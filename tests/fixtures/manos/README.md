# Capturas de poses de la mano

Esta carpeta guarda capturas reales de poses de la mano, grabadas con la tecla **P**, para usarlas como pruebas y diagnóstico.

## Cómo grabar una pose

1. Arranca el servidor de desarrollo: `npm run dev`.
2. Abre la página del juego en el navegador y espera a que el seguimiento esté activo (la cámara tiene que ver tu mano).
3. Sostén la pose frente a la webcam, quieta, durante un par de segundos.
4. Pulsa **P**. El navegador descarga un archivo `captura-mano-<fecha>.json`.
5. Renómbralo y colócalo en esta carpeta con el nombre de la pose:

| Archivo | Pose |
| --- | --- |
| `mano_canto.json` | Mano de canto (palma de lado) |
| `palma_abajo.json` | Palma hacia abajo |
| `dedos_hacia_camara.json` | Dedos apuntando a la webcam |
| `mano_colgando.json` | Mano colgando, relajada |
| `palma_frente.json` | Palma hacia la webcam (la pose que sí se ve bien) |

La tecla P solo funciona en desarrollo: no está en la versión de producción.

## Poses sintéticas (no son capturas de cámara)

Mientras no haya capturas reales, los cinco archivos de la tabla son **poses sintéticas**, generadas con
`node tests/fixtures/manos/generar-sinteticas.ts` a partir de una mano derecha aproximada (etiqueta `Right`).
Cada una lleva `"sintetica": true` y una `descripcion` que empieza por "SINTÉTICA". No son datos de MediaPipe: sirven
para las capturas de pantalla de `tests/capturas/manos/`. La prueba "con las capturas reales" de
`tests/manoModelo.test.ts` las ignora. Al grabar una captura real con la tecla P, reemplaza el archivo sintético del
mismo nombre (la captura real no lleva `sintetica`).

## Qué contiene cada captura

- `version`, `fecha`, `ancho` y `alto` del vídeo.
- `manos`: una entrada por mano detectada, con:
  - `label`: `Left` o `Right` (lateralidad de MediaPipe).
  - `score`: siempre `null` por ahora. La puntuación de handedness no llega a `TrackedHand`.
  - `landmarks`: 21 puntos normalizados (x, y entre 0 y 1; z relativa a la muñeca).
  - `worldLandmarks`: 21 puntos en metros, centrados en la mano.

## Analizar las capturas

```bash
node tests/fixtures/manos/analizar.ts              # todas las .json de esta carpeta
node tests/fixtures/manos/analizar.ts mano_canto.json   # una sola captura
```

El análisis calcula, para cada mano:

- **a)** Cuántos puntos no son finitos (pasan por `estimarPuntosOcultos`) y cuántos landmarks quedan fuera del encuadre.
- **b)** La flexión de cada articulación de cada dedo y la desviación lateral del primer hueso. Marca los valores fuera de -10° a 110° (flexión) y de más de 25° (desviación lateral).
- **c)** Los huesos de dedo que atraviesan el plano de la palma.
- **d)** El signo del determinante de la base de la palma (muñeca, MCP del índice y del meñique) antes y después de invertir z.

Nota sobre **d)**: invertir z de todos los puntos es un espejo, y un espejo siempre cambia el signo de un determinante. Por eso el cambio de signo, por sí solo, no indica un error. Lo que importa es si la lateralidad de la captura coincide con la mano real.
