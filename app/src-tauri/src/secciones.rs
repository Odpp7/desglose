// Proponer secciones con la IA (SongFormer en Modal, `backend/secciones.py`).
//
// 1. Sube la canción original a "iniciar" (con la clave de Modal en el
//    encabezado "Clave"). Modal responde al momento con el número del trabajo.
// 2. Guarda ese número en `secciones-ia.txt`, en la carpeta de la canción.
// 3. Pregunta a "estado" cada 3 segundos en qué va y se lo avisa a la interfaz
//    con el evento "avance-secciones" (subiendo, en fila, preparando, analizando).
// 4. Al terminar borra el archivo y devuelve las secciones (etiquetas en inglés;
//    la interfaz las traduce, numera y pega al compás: `src/lib/secciones.ts`).
//
// Si la app se cierra a mitad, el archivo queda: al volver se retoma el MISMO
// trabajo (no se sube ni se paga otra vez).
//
// Importante: `reqwest::blocking` no puede correr directo en una orden `async`
// de Tauri (se cae por dentro y la interfaz se queda esperando para siempre).
// Por eso el trabajo va en `spawn_blocking`, un hilo aparte para esperar.

use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use reqwest::blocking::{Client, Response};
use reqwest::header::HeaderMap;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};

use crate::ajustes;
use crate::biblioteca;
use crate::servicios;

/// Direcciones web, tal como las da `modal deploy`.
const INICIAR: &str = "https://odpp7--desglose-secciones-iniciar.us-east.modal.run";
const ESTADO: &str = "https://odpp7--desglose-secciones-estado.us-east.modal.run";
/// Dónde se guarda el número del trabajo mientras corre.
const PENDIENTE: &str = "secciones-ia.txt";
const ESPERA_ENTRE_CONSULTAS: Duration = Duration::from_secs(3);
/// Si en este tiempo no terminó, algo anda mal (Modal lo corta a los 10 minutos).
const ESPERA_MAXIMA: Duration = Duration::from_secs(20 * 60);

/// Una sección tal como la devuelve SongFormer.
#[derive(Serialize, Deserialize)]
pub struct SeccionIa {
    inicio: f64,
    fin: f64,
    etiqueta: String,
}

/// Lo que se avisa a la interfaz mientras trabaja.
#[derive(Serialize, Clone)]
struct Avance {
    cancion: i64,
    /// "subiendo", "en fila", "preparando" o "analizando".
    etapa: String,
    /// Segundos que lleva en esa etapa (según Modal).
    segundos: u64,
}

#[derive(Deserialize)]
struct Iniciado {
    id: String,
}

#[derive(Deserialize)]
struct Estado {
    etapa: String,
    #[serde(default)]
    segundos: u64,
    secciones: Option<Vec<SeccionIa>>,
    mensaje: Option<String>,
}

/// Propone las secciones de la canción (`archivo`, dentro de su carpeta).
/// Si había un trabajo pendiente de antes, lo retoma en vez de empezar otro.
#[tauri::command]
pub async fn proponer_secciones(app: AppHandle, id: i64, archivo: String) -> Result<Vec<SeccionIa>, String> {
    tauri::async_runtime::spawn_blocking(move || proponer(&app, id, &archivo))
        .await
        .map_err(|_| "El análisis se detuvo. Puedes reintentar o marcar las secciones a mano.".to_string())?
}

/// ¿Quedó un trabajo a medias (se cerró la app mientras analizaba)?
#[tauri::command]
pub fn secciones_ia_pendiente(app: AppHandle, id: i64) -> bool {
    ruta_pendiente(&app, id).is_ok_and(|r| r.exists())
}

fn ruta_pendiente(app: &AppHandle, id: i64) -> Result<PathBuf, String> {
    Ok(biblioteca::carpeta_cancion(app, id)?.join(PENDIENTE))
}

