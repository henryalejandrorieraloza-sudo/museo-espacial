import * as THREE from 'three';
import { Lote } from './paleta';

// Hologramas al estilo Star Wars: el objeto se dibuja como luz azul translúcida, con líneas de barrido, borde
// brillante, parpadeo y algún fallo de proyección. Lo proyecta un emisor en lo alto de un pedestal (arquitectura.ts).
// No representa un objeto real distinto: es el mismo modelo de exhibición con otro material.

/** Azul holográfico por defecto. */
export const COLOR_HOLOGRAMA = 0x4cc9ff;
/** Giro lento del holograma (rad/s): da una vuelta cada ~20 s. */
const VELOCIDAD_GIRO = 0.32;

const VERTEX = /* glsl */ `
uniform float uTiempo;
varying vec3 vLocal;
varying vec3 vVista;
varying float vLuz;

void main() {
  vec3 p = position;
  // Fallo de proyección: durante un instante, bandas horizontales se desplazan de lado.
  float fallo = step(0.972, fract(uTiempo * 0.31 + 0.2));
  p.x += fallo * sin(p.y * 22.0 + uTiempo * 60.0) * 0.045;
  vLocal = p;
#ifdef USE_COLOR
  vLuz = clamp(dot(color, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
#else
  vLuz = 0.6;
#endif
  vec4 vista = modelViewMatrix * vec4(p, 1.0);
  vVista = vista.xyz;
  gl_Position = projectionMatrix * vista;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTiempo;
uniform vec3 uColor;
uniform float uBase;
uniform float uAlto;
varying vec3 vLocal;
varying vec3 vVista;
varying float vLuz;

void main() {
  // Normal de la cara por derivadas: el modelo es facetado y no lleva normales.
  vec3 n = normalize(cross(dFdx(vVista), dFdy(vVista)));
  float borde = pow(1.0 - abs(dot(n, normalize(-vVista))), 2.2);

  float y = vLocal.y - uBase;
  // Líneas de barrido finas que suben despacio, y una franja brillante que recorre el objeto.
  float lineas = 0.62 + 0.38 * smoothstep(0.25, 0.75, abs(sin(y * 95.0 - uTiempo * 1.6)));
  float franja = pow(1.0 - fract(y / max(uAlto, 0.1) * 0.8 - uTiempo * 0.22), 9.0);

  // Parpadeo suave con alguna caída breve de intensidad.
  float parpadeo = 0.92 + 0.08 * sin(uTiempo * 41.0) * sin(uTiempo * 23.0);
  parpadeo *= 1.0 - 0.35 * step(0.985, fract(uTiempo * 0.53 + 0.4));

  // Se desvanece hacia el emisor: el pie del objeto nace de la luz, no de un recorte.
  float pie = mix(0.45, 1.0, smoothstep(0.0, 0.35, y));

  float luz = 0.07 + 0.17 * vLuz + 0.5 * borde + 0.4 * franja;
  luz *= lineas * parpadeo * pie;
  // Las caras traseras se ven a través del frente, más tenues.
  luz *= gl_FrontFacing ? 1.0 : 0.4;

  vec3 color = uColor * luz + vec3(0.3, 0.6, 1.0) * borde * 0.06;
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Material del holograma. Cada uno lleva su propio reloj (`uTiempo`) y la altura del objeto (para la franja). */
function crearMaterial(color: number, base: number, alto: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTiempo: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uBase: { value: base },
      uAlto: { value: alto },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export interface OpcionesHolograma {
  /** Color del haz (por defecto, el azul holográfico). */
  color?: number;
  /** Giro inicial alrededor de la vertical (rad). */
  giro?: number;
  /** Escala uniforme del objeto. */
  escala?: number;
  /** Si el holograma da vueltas. */
  gira?: boolean;
}

/**
 * Construye el objeto de `contenido` (origen en la base) como holograma. El grupo devuelto lleva en
 * `userData.actualizar(t)` el giro y el parpadeo; hay que llamarlo cada fotograma con el tiempo en segundos.
 * Su origen es la base del objeto: colócalo donde quieras que flote.
 */
export function crearHolograma(contenido: (l: Lote) => void, opciones: OpcionesHolograma = {}): THREE.Group {
  const { color = COLOR_HOLOGRAMA, giro = 0, escala = 1, gira = true } = opciones;
  const l = new Lote(false);
  contenido(l);
  const cuerpo = l.construir();

  const caja = new THREE.Box3().setFromObject(cuerpo);
  const material = crearMaterial(color, caja.min.y, caja.max.y - caja.min.y);
  cuerpo.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = material;
      o.renderOrder = 4;
      o.raycast = () => {};
    }
  });
  cuerpo.rotation.y = giro;

  const raiz = new THREE.Group();
  raiz.scale.setScalar(escala);
  raiz.add(cuerpo);
  raiz.userData.actualizar = (t: number): void => {
    material.uniforms.uTiempo.value = t;
    if (gira) cuerpo.rotation.y = giro + t * VELOCIDAD_GIRO;
  };
  raiz.userData.altura = (caja.max.y - caja.min.y) * escala;
  return raiz;
}
