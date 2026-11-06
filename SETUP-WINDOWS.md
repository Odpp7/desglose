# Instalación en Windows (PC de desarrollo)

Esto es solo para **la PC donde se programa**. La PC de la iglesia no instala nada de esto: solo el instalador de Desglose.

Después de instalar cada cosa, **cierra y vuelve a abrir PowerShell**.

## Ya instalado

- [x] Git 2.50
- [x] Visual Studio Build Tools 2026 con "Desarrollo para el escritorio con C++" (Rust y Tauri lo usan)
- [x] Node.js 22
- [x] Rust (cargo 1.93)
- [x] Python 3.11.9
- [x] FFmpeg 9
- [x] LLVM 23 (`signalsmith-stretch` lo necesita para compilar; solo en esta PC)

## Falta (revisado el 2026-11-05)

- [ ] uv: no está instalado (sección 1). Hace falta en el paso 3 de la Fase 0.
- [ ] REAPER 7: no se encontró en esta PC. Hace falta en el paso 2; confirmar si está en otra ruta o en versión portable.

## 1. uv (administra Python y las dependencias del backend)

```powershell
winget install --id astral-sh.uv -e
uv --version
```

## 2. Modal (IA en la nube, plan gratis)

1. Crea la cuenta gratis en https://modal.com (plan Starter, 30 USD de créditos al mes).
2. Se instala dentro del backend cuando lleguemos al paso 3 de la Fase 0, con:

```powershell
cd backend
uv add modal
uv run modal setup
```

## 3. Editor y Claude Code

- **VS Code** con las extensiones *Tauri*, *rust-analyzer*, *Python*, *ESLint* y *Tailwind CSS IntelliSense*.
- **Claude Code**: guía oficial en https://docs.claude.com.

## 4. Abrir el proyecto

El proyecto está en `C:\Users\PC\Desktop\PROYECTOS\desglose` y en GitHub (`Odpp7/desglose`).

Abre la carpeta con Claude Code y escribe como primer mensaje:

> Lee CLAUDE.md y docs/fase-0.md. Vamos con el sub-paso 1a de la Fase 0. Muéstrame el plan antes de escribir código.

## Comprobación

```powershell
git --version
node --version
cargo --version
uv --version
ffmpeg -version
```
