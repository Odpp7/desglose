# Separa una canción en instrumentos, en la nube (Modal, solo CPU: la GPU exige tarjeta).
# Uso: uv run modal run separar.py --cancion cancion1
# Lee samples/<cancion>/<archivo> y deja las pistas en samples/<cancion>/<destino>/.

import tempfile
import time
from pathlib import Path

import modal

MODELO = "BS-Roformer-SW.ckpt"

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
def separar(audio: bytes, extension: str, modelo: str) -> dict[str, bytes]:
    from audio_separator.separator import Separator

    with tempfile.TemporaryDirectory() as carpeta:
        entrada = Path(carpeta) / f"cancion{extension}"
        entrada.write_bytes(audio)

        separador = Separator(
            output_dir=carpeta,
            output_format="FLAC",
            model_file_dir="/modelos",
            # Una sola pasada: dos mejoran apenas la calidad y cuestan el doble.
            demucs_params={"segment_size": "Default", "shifts": 1, "overlap": 0.25, "segments_enabled": True},
        )
        inicio = time.time()
        separador.load_model(model_filename=modelo)
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
def main(
    cancion: str = "cancion1",
    archivo: str = "original.mp3",
    modelo: str = MODELO,
    salida: str = "stems",
):
    carpeta = Path(__file__).resolve().parents[2] / "samples" / cancion
    entrada = carpeta / archivo

    inicio = time.time()
    pistas = separar.remote(entrada.read_bytes(), entrada.suffix, modelo)
    print(f"Tiempo total: {time.time() - inicio:.0f} s")

    destino = carpeta / salida
    destino.mkdir(exist_ok=True)
    for original, datos in pistas.items():
        nombre = nombre_en_espanol(original)
        (destino / nombre).write_bytes(datos)
        print(f"Guardada: {nombre} ({len(datos) / 1_000_000:.1f} MB)")
