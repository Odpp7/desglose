import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type Estado = {
  reproduciendo: boolean;
  terminado: boolean;
  cortes: number;
};

function App() {
  const [ruta, setRuta] = useState("");
  const [cargada, setCargada] = useState(false);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    const intervalo = setInterval(async () => {
      setEstado(await invoke<Estado>("estado"));
    }, 500);
    return () => clearInterval(intervalo);
  }, []);

  async function ejecutar(orden: string, args?: { ruta: string }) {
    setError("");
    try {
      await invoke(orden, args);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }

  async function cargar() {
    // Quita las comillas que agrega "Copiar como ruta de acceso" en Windows.
    const limpia = ruta.trim().replace(/^"|"$/g, "");
    setCargada(await ejecutar("cargar", { ruta: limpia }));
  }

  function textoEstado() {
    if (!cargada) return "Sin pista";
    if (estado?.terminado) return "Terminó";
    return estado?.reproduciendo ? "Reproduciendo" : "En pausa";
  }

  return (
    <main>
      <h1>Motor de audio</h1>

      <label htmlFor="ruta">Ruta de la pista (FLAC o WAV)</label>
      <div className="fila">
        <input
          id="ruta"
          value={ruta}
          onChange={(e) => setRuta(e.target.value)}
          placeholder="C:\ruta\pista1.flac"
        />
        <button onClick={cargar}>Cargar</button>
      </div>

      <div className="fila">
        <button disabled={!cargada} onClick={() => ejecutar("play")}>
          Play
        </button>
        <button disabled={!cargada} onClick={() => ejecutar("pausa")}>
          Pausa
        </button>
      </div>

      <p>
        {textoEstado()} · Cortes: {estado?.cortes ?? 0}
      </p>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

export default App;
