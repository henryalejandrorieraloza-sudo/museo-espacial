// Comprobaciones automáticas de la malla del guante (sin navegador ni dependencias nuevas).
// Ejecutar: node tests/capturas/manos/geometria.ts      (código de salida 1 si algo falla)
//
// Para cada pose de tests/fixtures/manos/, en mano derecha e izquierda y con tres tamaños de mano:
//  1. Malla cerrada: cada arista pertenece a exactamente dos caras (con vértices soldados), y cada arista se recorre
//     una vez en cada sentido (caras orientadas igual: ninguna cara interior) y el volumen con signo es positivo.
//  2. Cada base de dedo coincide con su MCP (distancia 0) y con el punto medio de los dos vértices MCP de la palma.
//  3. El pulgar comparte vértices con la cuña tenar (≥ 2), y el puño con la palma (8 del cuello).
//  4. Límites de la palma (E4): lateral ≤ MCP + 0.12 anchos, entre la muñeca y la línea de MCP.
//  5. Bandas: 4 × 3 + 2 (el CMC del pulgar queda dentro de la cuña) y mismo número en las dos manos.
//  6. Misma cantidad de triángulos en las dos manos.
//  7. Los dedos vecinos no se cruzan: distancia mínima entre ejes ≥ 1.5 × radio.
// Informa además (no falla): ángulos entre dedos vecinos (E8), largos del pulgar y del meñique (E1, E5).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CADENAS_DEDO, ESPESOR_BORDE_MCP, RADIO_SEGMENTO, UNIONES_DEDO, DISEÑO_DEDOS } from '../../../src/visual/guante.ts';
import { crearManos, type ManoDetectada } from '../../../src/visual/manos.ts';
import { estimarPuntosOcultos, puntosManoMundo, HAND_BONE_LENGTHS } from '../../../src/visual/manosGeometria.ts';
import { tablaLimitesPorDefecto } from '../../../src/game/opciones.ts';

let fallos = 0;
const malo = (m: string): void => {
  console.log('  FALLO: ' + m);
  fallos++;
};

/** Soldadura de vértices por posición (tolerancia 1e-5 m). Devuelve el id de cada vértice. */
class Soldador {
  private celdas = new Map<string, { id: number; p: THREE.Vector3 }[]>();
  n = 0;
  id(p: THREE.Vector3): number {
    const c = 2e-5;
    const [i, j, k] = [Math.floor(p.x / c), Math.floor(p.y / c), Math.floor(p.z / c)];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let d = -1; d <= 1; d++)
          for (const q of this.celdas.get(`${i + a},${j + b},${k + d}`) ?? []) if (q.p.distanceTo(p) < 1e-5) return q.id;
    const e = { id: this.n++, p: p.clone() };
    const clave = `${i},${j},${k}`;
    this.celdas.set(clave, [...(this.celdas.get(clave) ?? []), e]);
    return e.id;
  }
}

/** Triángulos de una malla en coordenadas de escena: lista de [a, b, c]. */
function triangulos(m: THREE.Mesh): THREE.Vector3[][] {
  m.updateWorldMatrix(true, false);
  const p = m.geometry.getAttribute('position');
  const v = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
  return Array.from({ length: p.count / 3 }, (_, t) => [v(3 * t), v(3 * t + 1), v(3 * t + 2)]);
}

function distSegmentos(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3): number {
  let mejor = Infinity;
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) {
    p.lerpVectors(a0, a1, i / 40);
    for (let j = 0; j <= 40; j++) mejor = Math.min(mejor, p.distanceTo(q.lerpVectors(b0, b1, j / 40)));
  }
  return mejor;
}

const carpeta = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'manos');
const nombres = ['pulgar', 'indice', 'medio', 'anular', 'menique'] as const;
const resumen: Record<string, { tris: number; bandas: number }> = {};

