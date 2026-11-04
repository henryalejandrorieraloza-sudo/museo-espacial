# Modelos del museo

Cada fila es una entrada de `MODELOS` en `src/visual/config.ts`. Para cambiar un modelo por el de Blender, solo se cambia su `ruta` (un `.glb` en `public/`) y su `escala`.

Convención para el modelo final: 1 unidad de Blender = 1 metro, sin escalar en la exportación. Con eso, la escala queda en `1`.

| id | Nombre del nodo | Placeholder actual | Escala esperada (modelo final) |
| --- | --- | --- | --- |
| `museo` | `museo` | Sala de 16 × 16 m: suelo plano gris y cuatro paredes de caja de 4 m de alto. Sin texturas. | 1 (la sala medirá 16 m) |
| `vitrina_lrv` | `vitrina_lrv` | Pedestal octogonal gris (radio 0.6 m, alto 0.5 m) con un icosaedro blanco de 0.9 m de diámetro encima, centrado a 1.0 m de altura. | 1 |
| `vitrina_perseverance` | `vitrina_perseverance` | Igual que `vitrina_lrv`. Está a 8 m de distancia, en la misma fila (x = +4 frente a x = −4). | 1 |
| `mentor` | `mentor` | Tronco de cilindro azul de 8 lados (1.25 m) con cabeza icosaédrica color piel de 0.28 m de diámetro, con la base en el suelo. Altura total 1.6 m. | 1 (altura real del mentor, 1.6 m) |
| `halo_senalar` | `halo_senalar` | Anillo amarillo delgado (radio 0.6 m, grosor 0.04 m), de cara al jugador, a 2.2 m de altura sobre la vitrina. | 1 |

Notas:
- Las vitrinas no están en `config.ts` porque su posición es de diseño: se fija en `POSICION_VITRINA` de `src/visual/museo.ts`.
- El origen de cada modelo debe quedar en el suelo y centrado en la vitrina; el punto de apuntado es el centro del cubo (1.0 m).

## Escenas de misión (placeholders)

Se definen en `ESCENAS` de `src/visual/config.ts`. Cada escena es un grupo; se muestra solo una a la vez.

| id | Nombre del nodo | Contenido placeholder | Escala esperada (modelo final) |
| --- | --- | --- | --- |
| `escena_luna` | `escena_luna` | Suelo gris claro de 60 × 60 m. Cielo negro (fondo de la escena). Hijos: `lrv_placeholder` (LRV aproximado, unos 2.4 m de largo, en (0, 0, −4)) y `roca_placeholder` (dodecaedro aplanado de unos 0.8 m en (2.5, 0, −3), con el halo azul celeste `halo_roca`: anillo de 0.6 m de radio a 0.4 m de altura). | 1 |
| `escena_marte` | `escena_marte` | Suelo rojizo de 60 × 60 m. Cielo claro (fondo de la escena). Hijo: `perseverance_placeholder` (Perseverance aproximado, unos 1.8 m de ancho, en (0, 0, −4)). | 1 |

Notas:
- Los hijos tienen posición fija en el placeholder. Al cambiar un hijo por un `.glb`, mantén su nombre.
- **LRV y Perseverance son formas simplificadas, no medidas oficiales.** Las proporciones son aproximadas y no se han comprobado con documentación técnica. Lo que sí respeta la forma: el LRV tiene chasis plano, asiento, antena y cuatro ruedas; Perseverance tiene cuerpo blanco con capa dorada, seis ruedas, mástil con cámara, generador (RTG) y brazo. Las simplificaciones de forma se anotan aquí (SPEC §0 y §8.6).
- Colores añadidos a la paleta inicial: ruedas y asiento del LRV en gris muy oscuro (`rueda`) y cabeza del mentor en tono piel (`piel`).
- Estilo low poly: caras planas (`flatShading`), pocos segmentos, sin texturas. Iluminación: luz hemisférica y una direccional, sin sombras.
- El jugador llega a (0, 1.6, 4) mirando a −Z. Al volver, recupera su posición y giro del museo.
