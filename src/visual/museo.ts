import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../tracking/assets';
import { ESCENAS, MODELOS, type ConfigModelo } from './config';
import { crearManos, type ManoDetectada, type ManosAvatar, type OpcionesManos } from './manos';

// Toda la parte visual del museo (Three.js). La lógica de juego solo llama a `visual.museo`.
// Convención de ejes: X a la derecha, Y arriba (metros), −Z hacia donde mira la cámara al inicio.
// Estilo: low poly, sombreado plano, ambiente claro y luz plana (spec-visual-museo.md; manda sobre las capturas).

/** Altura de los ojos del jugador (m). */
const ALTURA_OJOS = 1.6;
/** Posición inicial del jugador: frente a las vitrinas, mirando a −Z. */
const INICIO = { x: 0, z: 5 };
/** Sala cuadrada de 16 m; el jugador no puede salir de ella. */
const LADO_SALA = 16;
const ALTURA_PAREDES = 4;
const GROSOR_PARED = 0.3;
const LIMITE_X_Z = LADO_SALA / 2 - 0.6;

/** Centro de cada vitrina de artefacto (base sobre el suelo). Separadas 8 m (SPEC: mínimo 4 m). */
const POSICION_VITRINA: Record<string, { x: number; z: number }> = {
  vitrina_lrv: { x: -4, z: -4 },
  vitrina_perseverance: { x: 4, z: -4 },
};
/** Lado del cubo de cristal de una vitrina de artefacto (m) y altura del pedestal bajo él (m). */
const LADO_VITRINA = 2.0;
const ALTURA_PEDESTAL = 0.5;
/** Punto al que apunta el rayo: el centro del cubo. */
const ALTURA_PUNTO_VITRINA = ALTURA_PEDESTAL + LADO_VITRINA / 2;
/** Altura del halo: encima del borde superior del cubo. */
const ALTURA_HALO = ALTURA_PEDESTAL + LADO_VITRINA + 0.3;
/** Altura media del robot-mentor (m) y amplitud del flotado (m). */
const ALTURA_MENTOR = 1.3;
const AMPLITUD_FLOTADO = 0.06;
const VELOCIDAD_FLOTADO = 1.6;
/** Ángulo máximo entre el rayo y la vitrina para considerar que la apunta. */
const TOLERANCIA_RAD = THREE.MathUtils.degToRad(12);

/** Paleta: ambiente claro (paredes blancas y grises), acentos de color solo en vitrinas, robot y decoración. */
const COLOR = {
  fondo: 0xdfe4ea,
  suelo: 0xd3d9e0,
  pared: 0xf4f6f8,
  /** Techo blanco y tiras de luz emisivas (luces planas, sin sombras). Paneles de pared un poco más oscuros. */
  techo: 0xf2f5f8,
  luzTecho: 0xf7fbff,
  panelPared: 0xdde3ea,
  pedestal: 0xeceff3,
  cristal: 0xbfe8f5,
  marcoVitrina: 0x7d8796,
  torre: 0x8c96a3,
  /** Robot-mentor: todo azul, visor oscuro, ojos y sonrisa claros (spec §5). */
  mentor: 0x2f6fd6,
  mentorVisor: 0x14213d,
  mentorOjos: 0xcfefff,
  halo: 0xffd60a,
  /** Halo azul celeste de las misiones (SPEC 10): color constante, sin iluminación. */
  haloCeleste: 0x87ceeb,
  /** Acentos de cada vitrina: luz interior y anillo de luz del pedestal. */
  acentoLRV: 0x2ee6d6,
  acentoPerseverance: 0xff8a3d,
  /** Planetas y muestras de la exhibición (colores sólidos). */
  planetas: [0xf4a261, 0x2a9d8f, 0xe76f51, 0xb388eb] as const,
  traje: 0xe4e8ee,
  sueloLuna: 0xcfd2d6,
  cieloLuna: 0x000000,
  lrv: 0xc9ccd1,
  rueda: 0x3a3a3a,
  roca: 0x8d99ae,
  sueloMarte: 0x9c4a2a,
  cieloMarte: 0xd9e8f2,
  /** Perseverance: cuerpo blanco y capa térmica dorada. */
  blanco: 0xeeeeee,
  dorado: 0xc8a24a,
} as const;

/** Escenas de misión disponibles. Coinciden con `Mision` de src/game/museo.ts. */
export type Escena = 'luna' | 'marte';
const NODO_ESCENA: Record<Escena, string> = { luna: 'escena_luna', marte: 'escena_marte' };
const FONDO_ESCENA: Record<Escena, number> = { luna: COLOR.cieloLuna, marte: COLOR.cieloMarte };
/** Punto de llegada del jugador en cada escena: 4 m delante del origen, mirando a −Z. */
const LLEGADA_ESCENA = { x: 0, z: 4 };

