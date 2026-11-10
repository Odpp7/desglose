// "Crear secuencia": separa la canción en pistas con MVSep.
//
// En el plan gratis de MVSep CADA trabajo hace la fila completa (con la fila
// llena, más de una hora) y solo hay uno a la vez por cuenta. Por eso la
// separación va por partes, y el encargado decide cuáles hace:
//
//   base       1 trabajo:  canción  → voz, batería, bajo, guitarra, piano, otros  (BS Roformer SW)
//   voces      1 trabajo:  voz      → voz líder, coros                           (Karaoke)
//   guitarras  2 trabajos: guitarra → acústica + eléctricas                      (Acoustic Guitar)
//                          eléctricas → lead, rítmica                            (Lead/Rhythm)
//   synth      1 trabajo:  otros    → synth, otros                               (Synth)
//
// Cada modelo recibe una pista ya separada y la divide en dos, así todo sigue
// sumando la canción original. La pista dividida se reemplaza por sus partes.
//
// Corre en un hilo aparte y avisa con dos eventos: "secuencia-avance" en cada
// cambio y "secuencia-fin" al terminar. Lo ya separado queda en `mvsep\`, y el
// código de cada trabajo también: al reintentar no se repite nada ni se pierde
// el lugar en la fila.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ajustes;
use crate::audio::nivel;
use crate::biblioteca;
use crate::mvsep::{CANCELADA, Cliente, Fila, Modelo};

const BS_ROFORMER_SW: Modelo = Modelo {
    sep_type: 63,
    opciones: &[],
    salidas: &["vocals", "drums", "bass", "guitar", "piano", "other"],
};
// La opción 6 es la mejor gratis; la 8 es solo para usuarios de pago.
const KARAOKE: Modelo = Modelo {
    sep_type: 49,
    opciones: &[("add_opt1", "6"), ("add_opt2", "0")],
    salidas: &["vocals-lead", "vocals-back"],
};
const GUITARRA_ACUSTICA: Modelo = Modelo {
    sep_type: 66,
    opciones: &[("add_opt2", "0")],
    salidas: &["acoustic-guitar", "other"],
};
const LEAD_RITMICA: Modelo = Modelo {
    sep_type: 101,
    opciones: &[("add_opt1", "0")],
    salidas: &["lead-guitar", "rhythm-guitar"],
};
const SYNTH: Modelo = Modelo {
    sep_type: 88,
    opciones: &[("add_opt1", "0")],
    salidas: &["synth", "other"],
};

/// Orden en que aparecen las pistas. Una pista dividida ("voz", "guitarra")
/// deja de existir y en su lugar aparecen sus partes.
const ORDEN: [&str; 12] = [
    "voz",
    "voz-lider",
    "coros",
    "bateria",
    "bajo",
    "piano",
    "guitarra",
    "guitarra-acustica",
    "guitarra-lead",
    "guitarra-ritmica",
    "synth",
    "otros",
];

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Modo {
    Base,
    Voces,
    Guitarras,
    Synth,
}

impl Modo {
    fn grupo(self) -> Result<(&'static str, &'static [&'static str]), String> {
        match self {
            Modo::Voces => Ok(("voz", &["voz-lider", "coros"])),
            Modo::Guitarras => Ok(("guitarra", &["guitarra-acustica", "guitarra-lead", "guitarra-ritmica"])),
            Modo::Synth => Ok(("otros", &["synth", "otros"])),
            Modo::Base => Err("La separación base no se puede alternar.".into()),
        }
    }

    fn etapas(self) -> &'static [&'static str] {
        match self {
            Modo::Base => &["Separar los instrumentos", "Preparar las pistas"],
            Modo::Voces => &["Separar voz líder y coros", "Preparar las pistas"],
            Modo::Guitarras => &[
                "Separar la guitarra acústica",
                "Separar guitarras lead y rítmica",
                "Preparar las pistas",
            ],
            Modo::Synth => &["Separar el synth", "Preparar las pistas"],
        }
    }
}

/// Qué canción se está separando ahora (MVSep gratis hace una a la vez),
/// y la señal para cancelarla.
#[derive(Default)]
pub struct Separacion {
    en_curso: Mutex<Option<i64>>,
    cancelar: Arc<AtomicBool>,
}

