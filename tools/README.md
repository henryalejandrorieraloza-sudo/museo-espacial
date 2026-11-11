# Herramientas (no forman parte de la app)

## Generar el audio del mentor

`generar-voz.mjs` crea el audio de las líneas del mentor y los tiempos por palabra. La app **no genera audio en
ejecución**: solo reproduce lo que encuentre en `public/voz/`. Si no hay audio, usa la síntesis de voz del navegador.

```bash
# 1) Edita tools/voz.config.json: proveedor, voz, modelo y qué claves de src/i18n/es.json generar.
# 2) Pon la clave en una variable de entorno (el nombre está en "apiKeyEnv"; nunca en el código ni en el repo):
export TTS_API_KEY=...
# 3) Comprueba qué se va a enviar, sin red ni clave:
node tools/generar-voz.mjs --dry-run
# 4) Genera (omite lo que ya existe; --force regenera):
node tools/generar-voz.mjs
```

Salida en `public/voz/`: `<clave>.mp3`, `<clave>.json` (`{ texto, words: [{ text, start, end }] }`, en segundos) e
`index.json`, que la app lee al arrancar. La línea se busca por su texto limpio, así que si cambias el texto en
`es.json` hay que regenerar el audio.

**Proveedor.** Es un valor de configuración (`provider`). Hoy está implementado `elevenlabs` (endpoint con tiempos por
carácter, de los que se derivan las palabras). Para otro proveedor, añade una función en `proveedores` que devuelva
`{ audio: Buffer, words }`. Esta versión no se ha probado contra la API real (no había clave).

## Marcas de gesto en los textos

En `src/i18n/es.json` el texto del mentor puede llevar marcas `{nombre}`. Cada marca se pega a la palabra que la
precede y el gesto empieza cuando esa palabra empieza a sonar. `t()` las quita, así que los subtítulos no cambian;
solo la voz lee el texto con marcas (`tGuion()`).

| Marca | Gesto (se mantiene y vuelve a neutro; transiciones de 0,6 a 1 s) | Para |
|---|---|---|
| `{heroico}` | un brazo muy alto sobre el hombro, garra cerrada e inclinada hacia delante; ≈1,5 s | logros y momentos clave |
| `{exacto}` | una garra casi en el collar, con un pulso rápido (≈0,3 s); ≈0,9 s | cifras, datos y detalles precisos |
| `{directo}` | un brazo al frente y algo hacia fuera, garra abierta; ≈1,2 s | explicaciones e invitar a mirar |
| `{poderoso}` | un brazo doblado con la garra cerrada cerca del pecho y el cuerpo inclinado 4°; ≈1,2 s | afirmaciones fuertes |
| `{honesto}` | los dos brazos abajo y abiertos hacia fuera, garras abiertas; ≈1,5 s | confesiones y hablar claro |
| `{cercano}` | los dos brazos se pliegan despacio hacia el cuerpo (entrada de ≈1 s); ≈1,5 s | bienvenidas y despedidas |

Reglas: un solo gesto a la vez (si llega una marca con otro gesto en curso, se descarta: no podría empezar a media
palabra), como mucho uno por frase, y hay frases sin gesto. En reposo no hay movimiento aleatorio: los brazos
descansan cerca de la pose neutra con una respiración de ≈1° y un balanceo lento del cuerpo.

Hay un guion de ejemplo con las seis marcas en `tools/guion-ejemplo.txt`.
