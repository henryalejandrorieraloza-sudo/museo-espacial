// Comprobaciones de las poses de tests/fixtures/manos/ con la geometría del guante (sin navegador).
// Ejecutar: node tests/capturas/manos/comprobar.ts
//
// Para cada pose:
// - Dónde queda la base del pulgar (landmark 1) en unidades de la palma.
// - Si algún dedo atraviesa la palma: puntos del eje de cada dedo dentro del volumen de la palma (PERFIL_PALMA).
//   Un dedo nace en su nudillo, que ya está dentro del borde de la palma; solo cuenta si vuelve hacia la muñeca
//   (más abajo que su nudillo) y entra en el cuerpo de la palma. El pulgar cuenta salvo junto a su base (tenar).
//   Se informa la penetración máxima en metros.
// - Con palma_frente: si el pulgar queda a la izquierda del índice en la escena.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAND_SCALE, estimarPuntosOcultos, puntosManoMundo, type Vec3, type VistaCamara } from '../../../src/visual/manosGeometria.ts';
import { PERFIL_PALMA, RADIO_SEGMENTO } from '../../../src/visual/guante.ts';
import type { ManoDetectada } from '../../../src/visual/manos.ts';

const carpeta = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'manos');
const VISTA_BASE = { aspectoEscena: 16 / 9, fovVertical: (60 * Math.PI) / 180, escala: HAND_SCALE };

const resta = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const punto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const escalar = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cruz = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const mezcla = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** Igual que sistemaPalma de manos.ts. */
function sistema(p: Vec3[]) {
  const c = escalar([5, 9, 13, 17].reduce((s, i) => ({ x: s.x + p[i].x, y: s.y + p[i].y, z: s.z + p[i].z }), { x: 0, y: 0, z: 0 }), 0.25);
  const yv = resta(c, p[0]);
  const largo = norm(yv);
  const Y = escalar(yv, 1 / largo);
  const xv = resta(p[17], p[5]);
  const ancho = norm(xv);
  const xo = resta(xv, escalar(Y, punto(xv, Y)));
  const X = escalar(xo, 1 / norm(xo));
  const Z = cruz(X, Y);
  return { X, Y, Z, ancho, largo };
}

/** Perfil de la palma interpolado en la altura v (unidades de largo). null fuera de la palma. */
function perfilEn(v: number) {
  if (v < PERFIL_PALMA[0].y || v > PERFIL_PALMA[PERFIL_PALMA.length - 1].y) return null;
  for (let i = 0; i + 1 < PERFIL_PALMA.length; i++) {
    const a = PERFIL_PALMA[i];
    const b = PERFIL_PALMA[i + 1];
    if (v <= b.y) {
      const t = (v - a.y) / (b.y - a.y);
      return { rx: a.rx + (b.rx - a.rx) * t, dorso: a.dorso + (b.dorso - a.dorso) * t, palmar: a.palmar + (b.palmar - a.palmar) * t };
    }
  }
  return null;
}

/** Dedos: cadena de landmarks desde el nudillo (el pulgar, desde su MCP; los primeros 35 % de ese hueso van en la tenar). */
const DEDOS: Record<string, number[]> = {
  indice: [5, 6, 7, 8],
  medio: [9, 10, 11, 12],
  anular: [13, 14, 15, 16],
  menique: [17, 18, 19, 20],
  pulgar: [2, 3, 4],
};

let fallos = 0;
for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.json')).sort()) {
  const captura = JSON.parse(readFileSync(join(carpeta, archivo), 'utf8')) as {
    sintetica?: boolean;
    ancho: number;
    alto: number;
    manos: ManoDetectada[];
  };
  for (const mano of captura.manos) {
    const vista: VistaCamara = { ancho: captura.ancho, alto: captura.alto, ...VISTA_BASE };
    const mundo = estimarPuntosOcultos(mano.worldLandmarks);
    const p = mundo ? puntosManoMundo(mano.landmarks, mundo, vista) : null;
    if (!p) {
      console.log(`${archivo} ${mano.label}: no se puede dibujar`);
      continue;
    }
    const s = sistema(p);
    // Mano izquierda: dorso en −z; derecha: dorso en +z (como en manos.ts).
    const ladoDorso = mano.label === 'Left' ? -1 : 1;
    const local = (q: Vec3) => {
      const d = resta(q, p[0]);
      return { u: punto(d, s.X) / s.ancho, v: punto(d, s.Y) / s.largo, w: punto(d, s.Z) * ladoDorso };
    };
    const base = local(p[1]);
    let peor = 0;
    let donde = '';
    for (const [dedo, cadena] of Object.entries(DEDOS)) {
      const vNudillo = local(p[cadena[0]]).v;
      for (let k = 0; k + 1 < cadena.length; k++) {
        const r = RADIO_SEGMENTO[cadena[k]];
        for (let t = k === 0 ? 0.35 : 0; t <= 1.0001; t += 0.05) {
          const q = local(mezcla(p[cadena[k]], p[cadena[k + 1]], t));
          const perfil = perfilEn(q.v);
          if (!perfil || Math.abs(q.u) > perfil.rx) continue;
          if (dedo !== 'pulgar' && q.v > vNudillo - 0.05) continue;
          // Penetración del eje del dedo en el volumen de la palma (m). Positiva = dentro.
          const dentro = q.w >= 0 ? perfil.dorso - q.w : perfil.palmar + q.w;
          if (dentro > peor) {
            peor = dentro;
            donde = `${dedo} (hueso ${cadena[k]}→${cadena[k + 1]}, radio ${r})`;
          }
        }
      }
    }
    const linea = [
      `${archivo}${captura.sintetica ? ' (sintética)' : ''} ${mano.label}:`,
      `base del pulgar en u=${base.u.toFixed(2)} v=${base.v.toFixed(2)} w=${(base.w * 1000).toFixed(1)} mm;`,
      peor > 0 ? `ATRAVIESA la palma: ${donde}, ${(peor * 1000).toFixed(1)} mm dentro` : 'ningún dedo atraviesa la palma',
    ];
    if (peor > 0) fallos++;
    if (archivo.startsWith('palma_frente')) {
      const izquierda = p[4].x < p[8].x;
      linea.push(izquierda ? '· pulgar a la izquierda del índice' : '· PULGAR A LA DERECHA');
      if (!izquierda) fallos++;
    }
    console.log(linea.join(' '));
  }
}
process.exitCode = fallos > 0 ? 1 : 0;
