/** Ruta absoluta a un recurso estático (modelos, WASM) respetando `base` de Vite. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return base + path.replace(/^\/+/, '');
}
