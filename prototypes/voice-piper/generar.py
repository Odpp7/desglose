# Genera el vocabulario de la voz guía con Piper y lo prueba sobre un click.
# Uso: python generar.py
# Necesita piper/ y voces/ (ver scripts/preparar.ps1). Solo usa Python, sin librerías extra.
# Deja en out/<voz>/ una frase por archivo, y out/demo-<voz>-<bpm>.wav para escuchar.

import array
import math
import subprocess
import wave
from pathlib import Path

CARPETA = Path(__file__).parent
PIPER = CARPETA / "piper" / "piper.exe"
VOCES = ["es_MX-claude-high", "es_AR-daniela-high"]
RATE = 22050
VELOCIDAD_VOZ = 0.9  # menos de 1 habla más rápido, para que quepa en un tiempo

FRASES = [
    "Intro", "Verso", "Verso 1", "Verso 2", "Verso 3", "Pre-coro", "Coro", "Coro 1", "Coro 2",
    "Coro 3", "Post-coro", "Puente", "Instrumental", "Interludio", "Vuelta", "Refrán", "Solo",
    "Tag", "Vamp", "Final", "1", "2", "3", "4", "5", "6",
    "Todos", "Solo voz", "Solo piano", "Bajamos", "Subimos", "Corte", "Última vez", "Repetimos",
]

# Cada sección dura dos compases: uno de música y uno con el aviso de la siguiente.
DEMO = ["Intro", "Verso 1", "Pre-coro", "Coro 1", "Instrumental", "Puente", "Coro 2", "Final"]


def archivo_de(frase: str) -> str:
    return frase.replace(" ", "-") + ".wav"


def generar_frase(modelo: Path, frase: str, destino: Path) -> None:
    subprocess.run(
        [PIPER, "--model", modelo, "--output_file", destino, "--length_scale", str(VELOCIDAD_VOZ)],
        input=frase.encode("utf-8"),
        check=True,
        capture_output=True,
    )


def leer_recortado(ruta: Path) -> array.array:
    with wave.open(str(ruta)) as audio:
        assert audio.getframerate() == RATE and audio.getnchannels() == 1
        muestras = array.array("h", audio.readframes(audio.getnframes()))

    # Quita el silencio de los extremos: el tiempo debe empezar con la voz.
    inicio = next(i for i, m in enumerate(muestras) if abs(m) > 400)
    fin = len(muestras) - next(i for i, m in enumerate(reversed(muestras)) if abs(m) > 400)
    return muestras[inicio:fin]


def sumar(pista: list[float], muestras, posicion: int, volumen: float) -> None:
    for i, muestra in enumerate(muestras):
        if posicion + i < len(pista):
            pista[posicion + i] += muestra * volumen


def click(acento: bool) -> list[float]:
    hz = 1600 if acento else 1000
    cuadros = int(0.03 * RATE)
    return [
        6000 * math.sin(2 * math.pi * hz * i / RATE) * math.exp(-120 * i / RATE)
        for i in range(cuadros)
    ]


def demo(clips: dict[str, array.array], bpm: int, destino: Path) -> list[str]:
    tiempo = int(60 / bpm * RATE)
    compas = tiempo * 4
    pista = [0.0] * (compas * (2 * len(DEMO) + 2))

    for numero in range(len(pista) // tiempo):
        sumar(pista, click(numero % 4 == 0), numero * tiempo, 1.0)

    avisos = []
    for numero, seccion in enumerate(DEMO):
        inicio = compas * (2 * numero + 1)
        nombre = clips[seccion]
        sumar(pista, nombre, inicio, 1.0)
        dicho = [seccion]

        # Si el nombre es largo, se recorta el conteo: "Instrumental... 3, 4".
        for cuenta in (2, 3, 4):
            if len(nombre) <= (cuenta - 1) * tiempo:
                sumar(pista, clips[str(cuenta)], inicio + (cuenta - 1) * tiempo, 1.0)
                dicho.append(str(cuenta))
        avisos.append(", ".join(dicho))

    salida = array.array("h", (max(-32000, min(32000, int(m))) for m in pista))
    with wave.open(str(destino), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(salida.tobytes())
    return avisos


def main() -> None:
    for voz in VOCES:
        carpeta = CARPETA / "out" / voz
        carpeta.mkdir(parents=True, exist_ok=True)
        modelo = CARPETA / "voces" / f"{voz}.onnx"

        clips = {}
        for frase in FRASES:
            ruta = carpeta / archivo_de(frase)
            generar_frase(modelo, frase, ruta)
            clips[frase] = leer_recortado(ruta)

        peso = sum(f.stat().st_size for f in carpeta.iterdir()) / 1_000_000
        largos = {f: round(len(c) / RATE, 2) for f, c in clips.items() if f in DEMO}
        print(f"{voz}: {len(clips)} frases, {peso:.1f} MB. Duración en segundos: {largos}")

        for bpm in (70, 120, 160):
            avisos = demo(clips, bpm, CARPETA / "out" / f"demo-{voz}-{bpm}.wav")
            print(f"  {bpm} BPM ({60 / bpm:.2f} s por tiempo): {' | '.join(avisos)}")


if __name__ == "__main__":
    main()
