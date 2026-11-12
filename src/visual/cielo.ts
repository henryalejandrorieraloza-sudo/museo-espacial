import * as THREE from 'three';
import { azar } from './paleta';
import { ESTRELLAS_J2000 } from './cieloEstrellas';

// Cielo de Taurus-Littrow durante la EVA-1 de Apollo 17: Sol, Tierra y estrellas reales.
//
// Fuente de las posiciones del Sol y la Tierra: tabla "Sun and Earth: Altitudes and Azimuths at the Apollo Landing
// Sites" del Apollo Lunar Surface Journal (cálculos de Jim Scotti y Paul Fjeld, comprobados con JPL Horizons),
// https://www.nasa.gov/history/alsj/alsj-EarthSun_AltAz.html (revisión del 7 de mayo de 2025).
// scripts/efemerides-apollo17.mjs repite el cálculo (Meeus + modelo de rotación IAU de la Luna): coincide con la
// tabla en 0.01° para el Sol y en 0.2° para la altura de la Tierra. De ese script salen también la fase de la Tierra
// y la matriz que orienta las estrellas.
//
// Ejes: +X este, −Z norte, +Y cénit (ver sitioApollo17.ts). Todo el cielo va en la capa CAPA_LEJOS y sigue a la
// cámara, porque está en el infinito.

/** Capa de Three.js para lo lejano (cielo y macizos): se dibuja con una cámara de planos lejanos propios. */
export const CAPA_LEJOS = 1;

/** Tabla del ALSJ para Apollo 17 (UTC). Altura y azimut en grados (azimut desde el norte hacia el este). */
const TABLA_ALSJ = [
  { utc: Date.UTC(1972, 11, 11, 23, 54, 49), sol: { altura: 15.22, azimut: 96.58 }, tierra: { altura: 45.32, azimut: 240.72 } }, // inicio EVA-1
  { utc: Date.UTC(1972, 11, 12, 7, 6, 42), sol: { altura: 18.63, azimut: 97.96 }, tierra: { altura: 45.09, azimut: 240.42 } }, // fin EVA-1
] as const;

/**
 * Instante de la escena: 1 h después del inicio de la EVA-1 (12 dic. 1972, 00:54:49 UTC), con el LRV recién
 * desplegado junto al LM. En toda la EVA-1 el Sol sube solo 3.4°, así que la escena vale para toda la salida.
 */
export const INSTANTE_ESCENA_UTC = Date.UTC(1972, 11, 12, 0, 54, 49);

function interpolar(campo: 'sol' | 'tierra'): { altura: number; azimut: number } {
  const [a, b] = TABLA_ALSJ;
  const f = (INSTANTE_ESCENA_UTC - a.utc) / (b.utc - a.utc);
  return {
    altura: a[campo].altura + (b[campo].altura - a[campo].altura) * f,
    azimut: a[campo].azimut + (b[campo].azimut - a[campo].azimut) * f,
  };
}

/** Sol: altura ~15.7°, azimut ~96.8° (este, un poco al sur). */
export const SOL = interpolar('sol');
/** Tierra: altura ~45.3°, azimut ~240.7° (suroeste). Fija en el cielo: se mueve menos de 0.5° en toda la misión. */
export const TIERRA = interpolar('tierra');

/**
 * Fase de la Tierra vista desde la Luna (scripts/efemerides-apollo17.mjs): ángulo de fase 69°, 68 % iluminada,
 * gibosa. No se dibuja a mano: la Tierra se ilumina con la misma dirección del Sol de la escena, y el ángulo
 * Sol–Luna–Tierra que sale de SOL y TIERRA (~111°) reproduce esa fase.
 */
export const FASE_TIERRA = { anguloGrados: 69.1, fraccionIluminada: 0.679 } as const;
/** Radio angular de la Tierra (°) a 387 778 km (script). El del Sol, a ~0.985 UA en diciembre (°). */
const RADIO_ANGULAR_TIERRA = 0.941;
const RADIO_ANGULAR_SOL = 0.27;

/**
 * Matriz J2000 → horizonte local (filas: este, norte, cénit) en el instante de la escena (script). Orienta las
 * estrellas del catálogo Hipparcos.
 */
const MATRIZ_J2000_A_HORIZONTE = [
  [0.129063, -0.912035, -0.389274],
  [0.365388, -0.321199, 0.873684],
  [-0.921865, -0.254996, 0.291792],
] as const;

/** Distancias de dibujo (m). Solo cuenta la dirección: el cielo sigue a la cámara. */
const DISTANCIA_ESTRELLAS = 50_000;
const DISTANCIA_SOL = 45_000;
const DISTANCIA_TIERRA = 30_000;

