# Combina los dos modelos: la base de BS-Roformer-SW y los detalles del modelo de 53.
# Cada detalle se resta de la pista donde estaba, para que nada suene dos veces
# y el total siga sumando lo mismo que las pistas de BS-Roformer-SW.
# Uso: powershell -File scripts/combinar.ps1 fragmento1

param([string]$cancion = "fragmento1")

$raiz = Resolve-Path "$PSScriptRoot\..\..\.."
$carpeta = Join-Path $raiz "samples\$cancion"
$base = Join-Path $carpeta "stems-roformer"
$mega = Join-Path $carpeta "stems-mega"
$destino = Join-Path $carpeta "combinado"
New-Item -ItemType Directory -Force $destino | Out-Null

# Deja en $salida la pista $a menos todas las pistas de $restar.
function Restar($a, $restar, $salida) {
    $entradas = @("-i", $a)
    $filtro = ""
    $sumas = "[0:a]"
    for ($i = 0; $i -lt $restar.Count; $i++) {
        $entradas += @("-i", $restar[$i])
        $filtro += "[$($i + 1):a]volume=-1[n$i];"
        $sumas += "[n$i]"
    }
    $filtro += "${sumas}amix=inputs=$($restar.Count + 1):normalize=0:duration=first"
    ffmpeg -y -loglevel error @entradas -filter_complex $filtro -c:a flac -sample_fmt s32 $salida
}

function Copiar($origen, $salida) {
    ffmpeg -y -loglevel error -i $origen -c:a flac -sample_fmt s32 $salida
}

Copiar "$base\bateria.flac" "$destino\bateria.flac"
Copiar "$base\bajo.flac" "$destino\bajo.flac"
Copiar "$base\piano.flac" "$destino\piano.flac"

Copiar "$mega\back-vocal.flac" "$destino\coros.flac"
Restar "$base\voz.flac" @("$mega\back-vocal.flac") "$destino\voz-lider.flac"

# Medido con "Hay Libertad": lo que el modelo de 53 llama strings estaba en la guitarra, no en otros.
Copiar "$mega\acoustic-guitar.flac" "$destino\guitarra-acustica.flac"
Copiar "$mega\strings.flac" "$destino\strings.flac"
Restar "$base\guitarra.flac" @("$mega\acoustic-guitar.flac", "$mega\strings.flac") "$destino\guitarra-resto.flac"

Copiar "$mega\synth.flac" "$destino\synth.flac"
Restar "$base\otros.flac" @("$mega\synth.flac") "$destino\otros.flac"

Write-Host "Listo: $destino"