type Constructor = () => THREE.Object3D;

/** Placeholders generados en código. Las claves son las rutas "placeholder:…" de config.ts. */
const PLACEHOLDERS: Record<string, Constructor> = {
  'placeholder:sala': crearSala,
  'placeholder:vitrina_lrv': () => crearVitrina(() => crearLRV(COLOR.acentoLRV), COLOR.acentoLRV),
  'placeholder:vitrina_perseverance': () => crearVitrina(() => crearPerseverance(COLOR.acentoPerseverance), COLOR.acentoPerseverance),
  'placeholder:mentor': crearMentor,
  'placeholder:anillo': crearAnillo,
  'placeholder:escena_luna': crearEscenaLuna,
  'placeholder:escena_marte': crearEscenaMarte,
};

/** Material mate con caras planas (look low poly). Sin texturas. */
function material(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
}

/** Material sin iluminación: para luces emisivas y anillos de color constante. */
function materialBasico(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

/** Cristal transparente y tenue, con caras planas. No proyecta ni recibe sombras (no hay sombras). */
function materialCristal(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLOR.cristal,
    roughness: 0.1,
    flatShading: true,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
}

function caja(ancho: number, alto: number, fondo: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), material(color));
}

/** Malla de una figura geométrica con posición y giro en radianes (x, y, z). */
function malla(
  geometria: THREE.BufferGeometry,
  color: number,
  posicion: [number, number, number] = [0, 0, 0],
  giro: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const objeto = new THREE.Mesh(geometria, material(color));
  objeto.position.set(...posicion);
  objeto.rotation.set(...giro);
  return objeto;
}

/** Figura de color sólido, sin iluminación (anillos de luz, luces interiores). */
function mallaBasica(
  geometria: THREE.BufferGeometry,
  color: number,
  posicion: [number, number, number] = [0, 0, 0],
  giro: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const objeto = new THREE.Mesh(geometria, materialBasico(color));
  objeto.position.set(...posicion);
  objeto.rotation.set(...giro);
  return objeto;
}

/**
 * Sala: suelo gris claro, cuatro paredes blancas y la decoración de SPEC 6 (planetas, cápsulas,
 * torre de antenas y muestras de roca). Sin plataformas flotantes.
 */
function crearSala(): THREE.Object3D {
  const grupo = new THREE.Group();
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(LADO_SALA, LADO_SALA), material(COLOR.suelo));
  suelo.rotation.x = -Math.PI / 2;
  grupo.add(suelo);

  const mitad = LADO_SALA / 2;
  const largo = LADO_SALA + GROSOR_PARED;
  // [x, z, ancho, fondo] de cada pared (norte, sur, oeste, este).
  const paredes: [number, number, number, number][] = [
    [0, -mitad, largo, GROSOR_PARED],
    [0, mitad, largo, GROSOR_PARED],
    [-mitad, 0, GROSOR_PARED, largo],
    [mitad, 0, GROSOR_PARED, largo],
  ];
  for (const [x, z, ancho, fondo] of paredes) {
    const pared = new THREE.Mesh(new THREE.BoxGeometry(ancho, ALTURA_PAREDES, fondo), material(COLOR.pared));
    pared.position.set(x, ALTURA_PAREDES / 2, z);
    grupo.add(pared);
  }

  // Techo liso con tres tiras de luz emisiva que recorren la sala de norte a sur.
  // Material plano, sin depender de la luz: el techo mira hacia abajo y la luz del cielo lo oscurecería.
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(LADO_SALA, LADO_SALA), materialBasico(COLOR.techo));
  techo.rotation.x = Math.PI / 2;
  techo.position.y = ALTURA_PAREDES;
  grupo.add(techo);
  for (const x of [-4, 0, 4]) {
    grupo.add(mallaBasica(new THREE.BoxGeometry(0.3, 0.03, LADO_SALA - 2), COLOR.luzTecho, [x, ALTURA_PAREDES - 0.02, 0]));
  }

  // Paneles de pared: placas levemente más oscuras, pegadas a las paredes norte, oeste y sur.
  const dentro = mitad - GROSOR_PARED / 2 - 0.02;
  const panelNorte = (x: number): void => {
    grupo.add(malla(new THREE.BoxGeometry(2.4, 1.6, 0.03), COLOR.panelPared, [x, 2.2, -dentro]));
  };
  [-5, 0, 5].forEach(panelNorte);
  for (const z of [-5, 0, 5]) {
    grupo.add(malla(new THREE.BoxGeometry(0.03, 1.6, 2.4), COLOR.panelPared, [-dentro, 2.2, z]));
  }
  for (const x of [-5, 5]) {
    grupo.add(malla(new THREE.BoxGeometry(2.4, 1.6, 0.03), COLOR.panelPared, [x, 2.2, dentro]));
  }

  // Planetas en exhibición sobre peanas, contra la pared oeste.
  const planetas: [number, number, number][] = [
    [-6.2, -2, 0.55],
    [-6.2, 2, 0.4],
  ];
  planetas.forEach(([x, z, radio], i) => {
    const planeta = crearPlaneta(COLOR.planetas[i % COLOR.planetas.length], radio);
    planeta.position.set(x, 0, z);
    grupo.add(planeta);
  });

  // Cápsulas de laboratorio con trajes vacíos, contra la pared este.
  for (const [z, acento] of [
    [1.5, COLOR.acentoLRV],
    [4.5, COLOR.acentoPerseverance],
  ] as const) {
    const capsula = crearCapsula(acento);
    capsula.position.set(5.6, 0, z);
    grupo.add(capsula);
  }

  // Torre de comunicaciones en una esquina.
  const torre = crearTorre();
  torre.position.set(5.6, 0, -5.6);
  grupo.add(torre);

  // Muestras de roca en vitrinas pequeñas, delante de la sala. No son artefactos seleccionables.
  for (const [x, color] of [
    [-2.2, COLOR.planetas[2]],
    [2.2, COLOR.planetas[3]],
  ] as const) {
    const muestra = crearVitrina(crearRocaMuestra, color, 0.8, 1);
    muestra.position.set(x, 0, 1.8);
    grupo.add(muestra);
  }
  return grupo;
}

