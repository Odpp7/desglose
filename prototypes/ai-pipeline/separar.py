# Separa una canción en instrumentos, en la nube (Modal, solo CPU: la GPU exige tarjeta).
# Uso: uv run modal run separar.py --cancion cancion1
# Lee samples/<cancion>/original.mp3 y deja las pistas en samples/<cancion>/stems/.

import tempfile
import time
from pathlib import Path

import modal

MODELO = "htdemucs_6s.yaml"

# Nombres en español según lo que aparezca en el archivo que entrega el modelo.
NOMBRES = {
    "vocals": "voz",
    "drums": "bateria",
    "bass": "bajo",
    "guitar": "guitarra",
    "piano": "piano",
    "other": "otros",
}

app = modal.App("desglose-ai")

# La imagen es la "PC" de la nube: aquí se instala lo pesado, no en la PC de desarrollo.
imagen = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("audio-separator[gpu]==0.48.0")
)

# Guarda el modelo para no descargarlo en cada canción.
modelos = modal.Volume.from_name("desglose-modelos", create_if_missing=True)


# `timeout` es el freno del gasto: si algo se cuelga, Modal lo corta a los 20 minutos.
@app.function(image=imagen, cpu=8, memory=8192, volumes={"/modelos": modelos}, timeout=1200)
def separar(audio: bytes) -> dict[str, bytes]:
    from audio_separator.separator import Separator

    with tempfile.TemporaryDirectory() as carpeta:
        entrada = Path(carpeta) / "cancion.mp3"
        entrada.write_bytes(audio)

        separador = Separator(
            output_dir=carpeta,
            output_format="FLAC",
            model_file_dir="/modelos",
            # Una sola pasada: dos mejoran apenas la calidad y cuestan el doble.
            demucs_params={"segment_size": "Default", "shifts": 1, "overlap": 0.25, "segments_enabled": True},
        )
        inicio = time.time()
        separador.load_model(model_filename=MODELO)
        modelos.commit()
        print(f"Modelo listo en {time.time() - inicio:.0f} s")

        inicio = time.time()
        archivos = separador.separate(str(entrada))
        print(f"Separación lista en {time.time() - inicio:.0f} s: {archivos}")

        return {Path(a).name: (Path(carpeta) / Path(a).name).read_bytes() for a in archivos}


def nombre_en_espanol(archivo: str) -> str:
    minusculas = archivo.lower()
    for ingles, espanol in NOMBRES.items():
        if f"({ingles})" in minusculas:
            return f"{espanol}.flac"
    return archivo


@app.local_entrypoint()
def main(cancion: str = "cancion1"):
    carpeta = Path(__file__).resolve().parents[2] / "samples" / cancion
    audio = (carpeta / "original.mp3").read_bytes()

    inicio = time.time()
    pistas = separar.remote(audio)
    print(f"Tiempo total: {time.time() - inicio:.0f} s")

    destino = carpeta / "stems"
    destino.mkdir(exist_ok=True)
    for archivo, datos in pistas.items():
        nombre = nombre_en_espanol(archivo)
        (destino / nombre).write_bytes(datos)
        print(f"Guardada: {nombre} ({len(datos) / 1_000_000:.1f} MB)")
