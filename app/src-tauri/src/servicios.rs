//! Datos de error que se pueden mostrar sin copiar mensajes del proveedor.

use std::io::Read;

use reqwest::blocking::Response;
use reqwest::header::{HeaderMap, RETRY_AFTER};
use serde_json::Value;

pub fn leer_error(respuesta: Response) -> Value {
    let mut texto = String::new();
    let _ = respuesta.take(16 * 1024).read_to_string(&mut texto);
    serde_json::from_str(&texto).unwrap_or(Value::String(texto))
}

pub fn detalle(cuerpo: &Value) -> &str {
    cuerpo["data"]["message"]
        .as_str()
        .or_else(|| cuerpo["message"].as_str())
        .or_else(|| cuerpo["detail"].as_str())
        .or_else(|| cuerpo["error"].as_str())
        .or_else(|| cuerpo.as_str())
        .unwrap_or("")
}

pub fn limite_confirmado(cuerpo: &Value) -> bool {
    let mensaje = detalle(cuerpo).to_lowercase();
    let codigo = cuerpo["code"]
        .as_str()
        .or_else(|| cuerpo["data"]["code"].as_str());
    matches!(
        codigo,
        Some(
            "quota_exceeded"
                | "usage_limit_exceeded"
                | "insufficient_credits"
                | "credits_exhausted"
        )
    ) || [
        "quota exceeded",
        "exceeded your quota",
        "quota exhausted",
        "insufficient credits",
        "out of credits",
        "no credits left",
        "credits exhausted",
        "usage limit reached",
        "usage limit exceeded",
        "daily limit reached",
        "monthly limit reached",
        "daily limit exceeded",
        "monthly limit exceeded",
        "spending limit reached",
    ]
    .iter()
    .any(|frase| mensaje.contains(frase))
}

/// Solo muestra una fecha explícita del servicio. Retry-After en segundos es
/// una espera, y se muestra como tal para no inventar un día de reinicio.
pub fn aviso_reinicio(cuerpo: &Value, headers: &HeaderMap) -> String {
    let fecha = [cuerpo, &cuerpo["data"]]
        .iter()
        .filter_map(|datos| datos["reset_at"].as_str())
        .find_map(fecha_iso);
    if let Some(fecha) = fecha {
        return format!(" Fecha de renovación indicada: {fecha}.");
    }
    let Some(reintentar) = headers.get(RETRY_AFTER).and_then(|h| h.to_str().ok()) else {
        return String::new();
    };
    if let Ok(segundos) = reintentar.parse::<u64>() {
        return format!(
            " El servicio pidió esperar aproximadamente {} min.",
            segundos.div_ceil(60).max(1)
        );
    }
    // Retry-After también admite una fecha HTTP, por ejemplo «Wed, 11 Nov 2026 00:00:00 GMT».
    let partes: Vec<_> = reintentar.split_ascii_whitespace().collect();
    if let [_, dia, mes, anio, _, "GMT"] = partes.as_slice() {
        const MESES: [&str; 12] = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        if let Some(mes) = MESES.iter().position(|m| m == mes) {
            if let Some(fecha) = fecha_iso(&format!("{anio}-{:02}-{dia}", mes + 1)) {
                return format!(" Puedes reintentar a partir del {fecha} (UTC).");
            }
        }
    }
    String::new()
}

fn fecha_iso(valor: &str) -> Option<String> {
    let fecha = valor.get(..10)?;
    let (anio, resto) = fecha.split_once('-')?;
    let (mes, dia) = resto.split_once('-')?;
    if anio.len() != 4 || mes.len() != 2 || dia.len() != 2 {
        return None;
    }
    let (a, m, d) = (
        anio.parse::<u16>().ok()?,
        mes.parse::<u8>().ok()?,
        dia.parse::<u8>().ok()?,
    );
    (a >= 2000 && (1..=12).contains(&m) && (1..=31).contains(&d))
        .then(|| format!("{d:02}/{m:02}/{a}"))
}
