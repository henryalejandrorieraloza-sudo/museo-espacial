// Visibilidad de las manos del avatar: pérdida momentánea, desaparición por tiempo y reaparición (sin cámara).
// Ejecutar: node --test tests/manosVisibilidad.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearManos, type ManoDetectada, type OpcionesManos } from '../src/visual/manos.ts';
import { estimarPuntosOcultos, puntosManoMundo, type VistaCamara } from '../src/visual/manosGeometria.ts';
import { poseRelajada, posicionesModelo, HAND_JOINT_LIMITS } from '../src/visual/manoModelo.ts';

const vista: VistaCamara = { ancho: 640, alto: 480, aspectoEscena: 1.5, fovVertical: 1, escala: 1.25 };

/** Mano detectada sintética (la izquierda), centrada en la imagen, con desplazamiento x opcional. */
function manoIzquierda(desplazX = 0): ManoDetectada[] {
  const mundo = posicionesModelo(poseRelajada());
  return [
    {
      label: 'Left',
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5 + desplazX, y: 0.5, z: 0 })),
      worldLandmarks: mundo,
      score: 1,
    },
  ];
}

function opciones(ahoraS: number, tiempoOcultarS = 1, umbralSaltoM = 0.05): OpcionesManos {
  return { separacion: 0, ajuste: false, limites: HAND_JOINT_LIMITS as never, ahoraS, tiempoOcultarS, umbralSaltoM };
}

test('la mano se queda visible tras perder la detección dentro del tiempo y desaparece después', () => {
  const m = crearManos();
  const izquierda = m.objeto.children[0];
  m.actualizar(manoIzquierda(), vista, opciones(0));
  assert.equal(izquierda.visible, true);
  m.actualizar([], vista, opciones(0.5));
  assert.equal(izquierda.visible, true, 'a 0,5 s sin detección sigue visible');
  m.actualizar([], vista, opciones(1.2));
  assert.equal(izquierda.visible, false, 'a 1,2 s sin detección (tiempo 1 s) desaparece');
});

test('al reaparecer con salto grande, la mano aparece donde la detecta la cámara sin deslizarse', () => {
  const m = crearManos();
  const izquierda = m.objeto.children[0];
  m.actualizar(manoIzquierda(), vista, opciones(0));
  m.actualizar([], vista, opciones(2));
  assert.equal(izquierda.visible, false);
  const nuevaX = 0.8;
  m.actualizar(manoIzquierda(nuevaX - 0.5), vista, opciones(2.01, 1, 0.05));
  const muneca = izquierda.children[0].position;
  const esperada = puntosManoMundo(manoIzquierda(nuevaX - 0.5)[0].landmarks, estimarPuntosOcultos(manoIzquierda()[0].worldLandmarks)!, vista)![0];
  assert.ok(Math.hypot(muneca.x - esperada.x, muneca.y - esperada.y, muneca.z - esperada.z) < 1e-9, 'aparece en la posición detectada');
});

test('al reaparecer con salto pequeño, la mano se desliza hacia la posición detectada', () => {
  const m = crearManos();
  const izquierda = m.objeto.children[0];
  m.actualizar(manoIzquierda(), vista, opciones(0));
  const antes = izquierda.children[0].position.clone();
  m.actualizar([], vista, opciones(2));
  const destino = puntosManoMundo(manoIzquierda(0.01)[0].landmarks, estimarPuntosOcultos(manoIzquierda()[0].worldLandmarks)!, vista)![0];
  // Reaparición (inicio del deslizamiento) y, a mitad de los 0,15 s, la posición intermedia.
  m.actualizar(manoIzquierda(0.01), vista, opciones(2.0, 1, 0.5));
  m.actualizar(manoIzquierda(0.01), vista, opciones(2.075, 1, 0.5));
  const aMitad = izquierda.children[0].position.clone();
  // Deslizamiento de 0,15 s: a mitad (0,075 s) la mano está entre la posición anterior y la detectada.
  const distAntes = Math.hypot(aMitad.x - antes.x, aMitad.y - antes.y, aMitad.z - antes.z);
  const distDestino = Math.hypot(aMitad.x - destino.x, aMitad.y - destino.y, aMitad.z - destino.z);
  assert.ok(distAntes > 1e-6 && distDestino > 1e-6, 'a mitad del deslizamiento está entre la posición anterior y el destino');
  m.actualizar(manoIzquierda(0.01), vista, opciones(2.2, 1, 0.5));
  const alFinal = izquierda.children[0].position;
  assert.ok(Math.hypot(alFinal.x - destino.x, alFinal.y - destino.y, alFinal.z - destino.z) < 1e-9, 'al terminar el deslizamiento llega al destino');
});