/**
 * Vitrina con cubo de cristal transparente, marco delgado, pedestal y anillo de luz en el suelo.
 * Dentro va `contenido` (el artefacto completo), a escala `escalaContenido`. La luz interior tiene el
 * color `acento`. Origen en el suelo, centrado.
 */
function crearVitrina(
  contenido: () => THREE.Object3D,
  acento: number,
  lado: number = LADO_VITRINA,
  escalaContenido = 0.7,
): THREE.Object3D {
  const grupo = new THREE.Group();
  const radio = lado * 0.65;
  grupo.add(malla(new THREE.CylinderGeometry(radio, radio * 1.04, ALTURA_PEDESTAL, 8), COLOR.pedestal, [0, ALTURA_PEDESTAL / 2, 0]));

  // Anillo de luz que marca el artefacto, sobre el borde del pedestal.
  const anillo = mallaBasica(new THREE.TorusGeometry(radio * 0.96, 0.04, 6, 24), acento, [0, ALTURA_PEDESTAL + 0.01, 0], [Math.PI / 2, 0, 0]);
  grupo.add(anillo);

  const centroY = ALTURA_PEDESTAL + lado / 2;
  const cristal = new THREE.Mesh(new THREE.BoxGeometry(lado, lado, lado), materialCristal());
  cristal.position.set(0, centroY, 0);
  grupo.add(cristal);
  // Marco delgado del cubo. Las líneas no se pueden señalar: el rayo solo mira el cristal.
  const marco = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(lado, lado, lado)),
    new THREE.LineBasicMaterial({ color: COLOR.marcoVitrina }),
  );
  marco.position.set(0, centroY, 0);
  marco.raycast = () => {};
  grupo.add(marco);

  // Luz interior con color propio: una luz puntual y un núcleo emisivo.
  const luz = new THREE.PointLight(acento, 1.2, lado * 2.5);
  luz.position.set(0, ALTURA_PEDESTAL + lado * 0.8, 0);
  grupo.add(luz);
  grupo.add(mallaBasica(new THREE.IcosahedronGeometry(lado * 0.06, 0), acento, [0, centroY + lado * 0.3, 0]));

  const figura = contenido();
  figura.scale.setScalar(escalaContenido);
  figura.position.set(0, ALTURA_PEDESTAL, 0);
  figura.rotation.y = Math.PI / 4;
  grupo.add(figura);
  return grupo;
}

/** Muestra de roca facetada para las vitrinas pequeñas. */
function crearRocaMuestra(): THREE.Object3D {
  const roca = malla(new THREE.DodecahedronGeometry(0.22, 0), COLOR.roca, [0, 0.22, 0], [0.4, 0.6, 0.2]);
  roca.scale.y = 0.8;
  return roca;
}

/** Planeta facetado de color sólido sobre una peana de 1 m. Origen en el suelo. */
function crearPlaneta(color: number, radio: number): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.add(malla(new THREE.CylinderGeometry(0.45, 0.5, 1.0, 8), COLOR.pedestal, [0, 0.5, 0]));
  grupo.add(malla(new THREE.IcosahedronGeometry(radio, 1), color, [0, 1.0 + radio, 0]));
  return grupo;
}

