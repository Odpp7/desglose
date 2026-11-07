# Anota cada 30 minutos cuántos trabajos hay en la fila gratis de MVSep,
# para saber a qué horas conviene crear secuencias.
# Usa la consulta pública de MVSep: no necesita la clave.
#
# Uso (déjalo corriendo uno o dos días; Ctrl+C para parar):
#   powershell -ExecutionPolicy Bypass -File app/scripts/medir-fila-mvsep.ps1
#
# Resultado: samples/fila-mvsep.csv (fecha, hora, en fila, procesando).

$raiz = Resolve-Path "$PSScriptRoot\..\.."
$archivo = Join-Path $raiz "samples\fila-mvsep.csv"

if (-not (Test-Path $archivo)) {
    "fecha,hora,en_fila,procesando" | Out-File -FilePath $archivo -Encoding utf8
}

while ($true) {
    try {
        $r = Invoke-RestMethod -Uri "https://mvsep.com/api/app/queue" -TimeoutSec 30
        $ahora = Get-Date
        $linea = "{0},{1},{2},{3}" -f $ahora.ToString("yyyy-MM-dd"), $ahora.ToString("HH:mm"), $r.queue.registered, $r.queue.in_process
        $linea | Out-File -FilePath $archivo -Append -Encoding utf8
        Write-Host $linea
    } catch {
        Write-Host "$(Get-Date -Format HH:mm) sin respuesta de MVSep"
    }
    Start-Sleep -Seconds 1800
}
