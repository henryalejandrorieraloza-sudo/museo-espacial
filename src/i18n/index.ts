import { quitarCues } from '../audio/guion';
import es from './es.json';

// Textos de la interfaz. Por ahora solo español (SPEC 11). Para añadir inglés: un en.json con las mismas claves.
export type ClaveTexto = keyof typeof es;

/** Texto de `clave` tal como está escrito, con las marcas de gesto del mentor ({directo}, {exacto}…). Solo para la voz. */
export function tGuion(clave: ClaveTexto, variables: Record<string, string> = {}): string {
  let texto: string = es[clave];
  for (const [nombre, valor] of Object.entries(variables)) {
    texto = texto.replaceAll(`{${nombre}}`, valor);
  }
  return texto;
}

/** Devuelve el texto de `clave` para mostrar: sin marcas de gesto. `{nombre}` se sustituye por `variables.nombre`. */
export function t(clave: ClaveTexto, variables: Record<string, string> = {}): string {
  return quitarCues(tGuion(clave, variables));
}