/**
 * Cápsula de laboratorio: base, cilindro de cristal y un traje de astronauta vacío dentro
 * (sin persona: torso, casco con visor, brazos y piernas). Origen en el suelo, centrado.
 */
function crearCapsula(acento: number): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.add(malla(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 12), COLOR.pedestal, [0, 0.075, 0]));
  const cristal = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 12, 1, true), materialCristal());
  cristal.position.y = 1.45;
  grupo.add(cristal);

  // Traje vacío: sin cabeza humana, el casco es una cúpula y el visor es oscuro.
  grupo.add(malla(new THREE.BoxGeometry(0.5, 0.65, 0.3), COLOR.traje, [0, 1.15, 0]));
  grupo.add(malla(new THREE.BoxGeometry(0.5, 0.05, 0.31), acento, [0, 1.35, 0]));
  grupo.add(malla(new THREE.IcosahedronGeometry(0.2, 1), COLOR.traje, [0, 1.65, 0]));
  grupo.add(malla(new THREE.BoxGeometry(0.3, 0.1, 0.05), COLOR.mentorVisor, [0, 1.66, 0.18]));
  for (const x of [-0.36, 0.36]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6), COLOR.traje, [x, 1.1, 0], [0, 0, x > 0 ? -0.15 : 0.15]));
  }
  for (const x of [-0.14, 0.14]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 6), COLOR.traje, [x, 0.55, 0]));
  }
  return grupo;
}

/** Torre de comunicaciones: celosía de cuatro patas, travesaños, mástil y plato. Origen en el suelo. */
function crearTorre(): THREE.Object3D {
  const grupo = new THREE.Group();
  const alto = 4;
  for (const [x, z] of [
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.04, 0.06, alto, 6), COLOR.torre, [x, alto / 2, z]));
  }
  for (let y = 0.6; y < alto; y += 0.8) {
    grupo.add(malla(new THREE.BoxGeometry(0.9, 0.05, 0.9), COLOR.torre, [0, y, 0]));
  }
  grupo.add(malla(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), COLOR.torre, [0, alto + 0.5, 0]));
  // Plato de comunicaciones: cono invertido (cuenco hacia arriba).
  grupo.add(malla(new THREE.ConeGeometry(0.5, 0.25, 8), COLOR.acentoPerseverance, [0, 2.9, 0], [Math.PI, 0, 0]));
  return grupo;
}

/**
 * Robot-mentor compacto: cuerpo facetado azul, visor oscuro con ojos y sonrisa fijos, brazos cortos y sin piernas.
 * El origen es el centro del cuerpo. Mira hacia +Z (el visor); `actualizarMentor` lo gira hacia el jugador.
 */
function crearMentor(): THREE.Object3D {
  const grupo = new THREE.Group();
  const cuerpo = malla(new THREE.IcosahedronGeometry(0.3, 1), COLOR.mentor);
  cuerpo.scale.set(1, 1.15, 1);
  grupo.add(cuerpo);
  // Visor oscuro sobre la cara, con ojos y sonrisa claros.
  grupo.add(malla(new THREE.BoxGeometry(0.42, 0.24, 0.06), COLOR.mentorVisor, [0, 0.04, 0.28]));
  for (const x of [-0.1, 0.1]) {
    grupo.add(mallaBasica(new THREE.SphereGeometry(0.035, 6, 4), COLOR.mentorOjos, [x, 0.07, 0.33]));
  }
  grupo.add(mallaBasica(new THREE.TorusGeometry(0.07, 0.012, 4, 10, Math.PI), COLOR.mentorOjos, [0, -0.03, 0.33], [0, 0, Math.PI]));
  // Brazos cortos a los lados.
  for (const x of [-0.36, 0.36]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), COLOR.mentor, [x, -0.05, 0], [0, 0, Math.PI / 2]));
  }
  return grupo;
}

/** Anillo amarillo delgado de 0.6 m de radio, en el plano XY (su normal apunta a +Z). */
function crearAnillo(): THREE.Object3D {
  const malla = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.64, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.halo, side: THREE.DoubleSide }),
  );
  return malla;
}

/** Suelo plano grande (60 × 60 m) a nivel del suelo. */
function crearSuelo(color: number): THREE.Mesh {
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material(color));
  suelo.rotation.x = -Math.PI / 2;
  return suelo;
}

/**
 * Roca facetada (dodecaedro aplanado, ~0.8 m) con el halo azul celeste (anillo de 0.6 m de radio) alrededor.
 */
function crearRoca(): THREE.Object3D {
  const grupo = new THREE.Group();
  const roca = malla(new THREE.DodecahedronGeometry(0.42, 0), COLOR.roca, [0, 0.28, 0], [0.3, 0.5, 0]);
  roca.scale.y = 0.75;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.64, 48),
    new THREE.MeshBasicMaterial({ color: COLOR.haloCeleste, side: THREE.DoubleSide }),
  );
  halo.name = 'halo_roca';
  halo.position.y = 0.4;
  grupo.add(roca, halo);
  return grupo;
}