/**
 * Brillo de las estrellas. Con el suelo a plena luz, en las fotos de Apollo el cielo sale negro: la exposición no
 * alcanza a las estrellas. Aquí se dejan muy tenues, con el brillo relativo real (flujo ∝ 10^(−0.4·m)):
 * solo se distinguen las más brillantes. Sirio (m = −1.44) queda en BRILLO_ESTRELLAS.
 */
/**
 * Para que se vean, el brillo se comprime respecto al real (exponente 0,2 en vez de 0,4 sobre la magnitud): se
 * conservan la distribución real del catálogo y el orden de brillo, y las de magnitud 5 quedan tenues
 * (BRILLO_MAG5) y las más brillantes saturan. El tamaño también crece con el brillo, como en una foto.
 */
const BRILLO_MAG5 = 0.3;
/** Tamaño de las estrellas en píxeles de pantalla (antes de la densidad de píxeles): mínimo, por magnitud y máximo. */
const TAMANO_MIN_PX = 1.6;
const TAMANO_POR_MAG_PX = 0.4;
const TAMANO_MAX_PX = 5;
/** Brillo del disco solar: muy por encima del umbral del bloom (es el único emisivo intenso de la escena). */
const BRILLO_SOL = 5;

/** Vector unitario de la escena para una altura y un azimut (°). */
export function direccionCielo(altura: number, azimut: number): THREE.Vector3 {
  const h = THREE.MathUtils.degToRad(altura);
  const a = THREE.MathUtils.degToRad(azimut);
  return new THREE.Vector3(Math.cos(h) * Math.sin(a), Math.sin(h), -Math.cos(h) * Math.cos(a));
}

/** Hacia el Sol, en la escena. */
export const DIRECCION_SOL = direccionCielo(SOL.altura, SOL.azimut);
export const DIRECCION_TIERRA = direccionCielo(TIERRA.altura, TIERRA.azimut);

/** Color aproximado de una estrella según su índice B−V (azuladas < 0, blancas ~0.3, anaranjadas > 1.2). */
function colorEstrella(bv: number, destino: THREE.Color): THREE.Color {
  const t = THREE.MathUtils.clamp((bv + 0.3) / 2.0, 0, 1);
  const r = THREE.MathUtils.lerp(0.72, 1.0, Math.min(1, t * 1.6));
  const g = THREE.MathUtils.lerp(0.82, 0.78, t);
  const b = THREE.MathUtils.lerp(1.0, 0.52, t);
  return destino.setRGB(r, g, b);
}

const ESTRELLAS_VS = /* glsl */ `
  attribute vec3 brillo;
  attribute float tamanoEstrella;
  uniform float escalaPx;
  varying vec3 vBrillo;
  void main() {
    vBrillo = brillo;
    gl_PointSize = tamanoEstrella * escalaPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ESTRELLAS_FS = /* glsl */ `
  varying vec3 vBrillo;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float borde = smoothstep(0.5, 0.15, length(c));
    gl_FragColor = vec4(vBrillo * borde, 1.0);
  }
`;

/** Estrellas del catálogo sobre el horizonte, con su brillo y color reales. */
function crearEstrellas(): THREE.Points {
  const posiciones: number[] = [];
  const brillos: number[] = [];
  const tamanos: number[] = [];
  const color = new THREE.Color();
  const m = MATRIZ_J2000_A_HORIZONTE;
  for (let i = 0; i < ESTRELLAS_J2000.length; i += 4) {
    const ar = THREE.MathUtils.degToRad(ESTRELLAS_J2000[i]);
    const dec = THREE.MathUtils.degToRad(ESTRELLAS_J2000[i + 1]);
    const mag = ESTRELLAS_J2000[i + 2];
    const v = [Math.cos(dec) * Math.cos(ar), Math.cos(dec) * Math.sin(ar), Math.sin(dec)];
    const este = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2];
    const norte = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2];
    const cenit = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2];
    if (cenit < -0.01) continue;
    posiciones.push(este * DISTANCIA_ESTRELLAS, cenit * DISTANCIA_ESTRELLAS, -norte * DISTANCIA_ESTRELLAS);
    const flujo = Math.min(1.6, BRILLO_MAG5 * Math.pow(10, -0.2 * (mag - 5)));
    colorEstrella(ESTRELLAS_J2000[i + 3], color).multiplyScalar(flujo);
    brillos.push(color.r, color.g, color.b);
    tamanos.push(Math.min(TAMANO_MAX_PX, TAMANO_MIN_PX + Math.max(0, 5 - mag) * TAMANO_POR_MAG_PX));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('brillo', new THREE.Float32BufferAttribute(brillos, 3));
  geo.setAttribute('tamanoEstrella', new THREE.Float32BufferAttribute(tamanos, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: ESTRELLAS_VS,
    fragmentShader: ESTRELLAS_FS,
    uniforms: { escalaPx: { value: Math.min(window.devicePixelRatio, 1.25) } },
    depthWrite: false,
  });
  const puntos = new THREE.Points(geo, material);
  puntos.frustumCulled = false;
  return puntos;
}

const TIERRA_VS = /* glsl */ `
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vPosMundo;
  void main() {
    vColor = color;
    vec4 p = modelMatrix * vec4(position, 1.0);
    vPosMundo = p.xyz;
    gl_Position = projectionMatrix * viewMatrix * p;
  }
