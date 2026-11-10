import { useEffect, useRef, useState } from "react";
import { motor } from "../../lib/engine";

const MAX_SEGUNDOS = 10;
const MAX_BYTES = 4 * 1024 * 1024;
const BOTON = "rounded-md border border-line-2 px-3 py-1.5 hover:bg-ink-3 disabled:opacity-40";

// El WebView captura una frase corta. El motor de la canción sigue en Rust.
async function grabacionAWav(grabacion: Blob) {
  const contexto = new AudioContext({ sampleRate: 22050 });
  try {
    const audio = await contexto.decodeAudioData(await grabacion.arrayBuffer());
    const muestras = Math.min(audio.length, contexto.sampleRate * MAX_SEGUNDOS);
    const wav = new DataView(new ArrayBuffer(44 + muestras * 2));
    const texto = (offset: number, valor: string) => {
      for (let i = 0; i < valor.length; i++) wav.setUint8(offset + i, valor.charCodeAt(i));
    };
    texto(0, "RIFF");
    wav.setUint32(4, wav.byteLength - 8, true);
    texto(8, "WAVEfmt ");
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true); // PCM
    wav.setUint16(22, 1, true); // Mono
    wav.setUint32(24, contexto.sampleRate, true);
    wav.setUint32(28, contexto.sampleRate * 2, true);
    wav.setUint16(32, 2, true);
    wav.setUint16(34, 16, true);
    texto(36, "data");
    wav.setUint32(40, muestras * 2, true);
    const canales = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    for (let i = 0; i < muestras; i++) {
      const mono = canales.reduce((suma, canal) => suma + canal[i], 0) / canales.length;
      wav.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, mono)) * 32767), true);
    }
    return new Blob([wav.buffer], { type: "audio/wav" });
  } finally {
    await contexto.close();
  }
}

type Props = {
  frases: string[];
  alCambiar: () => Promise<void>;
  alCerrar: () => void;
};

