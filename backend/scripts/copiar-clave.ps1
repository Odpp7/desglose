# Copia al portapapeles la clave de Modal guardada en esta PC, para pegarla en
# Ajustes de la app en otra PC (por ejemplo, la de la iglesia).
#
# La clave no se muestra en pantalla. Correr en una terminal normal de Windows:
#   powershell -ExecutionPolicy Bypass -File backend\scripts\copiar-clave.ps1
# Después de pegarla, conviene copiar otra cosa para que no quede en el portapapeles.

$ErrorActionPreference = "Stop"
$archivo = Join-Path $env:APPDATA "com.desglose.app\clave-modal.txt"
if (-not (Test-Path $archivo)) {
    Write-Output "No hay clave de Modal en esta PC. Créala con scripts\crear-clave.ps1."
    exit 1
}
(Get-Content $archivo -Raw).Trim() | Set-Clipboard
Write-Output "Listo: la clave de Modal está en el portapapeles. Pégala en Ajustes → Clave de Modal."
