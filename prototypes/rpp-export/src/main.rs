// Genera un paquete de prueba en la carpeta que se le indique.
// Uso: cargo run -- ../../samples/paquete-prueba

mod rpp;

use std::env;
use std::fs;
use std::path::Path;

use rpp::{Pista, Proyecto, Seccion, Tempo, escribir};

const DURACION: f64 = 300.0;

fn secciones() -> Vec<Seccion> {
    let lista = [
        ("Intro", 0.0, 16.0),
        ("Verso 1", 16.0, 48.0),
        ("Coro 1", 48.0, 80.0),
        ("Verso 2", 80.0, 112.0),
        ("Coro 2", 112.0, 144.0),
        ("Puente", 144.0, 192.0),
        ("Coro 3", 192.0, 256.0),
        ("Final", 256.0, DURACION),
    ];
    lista
        .iter()
        .map(|(nombre, inicio, fin)| Seccion {
            nombre: nombre.to_string(),
            inicio: *inicio,
            fin: *fin,
        })
        .collect()
}

fn pistas() -> Vec<Pista> {
    ["CLICK", "GUIA", "Bateria", "Bajo", "Guitarra", "Piano", "Otros", "Voz"]
        .iter()
        .enumerate()
        .map(|(indice, nombre)| Pista {
            nombre: nombre.to_string(),
            archivo: format!("{:02} {nombre}.wav", indice + 1),
            duracion: DURACION,
        })
        .collect()
}

fn guardar(carpeta: &Path, nombre: &str, tempos: Vec<Tempo>) {
    let proyecto = Proyecto {
        rate: 44100,
        tempos,
        secciones: secciones(),
        pistas: pistas(),
    };
    let ruta = carpeta.join(nombre);
    fs::write(&ruta, escribir(&proyecto)).expect("no se pudo escribir el proyecto");
    println!("Creado: {}", ruta.display());
}

fn main() {
    let carpeta = env::args().nth(1).expect("falta la carpeta de destino");
    let carpeta = Path::new(&carpeta);

    let inicial = || Tempo { inicio: 0.0, bpm: 120.0, tiempos: 4, figura: 4 };
    guardar(carpeta, "Prueba.RPP", vec![inicial()]);

    // Mismo paquete con un cambio de tempo y de compás al llegar al Puente.
    let puente = Tempo { inicio: 144.0, bpm: 90.0, tiempos: 3, figura: 4 };
    guardar(carpeta, "Prueba cambio de tempo.RPP", vec![inicial(), puente]);
}
