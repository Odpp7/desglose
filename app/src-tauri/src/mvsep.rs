// Cliente de la API gratuita de MVSep (mvsep.com): sube un archivo, espera a
// que lo separe y baja las pistas que devuelve.
// Pasado a Rust desde el prototipo `prototypes/ai-pipeline/mvsep.py`.
//
// Cada separación es un "trabajo":
//   1. POST /create con el audio y el modelo  → MVSep devuelve un código (hash).
//   2. GET  /get?hash=...  cada 15 s          → "en fila", "procesando"... o "listo" con las URLs.
//   3. Se baja cada archivo.
//
// Plan gratis: un solo trabajo a la vez por cuenta, y CADA trabajo hace la fila
// completa. Con la fila llena (400 trabajos) un trabajo puede esperar más de una hora.
// Por eso el código de cada trabajo se guarda en el disco: si la app se cierra
// mientras espera, al reintentar sigue esperando el MISMO trabajo, sin perder el lugar.
//
// Cancelar: la interfaz enciende una señal (`cancelar`). Mientras espera en la fila,
// el cliente la revisa cada cuarto de segundo; al verla, le pide a MVSep que cancele
// el trabajo (si no empezó a procesarse, no cuenta) y termina con `CANCELADA`.

use std::fs::{self, File};
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use reqwest::blocking::Client;
use reqwest::blocking::multipart::Form;
use serde::Serialize;
use serde_json::Value;

const SITIO: &str = "https://mvsep.com/api";
const FLAC_16_BITS: &str = "2"; // el de 24 bits es solo para usuarios de pago
const ESPERA_ENTRE_CONSULTAS: Duration = Duration::from_secs(15);
const LIMITE_POR_TRABAJO: Duration = Duration::from_secs(4 * 60 * 60);
/// Consultas seguidas que pueden fallar (un corte corto de internet) antes de rendirse.
const FALLOS_TOLERADOS: u32 = 8;

/// Un modelo de MVSep con sus opciones (`add_opt1`, `add_opt2`...).
pub struct Modelo {
    pub sep_type: u32,
    pub opciones: &'static [(&'static str, &'static str)],
    /// Final del nombre de las pistas que debe devolver ("vocals-lead"...).
    /// Sirve para comprobar que el resultado es de este modelo.
    pub salidas: &'static [&'static str],
}

/// Cómo está la fila de MVSep para las cuentas gratis.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Fila {
    /// Trabajos esperando en la fila de cuentas gratis registradas.
    pub en_fila: Option<u64>,
    /// Cuántos trabajos procesa MVSep por minuto (todas las filas juntas).
    pub por_minuto: Option<f64>,
    /// Espera estimada para UN trabajo, en minutos.
    pub minutos_por_trabajo: Option<u64>,
}

pub struct Cliente {
    http: Client,
    clave: String,
    /// Se enciende cuando el encargado pulsa "Cancelar".
    cancelar: Arc<AtomicBool>,
}

/// El error con que termina una separación cancelada.
pub const CANCELADA: &str = "Separación cancelada.";

impl Cliente {
    pub fn new(clave: String, cancelar: Arc<AtomicBool>) -> Result<Self, String> {
        let http = Client::builder()
            // Subir o bajar una canción con internet lento puede tardar varios minutos.
            .timeout(Duration::from_secs(15 * 60))
            .build()
            .map_err(|e| format!("No se pudo preparar la conexión: {e}"))?;
        Ok(Self {
            http,
            clave,
            cancelar,
        })
    }

    /// Si se pidió cancelar, termina aquí.
    fn revisar(&self) -> Result<(), String> {
        if self.cancelar.load(Ordering::Relaxed) {
            Err(CANCELADA.into())
        } else {
            Ok(())
        }
    }

    /// Espera 15 s entre consultas, pero revisando cada cuarto de segundo si se
    /// canceló: así "Cancelar" responde enseguida.
    fn dormir(&self) -> Result<(), String> {
        let pasos = (ESPERA_ENTRE_CONSULTAS.as_millis() / 250) as u32;
        for _ in 0..pasos {
            self.revisar()?;
            thread::sleep(Duration::from_millis(250));
        }
        self.revisar()
    }

