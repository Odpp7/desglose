# Separa una canción con la cadena de modelos de MVSep. La clave va en .env (MVSEP_TOKEN).
# Uso: uv run python mvsep.py cancion2
# Lee samples/<cancion>/original.mp3 y deja las pistas en samples/<cancion>/mvsep/final/.
#
# Cada modelo recibe la pista limpia del paso anterior y la divide en dos,
# así todo sigue sumando la canción original:
#
#   canción  -> voz, batería, bajo, guitarra, piano, otros
#   voz      -> voz líder, coros
#   guitarra -> acústica, eléctricas
#   eléctricas -> lead, rítmica
#   otros    -> synth, otros

import shutil
import sys
import time
from pathlib import Path

import requests

API = "https://mvsep.com/api/separation"
FLAC_16_BITS = 2  # el de 24 bits es solo para usuarios de pago
ESPERA_ENTRE_CONSULTAS = 20
LIMITE_POR_ETAPA = 90 * 60

BS_ROFORMER_SW = 63
KARAOKE = 49
GUITARRA_ACUSTICA = 66
LEAD_RITMICA = 101
SYNTH = 88


def leer_token() -> str:
    for linea in (Path(__file__).parent / ".env").read_text().splitlines():
        if linea.startswith("MVSEP_TOKEN="):
            return linea.split("=", 1)[1].strip()
    raise SystemExit("Falta MVSEP_TOKEN en .env")


def crear_trabajo(token: str, archivo: Path, modelo: int, opciones: dict) -> str:
    with archivo.open("rb") as audio:
        respuesta = requests.post(
            f"{API}/create",
            data={
                "api_token": token,
                "sep_type": modelo,
                "output_format": FLAC_16_BITS,
                **opciones,
            },
            files={"audiofile": (archivo.name, audio)},
            timeout=600,
        )
    cuerpo = respuesta.json()
    if not cuerpo.get("success"):
        detalle = str(cuerpo).replace(token, "***")
        raise SystemExit(f"MVSep rechazó el trabajo ({respuesta.status_code}): {detalle}")
    return cuerpo["data"]["hash"]


def esperar_trabajo(hash_trabajo: str) -> list[dict]:
    inicio = time.time()
    ultimo = ""
    while time.time() - inicio < LIMITE_POR_ETAPA:
        cuerpo = requests.get(f"{API}/get", params={"hash": hash_trabajo}, timeout=60).json()
        estado = cuerpo.get("status")
        datos = cuerpo.get("data") or {}

        if estado == "done":
            print(f"  Listo en {time.time() - inicio:.0f} s", flush=True)
            return datos["files"]
        if estado in ("failed", "not_found"):
            raise SystemExit(f"El trabajo falló: {datos.get('message')}")

        resumen = f"{estado} {datos.get('current_order', '')}/{datos.get('queue_count', '')}"
        if resumen != ultimo:
            print(f"  {resumen}", flush=True)
            ultimo = resumen
        time.sleep(ESPERA_ENTRE_CONSULTAS)
    raise SystemExit("MVSep tardó demasiado")


def descargar(archivos: list[dict], carpeta: Path) -> None:
    carpeta.mkdir(parents=True, exist_ok=True)
    for archivo in archivos:
        destino = carpeta / Path(archivo["download"]).name
        with requests.get(archivo["url"], stream=True, timeout=600) as respuesta:
            respuesta.raise_for_status()
            with destino.open("wb") as salida:
                shutil.copyfileobj(respuesta.raw, salida)
        print(f"  Bajado: {destino.name} ({destino.stat().st_size / 1_000_000:.1f} MB)", flush=True)


def etapa(token: str, nombre: str, entrada: Path, modelo: int, opciones: dict, carpeta: Path) -> Path:
    # Si la etapa ya se hizo, no se repite: un fallo más adelante no gasta lo ya hecho.
    salida = carpeta / nombre
    if salida.exists() and any(salida.iterdir()):
        print(f"{nombre}: ya estaba", flush=True)
        return salida

    print(f"{nombre}: subiendo {entrada.name}", flush=True)
    hash_trabajo = crear_trabajo(token, entrada, modelo, opciones)
    descargar(esperar_trabajo(hash_trabajo), salida)
    return salida


# Busca por el final del nombre: el inicio repite el nombre de la pista de entrada.
def buscar(carpeta: Path, pista: str) -> Path:
    for archivo in carpeta.iterdir():
        if archivo.stem.lower().endswith(f"_{pista}"):
            return archivo
    raise SystemExit(f"No apareció '{pista}' en {carpeta}: {[a.name for a in carpeta.iterdir()]}")


def main() -> None:
    token = leer_token()
    cancion = Path(__file__).resolve().parents[2] / "samples" / sys.argv[1]
    carpeta = cancion / "mvsep"
    carpeta.mkdir(exist_ok=True)
    inicio = time.time()

    base = etapa(token, "1-base", cancion / "original.mp3", BS_ROFORMER_SW, {}, carpeta)
    voz = buscar(base, "vocals")
    guitarra = buscar(base, "guitar")
    otros = buscar(base, "other")

    # La opción 6 es la mejor gratis; la 8 es solo para usuarios de pago.
    voces = etapa(token, "2-voces", voz, KARAOKE, {"add_opt1": 6, "add_opt2": 0}, carpeta)
    acustica = etapa(token, "3-acustica", guitarra, GUITARRA_ACUSTICA, {"add_opt2": 0}, carpeta)
    electricas = buscar(acustica, "other")
    lead = etapa(token, "4-lead", electricas, LEAD_RITMICA, {"add_opt1": 0}, carpeta)
    synth = etapa(token, "5-synth", otros, SYNTH, {"add_opt1": 0}, carpeta)

    final = carpeta / "final"
    final.mkdir(exist_ok=True)
    pistas = {
        "bateria": buscar(base, "drums"),
        "bajo": buscar(base, "bass"),
        "piano": buscar(base, "piano"),
        "voz-lider": buscar(voces, "vocals-lead"),
        "coros": buscar(voces, "vocals-back"),
        "guitarra-acustica": buscar(acustica, "acoustic-guitar"),
        "guitarra-lead": buscar(lead, "lead-guitar"),
        "guitarra-ritmica": buscar(lead, "rhythm-guitar"),
        "synth": buscar(synth, "synth"),
        "otros": buscar(synth, "other"),
    }
    for nombre, archivo in pistas.items():
        shutil.copy(archivo, final / f"{nombre}{archivo.suffix}")

    print(f"Terminado en {(time.time() - inicio) / 60:.1f} minutos: {final}", flush=True)


if __name__ == "__main__":
    main()