impl Separacion {
    pub fn en_curso(&self) -> Option<i64> {
        *self.en_curso.lock().unwrap()
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Avance {
    cancion_id: i64,
    /// Nombres de las etapas de este modo, para que la interfaz las muestre.
    etapas: &'static [&'static str],
    /// De 1 a `etapas.len()`.
    etapa: usize,
    detalle: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PistaLista {
    pub instrumento: String,
    /// Ruta dentro de la carpeta de la canción, por ejemplo "pistas/voz-lider.flac".
    pub archivo: String,
    pub vacia: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Fin {
    cancion_id: i64,
    pistas: Option<Vec<PistaLista>>,
    error: Option<String>,
    /// La canceló el encargado (no es un error).
    cancelada: bool,
}

/// Empieza a separar y vuelve enseguida. El resultado llega con "secuencia-fin".
#[tauri::command]
pub fn crear_secuencia(
    app: AppHandle,
    id: i64,
    modo: Modo,
    restaurar: Option<bool>,
    separacion: State<'_, Separacion>,
) -> Result<(), String> {
    let clave =
        ajustes::leer_clave_mvsep(&app)?.ok_or("Falta la clave de MVSep. Agrégala en Ajustes.")?;
    let carpeta = biblioteca::carpeta_cancion(&app, id)?;

    {
        let mut en_curso = separacion.en_curso.lock().unwrap();
        if en_curso.is_some() {
            return Err(
                "Ya se está separando algo. MVSep gratis hace un trabajo a la vez: \
                 espera a que termine."
                    .into(),
            );
        }
        *en_curso = Some(id);
    }
    separacion.cancelar.store(false, Ordering::Relaxed);
    let cancelar = separacion.cancelar.clone();

    thread::spawn(move || {
        let restaurar = restaurar.unwrap_or(false);
        let etapas: &[&str] = if restaurar {
            &["Recuperar pistas originales", "Preparar la pista"]
        } else {
            modo.etapas()
        };
        let mut avisar = |etapa: usize, detalle: String| {
            let avance = Avance {
                cancion_id: id,
                etapas,
                etapa,
                detalle,
            };
            let _ = app.emit("secuencia-avance", avance);
        };
        let resultado = Cliente::new(clave, cancelar).and_then(|cliente| {
            let ultima = etapas.len();
            if restaurar {
                return recuperar_original(&cliente, &carpeta, modo, &mut avisar);
            }
            match modo {
                Modo::Base => base(&cliente, &carpeta, ultima, &mut avisar),
                Modo::Voces => dividir(
                    &cliente,
                    &carpeta,
                    "voz",
                    &[(
                        "2-voces",
                        &KARAOKE,
                        &[("voz-lider", "vocals-lead"), ("coros", "vocals-back")],
                    )],
                    ultima,
                    &mut avisar,
                ),
                Modo::Guitarras => guitarras(&cliente, &carpeta, ultima, &mut avisar),
                Modo::Synth => dividir(
                    &cliente,
                    &carpeta,
                    "otros",
                    &[("5-synth", &SYNTH, &[("synth", "synth"), ("otros", "other")])],
                    ultima,
                    &mut avisar,
                ),
            }
        });

        // Se libera antes de avisar, para que la interfaz pueda empezar otra enseguida.
        *app.state::<Separacion>().en_curso.lock().unwrap() = None;
        let fin = match resultado {
            Ok(pistas) => Fin {
                cancion_id: id,
                pistas: Some(pistas),
                error: None,
                cancelada: false,
            },
            Err(error) => {
                let cancelada = error == CANCELADA;
                // Si se canceló, se borra lo que esta separación dejó a medias.
                if cancelada {
                    if restaurar {
                        let _ = fs::remove_dir_all(carpeta.join("mvsep/recuperar-base"));
                    } else {
                        limpiar(&carpeta, modo);
                    }
                }
                Fin {
                    cancion_id: id,
                    pistas: None,
                    error: Some(error),
                    cancelada,
                }
            }
        };
        let _ = app.emit("secuencia-fin", fin);
    });
    Ok(())
}

/// Cambia el grupo con sus audios locales. Si falta alguno, la interfaz decide
/// si pide un trabajo a MVSep.
#[tauri::command(async)]
pub fn alternar_separacion(
    app: AppHandle,
    id: i64,
    modo: Modo,
    restaurar: bool,
    separacion: State<'_, Separacion>,
) -> Result<Option<Vec<PistaLista>>, String> {
    let en_curso = separacion.en_curso.lock().unwrap();
    if *en_curso == Some(id) {
        return Err("Espera a que termine la separación de esta canción.".into());
    }
    let carpeta = biblioteca::carpeta_cancion(&app, id)?;
    alternar_local(&carpeta, modo, restaurar)
}

/// Pide cancelar la separación en curso. Responde enseguida; la separación
/// termina un momento después con "secuencia-fin" (`cancelada: true`).
#[tauri::command]
pub fn cancelar_secuencia(separacion: State<'_, Separacion>) {
    separacion.cancelar.store(true, Ordering::Relaxed);
}

/// Borra lo intermedio de las etapas de un modo (carpetas, códigos de trabajo y
/// descargas a medias). Las pistas que la canción ya tenía no se tocan.
fn limpiar(carpeta: &Path, modo: Modo) {
    let etapas: &[&str] = match modo {
        Modo::Base => &["1-base"],
        Modo::Voces => &["2-voces"],
        Modo::Guitarras => &["3-acustica", "4-lead"],
        Modo::Synth => &["5-synth"],
    };
    let mvsep = carpeta.join("mvsep");
    for nombre in etapas {
        let etapa = mvsep.join(nombre);
        let _ = fs::remove_dir_all(&etapa);
        let _ = fs::remove_dir_all(etapa.with_extension("bajando"));
        let _ = fs::remove_file(etapa.with_extension("trabajo"));
    }
    let _ = fs::remove_dir(&mvsep); // solo si quedó vacía
}

/// Id de la canción que se está separando, si hay una.
#[tauri::command]
pub fn secuencia_en_curso(separacion: State<'_, Separacion>) -> Option<i64> {
    separacion.en_curso()
}

/// Cuántos trabajos hay en la fila gratis de MVSep y cuánto espera cada uno.
/// `reqwest::blocking` no puede correr directo en una orden `async` (se cae por
/// dentro): va en `spawn_blocking`, un hilo aparte para esperar.
#[tauri::command]
pub async fn fila_mvsep(app: AppHandle) -> Result<Fila, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clave = ajustes::leer_clave_mvsep(&app)?.ok_or("Falta la clave de MVSep.")?;
        Cliente::new(clave, Arc::default())?.fila()
    })
    .await
    .map_err(|e| format!("No se pudo consultar la fila: {e}"))?
}

