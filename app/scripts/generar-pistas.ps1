# Genera 8 pistas de prueba iguales en samples/sinteticas/ con FFmpeg.
# Cada pista es un click corto de 1 kHz cada 0,5 s (120 BPM), estéreo, 44.1 kHz y 5 minutos.
# Al ser idénticas, cualquier desfase entre ellas se nota enseguida.
# Van a volumen bajo para que las 8 sumadas no saturen.

$raiz = Resolve-Path "$PSScriptRoot\..\.."
$destino = Join-Path $raiz "samples\sinteticas"
New-Item -ItemType Directory -Force $destino | Out-Null

$click = "aevalsrc='0.1*sin(2*PI*1000*t)*exp(-60*mod(t,0.5))*lt(mod(t,0.5),0.03)':s=44100:c=stereo:d=300"

foreach ($i in 1..8) {
    $archivo = Join-Path $destino "pista$i.flac"
    ffmpeg -y -loglevel error -f lavfi -i $click -c:a flac -sample_fmt s16 $archivo
    Write-Host "Creada: $archivo"
}

# Peor caso para medir la CPU: ruido en 24 bits, distinto en cada pista y en cada lado.
# Nada se comprime peor en FLAC, así que descomprimirlo cuesta más que cualquier canción.
$destinoRuido = Join-Path $raiz "samples\ruido"
New-Item -ItemType Directory -Force $destinoRuido | Out-Null

foreach ($i in 1..8) {
    $archivo = Join-Path $destinoRuido "ruido$i.flac"
    $izquierda = "anoisesrc=c=white:a=0.1:r=44100:d=300:s=$($i * 2)"
    $derecha = "anoisesrc=c=white:a=0.1:r=44100:d=300:s=$($i * 2 + 1)"
    ffmpeg -y -loglevel error -f lavfi -i $izquierda -f lavfi -i $derecha `
        -filter_complex "[0:a][1:a]amerge=inputs=2" `
        -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 $archivo
    Write-Host "Creada: $archivo"
}
