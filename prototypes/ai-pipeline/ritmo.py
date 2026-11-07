# Detecta tiempos y primer tiempo de compás con Beat This!, en la nube (Modal, solo CPU).
# Uso: uv run modal run ritmo.py --cancion cancion2
# Lee samples/<cancion>/original.mp3 y deja ritmo.json y click-detectado.flac en esa carpeta.
# El click sigue los tiempos reales de la canción, así se puede oír si la detección acierta.

import io
import json
import tempfile
from pathlib import Path

import modal

RATE = 44100

app = modal.App("desglose-ritmo")

imagen = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch", "torchaudio", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "numpy",
        "soundfile",
        "soxr",
        "tqdm",
        "einops",
        "rotary-embedding-torch",
        "https://github.com/CPJKU/beat_this/archive/main.zip",
    )
)


def crear_click(tiempos: list[float], acentos: set[float], duracion: float) -> bytes:
    import numpy as np
    import soundfile as sf

    audio = np.zeros(int(duracion * RATE) + RATE)
    instante = np.arange(int(0.03 * RATE)) / RATE
    for tiempo in tiempos:
        hz = 1600 if tiempo in acentos else 1000
        sonido = 0.5 * np.sin(2 * np.pi * hz * instante) * np.exp(-120 * instante)
        inicio = int(tiempo * RATE)
        audio[inicio : inicio + len(sonido)] += sonido

    archivo = io.BytesIO()
    sf.write(archivo, np.stack([audio, audio], axis=1), RATE, format="FLAC", subtype="PCM_16")
    return archivo.getvalue()


# `timeout` es el freno del gasto: si algo se cuelga, Modal lo corta a los 5 minutos.
@app.function(image=imagen, cpu=4, memory=4096, timeout=300)
def detectar(audio: bytes, duracion: float) -> tuple[dict, bytes]:
    import numpy as np
    from beat_this.inference import File2Beats

    with tempfile.TemporaryDirectory() as carpeta:
        entrada = Path(carpeta) / "cancion.mp3"
        entrada.write_bytes(audio)
        detector = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)
        tiempos, acentos = detector(str(entrada))

    tiempos = np.asarray(tiempos, dtype=float)
    acentos = np.asarray(acentos, dtype=float)
    intervalos = np.diff(tiempos)

    # Tiempos por compás: cuántos caben entre dos primeros tiempos seguidos.
    posiciones = np.searchsorted(tiempos, acentos)
    por_compas = np.diff(posiciones)
    valores, conteos = np.unique(por_compas, return_counts=True)

    # Qué tanto se aleja la canción de un tempo fijo: recta ideal contra tiempos reales.
    numeros = np.arange(len(tiempos))
    pendiente, origen = np.polyfit(numeros, tiempos, 1)
    desvio = tiempos - (pendiente * numeros + origen)

    bpm_por_tramo = [
        60 / float(np.median(tramo)) for tramo in np.array_split(intervalos, 8) if len(tramo)
    ]
    informe = {
        "bpm": 60 / float(np.median(intervalos)),
        "bpm_recta": 60 / float(pendiente),
        "bpm_por_tramo": [round(b, 1) for b in bpm_por_tramo],
        "tiempos_por_compas": {int(v): int(c) for v, c in zip(valores, conteos)},
        "desvio_maximo_ms": float(np.abs(desvio).max() * 1000),
        "total_tiempos": int(len(tiempos)),
        "total_compases": int(len(acentos)),
        "tiempos": [round(float(t), 4) for t in tiempos],
        "primeros_tiempos": [round(float(t), 4) for t in acentos],
    }
    click = crear_click(list(tiempos), set(acentos), duracion)
    return informe, click


@app.local_entrypoint()
def main(cancion: str = "cancion2", duracion: float = 300.0):
    carpeta = Path(__file__).resolve().parents[2] / "samples" / cancion
    informe, click = detectar.remote((carpeta / "original.mp3").read_bytes(), duracion)

    (carpeta / "ritmo.json").write_text(json.dumps(informe), encoding="utf-8")
    (carpeta / "click-detectado.flac").write_bytes(click)

    resumen = {k: v for k, v in informe.items() if k not in ("tiempos", "primeros_tiempos")}
    print(f"{cancion}: {json.dumps(resumen)}")
