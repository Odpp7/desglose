# Crea la clave que protege la dirección de Modal y la deja guardada en la app.
#
# 1. Inventa una clave al azar.
# 2. La guarda en Modal como el secreto "desglose-clave" (la dirección web solo
#    responde si la petición trae esa clave).
# 3. La guarda en la app: %APPDATA%\com.desglose.app\clave-modal.txt
#
# La clave no se muestra en pantalla. Correr una vez, desde la carpeta backend/:
#   powershell -ExecutionPolicy Bypass -File scripts\crear-clave.ps1
# Si se corre otra vez, cambia la clave (la vieja deja de servir).

$ErrorActionPreference = "Stop"

$uv = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter uv.exe | Select-Object -First 1
if (-not $uv) { throw "No se encontró uv." }
$env:UV_CACHE_DIR = ".uv-cache"
$env:UV_LINK_MODE = "copy"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$clave = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")

& $uv.FullName run modal secret create --force desglose-clave "CLAVE=$clave" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Modal no aceptó el secreto." }

$carpeta = Join-Path $env:APPDATA "com.desglose.app"
New-Item -ItemType Directory -Force $carpeta | Out-Null
[System.IO.File]::WriteAllText((Join-Path $carpeta "clave-modal.txt"), $clave)

Write-Output "Listo: la clave quedó en Modal y en la app."