export function FrasesGuia({ frases, alCambiar, alCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const captura = useRef<{ grabador: MediaRecorder; flujo: MediaStream; limite: number } | null>(null);
  const abierto = useRef(false);
  const [estado, setEstado] = useState<"libre" | "permiso" | "grabando" | "preparando" | "guardando">("libre");
  const [nombre, setNombre] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [vista, setVista] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [restaurables, setRestaurables] = useState<string[]>([]);
  const ocupada = estado !== "libre";
  const frase = nombre.trim();
  const existe = frases.includes(frase);

  useEffect(() => {
    const nodo = dialogo.current;
    nodo?.showModal();
    abierto.current = true;
    motor.frasesGuiaRestaurables().then(
      (lista) => { if (abierto.current) setRestaurables(lista); },
      (e) => { if (abierto.current) setError(String(e)); },
    );
    return () => {
      abierto.current = false;
      nodo?.close();
      const actual = captura.current;
      if (!actual) return;
      captura.current = null;
      window.clearTimeout(actual.limite);
      actual.grabador.onstop = null;
      if (actual.grabador.state !== "inactive") actual.grabador.stop();
      actual.flujo.getTracks().forEach((pista) => pista.stop());
    };
  }, []);

  useEffect(() => {
    if (!audio) {
      setVista("");
      return;
    }
    const url = URL.createObjectURL(audio);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  async function grabar() {
    setEstado("permiso");
    setError("");
    setAviso("");
    setAudio(null);
    let flujo: MediaStream | undefined;
    try {
      await motor.pausa();
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!abierto.current) {
        flujo.getTracks().forEach((pista) => pista.stop());
        return;
      }
      const grabador = new MediaRecorder(flujo);
      const partes: Blob[] = [];
      grabador.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
      grabador.onstop = async () => {
        const actual = captura.current;
        if (actual?.grabador !== grabador) return;
        captura.current = null;
        window.clearTimeout(actual.limite);
        actual.flujo.getTracks().forEach((pista) => pista.stop());
        setEstado("preparando");
        try {
          const wav = await grabacionAWav(new Blob(partes, { type: grabador.mimeType }));
          if (abierto.current) setAudio(wav);
        } catch {
          if (abierto.current) setError("No se pudo preparar la grabación. Intenta grabar otra vez.");
        } finally {
          if (abierto.current) setEstado("libre");
        }
      };
      grabador.onerror = () => {
        const actual = captura.current;
        if (actual?.grabador !== grabador) return;
        captura.current = null;
        window.clearTimeout(actual.limite);
        actual.flujo.getTracks().forEach((pista) => pista.stop());
        setError("El micrófono dejó de grabar. Comprueba que esté conectado.");
        setEstado("libre");
      };
      grabador.start();
      const limite = window.setTimeout(() => {
        if (grabador.state === "recording") grabador.stop();
      }, MAX_SEGUNDOS * 1000);
      captura.current = { grabador, flujo, limite };
      setEstado("grabando");
    } catch {
      flujo?.getTracks().forEach((pista) => pista.stop());
      if (!abierto.current) return;
      setError("No se pudo usar el micrófono. Revisa el permiso de Windows o importa un WAV.");
      setEstado("libre");
    }
  }

  function importar(archivo?: File) {
    if (!archivo) return;
    setError("");
    setAviso("");
    setAudio(null);
    if (!/\.wav$/i.test(archivo.name) || archivo.size > MAX_BYTES) {
      setError("Elige un archivo WAV de hasta 4 MB.");
      return;
    }
    setAudio(archivo);
  }

  async function aplicar(restaurar: boolean) {
    setError("");
    setAviso("");
    setEstado("guardando");
    try {
      if (restaurar) {
        await motor.restaurarFraseGuia(frase);
      } else if (audio) {
        const bytes = new Uint8Array(await audio.arrayBuffer());
        await motor.guardarFraseGuia(frase, bytes);
      }
      await alCambiar();
      setRestaurables(await motor.frasesGuiaRestaurables());
      setConfirmado(false);
      setAudio(null);
      setAviso(restaurar ? "Frase original restaurada." : "Frase guardada. Ya puedes usarla en tus avisos.");
    } catch (e) {
      setError(String(e));
    } finally {
      setEstado("libre");
    }
  }

  return (
    <dialog
      ref={dialogo}
      aria-labelledby="frases-guia-titulo"
      className="m-auto w-[min(440px,90vw)] rounded-xl border border-line-2 bg-ink-2 p-5 text-fg backdrop:bg-black/55"
      onCancel={(e) => {
        e.preventDefault();
        if (estado !== "guardando") alCerrar();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <h2 id="frases-guia-titulo" className="mb-1 font-semibold">Frases de voz guía</h2>
      <p className="mb-4 text-sm text-fg-2">Escribe un nombre nuevo o elige una frase para reemplazarla en todas las canciones.</p>
      <label className="grid gap-1 text-sm">
        Nombre de la frase
        <input
          autoFocus
          value={nombre}
          list="frases-guia-nombres"
          maxLength={100}
          disabled={ocupada}
          onChange={(e) => { setNombre(e.target.value); setConfirmado(false); }}
          className="rounded-md border border-line-2 bg-ink-0 p-2"
          placeholder="Ej. Solo teclado"
        />
      </label>
      <datalist id="frases-guia-nombres">{frases.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="my-3 flex items-center gap-2">
        {estado === "grabando" ? (
          <button className={BOTON} onClick={() => {
            const grabador = captura.current?.grabador;
            if (grabador?.state === "recording") grabador.stop();
          }}>Detener grabación</button>
        ) : (
          <button className={BOTON} disabled={ocupada} onClick={grabar}>Grabar</button>
        )}
        <label className={`${BOTON} cursor-pointer focus-within:ring-1 focus-within:ring-accent ${ocupada ? "opacity-40" : ""}`}>
          Importar WAV
          <input
            type="file"
            accept=".wav,audio/wav"
            disabled={ocupada}
            className="sr-only"
            onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }}
          />
        </label>
      </div>
      <p className="mb-3 text-xs text-fg-2" role="status">
        {estado === "grabando" ? "Grabando… se detiene a los 10 segundos." :
          estado === "permiso" ? "Esperando permiso del micrófono…" :
          estado === "preparando" ? "Preparando grabación…" : "Hasta 10 segundos por frase."}
      </p>
      {vista && (
        <audio
          controls
          src={vista}
          aria-label="Escuchar la frase"
          onPlay={() => { void motor.pausa().catch(() => {}); }}
          className="mb-3 w-full"
        />
      )}
      {audio && existe && (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmado} disabled={ocupada} onChange={(e) => setConfirmado(e.target.checked)} />
          Reemplazar «{frase}»
        </label>
      )}
      {error && <p role="alert" className="mb-2 text-sm text-red-300">{error}</p>}
      {aviso && <p role="status" className="mb-2 text-sm text-accent">{aviso}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {restaurables.includes(frase) && (
          <button className={BOTON} disabled={ocupada} onClick={() => aplicar(true)}>Restaurar original</button>
        )}
        <button className={BOTON} disabled={estado === "guardando"} onClick={alCerrar}>Cerrar</button>
        <button
          className="rounded-md bg-accent px-3 py-1.5 font-semibold text-accent-ink disabled:opacity-40"
          disabled={ocupada || !frase || !audio || (existe && !confirmado)}
          onClick={() => aplicar(false)}
        >
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </dialog>
  );
}