/**
 * LRV aproximado, sin medidas oficiales: chasis plano, asiento, antena y cuatro ruedas de cilindro.
 * Origen en el suelo, centrado. Forma simplificada: ver src/visual/MODELS.md.
 */
function crearLRV(acento: number = COLOR.acentoLRV): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.name = 'lrv_placeholder';
  const chasis = caja(1.2, 0.1, 1.8, COLOR.lrv);
  chasis.position.y = 0.6;
  const asiento = caja(0.5, 0.25, 0.5, COLOR.rueda);
  asiento.position.set(0, 0.85, 0);
  const antena = malla(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), COLOR.lrv, [0.4, 1.0, -0.5]);
  // Antena de alta ganancia: plato de color de acento sobre la antena.
  const plato = malla(new THREE.ConeGeometry(0.18, 0.08, 8), acento, [0.4, 1.42, -0.5], [Math.PI / 2, 0, 0]);
  // Paneles de color de acento a los lados del chasis y una caja de electrónica.
  const panelIzq = caja(0.04, 0.22, 1.2, acento);
  panelIzq.position.set(-0.62, 0.7, 0);
  const panelDer = caja(0.04, 0.22, 1.2, acento);
  panelDer.position.set(0.62, 0.7, 0);
  const electronica = caja(0.35, 0.2, 0.3, COLOR.rueda);
  electronica.position.set(-0.3, 0.7, -0.5);
  grupo.add(chasis, asiento, antena, plato, panelIzq, panelDer, electronica);
  // Ruedas: cilindros girados para que el eje quede a lo ancho.
  for (const [x, z] of [[-0.75, -0.8], [0.75, -0.8], [-0.75, 0.8], [0.75, 0.8]]) {
    grupo.add(malla(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), COLOR.rueda, [x, 0.35, z], [0, 0, Math.PI / 2]));
  }
  return grupo;
}

/**
 * Perseverance aproximado, sin medidas oficiales: cuerpo blanco con capa dorada, seis ruedas,
 * mástil con cámara, generador (RTG) y brazo. Origen en el suelo, centrado. Forma simplificada: ver MODELS.md.
 */
function crearPerseverance(acento: number = COLOR.acentoPerseverance): THREE.Object3D {
  const grupo = new THREE.Group();
  grupo.name = 'perseverance_placeholder';
  const cuerpo = caja(1.3, 0.5, 1.0, COLOR.blanco);
  cuerpo.position.y = 0.75;
  const capa = caja(1.1, 0.06, 0.9, COLOR.dorado);
  capa.position.y = 1.03;
  // Franja de acento en el frente del cuerpo, para distinguirlo del LRV.
  const franja = caja(1.32, 0.08, 0.1, acento);
  franja.position.set(0, 0.75, 0.5);
  grupo.add(franja);
  const rtg = malla(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8), COLOR.dorado, [0, 0.8, 0.75], [Math.PI / 2, 0, 0]);
  const mastil = malla(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 6), COLOR.blanco, [0.35, 1.42, -0.2]);
  const camara = malla(new THREE.IcosahedronGeometry(0.1, 0), COLOR.blanco, [0.35, 1.92, -0.2]);
  const brazo = malla(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), COLOR.blanco, [-0.35, 0.45, -0.85], [Math.PI / 2, 0, 0]);
  grupo.add(cuerpo, capa, rtg, mastil, camara, brazo);
  for (const x of [-0.75, 0.75]) {
    for (const z of [-0.5, 0, 0.5]) {
      grupo.add(malla(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 10), COLOR.rueda, [x, 0.25, z], [0, 0, Math.PI / 2]));
    }
  }
  return grupo;
}

/** Escena lunar: suelo gris claro, LRV aproximado y una roca con halo. Cielo negro (fondo de la escena). */
function crearEscenaLuna(): THREE.Object3D {
  const grupo = new THREE.Group();
  const lrv = crearLRV();
  lrv.position.set(0, 0, -4);
  const roca = crearRoca();
  roca.name = 'roca_placeholder';
  roca.position.set(2.5, 0, -3);
  grupo.add(crearSuelo(COLOR.sueloLuna), lrv, roca);
  return grupo;
}

/** Escena marciana: suelo rojizo y Perseverance aproximado. Cielo claro (fondo de la escena). */
function crearEscenaMarte(): THREE.Object3D {
  const grupo = new THREE.Group();
  const perseverance = crearPerseverance();
  perseverance.position.set(0, 0, -4);
  grupo.add(crearSuelo(COLOR.sueloMarte), perseverance);
  return grupo;
}

