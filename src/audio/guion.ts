// Guion del mentor: texto con marcas de gesto, p. ej. "Este es el LRV {directo}, el vehículo lunar…".
// Las marcas se quitan del texto visible y hablado; cada una se pega a la palabra que la precede, y el gesto
// empieza cuando esa palabra empieza a sonar. Este módulo es puro (sin DOM) para poder probarlo fuera del navegador.

export const CUES = ['heroico', 'exacto', 'directo', 'poderoso', 'honesto', 'cercano'] as const;
export type CueNombre = (typeof CUES)[number];

// Dos tipos de marca: de gesto del mentor ("{directo}", se pega a la palabra que la precede) y de plano de cámara
// ("{@malla}", la usa la presentación del LRV y se pega a la palabra que la sigue: el plano empieza con ella).
const MARCA = new RegExp(`\\{(${CUES.join('|')})\\}|\\{@([a-z0-9_]+)\\}`, 'g');

export interface PalabraGuion {
  texto: string;
  /** Posición de la palabra en el texto limpio. */
  inicio: number;
  cues: CueNombre[];
  /** Planos de cámara ("{@id}") que empiezan con esta palabra. */
  planos: string[];
}

export interface FraseGuion {
  texto: string;
  inicio: number;
  fin: number;
  /** Índices (inclusive) de su primera y última palabra. */
  primera: number;
  ultima: number;
  pregunta: boolean;
}

export interface Guion {
  /** Texto sin marcas: es el que se muestra en los subtítulos y se pasa a la voz. */
  texto: string;
  palabras: PalabraGuion[];
  frases: FraseGuion[];
}

/** Une dos trozos sin dejar dobles espacios ni un espacio antes de la puntuación. */
function unir(a: string, b: string): string {
  if (/^[.,;:!?…)»”]/.test(b)) a = a.trimEnd();
  else if (a.endsWith(' ') && b.startsWith(' ')) b = b.trimStart();
  return a + b;
}

/** Quita las marcas de gesto de un texto. */
export function quitarCues(crudo: string): string {
  return parsearGuion(crudo).texto;
}

export function parsearGuion(crudo: string): Guion {
  let texto = '';
  const marcas: { pos: number; cue: CueNombre }[] = [];
  const marcasPlano: { pos: number; id: string }[] = [];
  let ultimo = 0;
  for (const m of crudo.matchAll(MARCA)) {
    texto = unir(texto, crudo.slice(ultimo, m.index));
    if (m[2] !== undefined) marcasPlano.push({ pos: texto.length, id: m[2] });
    else marcas.push({ pos: texto.trimEnd().length, cue: m[1] as CueNombre });
    ultimo = m.index + m[0].length;
  }
  texto = unir(texto, crudo.slice(ultimo));

  const palabras: PalabraGuion[] = [];
  for (const m of texto.matchAll(/\S+/g)) palabras.push({ texto: m[0], inicio: m.index, cues: [], planos: [] });
  // Cada marca va a la palabra que la precede: la última que empieza antes de la marca (o la primera si no hay ninguna).
  for (const { pos, cue } of marcas) {
    let destino = 0;
    for (let i = 0; i < palabras.length; i++) {
      if (palabras[i].inicio < pos) destino = i;
    }
    palabras[destino]?.cues.push(cue);
  }

  // Cada plano va a la palabra que lo sigue: la primera que empieza en su posición o después (o la última si no hay).
  for (const { pos, id } of marcasPlano) {
    const destino = palabras.find((p) => p.inicio >= pos) ?? palabras[palabras.length - 1];
    destino?.planos.push(id);
  }

  // Frases: mismo corte que `dividirFrases` de voz.ts, pero conservando posiciones.
  const frases: FraseGuion[] = [];
  for (const m of texto.matchAll(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g)) {
    const bruto = m[0];
    const recortado = bruto.trim();
    if (recortado.length === 0) continue;
    const inicio = m.index + (bruto.length - bruto.trimStart().length);
    const fin = inicio + recortado.length;
    const dentro = palabras.map((p, i) => (p.inicio >= inicio && p.inicio < fin ? i : -1)).filter((i) => i >= 0);
    if (dentro.length === 0) continue;
    frases.push({
      texto: recortado,
      inicio,
      fin,
      primera: dentro[0],
      ultima: dentro[dentro.length - 1],
      pregunta: /\?["”»)]*$/.test(recortado),
    });
  }
  return { texto, palabras, frases };
}