type Avisar<'a> = dyn FnMut(usize, String) + 'a;

/// Base: 1 trabajo, 6 pistas. Es lo único que se hace al crear la secuencia.
fn base(
    cliente: &Cliente,
    carpeta: &Path,
    ultima: usize,
    avisar: &mut Avisar,
) -> Result<Vec<PistaLista>, String> {
    let original = buscar_original(carpeta)?;
    let mvsep = carpeta.join("mvsep");
    let base = etapa(
        cliente,
        1,
        "1-base",
        &original,
        &BS_ROFORMER_SW,
        &mvsep,
        avisar,
    )?;

    avisar(ultima, "Preparando las pistas".into());
    let pistas = carpeta.join("pistas");
    if pistas.exists() {
        fs::remove_dir_all(&pistas).map_err(|e| format!("No se pudo limpiar las pistas: {e}"))?;
    }
    fs::create_dir_all(&pistas).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    let mut elegidas = Vec::new();
    for (instrumento, sufijo) in [
        ("voz", "vocals"),
        ("bateria", "drums"),
        ("bajo", "bass"),
        ("piano", "piano"),
        ("guitarra", "guitar"),
        ("otros", "other"),
    ] {
        elegidas.push((instrumento, buscar(&base, sufijo)?));
    }
    copiar_pistas(&pistas, &elegidas)?;

    terminar(carpeta, &["1-base"])
}