    /// Le pide a MVSep que cancele el trabajo. Si falla no importa: igual se descarta.
    fn cancelar_en_mvsep(&self, hash: &str) {
        let formulario = Form::new()
            .text("api_token", self.clave.clone())
            .text("hash", hash.to_string());
        let _ = self
            .http
            .post(format!("{SITIO}/separation/cancel"))
            .multipart(formulario)
            .timeout(Duration::from_secs(30))
            .send();
    }

    /// Separa `entrada` con `modelo` y deja las pistas en la carpeta `destino`.
    /// `avisar` recibe textos cortos para mostrar el avance ("En fila: 3 de 12").
    ///
    /// Baja todo a una carpeta temporal y al final la renombra: si algo falla a
    /// mitad, `destino` no existe y el trabajo se vuelve a bajar completo.
    pub fn separar(
        &self,
        entrada: &Path,
        modelo: &Modelo,
        destino: &Path,
        avisar: &mut dyn FnMut(String),
    ) -> Result<(), String> {
        // El código del trabajo vive al lado de la carpeta de destino: "2-voces.trabajo".
        let archivo_codigo = destino.with_extension("trabajo");
        let hash = match fs::read_to_string(&archivo_codigo) {
            Ok(guardado) if !guardado.trim().is_empty() => {
                avisar("Retomando el trabajo en MVSep".into());
                guardado.trim().to_string()
            }
            _ => {
                self.revisar()?;
                avisar("Subiendo la canción".into());
                let nuevo = match self.crear_trabajo(entrada, modelo) {
                    Ok(nuevo) => nuevo,
                    // La cuenta ya tiene un trabajo en curso: casi siempre es este mismo,
                    // que quedó huérfano al cerrarse la app. Se adopta para no perder la fila.
                    // Si resulta ser otro, `secuencia::etapa` lo nota al revisar las pistas.
                    Err(error) if error.starts_with(OCUPADO) => {
                        let activo = self.trabajo_activo()?.ok_or(error)?;
                        avisar("Retomando el trabajo que ya estaba en MVSep".into());
                        activo
                    }
                    Err(error) => return Err(error),
                };
                fs::write(&archivo_codigo, &nuevo)
                    .map_err(|e| format!("No se pudo guardar el trabajo: {e}"))?;
                nuevo
            }
        };

        let archivos = match self.esperar(&hash, avisar) {
            Ok(archivos) => archivos,
            Err(error) => {
                if error == CANCELADA {
                    self.cancelar_en_mvsep(&hash);
                }
                // Si MVSep ya no conoce ese trabajo, falló o se canceló, el próximo intento
                // crea uno nuevo. Si fue un corte de internet, el código se conserva.
                if !error.starts_with(SIN_CONEXION) {
                    let _ = fs::remove_file(&archivo_codigo);
                }
                return Err(error);
            }
        };

        avisar("Bajando las pistas".into());
        let temporal = destino.with_extension("bajando");
        if temporal.exists() {
            fs::remove_dir_all(&temporal).map_err(|e| format!("No se pudo limpiar: {e}"))?;
        }
        fs::create_dir_all(&temporal).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
        for archivo in &archivos {
            if let Err(error) = self.revisar().and_then(|_| self.bajar(archivo, &temporal)) {
                let _ = fs::remove_dir_all(&temporal);
                return Err(error);
            }
        }
        // Si se adoptó un trabajo que resultó ser otro, sus pistas no coinciden:
        // se descarta y el próximo intento crea uno nuevo.
        if let Some(falta) = modelo.salidas.iter().find(|s| !tiene_pista(&temporal, s)) {
            let _ = fs::remove_dir_all(&temporal);
            let _ = fs::remove_file(&archivo_codigo);
            return Err(format!(
                "MVSep devolvió otras pistas (falta \"{falta}\"). Reintenta: se crea un trabajo nuevo."
            ));
        }
        fs::rename(&temporal, destino)
            .map_err(|e| format!("No se pudo guardar las pistas: {e}"))?;
        let _ = fs::remove_file(&archivo_codigo);
        Ok(())
    }

