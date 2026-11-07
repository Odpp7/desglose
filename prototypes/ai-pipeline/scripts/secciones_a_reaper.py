# Crea un proyecto de REAPER con la canción y sus secciones como regiones, para revisarlas a oído.
# Uso: python scripts/secciones_a_reaper.py cancion2
# Lee samples/<cancion>/secciones.json y deja samples/<cancion>/revisar-secciones/Secciones.RPP.

import json
import subprocess
import sys
from pathlib import Path

NOMBRES = {
    "intro": "Intro",
    "verse": "Verso",
    "pre-chorus": "Pre-coro",
    "chorus": "Coro",
    "bridge": "Puente",
    "inst": "Instrumental",
    "outro": "Final",
}


def unir_seguidas(secciones: list[dict]) -> list[dict]:
    unidas = []
    for seccion in secciones:
        if seccion["etiqueta"] == "silence":
            continue
        if unidas and unidas[-1]["etiqueta"] == seccion["etiqueta"]:
            unidas[-1]["fin"] = seccion["fin"]
        else:
            unidas.append(dict(seccion))
    return unidas


def main() -> None:
    carpeta = Path(__file__).resolve().parents[3] / "samples" / sys.argv[1]
    destino = carpeta / "revisar-secciones"
    destino.mkdir(exist_ok=True)

    audio = destino / "cancion.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", carpeta / "original.mp3", audio], check=True
    )
    duracion = float(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio]
        )
    )

    secciones = unir_seguidas(json.loads((carpeta / "secciones.json").read_text(encoding="utf-8")))
    cuenta: dict[str, int] = {}
    lineas = ['<REAPER_PROJECT 0.1 "7.0/x64" 0', "  SAMPLERATE 44100 0 0", "  TEMPO 120 4 4"]
    for numero, seccion in enumerate(secciones, start=1):
        nombre = NOMBRES.get(seccion["etiqueta"], seccion["etiqueta"])
        cuenta[nombre] = cuenta.get(nombre, 0) + 1
        lineas.append(f'  MARKER {numero} {seccion["inicio"]} "{nombre} {cuenta[nombre]}" 1')
        lineas.append(f'  MARKER {numero} {seccion["fin"]} "" 1')

    lineas += [
        "  <TRACK",
        '    NAME "Cancion"',
        "    <ITEM",
        "      POSITION 0",
        f"      LENGTH {duracion}",
        "      <SOURCE WAVE",
        '        FILE "cancion.wav"',
        "      >",
        "    >",
        "  >",
        ">",
    ]
    (destino / "Secciones.RPP").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"Creado: {destino / 'Secciones.RPP'} ({len(secciones)} secciones)")


if __name__ == "__main__":
    main()
