import { quitarCues } from '../audio/guion';
import en from './en.json';
import es from './es.json';

// Textos de la interfaz en español (por defecto) e inglés (SPEC 11). El español manda: define las claves y es el
// respaldo si falta una en inglés. Nunca se devuelve una clave cruda salvo que no exista en ningún idioma.
export type ClaveTexto = keyof typeof es;
export type Idioma = 'es' | 'en';

const CLAVE_IDIOMA = 'museo-espacial:idioma:v1';
const TEXTOS: Record<Idioma, Partial<Record<ClaveTexto, string>>> = { es, en };

/** Código de voz y de `<html lang>` de cada idioma. */
export const LENGUA_VOZ: Record<Idioma, string> = { es: 'es-ES', en: 'en-US' };

function leerGuardado(): Idioma {
  try {
    const valor = localStorage.getItem(CLAVE_IDIOMA);
    return valor === 'en' || valor === 'es' ? valor : 'es';
  } catch {
    return 'es';
  }
}

let activo: Idioma = leerGuardado();
const oyentes: ((idioma: Idioma) => void)[] = [];
if (typeof document !== 'undefined') document.documentElement.lang = activo;

/** Idioma activo. */
export function idioma(): Idioma {
  return activo;
}

/** Cambia el idioma al momento, lo guarda y avisa a quien se suscribió con `alCambiarIdioma`. */
export function fijarIdioma(nuevo: Idioma): void {
  if (nuevo === activo) return;
  activo = nuevo;
  if (typeof document !== 'undefined') document.documentElement.lang = nuevo;
  try {
    localStorage.setItem(CLAVE_IDIOMA, nuevo);
  } catch {
    // Sin localStorage: el idioma vale solo para esta carga de la página.
  }
  for (const oyente of oyentes) oyente(nuevo);
}

/** Llama a `oyente` cada vez que cambia el idioma, para volver a leer los textos que ya están en pantalla. */
export function alCambiarIdioma(oyente: (idioma: Idioma) => void): void {
  oyentes.push(oyente);
}

/** Texto de `clave` tal como está escrito, con las marcas de gesto del mentor ({directo}, {exacto}…). Solo para la voz. */
export function tGuion(clave: ClaveTexto, variables: Record<string, string> = {}): string {
  let texto: string = TEXTOS[activo][clave] ?? es[clave] ?? clave;
  for (const [nombre, valor] of Object.entries(variables)) {
    texto = texto.replaceAll(`{${nombre}}`, valor);
  }
  return texto;
}

/** Devuelve el texto de `clave` para mostrar: sin marcas de gesto. `{nombre}` se sustituye por `variables.nombre`. */
export function t(clave: ClaveTexto, variables: Record<string, string> = {}): string {
  return quitarCues(tGuion(clave, variables));
}
