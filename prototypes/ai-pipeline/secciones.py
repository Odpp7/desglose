# Propone las secciones de una canción con SongFormer, en la nube (Modal, solo CPU).
# Uso: uv run modal run secciones.py --canciones cancion2,cancion1
# Lee samples/<cancion>/original.mp3 y deja samples/<cancion>/secciones.json.

import json
import os
import sys
import tempfile
import time
from pathlib import Path

import modal

CARPETA_MODELO = "/modelos/songformer"

app = modal.App("desglose-secciones")

imagen = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.4.0",
        "torchaudio==2.4.0",
        "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cpu",
    )
    .pip_install(
        "numpy==1.25.0",
        "scipy==1.15.2",
        "transformers==4.51.1",
        "accelerate==1.5.2",
        "huggingface-hub==0.30.1",
        "safetensors==0.5.3",
        "librosa==0.11.0",
        "soundfile==0.13.1",
        "omegaconf==2.3.0",
        "einops==0.8.1",
        "x-transformers==2.4.14",
        "ema-pytorch==0.7.7",
        "loguru==0.7.3",
        "tqdm==4.67.1",
        "easydict==1.13",
        "msaf==0.1.80",
        "muq==0.1.0",
    )
    .env({"HF_HOME": "/modelos/hf"})
)

modelos = modal.Volume.from_name("desglose-modelos", create_if_missing=True)


# `timeout` es el freno del gasto: si algo se cuelga, Modal lo corta a los 10 minutos.
@app.function(image=imagen, cpu=8, memory=16384, volumes={"/modelos": modelos}, timeout=600)
def detectar(audio: bytes) -> list[dict]:
    from huggingface_hub import snapshot_download
    from transformers import AutoModel

    inicio = time.time()
    snapshot_download(
        repo_id="ASLP-lab/SongFormer",
        local_dir=CARPETA_MODELO,
        ignore_patterns=["SongFormer.pt", "SongFormer.safetensors"],
    )
    sys.path.append(CARPETA_MODELO)
    os.environ["SONGFORMER_LOCAL_DIR"] = CARPETA_MODELO

    modelo = AutoModel.from_pretrained(
        CARPETA_MODELO, trust_remote_code=True, low_cpu_mem_usage=False
    )
    modelo.to("cpu")
    modelo.eval()
    modelos.commit()
    print(f"Modelo listo en {time.time() - inicio:.0f} s")

    with tempfile.NamedTemporaryFile(suffix=".mp3") as archivo:
        archivo.write(audio)
        archivo.flush()
        inicio = time.time()
        resultado = modelo(archivo.name)
        print(f"Secciones listas en {time.time() - inicio:.0f} s")

    return [
        {"inicio": float(s["start"]), "fin": float(s["end"]), "etiqueta": str(s["label"])}
        for s in resultado
    ]


@app.local_entrypoint()
def main(canciones: str = "cancion2"):
    raiz = Path(__file__).resolve().parents[2] / "samples"
    for cancion in canciones.split(","):
        carpeta = raiz / cancion
        secciones = detectar.remote((carpeta / "original.mp3").read_bytes())
        (carpeta / "secciones.json").write_text(json.dumps(secciones), encoding="utf-8")

        print(f"== {cancion}")
        for s in secciones:
            minuto = f"{int(s['inicio'] // 60)}:{int(s['inicio'] % 60):02d}"
            print(f"{minuto}  {s['etiqueta']}  ({s['fin'] - s['inicio']:.0f} s)")
