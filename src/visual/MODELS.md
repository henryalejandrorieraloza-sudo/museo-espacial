# Modelos del museo

Cada fila es una entrada de `MODELOS` en `src/visual/config.ts`. Para cambiar un modelo por el de Blender, solo se cambia su `ruta` (un `.glb` en `public/`) y su `escala`.

Convención para el modelo final: 1 unidad de Blender = 1 metro, sin escalar en la exportación. Con eso, la escala queda en `1`.

| id | Nombre del nodo | Placeholder actual | Escala esperada (modelo final) |
| --- | --- | --- | --- |
| `museo` | `museo` | Sala de 16 × 16 m: suelo plano gris y cuatro paredes de caja de 4 m de alto. Sin texturas. | 1 (la sala medirá 16 m) |
| `vitrina_lrv` | `vitrina_lrv` | Pedestal gris de 1.2 × 0.5 × 1.2 m con un cubo blanco de 1 × 1 × 1 m encima. Centro del cubo a 1.0 m de altura. | 1 |
| `vitrina_perseverance` | `vitrina_perseverance` | Igual que `vitrina_lrv`. Está a 8 m de distancia, en la misma fila (x = +4 frente a x = −4). | 1 |
| `mentor` | `mentor` | Cilindro azul de 0.4 m de diámetro y 1.6 m de alto, con la base en el suelo. | 1 (altura real del mentor, 1.6 m) |
| `halo_senalar` | `halo_senalar` | Anillo amarillo delgado (radio 0.6 m, grosor 0.04 m), de cara al jugador, a 2.2 m de altura sobre la vitrina. | 1 |

Notas:
- Las vitrinas no están en `config.ts` porque su posición es de diseño: se fija en `POSICION_VITRINA` de `src/visual/museo.ts`.
- El origen de cada modelo debe quedar en el suelo y centrado en la vitrina; el punto de apuntado es el centro del cubo (1.0 m).
