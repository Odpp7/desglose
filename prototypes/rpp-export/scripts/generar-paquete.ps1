# Arma un paquete de prueba en samples/paquete-prueba/: 8 WAV de 24 bits y los proyectos .RPP.
# Usa las pistas sintéticas; primero hay que correr el script de prototypes/audio-engine.

$raiz = Resolve-Path "$PSScriptRoot\..\..\.."
$origen = Join-Path $raiz "samples\sinteticas\pista1.flac"
$destino = Join-Path $raiz "samples\paquete-prueba"
New-Item -ItemType Directory -Force $destino | Out-Null

$nombres = "01 CLICK", "02 GUIA", "03 Bateria", "04 Bajo", "05 Guitarra", "06 Piano", "07 Otros", "08 Voz"
foreach ($nombre in $nombres) {
    ffmpeg -y -loglevel error -i $origen -c:a pcm_s24le (Join-Path $destino "$nombre.wav")
    Write-Host "Creado: $nombre.wav"
}

Push-Location "$PSScriptRoot\.."
cargo run --quiet -- $destino
Pop-Location