/// Guitarras: 2 trabajos en cadena (acústica/eléctricas, y lead/rítmica).
fn guitarras(
    cliente: &Cliente,
    carpeta: &Path,
    ultima: usize,
    avisar: &mut Avisar,
) -> Result<Vec<PistaLista>, String> {
    let guitarra = pista_para_dividir(carpeta, "guitarra")?;
    let mvsep = carpeta.join("mvsep");
    let acustica = etapa(
        cliente,
        1,
        "3-acustica",
        &guitarra,
        &GUITARRA_ACUSTICA,
        &mvsep,
        avisar,
    )?;
    let electricas = buscar(&acustica, "other")?;
    let lead = etapa(
        cliente,
        2,
        "4-lead",
        &electricas,
        &LEAD_RITMICA,
        &mvsep,
        avisar,
    )?;

    avisar(ultima, "Preparando las pistas".into());
    let lista = guardar_partes(
        carpeta,
        Modo::Guitarras,
        &[
            ("guitarra-acustica", buscar(&acustica, "acoustic-guitar")?),
            ("guitarra-lead", buscar(&lead, "lead-guitar")?),
            ("guitarra-ritmica", buscar(&lead, "rhythm-guitar")?),
        ],
    )?;
    limpiar_etapas(carpeta, &["3-acustica", "4-lead"]);
    Ok(lista)
}

/// Divide una pista con UN trabajo y la reemplaza por sus partes
/// (voz → voz líder y coros; otros → synth y otros).
fn dividir(
    cliente: &Cliente,
    carpeta: &Path,
    pista: &str,
    trabajo: &[(&str, &Modelo, &[(&str, &str)])],
    ultima: usize,
    avisar: &mut Avisar,
) -> Result<Vec<PistaLista>, String> {
    let entrada = pista_para_dividir(carpeta, pista)?;
    let (carpeta_etapa, modelo, partes) = trabajo[0];
    let salida = etapa(
        cliente,
        1,
        carpeta_etapa,
        &entrada,
        modelo,
        &carpeta.join("mvsep"),
        avisar,
    )?;

    avisar(ultima, "Preparando las pistas".into());
    let mut nuevas = Vec::new();
    for (instrumento, sufijo) in partes {
        nuevas.push((*instrumento, buscar(&salida, sufijo)?));
    }
    let modo = if pista == "voz" { Modo::Voces } else { Modo::Synth };
    let lista = guardar_partes(carpeta, modo, &nuevas)?;
    limpiar_etapas(carpeta, &[carpeta_etapa]);
    Ok(lista)
}

/// La pista que se va a dividir, si existe.
fn pista_para_dividir(carpeta: &Path, pista: &str) -> Result<PathBuf, String> {
    lista_actual(carpeta)?
        .unwrap_or_default()
        .into_iter()
        .find(|p| p.instrumento == pista && carpeta.join(&p.archivo).is_file())
        .map(|p| carpeta.join(p.archivo))
        .ok_or_else(|| format!("Esta canción no tiene la pista \"{pista}\" para separar."))
}

/// Las partes nuevas tienen su propia ruta, incluido el «otros» que queda sin synth.
fn guardar_partes(
    carpeta: &Path,
    modo: Modo,
    nuevas: &[(&str, PathBuf)],
) -> Result<Vec<PistaLista>, String> {
    let destino = carpeta.join("pistas/divididas");
    fs::create_dir_all(&destino).map_err(|e| format!("No se pudo guardar las pistas: {e}"))?;
    copiar_pistas(&destino, nuevas)?;
    alternar_local(carpeta, modo, false)?.ok_or("No se encontraron todas las pistas separadas.".into())
}

fn alternar_local(carpeta: &Path, modo: Modo, restaurar: bool) -> Result<Option<Vec<PistaLista>>, String> {
    let (base, partes) = modo.grupo()?;
    let mut lista = lista_actual(carpeta)?.ok_or("Esta canción aún no tiene pistas.")?;
    let nombres = if restaurar { std::slice::from_ref(&base) } else { partes };
    let directorio = if restaurar {
        let recuperada = format!("pistas/base/{base}.flac");
        if carpeta.join(recuperada).is_file() {
            "pistas/base"
        } else if base == "otros" && carpeta.join("pistas/synth.flac").is_file() {
            // En las canciones antiguas, separar synth sobrescribía «otros».
            return Ok(None);
        } else {
            "pistas"
        }
    } else if partes.iter().all(|p| carpeta.join(format!("pistas/divididas/{p}.flac")).is_file()) {
        "pistas/divididas"
    } else if carpeta.join(format!("pistas/{}.flac", partes[0])).is_file() {
        "pistas" // Las partes separadas antes de este cambio siguen siendo utilizables.
    } else {
        return Ok(None);
    };
    let rutas: Vec<_> = nombres.iter().map(|p| format!("{directorio}/{p}.flac")).collect();
    if !rutas.iter().all(|ruta| carpeta.join(ruta).is_file()) {
        return Ok(None);
    }

    lista.retain(|p| p.instrumento != base && !partes.contains(&p.instrumento.as_str()));
    for (&instrumento, archivo) in nombres.iter().zip(rutas) {
        lista.push(PistaLista {
            instrumento: instrumento.into(),
            vacia: nivel::esta_vacia(&carpeta.join(&archivo))?,
            archivo,
        });
    }
    lista.sort_by_key(|p| ORDEN.iter().position(|&n| n == p.instrumento));
    guardar_lista(&carpeta.join("pistas"), &lista)?;
    Ok(Some(lista))
}

