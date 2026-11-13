// Fotografía un instante de la cinemática del despegue (solo desarrollo, no entra en el build). Usa las mismas piezas
// que el juego: la línea de tiempo (game/cinematicaDespegue.ts), la escena lunar con visual.museo y la capa de pantalla.
//
// Parámetros de la URL: t (s de la cinemática), y lrvX, lrvZ, rumbo (dónde estaba el LRV al empezar; por defecto, junto
// al suelo naranja). Con `libre=1` muestra el modo libre del final. Cuando termina de dibujar, el título pasa a "listo".

import '../../../src/styles.css';
import '../../../src/juego.css';
import { LINEA_DESPEGUE, estadoEn, fundidoEn } from '../../../src/game/cinematicaDespegue.ts';
import { t as texto } from '../../../src/i18n/index.ts';
import { crearCinematicaUi } from '../../../src/ui/cinematicaUi.ts';
import { DURACION_DESPLIEGUE_LRV_S } from '../../../src/visual/despliegueApollo17.ts';
import { visual } from '../../../src/visual/museo.ts';
import { ROCA_ESTACION1 } from '../../../src/visual/sitioApollo17.ts';

const params = new URLSearchParams(location.search);
const tFinal = Number(params.get('t') ?? 0);
const libre = params.get('libre') === '1';

await visual.museo.iniciar(document.getElementById('scene')!);
const m = visual.museo;
m.entrarEscena('luna');
m.poseDespliegueLRV(DURACION_DESPLIEGUE_LRV_S, 0);
// El LRV conduce un poco hasta junto al suelo naranja (deja huellas) y el jugador se baja.
const fin = { x: Number(params.get('lrvX') ?? ROCA_ESTACION1.x + 3), z: Number(params.get('lrvZ') ?? ROCA_ESTACION1.z - 4) };
const rumbo = Number(params.get('rumbo') ?? 175);
for (let k = 0; k <= 60; k++) {
  const f = k / 60;
  m.actualizarLuna({ x: 7 + (fin.x - 7) * f, z: 5 + (fin.z - 5) * f, rumboGrados: rumbo, direccionGrados: 0, dtS: 0.1, sentado: false, haloVisible: false });
}
m.recogerSueloNaranja(1);
m.iniciarDespegue();
const ui = crearCinematicaUi();
ui.mostrar(true);
ui.omitible(true);
for (let tt = 0; tt <= tFinal + 1e-6; tt += 0.25) m.actualizarDespegue(estadoEn(LINEA_DESPEGUE, Math.min(tt, tFinal)));
const estado = estadoEn(LINEA_DESPEGUE, tFinal);
m.actualizarDespegue(estado);
if (libre) {
  m.terminarDespegue();
  ui.mostrar(false);
} else {
  m.fundido(fundidoEn(LINEA_DESPEGUE.fundidos, tFinal));
  const visible = LINEA_DESPEGUE.textos.find((x) => tFinal > x.desdeS && tFinal < x.hastaS);
  ui.texto(visible ? texto(visible.clave) : null, 1);
  ui.aspecto(estado.toma?.estilo ?? null, estado.sobreexposicion);
}
requestAnimationFrame(() => requestAnimationFrame(() => (document.title = 'listo')));
