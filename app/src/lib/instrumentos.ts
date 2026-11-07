// Nombre en pantalla y color de cada pista. Los colores son los de la maqueta
// del diseño, agrupados por familia (voces rosadas, guitarras verdes...).

export const INSTRUMENTOS: Record<string, { nombre: string; color: string }> = {
  // Separación base: la voz junta. "Separar voz líder y coros" la divide en las dos de abajo.
  voz: { nombre: "Voz", color: "#f08aa0" },
  "voz-lider": { nombre: "Voz líder", color: "#f0798f" },
  coros: { nombre: "Coros", color: "#e8a3cb" },
  bateria: { nombre: "Batería", color: "#f2a65a" },
  bajo: { nombre: "Bajo", color: "#e6cf5f" },
  piano: { nombre: "Piano", color: "#b39df2" },
  // Separación base: todas las guitarras juntas. "Separar guitarras" la divide en las tres de abajo.
  guitarra: { nombre: "Guitarra", color: "#8fd48a" },
  "guitarra-acustica": { nombre: "Guitarra acústica", color: "#9bd77a" },
  "guitarra-lead": { nombre: "Guitarra lead", color: "#5fd0a6" },
  "guitarra-ritmica": { nombre: "Guitarra rítmica", color: "#7fc7e8" },
  synth: { nombre: "Synth", color: "#6fc3f0" },
  otros: { nombre: "Otros", color: "#a2b0d8" },
};

export function instrumento(clave: string) {
  return INSTRUMENTOS[clave] ?? { nombre: clave, color: "#a2b0d8" };
}
