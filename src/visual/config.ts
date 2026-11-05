// Modelos del museo. Para cambiar un modelo, solo cambia `ruta` y `escala` aquí.
//
// - `ruta` empieza por "placeholder:" → se genera en código (ver src/visual/museo.ts).
//   Cualquier otra ruta se carga como .glb relativo a public/ (p. ej. "models/vitrina_lrv.glb").
// - `nodo` es el nombre del nodo dentro de la escena (Object3D.name).
// - `escala` multiplica el tamaño natural del modelo. Con 1, el modelo va en metros reales.
// La tabla con el detalle de cada placeholder está en src/visual/MODELS.md.

export interface ConfigModelo {
  id: string;
  ruta: string;
  nodo: string;
  escala: number;
}

export const MODELOS: readonly ConfigModelo[] = [
  { id: 'museo', ruta: 'placeholder:sala', nodo: 'museo', escala: 1 },
  { id: 'vitrina_lrv', ruta: 'placeholder:vitrina_lrv', nodo: 'vitrina_lrv', escala: 1 },
  { id: 'vitrina_perseverance', ruta: 'placeholder:vitrina_perseverance', nodo: 'vitrina_perseverance', escala: 1 },
  { id: 'mentor', ruta: 'placeholder:mentor', nodo: 'mentor', escala: 0.8 },
  { id: 'halo_senalar', ruta: 'placeholder:anillo', nodo: 'halo_senalar', escala: 1.6 },
];

// Escenas de misión (placeholders). Cada escena es un grupo con el nombre `nodo`; sus hijos
// (lrv_placeholder, roca_placeholder, perseverance_placeholder) se nombran en src/visual/museo.ts.
export const ESCENAS: readonly ConfigModelo[] = [
  { id: 'escena_luna', ruta: 'placeholder:escena_luna', nodo: 'escena_luna', escala: 1 },
  { id: 'escena_marte', ruta: 'placeholder:escena_marte', nodo: 'escena_marte', escala: 1 },
];