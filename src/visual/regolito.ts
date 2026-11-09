import * as THREE from 'three';

// Materiales del suelo y las rocas de la Luna con detalle procedural en el shader (sin texturas ni UV).
//
// La malla del suelo tiene vértices cada 0.3–1 m cerca del jugador: basta para lomas y cráteres de metros, pero el
// regolito de las fotos de Apollo tiene detalle hasta el centímetro (terrones, piedrecitas, hoyitos de impacto).
// Ese detalle se calcula por píxel a partir de la posición en el mundo:
// - Relieve: ruido fractal y dos capas de cráteres diminutos (celdas de 1.4 m y 0.4 m) que solo inclinan la normal.
//   Con el Sol bajo de la EVA-1 (~16°), esa inclinación basta para que el suelo se vea granuloso y picado.
// - Albedo: motas claras y oscuras de pocos centímetros y manchas suaves de metros.
// - Reflectancia: el regolito no es lambertiano. Sigue aproximadamente la ley de Lommel-Seeliger, μ0 / (μ0 + μ):
//   por eso el suelo lejano no se oscurece hacia el horizonte y la Luna llena se ve como un disco plano.
// Cada octava se apaga cuando es más fina que el píxel (según dFdx/dFdy), así no parpadea a lo lejos.

const RUIDO_GLSL = /* glsl */ `
varying vec3 vPosMundo;

float hashR(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hashR2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/** Ruido de valor (0–1) y sus derivadas analíticas: (valor, d/dx, d/dy). */
vec3 ruidoR(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hashR(i);
  float b = hashR(i + vec2(1.0, 0.0));
  float c = hashR(i + vec2(0.0, 1.0));
  float d = hashR(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}

/** Atenuación de una octava de frecuencia 'frec' (ciclos/m) según el tamaño del píxel en el suelo 'pie' (m). */
float octava(float frec, float pie) {
  return 1.0 - smoothstep(0.18, 0.5, frec * pie);
}
`;

const SUELO_GLSL = /* glsl */ `
/**
 * Cráteres diminutos en una rejilla de celdas de 'celda' metros: en cada celda hay uno con probabilidad 'densidad'.
 * Devuelve la pendiente (dh/dx, dh/dz). Perfil igual que los cráteres grandes: cuenco y borde que se desvanece.
 */
vec2 crateritos(vec2 p, float celda, float densidad, float semilla) {
  vec2 q = p / celda;
  vec2 i = floor(q);
  vec2 g = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = i + vec2(float(x), float(y));
      vec2 h = hashR2(c + semilla);
      if (h.x > densidad) continue;
      float radio = mix(0.12, 0.42, h.y * h.y);
      vec2 centro = c + radio + hashR2(c + semilla + 17.0) * (1.0 - 2.0 * radio);
      vec2 d = q - centro;
      float dist = length(d);
      float u = dist / radio;
      if (u >= 2.0 || dist < 1e-4) continue;
      // Perfil suave (sin aristas): cuenco -P(1-u²)² y borde B·sen²(πu/2), que se apaga en u = 2.
      // Casi todos muy degradados: en el regolito los hoyitos se rellenan y se suavizan enseguida.
      float prof = mix(0.03, 0.14, pow(hashR(c + semilla + 5.0), 3.0)) * radio;
      float borde = 0.25 * prof;
      float dh = (u < 1.0 ? 4.0 * prof * u * (1.0 - u * u) : 0.0) + 1.5708 * borde * sin(3.14159 * u);
      dh /= radio;
      g += dh * d / dist;
    }
  }
  return g;
}

/** Detalle del suelo: variación de albedo (multiplicador − 1) y pendiente del relieve fino. */
void detalleSuelo(vec2 p, float pie, out float albedo, out vec2 grad) {
  grad = vec2(0.0);
  float amp = 0.08;
  float frec = 0.45;
  for (int k = 0; k < 6; k++) {
    vec3 n = ruidoR(p * frec + float(k) * 17.31);
    grad += octava(frec, pie) * amp * frec * n.yz;
    frec *= 2.2;
    amp *= 0.5;
  }
  grad += octava(1.0 / 1.4, pie) * crateritos(p, 1.4, 0.22, 3.0);
  grad += octava(1.0 / 0.4, pie) * crateritos(p, 0.4, 0.3, 11.0);
  grad += octava(1.0 / 0.13, pie) * crateritos(p, 0.13, 0.35, 23.0);

  // Albedo: manchas de metros y motas de centímetros (piedrecitas claras y terrones oscuros).
  albedo = (ruidoR(p * 0.35 + 3.7).x - 0.5) * 0.14;
  albedo += octava(1.6, pie) * (ruidoR(p * 1.6 + 9.1).x - 0.5) * 0.12;
  albedo += octava(9.0, pie) * (ruidoR(p * 9.0 + 1.3).x - 0.5) * 0.1;
  albedo += octava(30.0, pie) * (ruidoR(p * 30.0 + 7.7).x - 0.5) * 0.12;
  float motas = ruidoR(p * 22.0 + 41.0).x;
  albedo += octava(22.0, pie) * (smoothstep(0.84, 0.95, motas) * 0.25 - smoothstep(0.2, 0.08, motas) * 0.1);
}
`;

