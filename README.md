# Museo Espacial Interactivo (Beta)

Un museo web que se controla con el cuerpo, usando solo la webcam del computador (o con teclado y ratón si no hay cámara). Recorres el museo, eliges artefactos históricos y vives dos misiones simuladas:

- **Luna, Apollo 17 (1972):** conduces el rover lunar LRV en Taurus-Littrow, recoges una muestra y vuelves al módulo lunar.
- **Marte, Perseverance (en curso):** el rover sigue activo en el cráter Jezero desde 2021. Aún no está implementado.

El objetivo es educativo: aprender sobre el hardware que dejamos en otros mundos y la ciencia que hizo. La precisión histórica es un requisito (ver [SPEC.md](./SPEC.md), §0 y §8.6).

Todo corre en el navegador. No hay backend.

## Tecnologías

- Vite + TypeScript.
- Three.js para la escena 3D.
- `@mediapipe/tasks-vision` para detectar cara, cuerpo y manos desde la webcam.
- Voz del mentor con la Web Speech API del navegador (o audio grabado, si existe en `public/voz/`).

## Requisitos

- Node.js 20 o superior, y npm.
- Navegador reciente con WebGL: Chrome, Edge o Safari.
- Webcam para el modo cámara. El modo teclado no la necesita.

> La webcam solo funciona en `localhost` o en una página servida por **HTTPS**.

## Puesta en marcha

```bash
npm install          # instala dependencias
npm run dev          # servidor de desarrollo en http://localhost:5173
npm run build        # comprueba tipos (tsc) y genera dist/
npm run preview      # sirve dist/ localmente para probar el build
```

`predev` y `prebuild` copian los WASM de MediaPipe a `public/wasm` (carpeta ignorada por git). Si arrancas Vite directamente sin npm, esa carpeta no existe y el seguimiento no carga.

### Páginas

| Ruta      | Contenido                                                                                  |
| --------- | ------------------------------------------------------------------------------------------ |
| `/`       | El juego: pantalla de inicio, museo y misiones.                                            |
| `/debug/` | Diagnóstico: webcam, puntos de cara, hombros y manos, y valores de los gestos en vivo.     |

### Pruebas

No hay suite general ni linter. `npm run build` es la única comprobación automática de tipos. Algunas pruebas de lógica viven en `tests/` y corren sin dependencias con Node 22.6 o superior:

```bash
node --test tests/luna.test.ts
node --test tests/velocidadLuna.test.ts
```

## Controles

El juego ofrece dos formas de control. Se elige al inicio y se recuerda al recargar.

### Modo cámara

| Acción                          | Gesto                                                    |
| ------------------------------- | -------------------------------------------------------- |
| Caminar por el museo            | Subir las rodillas (caminar en el sitio)                 |
| Girar la vista                  | Inclinar la cabeza hacia un lado                         |
| Mirar arriba o abajo            | Subir o bajar la cabeza                                  |
| Señalar una vitrina             | Cursor con el dedo índice                                |
| Entrar a la misión              | Aplaudir                                                 |
| Conducir el LRV                 | Volante con las dos manos; avanzar con las rodillas      |
| Seleccionar una muestra         | Cursor con una mano y pellizco                           |
| Recoger una muestra             | Golpe con una mano y agarre con la otra                  |
| Volver al museo                 | Aplaudir                                                 |

### Modo teclado y ratón

| Acción                          | Control                              |
| ------------------------------- | ------------------------------------ |
| Moverse                         | W A S D                              |
| Mirar                           | Ratón                                |
| Acción principal                | Espacio, E o clic izquierdo          |
| Acción secundaria               | F o clic derecho                     |
| Salir o cancelar                | Esc                                  |
| Desplegar el LRV (Apollo 17)    | Mantener E durante 3 s               |

Las reglas de giro y de velocidad (zona muerta, sensibilidad y velocidad máxima) están en [SPEC.md](./SPEC.md), §4. Se pueden ajustar en el menú de opciones.

## Estado del proyecto

| Parte                                               | Estado                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Seguimiento de cara, cuerpo y manos                 | Verificado con cámara real                                    |
| Caminar por rodillas                                | Implementado. Umbrales pendientes de validar con cámara real  |
| Control por teclado y ratón                         | Verificado sin ventana (Chrome headless)                      |
| Museo: escena, vitrinas, navegación                 | Implementado. Falta prueba con navegador y cámara reales      |
| Misión lunar (Apollo 17)                            | Implementado. Falta prueba con navegador y cámara reales      |
| Misión marciana (Perseverance)                      | Pendiente                                                     |
| Mentor y voz                                        | En curso                                                      |
| Publicación                                         | Pendiente                                                     |

El detalle completo está en la sección 14 de [SPEC.md](./SPEC.md).

## Documentación

- [SPEC.md](./SPEC.md): especificación del producto. Gestos, flujo del museo, misiones y precisión histórica.
- [spec-visual-museo.md](./spec-visual-museo.md): especificación visual del museo y la escena lunar (estilo low poly).
- [CLAUDE.md](./CLAUDE.md): guía para trabajar en el código con Claude Code.
- [src/visual/MODELS.md](./src/visual/MODELS.md): cómo reemplazar los modelos placeholder por archivos `.glb`.
- [tools/README.md](./tools/README.md): generación del audio del mentor.

## Publicar

```bash
npm run build
```

Sube el contenido de `dist/` a cualquier hosting estático con HTTPS (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.). `dist/` incluye los modelos y los binarios WASM de MediaPipe, así que el servidor no necesita nada más.

Si la página se publica en una subruta (por ejemplo `https://usuario.github.io/museo-espacial/`), cambia `base` en `vite.config.ts` a `'/museo-espacial/'` antes de hacer el build.

## Estructura

```
index.html            Página principal del juego
debug/index.html      Página de diagnóstico (/debug/)
public/models/        Modelos .task de MediaPipe (cara, pose ligera, manos)
scripts/              Copia de los WASM de MediaPipe y cálculo de efemérides lunares
src/main.ts           Arranque: elige cámara o teclado
src/game/             Lógica: museo, calibración, caminata, gestos, misión lunar, opciones
src/tracking/         Detección con MediaPipe y cálculo de métricas (cámara)
src/input/            Fuentes de entrada: cámara o teclado y ratón
src/visual/           Escena Three.js: museo, Luna, mano 3D, mentor, modelos placeholder
src/audio/            Voz del mentor, guion y sincronía con el audio
src/ui/               Pantallas de inicio, juego y opciones; overlay de depuración
src/i18n/             Textos (es.json y en.json)
tests/                Pruebas de lógica y capturas de referencia
tools/                Herramientas fuera de la app (generación de voz)
referencia/           Material de referencia
```

## Modelos de MediaPipe

Se descargaron de `storage.googleapis.com/mediapipe-models/`:

- `face_landmarker.task`
- `pose_landmarker_lite.task`
- `hand_landmarker.task`
