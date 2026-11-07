# Prueba el modelo de 53 instrumentos (MVSep Mega) en la nube, solo con CPU.
# Uso: uv run modal run probar_mega.py --cancion fragmento1
# Lee samples/<cancion>/original.wav y deja las pistas en samples/<cancion>/stems-mega/.

import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import modal

BASE = "https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download/v1.0.21"
CONFIG = "mvsep_mega_model_bs_roformer_53_stems.yaml"
PESOS = "mvsep_mega_model_bs_roformer_53_stems_v1.ckpt"

app = modal.App("desglose-mega")

imagen = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libsndfile1", "ffmpeg")
    .pip_install("torch", "torchaudio", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "numpy",
        "scipy",
        "pandas",
        "librosa",
        "soundfile",
        "tqdm",
        "matplotlib",
        "pyyaml",
        "omegaconf==2.2.3",
        "ml_collections",
        "einops==0.8.1",
        "beartype==0.14.1",
        "rotary_embedding_torch==0.3.5",
        "hyper_connections==0.1.11",
        "loralib",
    )
    .run_commands(
        "git clone --depth 1 https://github.com/ZFTurbo/Music-Source-Separation-Training /repo"
    )
)

modelos = modal.Volume.from_name("desglose-modelos", create_if_missing=True)


# `timeout` es el freno del gasto: si algo se cuelga, Modal lo corta a los 10 minutos.
@app.function(image=imagen, cpu=8, memory=32768, volumes={"/modelos": modelos}, timeout=600)
def separar(audio: bytes) -> dict[str, bytes]:
    inicio = time.time()
    for archivo in [CONFIG, PESOS]:
        destino = Path("/modelos") / archivo
        if not destino.exists():
            urllib.request.urlretrieve(f"{BASE}/{archivo}", destino)
    modelos.commit()
    print(f"Modelo listo en {time.time() - inicio:.0f} s")

    with tempfile.TemporaryDirectory() as carpeta:
        entrada = Path(carpeta) / "entrada"
        salida = Path(carpeta) / "salida"
        entrada.mkdir()
        (entrada / "cancion.wav").write_bytes(audio)

        inicio = time.time()
        subprocess.run(
            [
                "python",
                "inference.py",
                "--model_type",
                "bs_roformer",
                "--config_path",
                f"/modelos/{CONFIG}",
                "--start_check_point",
                f"/modelos/{PESOS}",
                "--input_folder",
                str(entrada),
                "--store_dir",
                str(salida),
                "--flac_file",
                "--pcm_type",
                "PCM_24",
                "--force_cpu",
                "--disable_detailed_pbar",
            ],
            cwd="/repo",
            check=True,
        )
        print(f"Separación lista en {time.time() - inicio:.0f} s")

        return {a.name: a.read_bytes() for a in salida.rglob("*") if a.is_file()}


@app.local_entrypoint()
def main(cancion: str = "fragmento1"):
    carpeta = Path(__file__).resolve().parents[2] / "samples" / cancion
    audio = (carpeta / "original.wav").read_bytes()

    inicio = time.time()
    pistas = separar.remote(audio)
    print(f"Tiempo total: {time.time() - inicio:.0f} s")

    destino = carpeta / "stems-mega"
    destino.mkdir(exist_ok=True)
    for archivo, datos in pistas.items():
        (destino / archivo).write_bytes(datos)
    print(f"Guardadas {len(pistas)} pistas en {destino}")
