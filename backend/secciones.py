# Propone las secciones de una canción con SongFormer, en la nube (Modal, solo CPU).
#
# Son dos direcciones web, para que la app pueda mostrar el avance:
#
#   POST iniciar   La app manda la canción (los bytes del MP3/WAV/FLAC). Se
#                  lanza el análisis y responde AL MOMENTO con su número:
#                  {"id": "fc-..."}
#   GET  estado    ?id=fc-...  Responde en qué va:
#                  {"etapa": "en fila" | "preparando" | "analizando", "segundos": 40}
#                  {"etapa": "listo", "secciones": [{"inicio": 0.0, "fin": 18.1, "etiqueta": "intro"}, ...]}
#                  {"etapa": "error", "mensaje": "..."}
#
# Si la app se cierra a mitad, guarda el número y al volver sigue preguntando
# por el mismo trabajo: no se paga dos veces.
#
# Las etiquetas vienen en inglés (intro, verse, pre-chorus, chorus, bridge,
# inst, outro, silence); la app las traduce y numera.
#
# Protección: las dos direcciones solo responden si la petición trae el
# encabezado "Clave" igual al secreto de Modal "desglose-clave". Así nadie más
# puede gastar el crédito aunque conozca la dirección.
#
# Desplegar (desde backend/):  uv run modal deploy secciones.py
# Unos 3 minutos y 2 centavos por canción (CPU, 8 núcleos).

from __future__ import annotations

import os
import sys
import tempfile
import time
from typing import Annotated

import modal

CARPETA_MODELO = "/modelos/songformer"

app = modal.App("desglose-secciones")

# Imagen pesada, solo para el análisis. Las mismas versiones que funcionaron en
# la Fase 0 (Python 3.11, torch 2.4 en CPU).
imagen_ia = (
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

# Imagen liviana para las direcciones web: arrancan en un par de segundos.
imagen_web = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]==0.115.12")

# El modelo se baja una vez y queda guardado aquí entre llamadas.
modelos = modal.Volume.from_name("desglose-modelos", create_if_missing=True)
clave = modal.Secret.from_name("desglose-clave")
# En qué etapa va cada análisis (lo escribe `analizar`, lo lee `estado`).
avance = modal.Dict.from_name("desglose-avance", create_if_missing=True)

# FastAPI solo existe dentro de la imagen; en la PC este bloque se salta sin error.
with imagen_web.imports():
    from fastapi import Body, Header, HTTPException


def anotar(etapa: str):
    """Guarda la etapa de este análisis y desde cuándo empezó."""
    avance[modal.current_function_call_id()] = {"etapa": etapa, "desde": time.time()}


# `timeout` es el freno del gasto: si algo se cuelga, Modal lo corta a los 10 minutos.
# `max_containers=1`: nunca más de una canción a la vez (cuida el crédito).
@app.function(
    image=imagen_ia,
    cpu=8,
    memory=16384,
    volumes={"/modelos": modelos},
    timeout=600,
    max_containers=1,
)
def analizar(audio: bytes, extension: str) -> list[dict]:
    """Corre SongFormer sobre la canción y devuelve las secciones."""
    anotar("preparando")
    from huggingface_hub import snapshot_download
    from transformers import AutoModel

    snapshot_download(
        repo_id="ASLP-lab/SongFormer",
        local_dir=CARPETA_MODELO,
        ignore_patterns=["SongFormer.pt", "SongFormer.safetensors"],
    )
    sys.path.append(CARPETA_MODELO)
    os.environ["SONGFORMER_LOCAL_DIR"] = CARPETA_MODELO
    modelo = AutoModel.from_pretrained(CARPETA_MODELO, trust_remote_code=True, low_cpu_mem_usage=False)
    modelo.to("cpu")
    modelo.eval()
    modelos.commit()

    anotar("analizando")
    inicio = time.time()
    with tempfile.NamedTemporaryFile(suffix=f".{extension}") as archivo:
        archivo.write(audio)
        archivo.flush()
        resultado = modelo(archivo.name)
    print(f"Secciones listas en {time.time() - inicio:.0f} s")
    return [
        {"inicio": float(s["start"]), "fin": float(s["end"]), "etiqueta": str(s["label"])}
        for s in resultado
    ]


def revisar_clave(recibida: str | None):
    if recibida != os.environ["CLAVE"]:
        raise HTTPException(status_code=401, detail="Clave de Modal incorrecta")


@app.function(image=imagen_web, secrets=[clave])
@modal.fastapi_endpoint(method="POST")
def iniciar(
    # Los `Annotated` le dicen a FastAPI de dónde sale cada dato (el cuerpo y los
    # encabezados). Van como texto: en la PC no existe FastAPI y no se evalúan.
    audio: Annotated[bytes, Body(media_type="application/octet-stream")],
    clave: Annotated[str | None, Header()] = None,
    formato: Annotated[str, Header()] = "mp3",
):
    revisar_clave(clave)
    if len(audio) < 1000:
        raise HTTPException(status_code=400, detail="No llegó la canción")
    extension = formato.strip(".").lower()[:5] or "mp3"
    llamada = analizar.spawn(audio, extension)
    return {"id": llamada.object_id}


@app.function(image=imagen_web, secrets=[clave])
@modal.fastapi_endpoint(method="GET")
def estado(id: str, clave: Annotated[str | None, Header()] = None):
    revisar_clave(clave)
    try:
        llamada = modal.FunctionCall.from_id(id)
    except Exception:
        raise HTTPException(status_code=404, detail="Ese análisis no existe o ya venció")

    try:
        secciones = llamada.get(timeout=0)
    except TimeoutError:
        # Todavía no termina: se dice en qué etapa va.
        anotado = avance.get(id)
        if anotado is None:
            return {"etapa": "en fila", "segundos": 0}
        return {"etapa": anotado["etapa"], "segundos": round(time.time() - anotado["desde"])}
    except Exception as e:
        avance.pop(id, None)
        return {"etapa": "error", "mensaje": f"SongFormer falló: {e}"}

    avance.pop(id, None)
    return {"etapa": "listo", "secciones": secciones}
