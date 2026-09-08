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

  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return run(process.execPath, [npmExecPath, ...args]);
  }

  if (isWindows) {
    const comspec = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
    const quoted = args.map((x) => /[\s&|<>^]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x).join(' ');
    return run(comspec, ['/d', '/s', '/c', `npm ${quoted}`]);
  }

  return run('npm', args);
}

function moduleExists(name) {
  try {
    require.resolve(name, { paths: [root] });
    return true;
  } catch (_) {
    return false;
  }
}

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < 18) {
  fail(`Se requiere Node.js 18 o superior. Tienes ${process.versions.node}.`);
}

const required = ['electron', 'ffmpeg-static', 'ffprobe-static'];
const missing = required.filter((name) => !moduleExists(name));
let installedNow = false;

if (missing.length) {
  console.log('\n[YouTube Studio IA] Primera ejecución: instalando dependencias...');
  console.log(`[YouTube Studio IA] Faltan: ${missing.join(', ')}\n`);
  runNpm(['install', '--no-audit', '--no-fund']);
  installedNow = true;
}

for (const name of required) {
  if (!moduleExists(name)) fail(`La dependencia ${name} no quedó instalada correctamente.`);
}

let ffmpeg;
let ffprobe;
let electronExe;
try { ffmpeg = require('ffmpeg-static'); } catch (e) { fail('No se pudo cargar FFmpeg.', e.message); }
try { ffprobe = require('ffprobe-static').path; } catch (e) { fail('No se pudo cargar FFprobe.', e.message); }
try { electronExe = require('electron'); } catch (e) { fail('No se pudo cargar Electron.', e.message); }

if (!ffmpeg || !fs.existsSync(ffmpeg)) fail('FFmpeg no existe en la ruta instalada.', String(ffmpeg || ''));
if (!ffprobe || !fs.existsSync(ffprobe)) fail('FFprobe no existe en la ruta instalada.', String(ffprobe || ''));
if (!electronExe || !fs.existsSync(electronExe)) fail('Electron no existe en la ruta instalada.', String(electronExe || ''));

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
