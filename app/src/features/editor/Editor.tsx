import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Confirmar } from "../../components/Confirmar";
import { IconoMas } from "../../components/icons";
import { FORMATOS, borrarPistaPropia, copiarPistaPropia, sinExtension } from "../../lib/archivos";
import { avisarCambio } from "../../lib/cambios";
import { clickEnLinea, entradaEnMs, segundosPorCompas, type Click } from "../../lib/click";
import * as db from "../../lib/db";
import type { CambioPista, Cancion, Pista } from "../../lib/db";
import { escucharEstado, motor } from "../../lib/engine";
import { datosPista } from "../../lib/instrumentos";
import { alCompas, dividir, empezar, nombres, propuestaEnCurso, proponerConIa, useSecciones, type Seccion } from "../../lib/secciones";
import { Exportar, type Paquete } from "./Exportar";
import { alTiempo, calcularGuia, type Frases } from "../../lib/guia";
import { CabeceraPista } from "./CabeceraPista";
import { FrasesGuia } from "./FrasesGuia";
import { ALTO_FRANJA, ALTO_GUIA, ALTO_REGLA, ALTO_SECCIONES, LineaTiempo, type FilaOnda } from "./LineaTiempo";
import { FranjaGuia } from "./Guia";
import { FranjaSecciones, type AvanceIa } from "./Secciones";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Transporte, type Estudio } from "./Transporte";

// El editor de una canción ya separada:
//
//   ┌ MEZCLADOR  + Añadir pista ┬───────── línea de tiempo (ondas) ─────────┐
//   │ ● Voz líder      M S R   │ ▁▃▅▇▅▃▁▁▃▅▇▇▅▃                             │
//   │ ━━━━●━━          -1.5   │                                            │
//   │ ● Mi teclado  ⋯  M S R   │      ▁▃▅▇▅▃ (propia: se arrastra)          │
//   └──────────────────────────┴────────────────────────────────────────────┘
//   TRANSPORTE · POSICIÓN · VELOCIDAD · TONALIDAD · CLICK · Exportar
//
// La mezcla (volumen, M, S, R) y el desfase de las pistas propias se guardan en
// SQLite: siguen igual al cerrar y abrir la app.
// El click llega de la página de la canción: aquí se le pasa al motor (es la
// última "pista"), se dibuja su rejilla y se arrastra su primer tiempo.
//
// Secciones: la franja bajo la regla. Teclas: S corta en la posición actual
// (pegado al compás si hay click), Ctrl+Z deshace y Ctrl+Y rehace.
// Voz guía: la franja bajo las secciones. Sale sola de las secciones y el click
// (`src/lib/guia.ts`) y se le pasa al motor como una pista más (después del
// click). G agrega un aviso libre donde está la canción.
// Al entrar, carga las pistas en el motor. Si el motor ya las tenía igual (se
// abrió otra cosa y se volvió), no las recarga: sigue en el mismo punto.

type Props = {
  cancion: Cancion;
  /** Las pistas según SQLite (separadas y propias), en orden. */
  pistas: Pista[];
  click: Click;
  alCambiarClick: (cambio: Partial<Click>) => void;
  /** Avisa si la canción tiene secciones (para marcar el paso en la fila de datos). */
  alTenerSecciones: (si: boolean) => void;
};

/** Alto mínimo de una pista: si hay muchas, aparece la barra de desplazamiento. */
const ALTO_MINIMO = 64;
/** Espera antes de guardar el volumen en SQLite mientras se mueve el fader. */
const ESPERA_GUARDAR_MS = 400;