const gltf = new GLTFLoader();

/** Crea el modelo de una entrada de config: placeholder en código o .glb. */
async function cargar(modelo: ConfigModelo): Promise<THREE.Object3D> {
  let objeto: THREE.Object3D;
  if (modelo.ruta.startsWith('placeholder:')) {
    const constructor = PLACEHOLDERS[modelo.ruta];
    if (!constructor) throw new Error(`Placeholder desconocido: ${modelo.ruta}`);
    objeto = constructor();
  } else {
    const archivo = await gltf.loadAsync(assetUrl(modelo.ruta));
    objeto = archivo.scene;
  }
  objeto.name = modelo.nodo;
  objeto.scale.setScalar(modelo.escala);
  return objeto;
}

// ---------------------------------------------------------------------------
// Estado del módulo
// ---------------------------------------------------------------------------

const nodos = new Map<string, THREE.Object3D>();
let camara: THREE.PerspectiveCamera | null = null;
/** Manos del avatar, colgadas de la cámara (SPEC 5.5). */
let manosAvatar: ManosAvatar | null = null;
let halo: THREE.Object3D | null = null;
/** Vitrina a la que está anclado el halo; null si el halo está oculto. */
let haloEn: string | null = null;
let mentor: THREE.Object3D | null = null;
/** Yaw de la cámara (rad). La cabeza siempre mira al frente: no hay pitch. */
let yaw = 0;
let posicion = new THREE.Vector3(INICIO.x, ALTURA_OJOS, INICIO.z);
/** Escena three.js compartida por el museo y las escenas de misión (se muestra una a la vez). */
let escenaPrincipal: THREE.Scene | null = null;
let haloRoca: THREE.Object3D | null = null;
/** Posición y giro del jugador en el museo, guardados mientras está en una escena. */
let guardadaMuseo: { posicion: THREE.Vector3; yaw: number } | null = null;
/** Capa negra de fundido (DOM encima del canvas). */
let fundidoEl: HTMLDivElement | null = null;

function vitrinaAim(id: string): THREE.Vector3 {
  const p = POSICION_VITRINA[id];
  if (!p) throw new Error(`Vitrina desconocida: ${id}`);
  return new THREE.Vector3(p.x, ALTURA_PUNTO_VITRINA, p.z);
}

function actualizarCamara(): void {
  if (!camara) return;
  camara.position.copy(posicion);
  camara.rotation.set(0, yaw, 0, 'YXZ');
}

/** Vector hacia donde mira el jugador, en el plano horizontal. */
function adelante(): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

// ---------------------------------------------------------------------------
// API pública: visual.museo
// ---------------------------------------------------------------------------

/**
 * Crea la escena dentro de `container` y arranca el render. Hay que llamarla una vez.
 * Resuelve cuando todos los modelos están listos.
 */
async function iniciar(container: HTMLElement): Promise<void> {
  const escenaNueva = new THREE.Scene();
  escenaNueva.background = new THREE.Color(COLOR.fondo);
  escenaPrincipal = escenaNueva;

  const camaraNueva = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camara = camaraNueva;
  actualizarCamara();
  // Las manos cuelgan de la cámara, así que siempre están en primera persona. La cámara debe estar en la escena para que sus hijos se dibujen.
  manosAvatar = crearManos();
  camaraNueva.add(manosAvatar.objeto);
  escenaNueva.add(camaraNueva);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  fundidoEl = document.createElement('div');
  fundidoEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:100;';
  document.body.appendChild(fundidoEl);

  // Luz hemisférica (cielo/suelo) y una direccional sin sombras: luz plana, sin sombras proyectadas.
  escenaNueva.add(new THREE.HemisphereLight(0xffffff, 0x8a929c, 1.6));
  const sol = new THREE.DirectionalLight(0xffffff, 1.0);
  sol.position.set(4, 8, 5);
  escenaNueva.add(sol);

  // Museo y escenas de misión se cargan juntos; las escenas empiezan ocultas.
  const todos = [...MODELOS, ...ESCENAS];
  const objetos = await Promise.all(todos.map(cargar));
  for (const [i, objeto] of objetos.entries()) {
    const modelo = todos[i];
    nodos.set(modelo.id, objeto);
    escenaNueva.add(objeto);
  }
  for (const escena of ESCENAS) {
    const obj = nodos.get(escena.id);
    if (obj) obj.visible = false;
  }
  haloRoca = nodos.get('escena_luna')?.getObjectByName('halo_roca') ?? null;

  // Colocación: las vitrinas en su posición; el mentor y el halo se mueven en tiempo de juego.
  for (const id of Object.keys(POSICION_VITRINA)) {
    const obj = nodos.get(id);
    const p = POSICION_VITRINA[id];
    if (obj) obj.position.set(p.x, 0, p.z);
  }
  halo = nodos.get('halo_senalar') ?? null;
  if (halo) halo.visible = false;
  mentor = nodos.get('mentor') ?? null;
  if (mentor) mentor.visible = false;

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camaraNueva.aspect = width / height;
    camaraNueva.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = reloj.getElapsedTime();
    // El robot flota (sube y baja suave) y siempre gira hacia el jugador.
    if (mentor?.visible) {
      mentor.position.y = ALTURA_MENTOR + Math.sin(t * VELOCIDAD_FLOTADO) * AMPLITUD_FLOTADO;
      mentor.lookAt(posicion.x, mentor.position.y, posicion.z);
    }
    // El halo siempre se gira hacia el jugador para que se vea como anillo.
    if (halo?.visible) halo.lookAt(camaraNueva.position);
    if (haloRoca?.visible) haloRoca.lookAt(camaraNueva.position);
    renderer.render(escenaNueva, camaraNueva);
  });
}

