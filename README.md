# Museo Espacial Interactivo (Beta)

Experiencia web educativa que se controla con el cuerpo, usando solo la webcam del computador.
Todo corre en el navegador: no hay backend.

Stack: Vite + TypeScript, Three.js (escena 3D), `@mediapipe/tasks-vision` (cara, hombros y manos).

Especificación: [SPEC.md](./SPEC.md).

## Requisitos

- Node.js 20 o superior y npm.
- Navegador con WebGL y acceso a la webcam (Chrome, Edge o Safari recientes).

## Comandos

```bash
npm install          # instala dependencias
npm run dev          # servidor de desarrollo en http://localhost:5173
npm run build        # comprueba tipos y genera dist/
npm run preview      # sirve dist/ localmente para probar el build
```

Páginas:

| Ruta       | Contenido                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `/`        | Escena base de Three.js (suelo gris y una luz).                           |
| `/debug/`  | Página de depuración: webcam, puntos de cara/hombros/manos y valores en vivo. |

Para ver la depuración: `npm run dev` y abre **http://localhost:5173/debug/**.

> La webcam solo funciona en `localhost` o en una página servida por **HTTPS**.

## Publicar

```bash
npm run build
```

Sube el contenido de la carpeta `dist/` a cualquier hosting estático
(GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.). Ese contenido incluye los modelos
de MediaPipe y los binarios WASM, así que no hace falta nada más en el servidor.

Si la página se publica en una subruta (p. ej. `https://usuario.github.io/museo-espacial/`),
cambia `base` en `vite.config.ts` a `'/museo-espacial/'` antes de hacer el build.

## Estructura

```
index.html            Página principal (escena)
debug/index.html      Página de depuración (/debug/)
public/models/        Modelos .task de MediaPipe (cara, pose ligera, manos)
scripts/              Copia de los WASM de MediaPipe a public/wasm (automático en dev/build)
src/tracking/         Detección con MediaPipe y cálculo de métricas
src/scenes/           Escenas de Three.js
src/ui/               Overlay de depuración, utilidades de DOM
src/audio/            (vacío por ahora)
src/state/            (vacío por ahora)
```

## Modelos de MediaPipe

Descargados de `storage.googleapis.com/mediapipe-models/`:

- `face_landmarker.task`
- `pose_landmarker_lite.task`
- `hand_landmarker.task`