export function Editor({ cancion, pistas: desdeBase, click, alCambiarClick, alTenerSecciones }: Props) {
  const id = cancion.id;
  const entradaMs = entradaEnMs(click);
  const entrada = entradaMs / 1000;
  const duracion = cancion.duracion_ms / 1000;
  const duracionTotal = duracion + entrada;
  const clickLinea = clickEnLinea(click, entrada);
  // Copia local para que el fader responda al instante; se guarda en SQLite aparte.
  const [pistas, setPistas] = useState<Pista[]>(desdeBase);
  const [ondas, setOndas] = useState<Map<string, Uint8Array>>(new Map());
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const [porQuitar, setPorQuitar] = useState<Pista | null>(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const zona = useRef<HTMLDivElement>(null);
  const [altoZona, setAltoZona] = useState(0);
  // Velocidad y tono para ensayar. No se guardan: al abrir la canción vuelven a lo normal.
  const [estudio, setEstudio] = useState<Estudio>({ velocidad: 1, semitonos: 0 });
  const estudioActual = useRef(estudio);

  function cambiarEstudio(nuevo: Estudio) {
    setEstudio(nuevo);
    estudioActual.current = nuevo;
    motor.estudio(nuevo.velocidad, nuevo.semitonos).catch((e) => setError(String(e)));
  }

  useEffect(() => setPistas(desdeBase), [desdeBase]);

  // Alto disponible para las pistas: cambia al agrandar la ventana.
  useEffect(() => {
    const elemento = zona.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([e]) => setAltoZona(Math.floor(e.contentRect.height)));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // Dónde iba la canción: si hay que recargar el motor (se movió una pista propia),
  // se vuelve a ese punto y, si sonaba, sigue sonando.
  const ultimo = useRef({ posicion: 0, reproduciendo: false });
  useEffect(() => {
    const dejar = escucharEstado((e) => {
      ultimo.current = { posicion: e.posicion, reproduciendo: e.reproduciendo };
    });
    return () => {
      dejar.then((f) => f());
    };
  }, []);

  // Qué se carga en el motor: archivos y desfases. Si cambia, se recarga.
  const carga = useMemo(
    () => desdeBase.map((p) => ({ archivo: p.archivo, desfaseMs: p.desfase_ms + entradaMs })),
    [desdeBase, entradaMs],
  );
  const claveCarga = JSON.stringify(carga);
  const entradaCargada = useRef<number | null>(null);
  const [claveCargada, setClaveCargada] = useState<string | null>(null);
  const listaParaSonar = claveCargada === claveCarga;

  useEffect(() => {
    let vigente = true;
    setError("");
    setClaveCargada(null);
    (async () => {
      // Si cambia la entrada, vuelve a 0 para poder escucharla completa.
      const volver = entradaCargada.current === entradaMs ? { ...ultimo.current } : null;
      const yaEstaba = await motor.cargarCancion(id, carga);
      if (!vigente) return;
      entradaCargada.current = entradaMs;
      // El motor y la pantalla deben estar de acuerdo en la velocidad y el tono.
      await motor.estudio(estudioActual.current.velocidad, estudioActual.current.semitonos);

      if (!yaEstaba) {
        // El motor la abrió de nuevo: se le aplica la mezcla guardada.
        for (const [i, p] of desdeBase.entries()) {
          await motor.volumen(i, p.volumen);
          await motor.mute(i, !!p.mute);
          await motor.solo(i, !!p.solo);
        }
        if (vigente && volver && volver.posicion > 0) {
          await motor.buscar(volver.posicion);
          if (volver.reproduciendo) await motor.play();
        }
      }

      if (!vigente) return;
      setClaveCargada(claveCarga);

      // Las ondas que falten, una por una: la primera vez cada una tarda un momento.
      for (const p of desdeBase) {
        if (!vigente) return;
        if (ondas.has(p.archivo)) continue;
        const picos = await motor.ondas(id, p.archivo).catch(() => new Uint8Array());
        if (vigente) setOndas((antes) => new Map(antes).set(p.archivo, picos));
      }
    })().catch((e) => vigente && setError(String(e)));

    return () => {
      vigente = false;
    };
    // `carga` y `desdeBase` cambian juntos con `claveCarga`.
  }, [id, claveCarga]);

  // El click va al motor cada vez que cambia, o cuando el motor recargó las pistas
  // (al recargar, el motor vuelve a su click de fábrica). Sin BPM, queda callado.
  useEffect(() => {
    if (!listaParaSonar) return;
    const indice = desdeBase.length;
    const fallo = (e: unknown) => setError(String(e));
    motor.click(clickLinea.bpm ?? 120, clickLinea.compas, clickLinea.inicio, clickLinea.conteo).catch(fallo);
    motor.volumen(indice, click.volumen).catch(fallo);
    motor.mute(indice, !(click.activo && click.bpm !== null)).catch(fallo);
  }, [click, entrada, listaParaSonar]);

  // Guardar el volumen en SQLite se espera un momento (el fader manda muchos cambios).
  const esperas = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  function cambiar(indice: number, pista: Pista, cambio: CambioPista) {
    setPistas((antes) => antes.map((p) => (p.id === pista.id ? { ...p, ...cambio } : p)));
    const fallo = (e: unknown) => setError(String(e));

    if (cambio.volumen !== undefined) {
      motor.volumen(indice, cambio.volumen).catch(fallo);
      clearTimeout(esperas.current.get(pista.id));
      esperas.current.set(
        pista.id,
        setTimeout(() => db.actualizarPista(pista.id, { volumen: cambio.volumen }).catch(fallo), ESPERA_GUARDAR_MS),
      );
      return;
    }
    if (cambio.mute !== undefined) motor.mute(indice, !!cambio.mute).catch(fallo);
    if (cambio.solo !== undefined) motor.solo(indice, !!cambio.solo).catch(fallo);
    db.actualizarPista(pista.id, cambio)
      .then(() => {
        // Un desfase nuevo cambia lo que se carga en el motor: se avisa para recargar.
        if (cambio.desfase_ms !== undefined) avisarCambio();
      })
      .catch(fallo);
  }

  async function anadirPista() {
    const elegido = await open({
      multiple: false,
      title: "Elegir una pista propia",
      filters: [{ name: "Audio", extensions: FORMATOS }],
    });
    if (!elegido) return;
    try {
      const copia = await copiarPistaPropia(id, elegido);
      await db.agregarPistaPropia(id, copia.archivo, sinExtension(elegido));
      avisarCambio();
    } catch (e) {
      setError(String(e));
    }
  }

  async function quitar(pista: Pista) {
    setPorQuitar(null);
    try {
      await borrarPistaPropia(id, pista.archivo);
      await db.borrarPista(pista.id);
      avisarCambio();
    } catch (e) {
      setError(String(e));
    }
  }

  // ---------- Secciones ----------
  const secciones = useSecciones(id);
  const haySecciones = !!secciones.secciones?.length;
  useEffect(() => alTenerSecciones(haySecciones), [haySecciones]);

  /** Pega al compás más cercano si hay click. */
  const ajustar = (s: number) => (click.bpm ? alCompas(s, click.inicio, segundosPorCompas(click)) : s);

  function cortarAqui() {
    const actuales = secciones.secciones;
    const segundo = ultimo.current.posicion - entrada;
    if (!actuales || !listaParaSonar || segundo < 0) return;
    // Sin secciones, cortar empieza el modo a mano (una sola sección) y corta ahí.
    const base = actuales.length > 0 ? actuales : empezar();
    secciones.cambiar(dividir(base, ajustar(segundo), duracion));
  }

  // Proponer con IA. El trabajo sigue aunque se cierre el editor: al volver, si
  // todavía corre, se espera; si ya terminó, las secciones ya están en SQLite.
  // Si la app se cerró a mitad, Rust guardó el número del trabajo: al abrir la
  // canción se retoma solo (sin subirla ni pagar otra vez).
  const [proponiendo, setProponiendo] = useState(false);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  // En qué va la IA (lo avisa Rust cada 3 s) y cuándo empezó a esperarla.
  const [avanceIa, setAvanceIa] = useState<AvanceIa | null>(null);
  const [desdeIa, setDesdeIa] = useState(0);
  const seccionesActuales = useRef(secciones);
  seccionesActuales.current = secciones;
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    const enCurso = propuestaEnCurso(id);
    if (enCurso) esperarPropuesta(enCurso);
    const dejar = listen<AvanceIa & { cancion: number }>("avance-secciones", (e) => {
      if (e.payload.cancion === id) setAvanceIa({ etapa: e.payload.etapa, segundos: e.payload.segundos });
    });
    return () => {
      montado.current = false;
      dejar.then((f) => f());
    };
  }, [id]);

  const cargadas = secciones.secciones !== undefined;
  useEffect(() => {
    if (!cargadas || secciones.secciones?.length || propuestaEnCurso(id)) return;
    invoke<boolean>("secciones_ia_pendiente", { id }).then((hay) => {
      if (hay && montado.current) esperarPropuesta(proponerConIa(id, cancion.archivo, ajustar));
    });
  }, [cargadas]);

  function esperarPropuesta(trabajo: Promise<Parameters<typeof secciones.cambiar>[0]>) {
    setProponiendo(true);
    setErrorIa(null);
    setAvanceIa(null);
    setDesdeIa(Date.now());
    trabajo.then(
      (lista) => {
        if (!montado.current) return;
        setProponiendo(false);
        // Solo si sigue vacía: lo marcado a mano mientras tanto no se pisa.
        if (seccionesActuales.current.secciones?.length === 0) seccionesActuales.current.cambiar(lista);
      },
      (e) => {
        if (!montado.current) return;
        setProponiendo(false);
        setErrorIa(e instanceof Error ? e.message : String(e));
      },
    );
  }

  // ---------- Voz guía ----------
  const [frases, setFrases] = useState<Frases>(new Map());
  const [editarFrases, setEditarFrases] = useState(false);
  const [libres, setLibres] = useState<db.AvisoLibre[]>([]);
  useEffect(() => {
    motor.frasesGuia().then(setFrases, (e) => setError(String(e)));
    db.listarAvisos(id).then(setLibres, (e) => setError(String(e)));
  }, [id]);

  const guia = useMemo(
    () => calcularGuia(secciones.secciones ?? [], libres, click, duracion, frases, entrada),
    [secciones.secciones, libres, click, duracion, frases, entrada],
  );
  // Al motor solo cuando cambia de verdad lo que suena (no por cada dibujo).
  const claveGuia = JSON.stringify(guia.eventos);
  useEffect(() => {
    if (!listaParaSonar) return;
    motor.guia(guia.eventos).catch((e) => setError(String(e)));
  }, [claveGuia, listaParaSonar, frases]);
  useEffect(() => {
    if (!listaParaSonar) return;
    const indice = desdeBase.length + 1; // la guía va después del click
    motor.volumen(indice, click.guiaVolumen).catch((e) => setError(String(e)));
    motor.mute(indice, !(click.guiaActiva && click.bpm !== null)).catch((e) => setError(String(e)));
  }, [click.guiaActiva, click.guiaVolumen, click.bpm, listaParaSonar]);

  function cambiarSeccionGuia(indice: number, cambio: Partial<Seccion>) {
    const actuales = secciones.secciones;
    if (!actuales) return;
    secciones.cambiar(actuales.map((s, i) => (i === indice ? { ...s, ...cambio } : s)));
  }

  async function anadirAviso() {
    if (!click.bpm) return setError("Primero define el BPM: la voz guía cuenta sobre el click.");
    if (!listaParaSonar) return;
    const segundo = Math.round((alTiempo(ultimo.current.posicion, clickLinea) - entrada) * 1000) / 1000;
    try {
      const nuevoId = await db.crearAviso(id, segundo, "Todos");
      setLibres((antes) => [...antes, { id: nuevoId, segundo, frase: "Todos" }]);
    } catch (e) {
      setError(String(e));
    }
  }

  function cambiarLibre(aviso: db.AvisoLibre) {
    setLibres((antes) => antes.map((a) => (a.id === aviso.id ? aviso : a)));
    db.cambiarAviso(aviso.id, aviso.segundo, aviso.frase).catch((e) => setError(String(e)));
  }

  function borrarLibre(idAviso: number) {
    setLibres((antes) => antes.filter((a) => a.id !== idAviso));
    db.borrarAviso(idAviso).catch((e) => setError(String(e)));
  }

  // Teclas. Usan las funciones del último dibujo (por eso el ref).
  const teclas = useRef({ cortarAqui, anadirAviso, deshacer: secciones.deshacer, rehacer: secciones.rehacer });
  teclas.current = { cortarAqui, anadirAviso, deshacer: secciones.deshacer, rehacer: secciones.rehacer };
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLInputElement && e.target.type !== "range";
      if (escribiendo || e.repeat || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (e.ctrlKey && (tecla === "y" || (tecla === "z" && e.shiftKey))) {
        e.preventDefault();
        teclas.current.rehacer();
      } else if (e.ctrlKey && tecla === "z") {
        e.preventDefault();
        teclas.current.deshacer();
      } else if (!e.ctrlKey && e.code === "KeyS") {
        e.preventDefault();
        teclas.current.cortarAqui();
      } else if (!e.ctrlKey && e.code === "KeyG") {
        e.preventDefault();
        teclas.current.anadirAviso();
      }
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, []);

  // Qué pistas se ven. El índice en el motor se conserva aunque se oculten.
  const visibles = useMemo(
    () => pistas.map((p, indice) => ({ pista: p, indice })).filter(({ pista }) => !pista.vacia || mostrarVacias),
    [pistas, mostrarVacias],
  );
  const ocultas = pistas.filter((p) => p.vacia);
  const haySolo = pistas.some((p) => p.solo);

  // Cada pista toma una parte igual del alto disponible (nunca menos del mínimo).
  const altoFila =
    visibles.length > 0 ? Math.max(ALTO_MINIMO, Math.floor((altoZona - ALTO_REGLA - ALTO_FRANJA) / visibles.length)) : ALTO_MINIMO;

  const filas: FilaOnda[] = useMemo(
    () =>
      visibles.map(({ pista: p }) => ({
        clave: String(p.id),
        color: datosPista(p).color,
        picos: ondas.get(p.archivo),
        apagada: !!p.mute || (haySolo && !p.solo),
        desfase: p.desfase_ms / 1000 + entrada,
        movible: !!p.propia,
      })),
    [visibles, ondas, haySolo, entrada],
  );

  function alMover(clave: string, desfase: number) {
    const i = pistas.findIndex((p) => String(p.id) === clave);
    if (i >= 0) cambiar(i, pistas[i], { desfase_ms: Math.round(desfase * 1000) });
  }

  /**
   * Lo que se exporta: lo que se escucha ahora. Pistas con R (las vacías no, porque
   * casi no suenan), click y guía solo si están encendidos, la velocidad y el tono
   * del transporte. Todo en la línea de la app (con los compases antes de la música).
   */
  function armarPaquete(): Paquete {
    const conBpm = click.bpm !== null;
    const etiquetas = nombres(secciones.secciones ?? []);
    const lista = secciones.secciones ?? [];
    return {
      titulo: cancion.titulo,
      tono: cancion.tono,
      bpm: click.bpm,
      tiempos: click.compas,
      velocidad: estudio.velocidad,
      semitonos: estudio.semitonos,
      duracion: duracionTotal,
      pistas: pistas
        .filter((p) => p.en_export && !p.vacia)
        .map((p) => ({
          nombre: datosPista(p).nombre,
          archivo: p.archivo,
          desfase: p.desfase_ms / 1000 + entrada,
          volumen: p.volumen,
        })),
      click:
        conBpm && click.activo
          ? {
              bpm: clickLinea.bpm!,
              tiempos: clickLinea.compas,
              inicio: clickLinea.inicio,
              conteo: clickLinea.conteo,
              volumen: click.volumen,
            }
          : null,
      guia: conBpm && click.guiaActiva ? guia.eventos : null,
      volumenGuia: click.guiaVolumen,
      secciones: lista.map((s, i) => ({
        nombre: etiquetas[i],
        inicio: s.inicio + entrada,
        fin: (lista[i + 1]?.inicio ?? duracion) + entrada,
      })),
      fuera: pistas.filter((p) => !p.en_export && !p.vacia).map((p) => datosPista(p).nombre),
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p role="alert" className="m-0 flex border-b border-line bg-[#3a1d24] px-5 py-2 text-[#ffb3bd]">
          <span className="flex-1">{error}</span>
          <button aria-label="Cerrar aviso" onClick={() => setError("")} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </p>
      )}
      {errorIa && !proponiendo && !haySecciones && (
        <p role="alert" className="m-0 flex gap-3 border-b border-line bg-[#3a1d24] px-5 py-2 text-[#ffb3bd]">
          <span className="min-w-0 flex-1">{errorIa}</span>
          <button aria-label="Cerrar aviso de la IA" onClick={() => setErrorIa(null)} className="self-start opacity-70 hover:opacity-100">
            ✕
          </button>
        </p>
      )}

      {/* Cabeceras y ondas se desplazan juntas si las pistas no caben. */}
      <div ref={zona} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[244px_1fr]">
          <div className="border-r border-line bg-ink-1">
            <div
              style={{ height: ALTO_REGLA }}
              className="flex items-center gap-2 border-b border-line bg-ink-0 px-3"
            >
              <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Mezclador</span>
              {ocultas.length > 0 && (
                <button
                  onClick={() => setMostrarVacias((v) => !v)}
                  title={`Casi no suenan: ${ocultas.map((p) => datosPista(p).nombre).join(", ")}`}
                  className="text-[11px] text-fg-3 hover:text-fg"
                >
                  {mostrarVacias ? "Ocultar vacías" : `+${ocultas.length} vacía${ocultas.length > 1 ? "s" : ""}`}
                </button>
              )}
              <button
                onClick={anadirPista}
                title="Agrega un archivo tuyo (por ejemplo, un teclado grabado aparte) como una pista más"
                className="ml-auto flex items-center gap-1 rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg"
              >
                <IconoMas size={12} />
                Añadir pista
              </button>
            </div>
            <div style={{ height: ALTO_SECCIONES }} className="flex items-center gap-1 border-b border-line bg-ink-0 px-3">
              <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Secciones</span>
              <button
                onClick={cortarAqui}
                title="Corta la sección donde está la canción ahora (tecla S). Se pega al compás si hay click."
                className="ml-auto rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg"
              >
                Cortar (S)
              </button>
              <BotonChico etiqueta="Deshacer (Ctrl+Z)" deshabilitado={!secciones.puedeDeshacer} onClick={secciones.deshacer}>
                ↶
              </BotonChico>
              <BotonChico etiqueta="Rehacer (Ctrl+Y)" deshabilitado={!secciones.puedeRehacer} onClick={secciones.rehacer}>
                ↷
              </BotonChico>
            </div>
            <div style={{ height: ALTO_GUIA }} className="flex items-center gap-1 border-b border-line bg-ink-0 px-3">
              <span className="text-[10.5px] font-semibold tracking-wider text-fg-3 uppercase">Voz guía</span>
              <button
                onClick={() => setEditarFrases(true)}
                title="Grabar, importar o restaurar frases"
                className="ml-auto rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg"
              >
                Frases…
              </button>
              <button
                onClick={anadirAviso}
                disabled={!click.bpm}
                title="Agrega un aviso (Todos, Bajamos, Última vez...) donde está la canción (tecla G)"
                className="rounded-md border border-line-2 px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg disabled:opacity-35"
              >
                + Aviso (G)
              </button>
            </div>
            {visibles.map(({ pista, indice }) => (
              <CabeceraPista
                key={pista.id}
                pista={pista}
                alto={altoFila}
                alCambiar={(cambio) => cambiar(indice, pista, cambio)}
                alQuitar={() => setPorQuitar(pista)}
              />
            ))}
          </div>
          <LineaTiempo
            filas={filas}
            altoFila={altoFila}
            duracion={duracionTotal}
            entrada={entrada}
            alSaltar={(s) => motor.buscar(s).catch((e) => setError(String(e)))}
            alMover={alMover}
            click={click.bpm !== null ? click : null}
            alMoverInicio={(inicio) => alCambiarClick({ inicio })}
            franja={(ancho) => (
              <FranjaSecciones
                secciones={secciones.secciones}
                duracion={duracion}
                entrada={entrada}
                ancho={ancho}
                alCambiar={secciones.cambiar}
                alSaltar={(s) => motor.buscar(s + entrada).catch((e) => setError(String(e)))}
                ajustar={ajustar}
                alMarcarAMano={() => secciones.cambiar(empezar())}
                alProponer={() => esperarPropuesta(proponerConIa(id, cancion.archivo, ajustar))}
                proponiendo={proponiendo}
                avanceIa={avanceIa}
                desdeIa={desdeIa}
                errorIa={errorIa}
              />
            )}
            franjaGuia={(ancho) => (
              <FranjaGuia
                marcas={guia.marcas}
                secciones={secciones.secciones}
                click={clickLinea}
                duracion={duracionTotal}
                ancho={ancho}
                frases={[...frases.keys()]}
                alCambiarSeccion={cambiarSeccionGuia}
                alCambiarLibre={(aviso) => cambiarLibre({
                  ...aviso, segundo: Math.round((aviso.segundo - entrada) * 1000) / 1000,
                })}
                alBorrarLibre={borrarLibre}
                alSaltar={(s) => motor.buscar(s).catch((e) => setError(String(e)))}
              />
            )}
          />
        </div>
      </div>

      <Transporte
        duracion={duracionTotal}
        estudio={estudio}
        tono={cancion.tono}
        click={click}
        alCambiarClick={alCambiarClick}
        alCambiarEstudio={cambiarEstudio}
        alError={setError}
        alExportar={() => setExportando(true)}
      />

      {editarFrases && (
        <FrasesGuia
          frases={[...frases.keys()]}
          alCambiar={async () => setFrases(await motor.frasesGuia())}
          alCerrar={() => setEditarFrases(false)}
        />
      )}
      {exportando && (
        <Exportar cancionId={id} paquete={armarPaquete()} alCerrar={() => setExportando(false)} />
      )}
      {porQuitar && (
        <Confirmar
          titulo={`¿Quitar "${datosPista(porQuitar).nombre}"?`}
          texto="Se quita de esta canción. Tu archivo original no se toca: lo puedes volver a añadir."
          boton="Quitar pista"
          alConfirmar={() => quitar(porQuitar)}
          alCancelar={() => setPorQuitar(null)}
        />
      )}
    </div>
  );
}

function BotonChico(props: { etiqueta: string; deshabilitado: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={props.etiqueta}
      title={props.etiqueta}
      disabled={props.deshabilitado}
      onClick={props.onClick}
      className="grid size-6 place-items-center rounded-md text-[14px] text-fg-2 hover:bg-ink-3 hover:text-fg disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}