/** Opacidad del fundido a negro: 0 = sin fundido, 1 = negro total. */
function fundido(opacidad: number): void {
  if (fundidoEl) fundidoEl.style.opacity = String(THREE.MathUtils.clamp(opacidad, 0, 1));
}

/** Oculta o muestra todo el museo (vitrinas, sala y mentor). El halo se oculta siempre. */
function mostrarMuseo(visible: boolean): void {
  for (const modelo of MODELOS) {
    const obj = nodos.get(modelo.id);
    if (obj) obj.visible = visible;
  }
  if (halo) halo.visible = false;
  haloEn = null;
  if (mentor) mentor.visible = false;
}

/**
 * Cambia a la escena de misión: oculta el museo, muestra su escena, pone el fondo y lleva al
 * jugador a su punto de llegada. Guarda su posición en el museo para volver a ella.
 */
function entrarEscena(escena: Escena): void {
  if (!escenaPrincipal) return;
  guardadaMuseo = { posicion: posicion.clone(), yaw };
  mostrarMuseo(false);
  const escenaObj = nodos.get(NODO_ESCENA[escena]);
  if (escenaObj) escenaObj.visible = true;
  escenaPrincipal.background = new THREE.Color(FONDO_ESCENA[escena]);
  posicion = new THREE.Vector3(LLEGADA_ESCENA.x, ALTURA_OJOS, LLEGADA_ESCENA.z);
  yaw = 0;
  actualizarCamara();
}

/** Vuelve del escenario al museo, en la misma posición y con el mismo giro en que se salió. */
function volverAlMuseo(): void {
  if (!escenaPrincipal) return;
  for (const escena of ESCENAS) {
    const obj = nodos.get(escena.id);
    if (obj) obj.visible = false;
  }
  mostrarMuseo(true);
  escenaPrincipal.background = new THREE.Color(COLOR.fondo);
  if (guardadaMuseo) {
    posicion = guardadaMuseo.posicion;
    yaw = guardadaMuseo.yaw;
    guardadaMuseo = null;
  }
  actualizarCamara();
}

/** Hace visible la vitrina `id` (todas empiezan visibles). */
function mostrarVitrina(id: string): void {
  const obj = nodos.get(id);
  if (obj) obj.visible = true;
}

/**
 * Resalta (o quita el resaltado de) una vitrina con el halo amarillo.
 * Solo hay un halo: resaltar otra vitrina lo mueve.
 */
function resaltarVitrina(id: string, activa: boolean): void {
  if (!halo) return;
  if (activa) {
    halo.position.copy(vitrinaAim(id)).setY(ALTURA_HALO);
    halo.visible = true;
    haloEn = id;
  } else if (haloEn === id) {
    halo.visible = false;
    haloEn = null;
  }
}

/**
 * Mueve la cámara.
 * - dx: giro en grados alrededor de la vertical. Positivo = a la derecha del jugador.
 * - dy: avance en metros hacia donde mira el jugador. Negativo = retroceso.
 * La posición se limita a la sala.
 */
function moverCamara(dx: number, dy: number): void {
  yaw -= THREE.MathUtils.degToRad(dx);
  if (dy !== 0) {
    posicion.addScaledVector(adelante(), dy);
    posicion.x = THREE.MathUtils.clamp(posicion.x, -LIMITE_X_Z, LIMITE_X_Z);
    posicion.z = THREE.MathUtils.clamp(posicion.z, -LIMITE_X_Z, LIMITE_X_Z);
  }
  actualizarCamara();
}

/** Hace aparecer al mentor junto al jugador, a su derecha y un poco delante. El flotado lo anima el bucle. */
function mentorAparece(): void {
  if (!mentor) return;
  const derecha = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const pos = posicion.clone().addScaledVector(derecha, 1.0).addScaledVector(adelante(), 1.2);
  mentor.position.set(pos.x, ALTURA_MENTOR, pos.z);
  mentor.lookAt(posicion.x, ALTURA_MENTOR, posicion.z);
  mentor.visible = true;
}

