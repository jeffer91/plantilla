$ErrorActionPreference = "Stop"

$base = "https://raw.githubusercontent.com/jeffer91/plantilla/app-ready/ready"
$tmp = "D:\youtube-studio-bootstrap"
$zip = "D:\youtube-studio-ia-ready.zip"
$app = "D:\youtube-studio-ia"
$expectedHash = "9f0e0761c2e9750998ff99b3ef19dfb1a1aee27a784175e261c8bbf2e9bd5321"

Write-Host "=== YOUTUBE STUDIO IA - INSTALACION DESDE TERMINAL ==="

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js no esta disponible en PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm no esta disponible en PATH."
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

Write-Host "=== 1. DESCARGANDO APP DESDE GITHUB ==="

$parts = @()
for ($i = 0; $i -le 9; $i++) {
    $name = "ready.b64.{0:D3}" -f $i
    $out = Join-Path $tmp $name
    Write-Host "Descargando $name..."
    Invoke-WebRequest -Uri "$base/$name" -OutFile $out -UseBasicParsing
    $parts += $out
}

Write-Host "=== 2. RECONSTRUYENDO PAQUETE ==="

$b64 = ""
foreach ($part in $parts) {
    if (!(Test-Path $part)) {
        throw "Falta una parte del paquete: $part"
    }
    $b64 += (Get-Content $part -Raw).Trim()
}

try {
    $bytes = [System.Convert]::FromBase64String($b64)
} catch {
    throw "No se pudo reconstruir el paquete Base64: $($_.Exception.Message)"
}

[System.IO.File]::WriteAllBytes($zip, $bytes)

Write-Host "=== 3. VERIFICANDO INTEGRIDAD ==="
$actualHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA256: $actualHash"

if ($actualHash -ne $expectedHash) {
    throw "El paquete descargado no coincide con la version auditada. SHA256 obtenido: $actualHash"
}

Write-Host "Integridad correcta."

Write-Host "=== 4. INSTALANDO EN D:\youtube-studio-ia ==="
if (Test-Path $app) {
    Remove-Item $app -Recurse -Force
}

Expand-Archive -Path $zip -DestinationPath "D:\" -Force

if (!(Test-Path "$app\package.json")) {
    throw "No se encontro package.json despues de descomprimir."
}
if (!(Test-Path "$app\main.js")) {
    throw "No se encontro main.js despues de descomprimir."
}
if (!(Test-Path "$app\scripts\start.js")) {
    throw "No se encontro scripts\start.js despues de descomprimir."
}

Set-Location $app

Write-Host "=== 5. ENTORNO ==="
Write-Host "Ruta: $(Get-Location)"
Write-Host "Node: $(node -v)"
Write-Host "npm: $(npm -v)"

Write-Host "=== 6. INICIANDO APP ==="
Write-Host "La primera ejecucion puede tardar mientras npm instala Electron y FFmpeg."

npm start
