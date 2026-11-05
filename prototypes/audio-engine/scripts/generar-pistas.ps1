# Genera 8 pistas de prueba iguales en samples/sinteticas/ con FFmpeg.
# Cada pista es un click corto de 1 kHz cada 0,5 s (120 BPM), estéreo, 44.1 kHz y 5 minutos.
# Al ser idénticas, cualquier desfase entre ellas se nota enseguida.

$raiz = Resolve-Path "$PSScriptRoot\..\..\.."
$destino = Join-Path $raiz "samples\sinteticas"
New-Item -ItemType Directory -Force $destino | Out-Null

$click = "aevalsrc='0.8*sin(2*PI*1000*t)*exp(-60*mod(t,0.5))*lt(mod(t,0.5),0.03)':s=44100:c=stereo:d=300"

foreach ($i in 1..8) {
    $archivo = Join-Path $destino "pista$i.flac"
    ffmpeg -y -loglevel error -f lavfi -i $click -c:a flac -sample_fmt s16 $archivo
    Write-Host "Creada: $archivo"
}