    /// El trabajo de esta cuenta que sigue en fila o procesándose, si hay uno.
    /// Revisa los últimos del historial (el plan gratis solo permite uno a la vez).
    fn trabajo_activo(&self) -> Result<Option<String>, String> {
        let historial = self.pedir_json(&format!(
            "{SITIO}/app/separation_history?api_token={}&limit=5",
            self.clave
        ))?;
        let trabajos = historial["data"].as_array().cloned().unwrap_or_default();
        for trabajo in trabajos {
            let Some(hash) = trabajo["hash"].as_str() else {
                continue;
            };
            let estado = self.pedir_json(&format!("{SITIO}/separation/get?hash={hash}"))?;
            if matches!(
                estado["status"].as_str(),
                Some("waiting" | "processing" | "distributing" | "merging")
            ) {
                return Ok(Some(hash.to_string()));
            }
        }
        Ok(None)
    }

    /// Cuántos trabajos hay en la fila gratis y cuánto se espera por cada uno.
    /// La primera consulta es pública; la segunda usa la clave para saber el ritmo.
    pub fn fila(&self) -> Result<Fila, String> {
        let publica: Value = self.pedir_json(&format!("{SITIO}/app/queue"))?;
        let en_fila = publica["queue"]["registered"].as_u64();

        let resumen: Value = self
            .pedir_json(&format!(
                "{SITIO}/app/queue/summary?api_token={}",
                self.clave
            ))
            .unwrap_or(Value::Null);
        let por_minuto = campo(&resumen, "throughput_per_min").and_then(Value::as_f64);

        let minutos_por_trabajo = match (en_fila, por_minuto) {
            (Some(fila), Some(ritmo)) if ritmo > 0.0 => Some((fila as f64 / ritmo).ceil() as u64),
            _ => None,
        };
        Ok(Fila {
            en_fila,
            por_minuto,
            minutos_por_trabajo,
        })
    }

    fn crear_trabajo(&self, entrada: &Path, modelo: &Modelo) -> Result<String, String> {
        let mut formulario = Form::new()
            .text("api_token", self.clave.clone())
            .text("sep_type", modelo.sep_type.to_string())
            .text("output_format", FLAC_16_BITS);
        for (nombre, valor) in modelo.opciones {
            formulario = formulario.text(*nombre, *valor);
        }
        let formulario = formulario
            .file("audiofile", entrada)
            .map_err(|e| format!("No se pudo leer el audio: {e}"))?;

        let respuesta = self
            .http
            .post(format!("{SITIO}/separation/create"))
            .multipart(formulario)
            .send()
            .map_err(|e| self.error_de_red(e))?;
        let codigo = respuesta.status();
        let cuerpo: Value = respuesta.json().map_err(|e| self.error_de_red(e))?;

        if cuerpo["success"].as_bool() != Some(true) {
            let detalle = cuerpo["data"]["message"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| cuerpo.to_string());
            let minusculas = detalle.to_lowercase();
            if codigo.as_u16() == 401 || minusculas.contains("token") {
                return Err("MVSep no aceptó la clave. Revísala en Ajustes.".into());
            }
            if minusculas.contains("concurrent") || minusculas.contains("already") {
                return Err(format!("{OCUPADO} Espera a que termine y reintenta."));
            }
            return Err(self.ocultar_clave(format!("MVSep rechazó el trabajo: {detalle}")));
        }
        cuerpo["data"]["hash"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "MVSep no devolvió el código del trabajo".into())
    }

    /// Pregunta cada 15 s cómo va el trabajo hasta que termine.
    /// Devuelve la lista de archivos para bajar (cada uno con `url` y `download`).
    fn esperar(&self, hash: &str, avisar: &mut dyn FnMut(String)) -> Result<Vec<Value>, String> {
        let inicio = Instant::now();
        let mut fallos = 0;

        while inicio.elapsed() < LIMITE_POR_TRABAJO {
            let cuerpo = match self.pedir_json(&format!("{SITIO}/separation/get?hash={hash}")) {
                Ok(cuerpo) => {
                    fallos = 0;
                    cuerpo
                }
                // Un corte corto de internet no debe tirar una espera de una hora.
                Err(error) => {
                    fallos += 1;
                    if fallos > FALLOS_TOLERADOS {
                        return Err(error);
                    }
                    avisar("Sin conexión, reintentando…".into());
                    self.dormir()?;
                    continue;
                }
            };

            let datos = &cuerpo["data"];
            match cuerpo["status"].as_str().unwrap_or("") {
                "done" => {
                    return datos["files"]
                        .as_array()
                        .cloned()
                        .ok_or_else(|| "MVSep terminó pero no devolvió archivos".into());
                }
                "failed" | "not_found" => {
                    let motivo = datos["message"].as_str().unwrap_or("sin detalle");
                    return Err(format!("MVSep no pudo separar la canción: {motivo}"));
                }
                "waiting" => avisar(self.texto_fila(datos)),
                _ => avisar("MVSep está separando".into()),
            }
            self.dormir()?;
        }
        Err("MVSep tardó más de 4 horas. Reintenta más tarde: se retoma el mismo trabajo.".into())
    }

