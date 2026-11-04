import es from './es.json';

// Textos de la interfaz. Por ahora solo español (SPEC 11). Para añadir inglés: un en.json con las mismas claves.
export type ClaveTexto = keyof typeof es;

/** Devuelve el texto de `clave`; `{nombre}` en el texto se sustituye por `variables.nombre`. */
export function t(clave: ClaveTexto, variables: Record<string, string> = {}): string {
  let texto: string = es[clave];
  for (const [nombre, valor] of Object.entries(variables)) {
    texto = texto.replaceAll(`{${nombre}}`, valor);
  }
  return texto;
}
