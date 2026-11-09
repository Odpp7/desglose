# Backend de IA (Python + uv, en Modal)

Lo que corre en la nube. Por ahora una sola cosa: **proponer las secciones** de
una canción con SongFormer (`secciones.py`). Separar los instrumentos lo hace
MVSep, directo desde la app (Rust).

Dos direcciones web:

- `iniciar` (POST): recibe la canción, lanza el análisis y responde al momento
  con el número del trabajo.
- `estado` (GET `?id=`): en qué va (en fila, preparando, analizando) o, al
  final, las secciones.

Las dos solo responden con la clave correcta (secreto `desglose-clave` en
Modal; en la app, "Clave de Modal" en Ajustes). Sin ella nadie puede gastar el
crédito.

Unos 3 minutos y 2 centavos por canción, en CPU (sin tarjeta, Modal no da GPU).
Si Modal falla o se acaba el crédito, el encargado marca las secciones a mano.

## Comandos (PowerShell, desde `backend/`)

`uv` no está en el PATH: buscarlo en `%LOCALAPPDATA%\Microsoft\WinGet\Packages`.
Antes de cada uno: `UV_CACHE_DIR=.uv-cache`, `UV_LINK_MODE=copy`, `PYTHONUTF8=1`.

```powershell
uv sync                                            # instalar el cliente de Modal
powershell -ExecutionPolicy Bypass -File scripts\crear-clave.ps1   # una vez: la clave
uv run modal deploy secciones.py                   # publicar las direcciones web
uv run modal app logs desglose-secciones           # ver qué pasó en Modal
```
