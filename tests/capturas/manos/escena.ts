// Escena mínima para fotografiar la mano 3D con una pose guardada (solo desarrollo, no entra en el build).
// Usa las mismas piezas que el juego: crearManos, la cámara de 60° y las luces, fondo y bloom del museo.
//
// Parámetros de la URL:
// - pose: nombre del JSON de tests/fixtures/manos/ (sin .json).
// - vista: "juego" (cámara del jugador, por defecto) o "detalle" (cámara cercana que encuadra la mano).
// - lado: "izq" dibuja la pose como mano izquierda (cambia la etiqueta); por defecto la de la captura.
// - tamano y separacion: como los deslizadores de Opciones (por defecto 1.25 y 0 m).
// Cuando termina de dibujar, el título de la página pasa a "listo".

import * as THREE from 'three';
import { crearManos, type ManoDetectada } from '../../../src/visual/manos.ts';
import { crearAmbienteMuseo, crearPostproceso, EXPOSICION } from '../../../src/visual/ambiente.ts';
import { HAND_SCALE } from '../../../src/visual/manosGeometria.ts';
import { tablaLimitesPorDefecto } from '../../../src/game/opciones.ts';

const params = new URLSearchParams(location.search);
const pose = params.get('pose') ?? 'palma_frente';
const vista = params.get('vista') === 'detalle' ? 'detalle' : 'juego';
const tamano = Number(params.get('tamano') ?? HAND_SCALE);
const separacion = Number(params.get('separacion') ?? 0);
const ladoForzado = params.get('lado') === 'izq' ? 'Left' : null;

const ANCHO = 960;
const ALTO = 540;

async function principal(): Promise<void> {
  const captura = (await (await fetch(`/tests/fixtures/manos/${pose}.json`)).json()) as {
    sintetica?: boolean;
    ancho: number;
    alto: number;
    manos: ManoDetectada[];
  };
  document.getElementById('etiqueta')!.textContent =
    `${pose}${captura.sintetica ? ' · pose sintética' : ''} · ${vista} · tamaño ${tamano} · separación ${separacion} m`;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ANCHO, ALTO);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSICION;
  document.body.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(60, ANCHO / ALTO, 0.01, 2000);
  escena.add(camara);
  const ambiente = crearAmbienteMuseo(renderer, camara);
  escena.add(ambiente.grupo);
  escena.background = ambiente.fondo;
  escena.fog = ambiente.niebla;

  const manos = crearManos();
  camara.add(manos.objeto);
  manos.actualizar(
    captura.manos.map((m) => ({ ...m, label: ladoForzado ?? m.label, score: m.score ?? null })),
    { ancho: captura.ancho, alto: captura.alto, aspectoEscena: camara.aspect, fovVertical: (60 * Math.PI) / 180, escala: tamano },
    { separacion, ajuste: false, limites: tablaLimitesPorDefecto(), ahoraS: 0, tiempoOcultarS: 1, umbralSaltoM: 0.05 },
  );

  let camaraRender: THREE.PerspectiveCamera = camara;
  if (vista === 'detalle') {
    // Cámara cercana, hija de la del jugador: misma luz, encuadre de la mano desde un poco arriba y a la derecha.
    // Centro: los vértices de las mallas de la mano visible (la caja de las geometrías dinámicas no se actualiza).
    const visible = manos.objeto.children.find((g) => g.visible)!;
    visible.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    const p = new THREE.Vector3();
    visible.traverse((o) => {
      const malla = o as THREE.Mesh;
      if (!malla.isMesh) return;
      const pos = malla.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) caja.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld));
    });
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = Math.max(0.09, caja.getSize(new THREE.Vector3()).length() / 2 + 0.03);
    const detalle = new THREE.PerspectiveCamera(30, ANCHO / ALTO, 0.01, 2000);
    camara.add(detalle);
    detalle.position.copy(centro).add(new THREE.Vector3(0.12, 0.1, 0.5).normalize().multiplyScalar(radio / Math.tan((15 * Math.PI) / 180)));
    detalle.lookAt(centro);
    camaraRender = detalle;
  }

  const post = crearPostproceso(renderer, escena, camaraRender);
  post.ajustar(ANCHO, ALTO);
  escena.updateMatrixWorld(true);
  for (let i = 0; i < 3; i++) post.render();

  // Triángulos de las dos manos (para el presupuesto de spec-visual-museo §9).
  let triangulos = 0;
  let llamadas = 0;
  manos.objeto.traverse((o) => {
    const malla = o as THREE.Mesh;
    if (!malla.isMesh) return;
    const g = malla.geometry;
    const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    triangulos += n * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
    llamadas++;
  });
  console.log(JSON.stringify({ triangulos, llamadas }));
  document.title = `listo ${triangulos} ${llamadas}`;
}

principal().catch((e) => {
  console.error(e);
  document.title = `error ${String(e)}`;
});
