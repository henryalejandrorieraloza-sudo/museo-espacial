# Modelos del museo

Cada fila es una entrada de `MODELOS` en `src/visual/config.ts`. Para cambiar un modelo por el de Blender, solo se cambia su `ruta` (un `.glb` en `public/`) y su `escala`.

Convención para el modelo final: 1 unidad de Blender = 1 metro, sin escalar en la exportación. Con eso, la escala queda en `1`.

| id | Nombre del nodo | Placeholder actual | Escala esperada (modelo final) |
| --- | --- | --- | --- |
| `museo` | `museo` | Rotonda de 32 m generada en `arquitectura.ts`: suelo, paredes, pasarela, ventanales, cúpula con sistema solar, proyector y decoración (`props.ts`). | 1 |
| `vitrina_lrv` | `vitrina_lrv` | Pedestal octogonal de 0.6 m y cubo de cristal de 3.5 m, con el LRV de exhibición a tamaño real aproximado. | 1 |
| `vitrina_perseverance` | `vitrina_perseverance` | Igual que `vitrina_lrv`, con Perseverance de exhibición. A 9 m de distancia (x = +4.5 frente a x = −4.5). | 1 |
| `mentor` | `mentor` | Robot compacto flotante: cuerpo azul facetado, visor oscuro, ojos y sonrisa claros, brazos cortos y sin piernas. | 0.8 |
| `halo_senalar` | `halo_senalar` | Anillo amarillo delgado (radio 0.96 m con la escala 1.6), de cara al jugador, a 4.6 m de altura sobre la vitrina. | 1.6 |

Notas:
- Las vitrinas no están en `config.ts` porque su posición es de diseño: se fija en `POSICION_VITRINA` de `src/visual/museo.ts`.
- El origen de cada modelo debe quedar en el suelo y centrado en la vitrina; el punto de apuntado es el centro del cubo (2.35 m).

## Objetos de exhibición

Están en `src/visual/props.ts`. **Son formas simplificadas, con proporciones aproximadas a partir de datos públicos; no son planos oficiales ni se han comprobado con documentación técnica.**

| Objeto | Lo que sí representa | Simplificación |
| --- | --- | --- |
| LRV | Unos 3.1 m de largo, chasis en tres secciones, cuatro ruedas de malla con chevrones, dos asientos, mando en T, plato, antena helicoidal y cámara | Sin cableado ni instrumentos; ruedas macizas en vez de malla |
| Perseverance | Unos 3 × 2.7 × 2.2 m, seis ruedas con balancín, mástil con cámaras, brazo con torreta, generador con aletas y antena hexagonal | Instrumentos reducidos a cajas; brazo plegado aproximado |
| Traje A7LB | Traje blanco, visor dorado, mochila, conectores azul y rojo; franjas rojas del comandante en una de las dos cápsulas | Sin capa exterior de detalle; no representa un traje concreto de un astronauta |
| Saturn V | Escala 1:13 (8.5 m), etapas, patrón negro y torre de escape | Patrón de balanceo aproximado |
| Atlas V 541 | Escala 1:13 (4.48 m), etapa central naranja salmón, cuatro aceleradores y cofia blanca | Sin marcas ni detalle de superficie |

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
- Las escenas de misión mantienen su estilo y sus modelos propios: caras planas (`flatShading`), pocos segmentos, sin texturas, luz hemisférica y una direccional, sin sombras, niebla ni bloom.
- El jugador llega a (0, 1.6, 4) mirando a −Z. Al volver, recupera su posición y giro del museo.
