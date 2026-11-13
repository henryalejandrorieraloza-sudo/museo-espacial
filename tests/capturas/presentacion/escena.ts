// Fotografía un instante de la presentación del LRV (solo desarrollo, no entra en el build). Usa las mismas piezas
// que el juego: el guion (game/presentacionLRV.ts), la escena (visual/presentacionLRV.ts) y su capa de rótulos.
//
// Parámetros de la URL: escena (índice en GUION), tramo (índice dentro de la escena) y t (s desde el inicio del
// tramo). Se recorren los tramos anteriores de la misma escena para que la cámara salga de donde quedó. Con
// `subtitulos=1` se muestra la frase del tramo. Cuando termina de dibujar, el título de la página pasa a "listo".

import * as THREE from 'three';
import '../../../src/styles.css';
import '../../../src/juego.css';
import { GUION, opacidadMarca } from '../../../src/game/presentacionLRV.ts';
import { t as texto } from '../../../src/i18n/index.ts';
import { EXPOSICION_LUNA } from '../../../src/visual/lunaEscena.ts';
import { crearPresentacionVisual } from '../../../src/visual/presentacionLRV.ts';
import { crearPresentacionUi } from '../../../src/ui/presentacionUi.ts';

const params = new URLSearchParams(location.search);
const iEscena = Number(params.get('escena') ?? 0);
const iTramo = Number(params.get('tramo') ?? 0);
const tFinal = Number(params.get('t') ?? 0);
const conSubtitulos = params.get('subtitulos') === '1';

const ANCHO = 1280;
const ALTO = 720;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(ANCHO, ALTO);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSICION_LUNA;
document.body.prepend(renderer.domElement);

const pres = crearPresentacionVisual(renderer);
pres.ajustar(ANCHO, ALTO);
const ui = crearPresentacionUi();
ui.mostrar(true);

const escena = GUION[iEscena];
const paso = 1 / 15;
let posiciones = [] as ReturnType<typeof pres.actualizar>;
for (let k = 0; k <= iTramo; k++) {
  const tramo = escena.tramos[k];
  const fin = k === iTramo ? tFinal : tramo.minS;
  for (let tt = 0; tt <= fin + 1e-6; tt += paso) posiciones = pres.actualizar({ tramo, t: Math.min(tt, fin), dtS: paso });
  posiciones = pres.actualizar({ tramo, t: fin, dtS: 0 });
}
const tramo = escena.tramos[iTramo];
ui.rotulos(
  tramo.marcas.flatMap((m, i) => {
    const p = posiciones[i];
    if (!m.rotulo || !p?.enPantalla) return [];
    const [dx, dy] = m.rotuloPx ?? [0, -80];
    return [{ texto: texto(m.rotulo), x: p.x + dx, y: p.y + dy, opacidad: opacidadMarca(m, tFinal) }];
  }),
);
const peso = tramo.tarjetaPeso;
ui.peso(peso ? opacidadMarca({ resalte: 'lrv', rotulo: null, desde: peso[0], hasta: peso[1] }, tFinal) : 0);
if (conSubtitulos && tramo.narracion) {
  const sub = document.getElementById('subtitulos')!;
  sub.textContent = texto(tramo.narracion);
  sub.hidden = false;
}
pres.render();
requestAnimationFrame(() => {
  pres.render();
  document.title = 'listo';
});
