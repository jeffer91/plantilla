const { spawnSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

function fail(message, details = '') {
  console.error(`\n[YouTube Studio IA] ${message}`);
  if (details) console.error(details);
  console.error('\nNo se modificaron tus proyectos. Corrige el problema indicado y vuelve a ejecutar: npm start\n');
  process.exit(1);
}

function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
    ...options
  });
  if (r.error) fail(`No se pudo ejecutar ${command}.`, r.error.message);
  if (r.status !== 0) fail(`${command} terminó con código ${r.status}.`);
  return r;
}

function runNpm(args) {
  const npmExecPath = process.env.npm_execpath;
  const installEnv = {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    FFMPEG_BINARIES_URL: process.env.FFMPEG_BINARIES_URL || 'https://cdn.npmmirror.com/binaries/ffmpeg-static',
    FFPROBE_BINARIES_URL: process.env.FFPROBE_BINARIES_URL || 'https://cdn.npmmirror.com/binaries/ffprobe-static',
    npm_config_fetch_retries: process.env.npm_config_fetch_retries || '5',
    npm_config_fetch_retry_mintimeout: process.env.npm_config_fetch_retry_mintimeout || '20000',
    npm_config_fetch_retry_maxtimeout: process.env.npm_config_fetch_retry_maxtimeout || '120000',
    npm_config_fetch_timeout: process.env.npm_config_fetch_timeout || '120000'
  };

  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return run(process.execPath, [npmExecPath, ...args], { env: installEnv });
  }

  if (isWindows) {
    const comspec = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
    const quoted = args.map((x) => /[\s&|<>^]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x).join(' ');
    return run(comspec, ['/d', '/s', '/c', `npm ${quoted}`], { env: installEnv });
  }

  return run('npm', args, { env: installEnv });
}

function existsPackage(name) {
  try {
    require.resolve(name, { paths: [root] });
    return true;
  } catch (_) {
    return false;
  }
}

function electronReady() {
  try {
    const p = require('electron');
    return typeof p === 'string' && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function ffmpegReady() {
  try {
    const p = require('ffmpeg-static');
    return typeof p === 'string' && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function ffprobeReady() {
  try {
    const p = require('ffprobe-static').path;
    return typeof p === 'string' && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function removeBrokenInstallTargets() {
  const targets = [
    path.join(root, 'node_modules', 'electron'),
    path.join(root, 'node_modules', 'ffmpeg-static'),
    path.join(root, 'node_modules', 'ffprobe-static')
  ];

  for (const target of targets) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (_) {
      // npm puede reparar encima; no abortamos por un bloqueo temporal de antivirus/índice.
    }
  }
}

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < 18) {
  fail(`Se requiere Node.js 18 o superior. Tienes ${process.versions.node}.`);
}

let installedNow = false;
const readyBefore = electronReady() && ffmpegReady() && ffprobeReady();

if (!readyBefore) {
  console.log('\n[YouTube Studio IA] Primera ejecución o instalación incompleta: preparando dependencias...');
  console.log('[YouTube Studio IA] Se usarán mirrors para Electron, FFmpeg y FFprobe para evitar bloqueos de GitHub.\n');
  removeBrokenInstallTargets();
  runNpm(['install', '--no-audit', '--no-fund']);
  installedNow = true;
}

if (!existsPackage('electron') || !electronReady()) fail('Electron no quedó instalado correctamente.');
if (!existsPackage('ffmpeg-static') || !ffmpegReady()) fail('FFmpeg no quedó instalado correctamente.');
if (!existsPackage('ffprobe-static') || !ffprobeReady()) fail('FFprobe no quedó instalado correctamente.');

let ffmpeg;
let ffprobe;
let electronExe;
try { ffmpeg = require('ffmpeg-static'); } catch (e) { fail('No se pudo cargar FFmpeg.', e.message); }
try { ffprobe = require('ffprobe-static').path; } catch (e) { fail('No se pudo cargar FFprobe.', e.message); }
try { electronExe = require('electron'); } catch (e) { fail('No se pudo cargar Electron.', e.message); }

const ffmpegCheck = spawnSync(ffmpeg, ['-version'], { windowsHide: true, encoding: 'utf8' });
if (ffmpegCheck.error || ffmpegCheck.status !== 0) {
  fail('FFmpeg está instalado pero no pudo ejecutarse.', ffmpegCheck.stderr || ffmpegCheck.error?.message || '');
}

const ffprobeCheck = spawnSync(ffprobe, ['-version'], { windowsHide: true, encoding: 'utf8' });
if (ffprobeCheck.error || ffprobeCheck.status !== 0) {
  fail('FFprobe está instalado pero no pudo ejecutarse.', ffprobeCheck.stderr || ffprobeCheck.error?.message || '');
}

if (installedNow && process.env.STUDIO_SKIP_SELF_TEST !== '1') {
  console.log('\n[YouTube Studio IA] Ejecutando pruebas automáticas de primera instalación...\n');
  run(process.execPath, [path.join(root, 'tests', 'run-all.js')], {
    env: { ...process.env, PATH: process.env.PATH }
  });
}

console.log('\n[YouTube Studio IA] Dependencias y motor de video correctos. Abriendo aplicación...\n');

const child = spawn(electronExe, [root], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: false,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'false' }
});

child.on('error', (e) => fail('Electron no pudo iniciarse.', e.message));
child.on('exit', (code) => process.exit(code ?? 0));