/// Las versiones antiguas borraban las pistas base. Un trabajo recupera las
/// originales de los tres grupos y conserva las partes que ya están separadas.
fn recuperar_original(
    cliente: &Cliente,
    carpeta: &Path,
    modo: Modo,
    avisar: &mut Avisar,
) -> Result<Vec<PistaLista>, String> {
    modo.grupo()?;
    let salida = etapa(
        cliente, 1, "recuperar-base", &buscar_original(carpeta)?,
        &BS_ROFORMER_SW, &carpeta.join("mvsep"), avisar,
    )?;
    avisar(2, "Preparando la pista original".into());
    let destino = carpeta.join("pistas/base");
    fs::create_dir_all(&destino).map_err(|e| format!("No se pudo guardar las pistas: {e}"))?;
    let originales = [
        ("voz", buscar(&salida, "vocals")?),
        ("guitarra", buscar(&salida, "guitar")?),
        ("otros", buscar(&salida, "other")?),
    ];
    copiar_pistas(&destino, &originales)?;
    let lista = alternar_local(carpeta, modo, true)?.ok_or("No se encontró la pista original.")?;
    limpiar_etapas(carpeta, &["recuperar-base"]);
    Ok(lista)
}

/// Copia cada pista elegida a `pistas\<instrumento>.flac`.
/// Se copia (no se mueve) para que un reintento todavía encuentre todo en `mvsep\`.
fn copiar_pistas(destino: &Path, elegidas: &[(&str, PathBuf)]) -> Result<(), String> {
    for (instrumento, origen) in elegidas {
        let temporal = destino.join(format!("{instrumento}.flac.tmp"));
        let finalizada = destino.join(format!("{instrumento}.flac"));
        fs::copy(origen, &temporal)
            .and_then(|_| fs::rename(&temporal, finalizada))
            .map_err(|e| format!("No se pudo copiar {instrumento}: {e}"))?;
    }
    Ok(())
}

/// Borra lo intermedio de las etapas que terminaron (unos 100 MB por trabajo)
/// y devuelve la lista final de pistas, en orden, marcando cuáles están vacías.
/// Solo borra esas etapas: otra separación a medias conserva lo suyo.
fn terminar(carpeta: &Path, etapas: &[&str]) -> Result<Vec<PistaLista>, String> {
    let lista = listar_y_guardar(carpeta)?;
    limpiar_etapas(carpeta, etapas);
    Ok(lista)
}

fn limpiar_etapas(carpeta: &Path, etapas: &[&str]) {
    let mvsep = carpeta.join("mvsep");
    for nombre in etapas {
        let _ = fs::remove_dir_all(mvsep.join(nombre));
    }
    let _ = fs::remove_dir(&mvsep); // solo si quedó vacía
}

/// Mide qué pistas hay y cuáles están vacías, y lo guarda en `pistas\lista.json`.
/// Ese archivo es la copia de respaldo del resultado: si el aviso "secuencia-fin"
/// se pierde (la app se cerró justo al terminar), la interfaz lo lee al abrir.
fn listar_y_guardar(carpeta: &Path) -> Result<Vec<PistaLista>, String> {
    let pistas = carpeta.join("pistas");
    let mut lista = Vec::new();
    for instrumento in ORDEN {
        let ruta = pistas.join(format!("{instrumento}.flac"));
        if ruta.exists() {
            lista.push(PistaLista {
                instrumento: instrumento.into(),
                archivo: format!("pistas/{instrumento}.flac"),
                vacia: nivel::esta_vacia(&ruta)?,
            });
        }
    }
    guardar_lista(&pistas, &lista)?;
    Ok(lista)
}

const LISTA: &str = "lista.json";