const ROCA_GLSL = /* glsl */ `
/** Grano de la roca: motas en las tres proyecciones (las caras de una roca miran en todas direcciones). */
float detalleRoca(vec3 p, float pie) {
  float a = 0.0;
  for (int k = 0; k < 3; k++) {
    float frec = 6.0 * pow(2.6, float(k));
    float w = octava(frec, pie) * (0.16 - 0.03 * float(k));
    a += w * (ruidoR(p.xz * frec + 5.1).x + ruidoR(p.xy * frec + 2.3).x + ruidoR(p.zy * frec + 8.9).x - 1.5);
  }
  return a;
}
`;

/**
 * Lommel-Seeliger en lugar de Lambert para la luz directa: radiancia ∝ μ0 / (μ0 + μ). Se normaliza para que el suelo
 * llano visto desde los ojos, con el Sol de la EVA-1 (μ0 ≈ 0.27, μ ≈ 0.2), quede como con Lambert (factor ~1).
 * Así el suelo lejano no se oscurece hacia el horizonte y las laderas de cara al Sol no brillan mucho más que el
 * llano: el contraste lo ponen sobre todo las sombras, como en las fotos. Se limita en las vistas muy rasantes.
 */
const LS_NORMALIZACION = 0.6;
const LS_FACTOR_MAX = 1.9;
const LOMMEL_SEELIGER_GLSL = /* glsl */ `
float muVista = saturate(dot(geometryNormal, geometryViewDir));
float factorLS = min(${LS_NORMALIZACION.toFixed(2)} / (dotNL + muVista + 0.05), ${LS_FACTOR_MAX.toFixed(2)});
vec3 irradiance = dotNL * directLight.color * factorLS;
`;

function anadirPosicionMundo(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPosMundo;')
    .replace(
      '#include <worldpos_vertex>',
      /* glsl */ `#include <worldpos_vertex>
      vec4 posRegolito = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        posRegolito = instanceMatrix * posRegolito;
      #endif
      vPosMundo = (modelMatrix * posRegolito).xyz;`,
    );
}

function usarLommelSeeliger(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_physical_pars_fragment>',
    THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      LOMMEL_SEELIGER_GLSL,
    ),
  );
}

/**
 * Suelo: color por vértice y relieve fino por píxel. Sombreado suave para el suelo cercano; `facetado` (sombreado
 * plano, low poly) para el relieve lejano.
 */
export function crearMaterialSuelo(facetado = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: facetado, roughness: 1, metalness: 0, fog: false });
  material.onBeforeCompile = (shader) => {
    anadirPosicionMundo(shader);
    usarLommelSeeliger(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RUIDO_GLSL}\n${SUELO_GLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float pieRegolito = max(length(dFdx(vPosMundo)), length(dFdy(vPosMundo)));
        float albedoRegolito;
        vec2 pendienteRegolito;
        detalleSuelo(vPosMundo.xz, pieRegolito, albedoRegolito, pendienteRegolito);
        diffuseColor.rgb *= max(0.0, 1.0 + albedoRegolito);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = normalize(normal - (viewMatrix * vec4(pendienteRegolito.x, 0.0, pendienteRegolito.y, 0.0)).xyz);`,
      );
  };
  material.customProgramCacheKey = () => 'regolito-suelo';
  return material;
}

/** Rocas: facetadas (sombreado plano), color por instancia y grano por píxel. */
export function crearMaterialRoca(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, metalness: 0, fog: false });
  material.onBeforeCompile = (shader) => {
    anadirPosicionMundo(shader);
    usarLommelSeeliger(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RUIDO_GLSL}\n${ROCA_GLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float pieRoca = max(length(dFdx(vPosMundo)), length(dFdy(vPosMundo)));
        diffuseColor.rgb *= max(0.0, 1.0 + detalleRoca(vPosMundo, pieRoca));`,
      );
  };
  material.customProgramCacheKey = () => 'regolito-roca';
  return material;
}
