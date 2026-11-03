// Copia los binarios WASM de MediaPipe a public/wasm para servirlos desde el mismo origen
// (no depende de CDNs externos). Se ejecuta antes de `dev` y `build`.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url));
const target = fileURLToPath(new URL('../public/wasm', import.meta.url));

if (!existsSync(source)) {
  console.error(`No se encontró ${source}. ¿Ejecutaste npm install?`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`WASM de MediaPipe copiado a ${target.replace(root, '')}`);