/**
 * Qué vitrina apunta un rayo. `direccion` va en coordenadas de la cámara:
 * x a la derecha del jugador, y arriba, z negativa hacia delante. No hace falta normalizarla.
 * Devuelve el id de la vitrina más cercana al rayo dentro de la tolerancia, o null.
 */
function vitrinaEnDireccion(direccion: { x: number; y: number; z: number }): string | null {
  const rayo = new THREE.Vector3(direccion.x, direccion.y, direccion.z);
  if (rayo.lengthSq() === 0) return null;
  rayo.normalize();
  // La cámara solo gira en yaw, así que basta con aplicar su orientación.
  const rayoMundo = rayo.applyQuaternion(camaraOrientacion());

  let mejor: string | null = null;
  let mejorAngulo = TOLERANCIA_RAD;
  for (const id of Object.keys(POSICION_VITRINA)) {
    const hacia = vitrinaAim(id).sub(posicion).normalize();
    const angulo = rayoMundo.angleTo(hacia);
    if (angulo <= mejorAngulo) {
      mejorAngulo = angulo;
      mejor = id;
    }
  }
  return mejor;
}

/**
 * Qué vitrina está bajo un punto de la pantalla (cursor). `xNorm` e `yNorm` van de 0 a 1,
 * con (0, 0) arriba a la izquierda. Usa un rayo desde la cámara contra los modelos de vitrina.
 * Devuelve el id de la vitrina o null.
 */
function vitrinaEnPantalla(xNorm: number, yNorm: number): string | null {
  if (!camara) return null;
  camara.updateMatrixWorld();
  raycaster.setFromCamera(new THREE.Vector2(xNorm * 2 - 1, -(yNorm * 2 - 1)), camara);
  const vitrinas = Object.keys(POSICION_VITRINA)
    .map((id) => nodos.get(id))
    .filter((obj): obj is THREE.Object3D => obj !== undefined);
  const primero = raycaster.intersectObjects(vitrinas, true)[0];
  if (!primero) return null;
  // El impacto cae en una malla hija: subimos hasta el grupo que tiene el id de la vitrina.
  let nodo: THREE.Object3D | null = primero.object;
  while (nodo && !Object.hasOwn(POSICION_VITRINA, nodo.name)) nodo = nodo.parent;
  return nodo ? nodo.name : null;
}

const raycaster = new THREE.Raycaster();

function camaraOrientacion(): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
}

/**
 * Misión lunar (SPEC 8): coloca el LRV en la escena lunar y resalta la roca. Si el jugador está sentado,
 * la cámara va con el asiento (misma primera persona, en la posición del LRV). `rumboGrados` sigue la convención
 * de game/luna.ts: 0 = hacia −Z, positivo = derecha.
 */
function actualizarLuna(estado: {
  x: number;
  z: number;
  rumboGrados: number;
  sentado: boolean;
  rocaResaltada: boolean;
}): void {
  const rad = THREE.MathUtils.degToRad(estado.rumboGrados);
  const lrv = nodos.get('escena_luna')?.getObjectByName('lrv_placeholder');
  if (lrv) {
    lrv.position.set(estado.x, 0, estado.z);
    lrv.rotation.y = -rad;
  }
  if (haloRoca) haloRoca.visible = estado.rocaResaltada;
  if (estado.sentado) {
    posicion = new THREE.Vector3(estado.x, ALTURA_OJOS, estado.z);
    yaw = -rad;
    actualizarCamara();
  }
}

/** Coloca las manos del avatar según las manos detectadas en este fotograma (SPEC 5.5). */
function actualizarManos(manos: ManoDetectada[], w: number, h: number, escala: number, opciones: OpcionesManos): void {
  if (!camara) return;
  manosAvatar?.actualizar(
    manos,
    {
      ancho: w,
      alto: h,
      aspectoEscena: camara.aspect,
      fovVertical: THREE.MathUtils.degToRad(camara.fov),
      escala,
    },
    opciones,
  );
}

/** Oculta las dos manos del avatar, por ejemplo si el seguimiento se ha perdido (SPEC 6). */
function ocultarManos(): void {
  manosAvatar?.ocultar();
}

export const visual = {
  museo: {
    iniciar,
    actualizarLuna,
    actualizarManos,
    ocultarManos,
    mostrarVitrina,
    resaltarVitrina,
    moverCamara,
    mentorAparece,
    vitrinaEnDireccion,
    vitrinaEnPantalla,
    entrarEscena,
    volverAlMuseo,
    fundido,
  },
};