    /// "En fila en MVSep: 120 de 403 · faltan unos 25 min"
    fn texto_fila(&self, datos: &Value) -> String {
        let mut texto = match (
            datos["current_order"].as_u64(),
            datos["queue_count"].as_u64(),
        ) {
            (Some(lugar), Some(total)) => format!("En fila en MVSep: {lugar} de {total}"),
            _ => "En fila en MVSep".into(),
        };
        // La estimación es opcional: si falla, se muestra solo el lugar en la fila.
        if let Ok(resumen) = self.pedir_json(&format!(
            "{SITIO}/app/queue/summary?api_token={}",
            self.clave
        )) {
            if let Some(segundos) =
                campo(&resumen, "estimated_wait_seconds").and_then(Value::as_f64)
            {
                texto += &format!(" · faltan unos {} min", (segundos / 60.0).ceil().max(1.0));
            }
        }
        texto
    }

    fn bajar(&self, archivo: &Value, carpeta: &Path) -> Result<(), String> {
        let url = archivo["url"]
            .as_str()
            .ok_or("MVSep devolvió un archivo sin dirección")?;
        let nombre = archivo["download"]
            .as_str()
            .and_then(|d| Path::new(d).file_name())
            .ok_or("MVSep devolvió un archivo sin nombre")?;

        let mut respuesta = self
            .http
            .get(url)
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(|e| self.error_de_red(e))?;
        let mut destino = File::create(carpeta.join(nombre))
            .map_err(|e| format!("No se pudo guardar una pista: {e}"))?;
        respuesta
            .copy_to(&mut destino)
            .map_err(|e| self.error_de_red(e))?;
        Ok(())
    }

    fn pedir_json(&self, url: &str) -> Result<Value, String> {
        self.http
            .get(url)
            .timeout(Duration::from_secs(60))
            .send()
            .and_then(|r| r.json())
            .map_err(|e| self.error_de_red(e))
    }

    /// Traduce los errores de internet a algo que el encargado entienda.
    fn error_de_red(&self, error: reqwest::Error) -> String {
        if error.is_connect() || error.is_timeout() {
            return format!("{SIN_CONEXION} Revisa el internet y reintenta.");
        }
        self.ocultar_clave(format!("Error al hablar con MVSep: {error}"))
    }

    /// Nunca mostrar la clave en un mensaje de error.
    fn ocultar_clave(&self, texto: String) -> String {
        texto.replace(&self.clave, "***")
    }
}

const SIN_CONEXION: &str = "No hay conexión con MVSep.";
const OCUPADO: &str = "MVSep todavía tiene otro trabajo de esta cuenta en curso.";

/// ¿Hay en la carpeta un archivo cuyo nombre termina en `_<pista>`?
fn tiene_pista(carpeta: &Path, pista: &str) -> bool {
    let sufijo = format!("_{pista}");
    fs::read_dir(carpeta)
        .into_iter()
        .flatten()
        .flatten()
        .any(|e| {
            e.path()
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|n| n.to_lowercase().ends_with(&sufijo))
        })
}

/// Busca un campo arriba o dentro de "data": la documentación no dice dónde va.
fn campo<'a>(json: &'a Value, nombre: &str) -> Option<&'a Value> {
    json.get(nombre)
        .or_else(|| json.get("data").and_then(|d| d.get(nombre)))
        .filter(|v| !v.is_null())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn cancelar_corta_la_espera_enseguida() {
        let senal = Arc::new(AtomicBool::new(false));
        let cliente = Cliente::new("clave-de-prueba".into(), senal.clone()).unwrap();
        assert!(cliente.revisar().is_ok());

        senal.store(true, Ordering::Relaxed);
        let inicio = Instant::now();
        assert_eq!(cliente.dormir(), Err(CANCELADA.to_string()));
        assert!(inicio.elapsed() < Duration::from_secs(1), "debe cortar enseguida");
    }
}