fn guardar_lista(pistas: &Path, lista: &[PistaLista]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(lista).map_err(|e| e.to_string())?;
    let temporal = pistas.join("lista.tmp");
    fs::write(&temporal, json).and_then(|_| fs::rename(&temporal, pistas.join(LISTA)))
        .map_err(|e| format!("No se pudo guardar la lista: {e}"))
}

/// Las pistas que hay en el disco para una canción, o `None` si todavía no tiene.
/// Lee `pistas\lista.json`; si no existe (canciones de antes), la arma y la guarda.
#[tauri::command(async)]
pub fn pistas_guardadas(app: AppHandle, id: i64) -> Result<Option<Vec<PistaLista>>, String> {
    leer_lista(&app, id)
}

/// Lo mismo que `pistas_guardadas`, para usarlo desde otras partes de Rust.
pub fn leer_lista(app: &AppHandle, id: i64) -> Result<Option<Vec<PistaLista>>, String> {
    let carpeta = biblioteca::carpeta_cancion(app, id)?;
    lista_actual(&carpeta)
}

fn lista_actual(carpeta: &Path) -> Result<Option<Vec<PistaLista>>, String> {
    let pistas = carpeta.join("pistas");
    if !pistas.exists() {
        return Ok(None);
    }
    if let Ok(texto) = fs::read_to_string(pistas.join(LISTA)) {
        if let Ok(lista) = serde_json::from_str(&texto) {
            return Ok(Some(lista));
        }
    }
    listar_y_guardar(carpeta).map(Some)
}

/// Una etapa de la cadena. Si ya se hizo antes (un reintento), no se repite.
fn etapa(
    cliente: &Cliente,
    numero: usize,
    nombre: &str,
    entrada: &Path,
    modelo: &Modelo,
    mvsep: &Path,
    avisar: &mut Avisar,
) -> Result<PathBuf, String> {
    let salida = mvsep.join(nombre);
    if salida.exists() {
        avisar(numero, "Ya estaba hecha".into());
        return Ok(salida);
    }
    fs::create_dir_all(mvsep).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    cliente.separar(entrada, modelo, &salida, &mut |detalle| {
        avisar(numero, detalle)
    })?;
    Ok(salida)
}

/// Busca una pista por el FINAL del nombre (`..._vocals-back.flac`).
/// El inicio del nombre repite el de la pista de entrada, y por eso
/// buscar por el inicio o por "contiene" eligió mal en la Fase 0.
fn buscar(carpeta: &Path, pista: &str) -> Result<PathBuf, String> {
    let sufijo = format!("_{pista}");
    let entradas =
        fs::read_dir(carpeta).map_err(|e| format!("No se pudo leer {carpeta:?}: {e}"))?;
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let nombre = ruta
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if nombre.ends_with(&sufijo) {
            return Ok(ruta);
        }
    }
    Err(format!(
        "MVSep no devolvió la pista \"{pista}\". Reintenta."
    ))
}