for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith('.json')).sort()) {
  const captura = JSON.parse(readFileSync(join(carpeta, archivo), 'utf8')) as { ancho: number; alto: number; manos: ManoDetectada[] };
  // Tamaño 0.6 (mínimo del deslizador): el grosor de los dedos no escala, así que la separación entre dedos no se exige.
  for (const escala of [0.6, 1.25, 2]) {
    for (const label of ['Right', 'Left'] as const) {
      const detectada: ManoDetectada = { ...captura.manos[0], label, score: null };
      const v = { ancho: captura.ancho, alto: captura.alto, aspectoEscena: 16 / 9, fovVertical: Math.PI / 3, escala };
      const manos = crearManos();
      manos.actualizar([detectada], v, { separacion: 0, ajuste: false, limites: tablaLimitesPorDefecto(), ahoraS: 0, tiempoOcultarS: 1, umbralSaltoM: 0.05 });
      manos.objeto.updateMatrixWorld(true);
      const grupo = manos.objeto.children.find((c) => c.visible)!;
      const [puno, palma, tenar, dedos] = grupo.children as THREE.Mesh[];
      const pts = puntosManoMundo(detectada.landmarks, estimarPuntosOcultos(detectada.worldLandmarks)!, v)!;
      const P = (i: number): THREE.Vector3 => new THREE.Vector3(pts[i].x, pts[i].y, pts[i].z);
      const etiqueta = `${archivo} ${label} tamaño ${escala}`;
      const principal = escala === 1.25;
      const antes = fallos;

      // 1. Malla cerrada y orientada.
      const sol = new Soldador();
      const piezas = { puno: triangulos(puno), palma: triangulos(palma), tenar: triangulos(tenar), dedos: triangulos(dedos) };
      const idsPorPieza: Record<string, Set<number>> = {};
      const dirigidas = new Map<string, number>();
      let volumen = 0;
      let total = 0;
      for (const [nombre, tris] of Object.entries(piezas)) {
        idsPorPieza[nombre] = new Set();
        for (const [a, b, c] of tris) {
          total++;
          const ids = [a, b, c].map((q) => sol.id(q));
          ids.forEach((i) => idsPorPieza[nombre].add(i));
          for (let e = 0; e < 3; e++) {
            const clave = `${ids[e]}>${ids[(e + 1) % 3]}`;
            dirigidas.set(clave, (dirigidas.get(clave) ?? 0) + 1);
          }
          volumen += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
        }
      }
      let abiertas = 0;
      let malOrientadas = 0;
      for (const [clave, n] of dirigidas) {
        const [a, b] = clave.split('>');
        const opuesta = dirigidas.get(`${b}>${a}`) ?? 0;
        if (n !== 1 || opuesta !== 1) {
          if (n + opuesta !== 2) abiertas++;
          else malOrientadas++;
        }
      }
      if (abiertas) malo(`${etiqueta}: ${abiertas / 2} aristas con ≠ 2 caras`);
      if (malOrientadas) malo(`${etiqueta}: ${malOrientadas / 2} aristas con caras mal orientadas (cara interior)`);
      if (volumen <= 0) malo(`${etiqueta}: volumen con signo ≤ 0 (caras hacia adentro)`);

      // 2. Base de cada dedo en su MCP y en el punto medio de los dos vértices MCP de la palma.
      const posDedos = dedos.geometry.getAttribute('position');
      const posPalma = palma.geometry.getAttribute('position');
      let peorBase = 0;
      let peorMedio = 0;
      for (const d of DISEÑO_DEDOS) {
        const j = d.cadena[0];
        const base = new THREE.Vector3();
        for (let k = 0; k < 6; k++) base.add(new THREE.Vector3().fromBufferAttribute(posDedos, 3 * (d.inicio * 3 + 6 * 0) + 0).setScalar(0)); // (se calcula abajo)
        // Primer anillo del dedo: vértice v(0,k) = primer vértice del triángulo 2k.
        base.set(0, 0, 0);
        for (let k = 0; k < 6; k++) base.add(new THREE.Vector3().fromBufferAttribute(posDedos, 3 * (d.inicio + 2 * k)));
        base.multiplyScalar(1 / 6);
        peorBase = Math.max(peorBase, base.distanceTo(P(j)));
        if (j !== 2) {
          const vs: THREE.Vector3[] = [];
          for (let i = 0; i < posPalma.count; i++) {
            const q = new THREE.Vector3().fromBufferAttribute(posPalma, i);
            if (Math.abs(q.distanceTo(P(j)) - ESPESOR_BORDE_MCP) < 1e-5 && !vs.some((r) => r.distanceTo(q) < 1e-7)) vs.push(q);
          }
          if (vs.length !== 2) malo(`${etiqueta}: MCP ${j} tiene ${vs.length} vértices de palma (se esperaban 2)`);
          const medio = vs.reduce((t, q) => t.add(q), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, vs.length));
          peorMedio = Math.max(peorMedio, medio.distanceTo(P(j)));
        }
      }
      if (peorBase > 1e-4) malo(`${etiqueta}: la base de un dedo está a ${(peorBase * 1000).toFixed(4)} mm de su MCP`);
      if (peorMedio > 1e-4) malo(`${etiqueta}: el punto medio de los vértices MCP de la palma está a ${(peorMedio * 1000).toFixed(4)} mm del MCP`);

      // 3. Vértices compartidos.
      const comparte = (a: string, b: string): number => [...idsPorPieza[a]].filter((i) => idsPorPieza[b].has(i)).length;
      const pulgarCuna = comparte('tenar', 'dedos');
      const punoPalma = comparte('puno', 'palma');
      if (pulgarCuna < 2) malo(`${etiqueta}: el pulgar comparte ${pulgarCuna} vértices con la cuña`);
      if (punoPalma !== 8) malo(`${etiqueta}: el puño comparte ${punoPalma} vértices con la palma (se esperaban 8)`);

      // 4. Límites de la palma en su marco local.
      const centro = [5, 9, 13, 17].reduce((s, i) => s.add(P(i)), new THREE.Vector3()).multiplyScalar(0.25);
      const largo = centro.distanceTo(P(0));
      const Y = centro.clone().sub(P(0)).normalize();
      const ancho = P(17).distanceTo(P(5));
      const X = P(17).sub(P(5));
      X.addScaledVector(Y, -X.dot(Y)).normalize();
      const loc = (q: THREE.Vector3): { u: number; y: number } => {
        const dq = q.clone().sub(P(0));
        return { u: dq.dot(X) / ancho, y: dq.dot(Y) / largo };
      };
      let maxU = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < posPalma.count; i++) {
        const q = new THREE.Vector3().fromBufferAttribute(posPalma, i);
        // El anillo de la muñeca es el cuello del puño (metros fijos, no escala): se excluye del límite lateral.
        if (idsPorPieza.puno.has(sol.id(q))) continue;
        const l = loc(q);
        maxU = Math.max(maxU, Math.abs(l.u));
        minY = Math.min(minY, l.y);
        maxY = Math.max(maxY, l.y);
      }
      const mcpU = Math.max(...[5, 17].map((j) => Math.abs(loc(P(j)).u)));
      const mcpY = Math.max(...[5, 9, 13, 17].map((j) => loc(P(j)).y));
      // La muñeca queda en el cuello del puño (0.015 m por delante del landmark 0): el límite de atrás es ese anillo.
      if (maxU > mcpU + 0.12 + 1e-3) malo(`${etiqueta}: palma lateral ${maxU.toFixed(3)} > MCP ${mcpU.toFixed(3)} + 0.12`);
      if (minY < -1e-3 || maxY > mcpY + 1e-3) malo(`${etiqueta}: palma y ${minY.toFixed(3)}..${maxY.toFixed(3)} fuera de 0..${mcpY.toFixed(3)}`);

      // 5. Bandas (caras de color metal del tubo de los dedos): 12 triángulos por banda.
      const col = dedos.geometry.getAttribute('color');
      let metal = 0;
      for (let t = 0; t < col.count / 3; t++) if (col.getX(3 * t) < 0.5) metal++;
      const bandas = metal / 12;
      const esperadas = Object.values(UNIONES_DEDO).reduce((t, js) => t + js.length, 0);
      if (bandas !== esperadas || esperadas !== 4 * 3 + 2) malo(`${etiqueta}: ${bandas} bandas (esperadas ${esperadas} = 4 × 3 + 2)`);
      // Misma banda en el meñique que en el resto: 3 uniones.
      if (UNIONES_DEDO.menique.length !== UNIONES_DEDO.indice.length) malo(`${etiqueta}: el meñique tiene otras uniones`);

      // 6. Mismo número de triángulos en las dos manos.
      const tris = total;
      const clave = `${archivo}|${escala}`;
      resumen[`${clave}|${label}`] = { tris, bandas };
      if (label === 'Left') {
        const der = resumen[`${clave}|Right`];
        if (der.tris !== tris || der.bandas !== bandas) malo(`${etiqueta}: derecha ${der.tris} tri/${der.bandas} bandas, izquierda ${tris}/${bandas}`);
      }

      // 7. Dedos vecinos: distancia mínima entre ejes ≥ 1.5 × radio.
      const huesos = (n: string): [THREE.Vector3, THREE.Vector3, number][] =>
        CADENAS_DEDO[n as keyof typeof CADENAS_DEDO].slice(0, -1).map((j, i, c) => [P(j), P(CADENAS_DEDO[n as keyof typeof CADENAS_DEDO][i + 1]), RADIO_SEGMENTO[c[i]]]);
      let minRel = Infinity;
      let cual = '';
      for (let f = 1; f < 4; f++) {
        for (const [a0, a1, ra] of huesos(nombres[f])) {
          for (const [b0, b1, rb] of huesos(nombres[f + 1])) {
            const rel = distSegmentos(a0, a1, b0, b1) / Math.max(ra, rb);
            if (rel < minRel) {
              minRel = rel;
              cual = `${nombres[f]}-${nombres[f + 1]}`;
            }
          }
        }
      }
      if (minRel < 1.5 && escala >= 1) malo(`${etiqueta}: ${cual} a ${minRel.toFixed(2)} × radio (< 1.5)`);

      if (principal) {
        const ang = (a: string, b: string): number => {
          const da = P(CADENAS_DEDO[a as keyof typeof CADENAS_DEDO][1]).sub(P(CADENAS_DEDO[a as keyof typeof CADENAS_DEDO][0])).normalize();
          const db = P(CADENAS_DEDO[b as keyof typeof CADENAS_DEDO][1]).sub(P(CADENAS_DEDO[b as keyof typeof CADENAS_DEDO][0])).normalize();
          return (Math.acos(Math.min(1, da.dot(db))) * 180) / Math.PI;
        };
        console.log(
          `${etiqueta}: ${tris} triángulos, ${bandas} bandas; cuña∩pulgar ${pulgarCuna} vért., puño∩palma ${punoPalma}; dedo↔MCP ${(peorBase * 1e6).toFixed(1)} nm; ` +
            `separación mín. ${minRel.toFixed(2)}×r (${cual}); ángulos 1.º hueso índice-medio ${ang('indice', 'medio').toFixed(1)}°, medio-anular ${ang('medio', 'anular').toFixed(1)}°, anular-meñique ${ang('anular', 'menique').toFixed(1)}° ${fallos === antes ? 'OK' : 'FALLO'}`,
        );
      }
    }
  }
}

// Informe de largos (E1, E5), en metros sin escalar (HAND_BONE_LENGTHS).
const L = HAND_BONE_LENGTHS;
console.log('\nLargos de hueso (m, sin escalar):');
console.log(`  pulgar visible (MCP→IP, IP→punta): ${L[3]}, ${L[4]}; falange media del índice/medio/anular/meñique: ${L[7]}, ${L[11]}, ${L[15]}, ${L[19]}`);
console.log(`  meñique proximal/media/distal: ${L[18]} / ${L[19]} / ${L[20]}; anular: ${L[14]} / ${L[15]} / ${L[16]}`);
process.exitCode = fallos ? 1 : 0;
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodas las comprobaciones pasan');