`;
// Sombreado plano: la normal de cada cara sale de las derivadas de la posición (como flatShading en Three.js).
const TIERRA_FS = /* glsl */ `
  uniform vec3 dirSol;
  varying vec3 vColor;
  varying vec3 vPosMundo;
  void main() {
    vec3 n = normalize(cross(dFdx(vPosMundo), dFdy(vPosMundo)));
    float luz = max(dot(n, dirSol), 0.0);
    // Terminador algo suave: la atmósfera terrestre difumina la línea entre el día y la noche.
    luz = smoothstep(0.0, 0.25, luz) * (0.35 + 0.65 * luz);
    gl_FragColor = vec4(vColor * luz, 1.0);
  }
`;

/**
 * La Tierra, facetada: océano azul y nubes blancas, iluminada por el Sol de la escena (la fase sale sola).
 * Sin continentes a propósito: a ~1.9° de diámetro casi no se distinguen, y dibujar una geografía concreta
 * sin calcular qué cara miraba a la Luna sería inventarla. Las nubes son estilizadas, no el tiempo real de ese día.
 */
function crearTierra(): THREE.Mesh {
  const radio = DISTANCIA_TIERRA * Math.tan(THREE.MathUtils.degToRad(RADIO_ANGULAR_TIERRA));
  const geo = new THREE.IcosahedronGeometry(radio, 3).toNonIndexed();
  const pos = geo.getAttribute('position');
  const colores = new Float32Array(pos.count * 3);
  const rnd = azar(1972);
  const oceano = new THREE.Color(0x1d4f9e);
  const oceanoClaro = new THREE.Color(0x2f66b8);
  const nube = new THREE.Color(0xe9eef4);
  const c = new THREE.Color();
  const centro = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    centro.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centro.add(v.fromBufferAttribute(pos, i + k));
    centro.normalize();
    // Bandas de nubes por latitud (zona de convergencia y latitudes medias) con ruido por cara.
    const lat = Math.asin(centro.y);
    const bandas = 0.5 + 0.5 * Math.cos(lat * 5.5) * Math.cos(centro.x * 3.1 + centro.z * 2.3);
    const esNube = bandas + (rnd() - 0.5) * 0.7 > 0.62 || Math.abs(lat) > 1.2;
    c.copy(esNube ? nube : rnd() > 0.5 ? oceano : oceanoClaro);
    for (let k = 0; k < 3; k++) colores.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const material = new THREE.ShaderMaterial({
    vertexShader: TIERRA_VS,
    fragmentShader: TIERRA_FS,
    uniforms: { dirSol: { value: DIRECCION_SOL.clone() } },
  });
  const tierra = new THREE.Mesh(geo, material);
  tierra.position.copy(DIRECCION_TIERRA).multiplyScalar(DISTANCIA_TIERRA);
  // El eje de la Tierra no se orienta: sin continentes, no cambia nada visible.
  return tierra;
}

/** Disco solar emisivo: lo único que florece con el bloom. Sin atmósfera no hay aureola. */
function crearSol(): THREE.Mesh {
  const radio = DISTANCIA_SOL * Math.tan(THREE.MathUtils.degToRad(RADIO_ANGULAR_SOL));
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2dc).multiplyScalar(BRILLO_SOL) });
  const sol = new THREE.Mesh(new THREE.CircleGeometry(radio, 24), material);
  sol.position.copy(DIRECCION_SOL).multiplyScalar(DISTANCIA_SOL);
  sol.lookAt(0, 0, 0);
  return sol;
}

/** Grupo del cielo (capa lejana). Hay que moverlo con la cámara cada fotograma. */
export function crearCielo(): THREE.Group {
  const grupo = new THREE.Group();
  grupo.name = 'cielo_luna';
  grupo.add(crearEstrellas(), crearSol(), crearTierra());
  grupo.traverse((o) => o.layers.set(CAPA_LEJOS));
  return grupo;
}