/// El archivo de la canción: `original.mp3`, `original.wav`...
fn buscar_original(carpeta: &Path) -> Result<PathBuf, String> {
    let entradas = fs::read_dir(carpeta).map_err(|_| "No se encontró el audio de la canción")?;
    entradas
        .flatten()
        .map(|e| e.path())
        .find(|r| r.file_stem().and_then(|s| s.to_str()) == Some("original"))
        .ok_or_else(|| "No se encontró el audio de la canción".into())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn muestras(etapa: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../samples/cancion2/mvsep")
            .join(etapa)
    }

    // Los nombres reales que devolvió MVSep en la Fase 0.
    #[test]
    fn elige_cada_pista_por_el_final_del_nombre() {
        let base = muestras("1-base");
        assert!(
            buscar(&base, "other")
                .unwrap()
                .ends_with("original_bs6stem_mt_0_other.flac")
        );
        assert!(
            buscar(&base, "guitar")
                .unwrap()
                .ends_with("original_bs6stem_mt_0_guitar.flac")
        );

        let voces = muestras("2-voces");
        assert!(
            buscar(&voces, "vocals-lead")
                .unwrap()
                .to_string_lossy()
                .ends_with("_vocals-lead.flac")
        );
        assert!(
            buscar(&voces, "vocals-back")
                .unwrap()
                .to_string_lossy()
                .ends_with("_vocals-back.flac")
        );

        // "other" en la carpeta de guitarras: la entrada se llama "...-guitar._acoustic-guitar_mt_0_other".
        let acustica = muestras("3-acustica");
        assert!(
            buscar(&acustica, "other")
                .unwrap()
                .to_string_lossy()
                .ends_with("_mt_0_other.flac")
        );

        assert!(buscar(&base, "no-existe").is_err());
    }

    // Cada modelo dice qué pistas devuelve; deben coincidir con lo que MVSep
    // devolvió de verdad en la Fase 0, o la app descartaría resultados buenos.
    #[test]
    fn las_salidas_de_cada_modelo_coinciden_con_mvsep() {
        for (carpeta, modelo) in [
            ("1-base", &BS_ROFORMER_SW),
            ("2-voces", &KARAOKE),
            ("3-acustica", &GUITARRA_ACUSTICA),
            ("4-lead", &LEAD_RITMICA),
            ("5-synth", &SYNTH),
        ] {
            for salida in modelo.salidas {
                assert!(
                    buscar(&muestras(carpeta), salida).is_ok(),
                    "{carpeta}: falta {salida}"
                );
            }
        }
    }

    // Simula base → voces con las pistas reales de la Fase 0: primero 6 pistas,
    // y al dividir la voz quedan 7, con "voz" reemplazada por líder y coros.
    #[test]
    fn dividir_la_voz_la_reemplaza_por_lider_y_coros() {
        let carpeta = std::env::temp_dir().join("desglose-prueba-dividir");
        let _ = fs::remove_dir_all(&carpeta);
        let pistas = carpeta.join("pistas");
        fs::create_dir_all(&pistas).unwrap();
        let base = muestras("1-base");
        let mut elegidas = Vec::new();
        for (instrumento, sufijo) in [
            ("otros", "other"),
            ("voz", "vocals"),
            ("bateria", "drums"),
            ("bajo", "bass"),
            ("piano", "piano"),
            ("guitarra", "guitar"),
        ] {
            elegidas.push((instrumento, buscar(&base, sufijo).unwrap()));
        }
        copiar_pistas(&pistas, &elegidas).unwrap();
        let nombres = |lista: Vec<PistaLista>| -> Vec<String> {
            lista.into_iter().map(|p| p.instrumento).collect()
        };
        assert_eq!(
            nombres(terminar(&carpeta, &[]).unwrap()),
            ["voz", "bateria", "bajo", "piano", "guitarra", "otros"]
        );

        let voces = muestras("2-voces");
        let separadas = guardar_partes(
            &carpeta,
            Modo::Voces,
            &[
                ("voz-lider", buscar(&voces, "vocals-lead").unwrap()),
                ("coros", buscar(&voces, "vocals-back").unwrap()),
            ],
        )
        .unwrap();
        assert_eq!(
            nombres(separadas),
            [
                "voz-lider",
                "coros",
                "bateria",
                "bajo",
                "piano",
                "guitarra",
                "otros"
            ]
        );
        assert_eq!(
            nombres(alternar_local(&carpeta, Modo::Voces, true).unwrap().unwrap()),
            ["voz", "bateria", "bajo", "piano", "guitarra", "otros"]
        );
        let voces = alternar_local(&carpeta, Modo::Voces, false).unwrap().unwrap();
        assert_eq!(voces[0].archivo, "pistas/divididas/voz-lider.flac");

        let otros = buscar(&base, "other").unwrap();
        let synth = buscar(&base, "guitar").unwrap();
        let divididas = guardar_partes(&carpeta, Modo::Synth, &[("synth", synth), ("otros", otros)]).unwrap();
        assert_eq!(divididas.last().unwrap().archivo, "pistas/divididas/otros.flac");
        let restauradas = alternar_local(&carpeta, Modo::Synth, true).unwrap().unwrap();
        assert_eq!(restauradas.last().unwrap().archivo, "pistas/otros.flac");
        assert_eq!(restauradas[0].instrumento, "voz-lider");
        assert_eq!(lista_actual(&carpeta).unwrap().unwrap().last().unwrap().archivo, "pistas/otros.flac");

        // Una separación antigua de synth tenía «otros» sobrescrito.
        fs::copy(pistas.join("divididas/synth.flac"), pistas.join("synth.flac")).unwrap();
        assert!(alternar_local(&carpeta, Modo::Synth, true).unwrap().is_none());
        let _ = fs::remove_dir_all(&carpeta);
    }
}
