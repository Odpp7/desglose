# Descarga Piper para Windows y dos voces en español dentro de este prototipo.

$raiz = Resolve-Path "$PSScriptRoot\.."
$zip = Join-Path $raiz "piper.zip"
if (-not (Test-Path "$raiz\piper\piper.exe")) {
    Invoke-WebRequest -UseBasicParsing "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath $raiz -Force
    Remove-Item $zip
}

$base = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
$voces = "es/es_MX/claude/high/es_MX-claude-high", "es/es_AR/daniela/high/es_AR-daniela-high"
New-Item -ItemType Directory -Force "$raiz\voces" | Out-Null
foreach ($voz in $voces) {
    $nombre = Split-Path $voz -Leaf
    foreach ($extension in ".onnx", ".onnx.json") {
        $destino = "$raiz\voces\$nombre$extension"
        if (-not (Test-Path $destino)) {
            Invoke-WebRequest -UseBasicParsing "$base/$voz$extension" -OutFile $destino
        }
    }
}
Write-Host "Listo"
