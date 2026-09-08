$ErrorActionPreference = "Stop"

$main = "D:\youtube-studio-ia\main.js"
if (!(Test-Path $main)) {
    throw "No se encontro $main"
}

$content = [System.IO.File]::ReadAllText($main)
$old = "const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');"
$new = "const electron = process.env.STUDIO_TEST_MODE === '1' ? require('./tests/mocks/electron') : require('electron');`r`nconst { app, BrowserWindow, ipcMain, dialog, shell, session } = electron;"

if ($content.Contains($new.Split("`r`n")[0])) {
    Write-Host "main.js ya estaba corregido."
} elseif ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($main, $content, $utf8NoBom)
    Write-Host "main.js corregido."
} else {
    throw "No se encontro el bloque esperado en main.js; no se hizo ningun cambio."
}

Write-Host "Verificando sintaxis..."
node --check $main
if ($LASTEXITCODE -ne 0) {
    throw "La verificacion de sintaxis fallo."
}

Write-Host "Parche aplicado correctamente."
