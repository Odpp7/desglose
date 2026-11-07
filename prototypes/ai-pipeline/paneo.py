# Separa una pista según su posición en el estéreo: izquierda, centro y derecha.
# Sirve para guitarras que en la mezcla van a los lados, algo que ningún modelo distingue.
# Uso: uv run modal run paneo.py --carpeta fragmento2/stems-roformer --pista guitarra.flac
# Deja el resultado en samples/<carpeta>/../paneo/.

import io
from pathlib import Path

import modal

VENTANA = 4096
CORTE = 0.3  # desde qué tan al lado se considera que un sonido no es del centro
SUAVIDAD = 0.1  # transición entre zonas; más alto suena más natural pero separa menos

app = modal.App("desglose-paneo")
imagen = modal.Image.debian_slim(python_version="3.11").pip_install("numpy", "scipy", "soundfile")


@app.function(image=imagen, cpu=2, memory=4096, timeout=180)
def separar(audio: bytes) -> tuple[dict[str, bytes], str]:
    import numpy as np
    import soundfile as sf
    from scipy.signal import istft, stft

    datos, rate = sf.read(io.BytesIO(audio), dtype="float64")
    _, _, izquierda = stft(datos[:, 0], rate, nperseg=VENTANA, noverlap=VENTANA * 3 // 4)
    _, _, derecha = stft(datos[:, 1], rate, nperseg=VENTANA, noverlap=VENTANA * 3 // 4)

    # Posición de cada sonido: -1 todo a la izquierda, 0 centro, +1 todo a la derecha.
    nivel_i, nivel_d = np.abs(izquierda), np.abs(derecha)
    posicion = (nivel_d - nivel_i) / (nivel_d + nivel_i + 1e-12)

    # Cuánta energía hay en cada zona: dice si de verdad hay sonidos a los lados.
    energia = nivel_i**2 + nivel_d**2
    limites = np.linspace(-1, 1, 11)
    conteo, _ = np.histogram(posicion, bins=limites, weights=energia)
    conteo = conteo / conteo.sum() * 100
    informe = " ".join(f"{p:.0f}%" for p in conteo)

    # Las tres máscaras suman 1, así que las tres pistas suman exacto la original.
    mascara_i = 1 / (1 + np.exp((posicion + CORTE) / SUAVIDAD))
    mascara_d = 1 / (1 + np.exp(-(posicion - CORTE) / SUAVIDAD))
    mascaras = {
        "izquierda": mascara_i,
        "centro": 1 - mascara_i - mascara_d,
        "derecha": mascara_d,
    }

    pistas = {}
    for nombre, mascara in mascaras.items():
        _, canal_i = istft(izquierda * mascara, rate, nperseg=VENTANA, noverlap=VENTANA * 3 // 4)
        _, canal_d = istft(derecha * mascara, rate, nperseg=VENTANA, noverlap=VENTANA * 3 // 4)
        salida = np.stack([canal_i, canal_d], axis=1)[: len(datos)]
        archivo = io.BytesIO()
        sf.write(archivo, salida, rate, format="FLAC", subtype="PCM_24")
        pistas[nombre] = archivo.getvalue()
    return pistas, informe


@app.local_entrypoint()
def main(carpeta: str, pista: str = "guitarra.flac"):
    origen = Path(__file__).resolve().parents[2] / "samples" / carpeta
    pistas, informe = separar.remote((origen / pista).read_bytes())
    print(f"{carpeta}/{pista} de izquierda a derecha: {informe}")

    destino = origen.parent / "paneo"
    destino.mkdir(exist_ok=True)
    base = Path(pista).stem
    for nombre, datos in pistas.items():
        (destino / f"{base}-{nombre}.flac").write_bytes(datos)
