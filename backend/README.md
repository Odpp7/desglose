# Backend de IA (Python + uv, desplegado en Modal)

Se arma a partir de lo que funcione en `prototypes/ai-pipeline`.

- FastAPI + Pydantic, avance por SSE.
- Cada etapa en `desglose_engine/pipeline/` es un archivo independiente que se prueba solo.
- `scripts/export_openapi.py` genera `openapi.json`; la app genera sus tipos TypeScript desde ahí.

API y estructura en `docs/especificacion.md` (sección 7).