fn proponer(app: &AppHandle, id: i64, archivo: &str) -> Result<Vec<SeccionIa>, String> {
    let clave = ajustes::leer_clave_modal(app)?
        .ok_or("Falta la clave de Modal. Pégala en Ajustes, o marca las secciones a mano.")?;
    let http = Client::builder()
        // Subir una canción con internet lento puede tardar unos minutos.
        .timeout(Duration::from_secs(5 * 60))
        .build()
        .map_err(|_| "No se pudo conectar con Modal. Puedes marcar las secciones a mano.")?;
    let pendiente = ruta_pendiente(app, id)?;
    let avisar = |etapa: &str, segundos: u64| {
        let _ = app.emit(
            "avance-secciones",
            Avance { cancion: id, etapa: etapa.into(), segundos },
        );
    };
    let error_de_red = |e: reqwest::Error| {
        if e.is_timeout() {
            "Modal no respondió a tiempo. Reintenta o marca las secciones a mano.".to_string()
        } else if e.is_connect() {
            "No hay conexión con Modal. Revisa internet o marca las secciones a mano.".to_string()
        } else {
            "No se pudo completar la comunicación con Modal. Reintenta o marca las secciones a mano.".to_string()
        }
    };

    // 1. Retomar el trabajo de antes, o subir la canción y empezar uno nuevo.
    let trabajo = match fs::read_to_string(&pendiente) {
        Ok(texto) if !texto.trim().is_empty() => texto.trim().to_string(),
        _ => {
            avisar("subiendo", 0);
            let ruta = biblioteca::ruta_en_cancion(app, id, archivo)?;
            let audio = fs::read(&ruta).map_err(|e| format!("No se pudo leer la canción: {e}"))?;
            let formato = ruta.extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_lowercase();
            let respuesta = http
                .post(INICIAR)
                // Sin este tipo, FastAPI intentaría leer la canción como JSON.
                .header("Content-Type", "application/octet-stream")
                .header("Clave", &clave)
                .header("Formato", formato)
                .body(audio)
                .send()
                .map_err(error_de_red)?;
            let iniciado: Iniciado = revisar(respuesta)?
                .json()
                .map_err(|_| "Modal no confirmó el inicio del análisis. Puedes marcar las secciones a mano.")?;
            fs::write(&pendiente, &iniciado.id).map_err(|e| format!("No se pudo anotar el trabajo: {e}"))?;
            iniciado.id
        }
    };

    // 2. Preguntar en qué va hasta que termine.
    let empezo = Instant::now();
    loop {
        if empezo.elapsed() > ESPERA_MAXIMA {
            let _ = fs::remove_file(&pendiente);
            return Err("La IA tardó demasiado. Reintenta más tarde, o marca las secciones a mano.".into());
        }
        // El número es como "fc-01ABC...": letras, números y guiones, va tal cual.
        let respuesta: Result<reqwest::blocking::Response, reqwest::Error> = http
            .get(format!("{ESTADO}?id={trabajo}"))
            .header("Clave", &clave)
            .timeout(Duration::from_secs(60))
            .send();
        let respuesta = match respuesta {
            Ok(r) => r,
            // Un corte de internet momentáneo no tira el trabajo: se vuelve a preguntar.
            Err(e) if e.is_connect() || e.is_timeout() => {
                avisar("sin conexión", 0);
                thread::sleep(ESPERA_ENTRE_CONSULTAS);
                continue;
            }
            Err(e) => return Err(error_de_red(e)),
        };
        if respuesta.status() == StatusCode::NOT_FOUND {
            // El trabajo venció en Modal: se olvida y el encargado puede reintentar.
            let _ = fs::remove_file(&pendiente);
            return Err("El análisis anterior ya venció. Pulsa \"Proponer con IA\" otra vez.".into());
        }
        let estado: Estado = revisar(respuesta)?
            .json()
            .map_err(|_| "Modal no pudo informar del avance. Reintenta o marca las secciones a mano.")?;

        match estado.etapa.as_str() {
            "listo" => {
                let _ = fs::remove_file(&pendiente);
                return estado.secciones.ok_or_else(|| "La IA terminó sin devolver secciones. Puedes marcarlas a mano.".into());
            }
            "error" => {
                let _ = fs::remove_file(&pendiente);
                let cuerpo = json!({ "message": estado.mensaje });
                return Err(error_modal(StatusCode::INTERNAL_SERVER_ERROR, &cuerpo, &HeaderMap::new()));
            }
            etapa => avisar(etapa, estado.segundos),
        }
        thread::sleep(ESPERA_ENTRE_CONSULTAS);
    }
}

/// Traduce las respuestas de Modal que no son "todo bien".
fn revisar(respuesta: Response) -> Result<Response, String> {
    let estado = respuesta.status();
    if estado.is_success() {
        return Ok(respuesta);
    }
    let headers = respuesta.headers().clone();
    Err(error_modal(estado, &servicios::leer_error(respuesta), &headers))
}

fn error_modal(estado: StatusCode, cuerpo: &Value, headers: &HeaderMap) -> String {
    let (mensaje, limite) = if estado == StatusCode::PAYMENT_REQUIRED || servicios::limite_confirmado(cuerpo) {
        ("Se agotó el crédito de Modal o se alcanzó su límite de uso.", true)
    } else {
        match estado {
            StatusCode::UNAUTHORIZED => ("La clave de Modal no es correcta. Revísala en Ajustes.", false),
            StatusCode::FORBIDDEN => ("Modal denegó el acceso. Revisa la clave en Ajustes.", false),
            StatusCode::TOO_MANY_REQUESTS => ("Modal está recibiendo demasiadas solicitudes. Intenta más tarde.", true),
            StatusCode::NOT_FOUND => ("El análisis con IA no está disponible ahora.", false),
            StatusCode::PAYLOAD_TOO_LARGE => ("La canción es demasiado grande para analizarla con Modal.", false),
            _ => ("La IA no pudo completar el análisis. Puedes reintentar más tarde.", false),
        }
    };
    let aviso = if limite { servicios::aviso_reinicio(cuerpo, headers) } else { String::new() };
    format!("{mensaje}{aviso} Puedes marcar las secciones a mano.")
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn distingue_credito_de_saturacion_y_ofrece_marcar_a_mano() {
        let mut headers = HeaderMap::new();
        headers.insert("retry-after", "Wed, 11 Nov 2026 00:00:00 GMT".parse().unwrap());
        let limite = error_modal(StatusCode::PAYMENT_REQUIRED, &Value::Null, &headers);
        assert!(limite.contains("crédito"));
        assert!(limite.contains("11/11/2026"));
        assert!(limite.contains("marcar las secciones a mano"));

        let temporal = error_modal(StatusCode::TOO_MANY_REQUESTS, &Value::Null, &HeaderMap::new());
        assert!(temporal.contains("demasiadas solicitudes"));
        assert!(!temporal.contains("crédito"));
        let interno = error_modal(StatusCode::INTERNAL_SERVER_ERROR, &json!({"detail":"traceback privado"}), &headers);
        assert!(!interno.contains("traceback"));
        assert!(!interno.contains("11/11/2026"));
    }
}
