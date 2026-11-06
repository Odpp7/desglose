import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Estado = {
  reproduciendo: boolean;
  terminado: boolean;
  cortes: number;
  posicion: number;
  duracion: number;
};

type Pista = {
  nombre: string;
  volumen: number;
  mute: boolean;
  solo: boolean;
};

function formatoTiempo(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  const resto = Math.floor(segundos % 60);
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

function App() {
  const [carpeta, setCarpeta] = useState("");
  const [pistas, setPistas] = useState<Pista[]>([]);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);
  // Mientras se arrastra la barra guarda a dónde va; al soltar se hace el salto.
  const [arrastre, setArrastre] = useState<number | null>(null);

  useEffect(() => {
    const dejarDeEscuchar = listen<Estado>("estado", (evento) => setEstado(evento.payload));
    return () => {
      dejarDeEscuchar.then((dejar) => dejar());
    };
  }, []);

  async function ejecutar(orden: string, args?: Record<string, unknown>) {
    setError("");
    try {
      await invoke(orden, args);
    } catch (e) {
      setError(String(e));
    }
  }

  async function cargar() {
    setError("");
    try {
      // Quita las comillas que agrega "Copiar como ruta de acceso" en Windows.
      const limpia = carpeta.trim().replace(/^"|"$/g, "");
      const nombres = await invoke<string[]>("cargar_carpeta", { carpeta: limpia });
      setPistas(nombres.map((nombre) => ({ nombre, volumen: 1, mute: false, solo: false })));
    } catch (e) {
      setPistas([]);
      setError(String(e));
    }
  }

  async function soltarBarra() {
    if (arrastre === null) return;
    await ejecutar("buscar", { segundos: arrastre });
    setArrastre(null);
  }

  function cambiar(indice: number, cambio: Partial<Pista>) {
    setPistas((actuales) =>
      actuales.map((pista, i) => (i === indice ? { ...pista, ...cambio } : pista)),
    );
  }

  function cambiarVolumen(indice: number, valor: number) {
    cambiar(indice, { volumen: valor });
    ejecutar("volumen", { indice, valor });
  }

  function cambiarMute(indice: number, valor: boolean) {
    cambiar(indice, { mute: valor });
    ejecutar("mute", { indice, valor });
  }

  function cambiarSolo(indice: number, valor: boolean) {
    cambiar(indice, { solo: valor });
    ejecutar("solo", { indice, valor });
  }

  function textoEstado() {
    if (pistas.length === 0) return "Sin pistas";
    if (estado?.terminado) return "Terminó";
    return estado?.reproduciendo ? "Reproduciendo" : "En pausa";
  }

  const posicion = arrastre ?? estado?.posicion ?? 0;
  const duracion = estado?.duracion ?? 0;

  return (
    <main>
      <h1>Motor de audio</h1>

      <label htmlFor="carpeta">Carpeta con las pistas (FLAC o WAV)</label>
      <div className="fila">
        <input
          id="carpeta"
          value={carpeta}
          onChange={(e) => setCarpeta(e.target.value)}
          placeholder="C:\ruta\sinteticas"
        />
        <button onClick={cargar}>Cargar</button>
      </div>

      <div className="fila">
        <button disabled={pistas.length === 0} onClick={() => ejecutar("play")}>
          Play
        </button>
        <button disabled={pistas.length === 0} onClick={() => ejecutar("pausa")}>
          Pausa
        </button>
      </div>

      <div className="fila tiempo">
        <span>{formatoTiempo(posicion)}</span>
        <input
          type="range"
          aria-label="Posición en la canción"
          disabled={pistas.length === 0}
          min={0}
          max={duracion}
          step={0.1}
          value={posicion}
          onChange={(e) => setArrastre(Number(e.target.value))}
          onPointerUp={soltarBarra}
          onKeyUp={soltarBarra}
        />
        <span>{formatoTiempo(duracion)}</span>
      </div>

      <p>
        {textoEstado()} · Cortes: {estado?.cortes ?? 0}
      </p>
      {error && <p className="error">{error}</p>}

      {pistas.map((pista, indice) => (
        <div className="pista" key={pista.nombre}>
          <span className="nombre">{pista.nombre}</span>
          <input
            type="range"
            aria-label={`Volumen de ${pista.nombre}`}
            min={0}
            max={1}
            step={0.01}
            value={pista.volumen}
            onChange={(e) => cambiarVolumen(indice, Number(e.target.value))}
          />
          <button
            className={pista.mute ? "activo" : ""}
            onClick={() => cambiarMute(indice, !pista.mute)}
          >
            Silenciar
          </button>
          <button
            className={pista.solo ? "activo" : ""}
            onClick={() => cambiarSolo(indice, !pista.solo)}
          >
            Solo
          </button>
        </div>
      ))}
    </main>
  );
}

export default App;
