// Fondo animado de la pantalla de inicio: el remolino de estelas de estrellas de la imagen de referencia, girando.
//
// Lo pinta un shader WebGL2, píxel a píxel (sin Three.js, para no tocar la escena del museo que se carga detrás).
// Las órbitas son una familia de elipses que convergen en un punto justo a la izquierda de la pantalla: dentro se
// cierran en lazos con la punta hacia la derecha, y las de fuera se abren hacia arriba y abajo a la derecha, como en
// la imagen. Cada órbita es una hilera de partículas muy juntas (de lejos, una línea) que giran todas en el mismo
// sentido a la velocidad de su órbita: las de dentro, más rápido. Algunas son más grandes y blancas, y otras rojas.
// Entre las líneas flotan además partículas sueltas, pequeñas y redondas, que siguen el mismo sentido de giro. Abajo se vuelven salmón, naranja y rojo, y arriba a la izquierda se apagan
// hasta dejar el cielo negro con estrellas.
//
// Sin WebGL2 queda un degradado azul fijo (clase `inicio-remolino--fijo`): la pantalla de inicio sigue funcionando.

/** Punto de convergencia de las órbitas, en unidades del remolino (x) y fracción del alto (y). */
const ORIGEN_X = -0.11;
const ORIGEN_Y = 0.56;
/** Aplastamiento vertical de las órbitas (1 = círculos): la mitad de arriba es más plana que la de abajo. */
const ACHATAMIENTO_ARRIBA = 0.58;
const ACHATAMIENTO_ABAJO = 0.8;
/** Giro de todo el remolino (rad). Positivo = la punta de los lazos baja. */
const INCLINACION = 0.16;
/** Torsión en espiral (rad por unidad de distancia al origen): las órbitas de fuera se giran hacia arriba. */
const TORSION = 0.8;
/** Separación entre órbitas (px, medida en el radio de cada órbita). */
const SEPARACION = 3.0;
/** Separación entre las partículas de una órbita (px): tan juntas que de lejos parecen una línea. */
const PASO = 2.3;
/** Partículas sueltas que flotan entre las líneas: separación entre sus anillos y largo de cada hueco (px). */
const SEPARACION_SUELTAS = 7.0;
const PASO_SUELTAS = 9.0;
/** Probabilidad de que cada hueco tenga una partícula suelta. */
const PROB_SUELTAS = 0.26;
/** Segundos por vuelta de la órbita de referencia (radio 0.1 unidades). Las de fuera van más lentas. */
const PERIODO_S = 26;
/** Escala de la velocidad durante un acelerón (al pasar de paso o al salir). */
const VELOCIDAD_ACELERON = 4;
/** Tope de píxeles de dispositivo por píxel CSS. */
const PPP_MAX = 2;

const VERTICES = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENTOS = `#version 300 es
precision highp float;
uniform vec2 uRes;       // tamaño en px CSS
uniform float uPpp;      // px de dispositivo por px CSS
uniform float uT;        // ángulo de giro acumulado de la órbita de referencia (rad)
uniform float uU;        // unidad del remolino (px CSS)
uniform vec2 uOrigen;    // punto de convergencia (px CSS)
out vec4 salida;

const float PI = 3.14159265;
const float RHO_ARRIBA = ${ACHATAMIENTO_ARRIBA.toFixed(4)};
const float RHO_ABAJO = ${ACHATAMIENTO_ABAJO.toFixed(4)};
const float SEP = ${SEPARACION.toFixed(4)};
const float PASO = ${PASO.toFixed(4)};
const float SEP_S = ${SEPARACION_SUELTAS.toFixed(4)};
const float PASO_S = ${PASO_SUELTAS.toFixed(4)};
const float PROB_S = ${PROB_SUELTAS.toFixed(4)};
const float INCL = ${INCLINACION.toFixed(4)};
const float TORSION = ${TORSION.toFixed(4)};

uint hu(uint x) {
  x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16;
  return x;
}
float h1(float a) { return float(hu(uint(int(a) + 1000000))) / 4294967295.0; }
float h2(float a, float b) {
  return float(hu(hu(uint(int(a) + 1000000)) ^ (uint(int(b) + 1000000) * 0x9E3779B9U))) / 4294967295.0;
}
float ruido(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h1(i), h1(i + 1.0), f);
}

vec3 rampaFria(float t) {
  vec3 marino = vec3(0.03, 0.07, 0.20);
  vec3 azul = vec3(0.09, 0.25, 0.62);
  vec3 medio = vec3(0.20, 0.43, 0.86);
  vec3 claro = vec3(0.48, 0.67, 0.96);
  vec3 blanco = vec3(0.86, 0.92, 1.0);
  if (t < 0.3) return mix(marino, azul, t / 0.3);
  if (t < 0.6) return mix(azul, medio, (t - 0.3) / 0.3);
  if (t < 0.85) return mix(medio, claro, (t - 0.6) / 0.25);
  return mix(claro, blanco, (t - 0.85) / 0.15);
}

vec3 colorCalido(float h) {
  if (h < 0.3) return vec3(1.0, 0.66, 0.56);    // salmón
  if (h < 0.55) return vec3(1.0, 0.42, 0.24);   // naranja
  if (h < 0.85) return vec3(0.92, 0.18, 0.18);  // rojo
  return vec3(1.0, 0.92, 0.88);                 // crema
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uPpp - gl_FragCoord.y) / uPpp;
  vec2 q = p - uOrigen;
  // Torsión en espiral: cuanto más lejos del origen, más se giran las órbitas hacia arriba (con tope, para que en
  // pantallas anchas la derecha no acabe en estelas verticales).
  float dq = length(q) / uU;
  float alfa = TORSION * dq / (1.0 + 0.9 * dq) - INCL;
  float c = cos(alfa), s = sin(alfa);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  float X = max(q.x, 0.5);
  float rho = mix(RHO_ARRIBA, RHO_ABAJO, smoothstep(-0.12 * uU, 0.12 * uU, q.y));
  float Y = q.y / rho;
  // Órbita que pasa por este píxel: circunferencia (aplastada) de radio R y centro (R, 0), tangente en el origen.
  float R = (X * X + Y * Y) / (2.0 * X);
  float Ru = R / uU;
  float ang = atan(Y, X - R);

  // Velocidad angular: las de dentro giran más rápido. Todas en el mismo sentido.
  float omega = pow(0.1 / max(Ru, 0.02), 0.85);
  float a = fract((ang - omega * uT) / (2.0 * PI));

  // Órbita discreta y posición dentro de ella.
  float kf = R / SEP;
  float k = floor(kf);
  float f = fract(kf);
  float Rk = (k + 0.5) * SEP;
  float Rku = Rk / uU;
  // Ritmo de cambio por píxel con la longitud real del gradiente (fwidth la exagera en diagonal y alarga los puntos).
  float fw = max(length(vec2(dFdx(kf), dFdy(kf))), 1e-4);   // órbitas por píxel
  float radialPx = (f - 0.5) / fw;           // distancia con signo al centro de la órbita (px)

  // Bandas: brillo de cada zona del remolino, con huecos oscuros y la gran banda blanca del lazo.
  float n = 0.5 * ruido(Rku * 10.0) + 0.3 * ruido(Rku * 27.0 + 11.0) + 0.2 * ruido(Rku * 70.0 + 5.0);
  float banda = smoothstep(0.36, 0.72, n);
  float bandaU = exp(-pow((Rku - 0.235) / 0.03, 2.0));   // el lazo blanco
  banda += 0.9 * bandaU;
  banda += 0.5 * exp(-pow((Rku - 0.12) / 0.03, 2.0));
  banda *= 0.55 + 0.45 * smoothstep(1.6, 0.4, Rku);
  float yRel = p.y / uRes.y;
  // Banda blanca ancha abajo, justo encima de las rojas.
  // En pantallas anchas se queda en la parte izquierda, donde las órbitas van casi horizontales como en la imagen.
  float bandaBlanca = exp(-pow((yRel - 0.8) / 0.045, 2.0)) * smoothstep(0.0, 0.2 * uU, Y)
    * (1.0 - smoothstep(0.6, 1.0, p.x / uRes.y));
  banda += 0.7 * bandaBlanca;
  float hk = h1(k);
  float brilloOrbita = banda * (0.45 + 0.55 * h1(k + 0.37 * 977.0));

  // Color de la órbita: frío según el brillo de la banda; abajo, cálido.
  vec3 colBase = rampaFria(clamp(0.1 + 0.42 * banda + 0.45 * bandaU + (hk - 0.5) * 0.45, 0.0, 1.0));
  float abajo = smoothstep(0.0, 0.3 * uU, Y);
  float calor = smoothstep(0.8, 0.95, yRel) * abajo;
  float calorOrbita = calor * step(h1(k + 55.0), 0.5 + 0.5 * calor);
  brilloOrbita *= 1.0 + 1.4 * calorOrbita;
  colBase = mix(colBase, colorCalido(h1(k + 91.0)), calorOrbita);
  // Bandas con partículas rojas (a la derecha del lazo blanco).
  float rojez = smoothstep(0.62, 0.85, ruido(Rku * 16.0 + 3.0)) * smoothstep(0.22, 0.3, Rku) * smoothstep(0.9, 0.5, Rku);

  // Tramos de la órbita más o menos poblados, para que las líneas no sean todas iguales.
  float nTramos = max(1.0, floor(2.0 * PI * Rk / (60.0 + 180.0 * h1(k * 1.7 + 3.0))));
  float pt = a * nTramos;
  float poblacion = mix(0.35, 1.0, mix(h2(k, floor(pt)), h2(k, mod(floor(pt) + 1.0, nTramos)), smoothstep(0.0, 1.0, fract(pt))));

  // Partículas muy juntas sobre la órbita (una cada PASO px): de lejos forman la línea. Cada píxel mira la suya y
  // las dos vecinas, porque las más grandes se salen de su hueco.
  float nPuntos = max(1.0, floor(2.0 * PI * Rk / PASO));
  float pp = a * nPuntos;
  // Se deriva el ángulo sin envolver: pp salta de nPuntos a 0 en una curva que gira, y su derivada dejaría una costura.
  float fwp = max(length(vec2(dFdx(ang), dFdy(ang))) / (2.0 * PI) * nPuntos, 1e-4);  // partículas por píxel
  float idBase = floor(pp);
  float probPunto = (0.5 + 0.45 * clamp(banda, 0.0, 1.0)) * poblacion;
  float pGrande = 0.015 + 0.04 * clamp(banda, 0.0, 1.3) + 0.12 * bandaBlanca;
  float pRoja = 0.14 * rojez;
  vec3 luz = vec3(0.0);
  for (int m = -1; m <= 1; m++) {
    float id = idBase + float(m);
    // Identidad de la partícula, igual a ambos lados del salto de nPuntos a 0.
    float idh = mod(id, nPuntos);
    if (h2(k, idh) > probPunto) continue;
    float t = h2(idh, k + 7.0);
    float radio;
    float brillo;
    vec3 cp;
    if (t < pGrande) {
      radio = 1.1 + 0.6 * h2(idh, k + 3.0);
      brillo = 1.5;
      cp = calorOrbita > 0.5 ? vec3(1.0, 0.86, 0.8) : vec3(1.0);
    } else if (t < pGrande + pRoja) {
      radio = 0.8 + 0.4 * h2(idh, k + 3.0);
      brillo = 1.3;
      cp = vec3(1.0, 0.2, 0.22);
    } else {
      radio = 0.65 + 0.55 * h2(idh, k + 3.0);
      brillo = brilloOrbita * (0.45 + 0.8 * h2(idh, k + 4.0));
      cp = mix(colBase, vec3(0.8, 0.88, 1.0), 0.3 * h2(idh, k + 5.0));
    }
    float centroA = id + 0.5 + (h2(idh, k + 1.0) - 0.5) * 0.4;
    float desv = (h2(idh, k + 2.0) - 0.5) * 0.7;
    float d = length(vec2((pp - centroA) / fwp, radialPx - desv));
    luz += cp * brillo * (1.0 - smoothstep(radio * 0.4, radio + 0.6, d));
  }
  // Brillo suave de la línea bajo las partículas.
  luz += colBase * brilloOrbita * poblacion * 0.22 * (1.0 - smoothstep(0.4, 2.2, abs(radialPx)));
  // Donde las órbitas o las partículas quedan a menos de ~2 px (junto al borde izquierdo) no se distinguen: se pinta
  // su brillo medio, sin parpadeo.
  float denso = max(smoothstep(0.3, 0.6, fw), smoothstep(0.4, 0.8, fwp));
  luz = mix(luz, colBase * brilloOrbita * poblacion * 0.5, denso);

  // Partículas sueltas: pequeñas y redondas, flotan entre las líneas sin ir sobre ninguna. Siguen el mismo sentido de
  // giro, pero cada anillo de sueltas va a su ritmo (±25 % del de las líneas) y cada partícula se mece hacia dentro y
  // hacia fuera. Cada píxel mira los 3 anillos de sueltas más cercanos y 3 huecos en cada uno.
  float gradR = max(length(vec2(dFdx(R), dFdy(R))), 1e-4);        // unidades de R por píxel
  float gradAng = max(length(vec2(dFdx(ang), dFdy(ang))), 1e-4);  // radianes por píxel
  float visibleS = 1.0 - smoothstep(0.25, 0.5, gradR / SEP_S);   // anillos a menos de ~3 px: no se distinguen
  if (visibleS > 0.0) {
    float kS = floor(R / SEP_S);
    for (int j = -1; j <= 1; j++) {
      float Kj = kS + float(j);
      if (Kj < 0.0) continue;
      float Rs = (Kj + 0.5) * SEP_S;
      float ritmo = 0.75 + 0.5 * h1(Kj * 3.1 + 7.0);
      float omS = pow(0.1 / max(Rs / uU, 0.02), 0.85) * ritmo;
      float nS = max(1.0, floor(2.0 * PI * Rs / PASO_S));
      float ps = fract((ang - omS * uT) / (2.0 * PI)) * nS;
      float fwS = gradAng / (2.0 * PI) * nS;
      float idB = floor(ps);
      for (int m = -1; m <= 1; m++) {
        float id = idB + float(m);
        float idh = mod(id, nS);
        if (h2(Kj + 4000.0, idh) > PROB_S) continue;
        float fase = h2(idh, Kj + 4001.0) * 6.2832;
        float rp = Rs + SEP_S * (0.36 * (h2(idh, Kj + 4002.0) - 0.5) * 2.0 + 0.14 * sin(uT * 4.0 + fase));
        float cA = id + 0.5 + (h2(idh, Kj + 4003.0) - 0.5) * 0.6;
        float d = length(vec2((ps - cA) / fwS, (R - rp) / gradR));
        float radioS = 0.75 + 0.7 * h2(idh, Kj + 4004.0);
        float t = h2(idh, Kj + 4005.0);
        vec3 cs = t < 0.55 ? vec3(0.95, 0.97, 1.0) : (t < 0.9 ? vec3(0.6, 0.76, 1.0) : vec3(1.0, 0.3, 0.3));
        if (calor > 0.5) cs = t < 0.5 ? vec3(1.0, 0.9, 0.86) : vec3(1.0, 0.55, 0.45);
        luz += cs * (0.9 + 0.8 * h2(idh, Kj + 4006.0)) * visibleS * (1.0 - smoothstep(radioS * 0.4, radioS + 0.6, d));
      }
    }
  }

  // Arriba a la izquierda el remolino se apaga; abajo llega más lejos.
  float lado = smoothstep(-0.15 * uU, 0.15 * uU, Y);
  float mascara = mix(1.0 - smoothstep(1.0, 1.5, Ru), 1.0 - smoothstep(2.6, 3.6, Ru), lado);

  // Cielo oscuro arriba a la izquierda, con el borde diagonal de la imagen: de (0, 33 %) a (100 %, 3 %).
  float xRel = p.x / max(uRes.x, 1.0);
  float bajoDiagonal = yRel - (0.33 - 0.3 * min(xRel * uRes.x / (0.6 * uRes.y), 1.0));
  mascara *= smoothstep(-0.06, 0.1, bajoDiagonal);
  // Píxeles que quedan detrás del origen tras la torsión: ahí la fórmula de la órbita no vale.
  mascara *= smoothstep(0.0, 0.05 * uU, q.x);

  vec3 col = luz * 1.5;
  col += vec3(0.02, 0.07, 0.24) * (0.25 + 0.9 * min(banda, 1.0)) * (1.0 - 0.8 * calor);   // bruma azul entre las órbitas
  col += vec3(0.16, 0.03, 0.03) * calor;                             // bruma roja abajo
  col *= mascara;

  // Resplandor blanco azulado donde convergen las órbitas, en el borde izquierdo.
  float dCentro = length((p - vec2(0.0, uOrigen.y)) / vec2(1.0, 1.3));
  col += vec3(0.72, 0.82, 1.0) * exp(-dCentro / (0.07 * uU)) * 0.9;
  col += vec3(0.25, 0.4, 0.8) * exp(-dCentro / (0.22 * uU)) * 0.25;

  // Estrellas del fondo (sobre todo visibles en el cielo oscuro).
  vec2 rejilla = floor(p / 3.0);
  float he = h2(rejilla.x, rejilla.y + 5000.0);
  if (he > 0.972) {
    vec2 centro = (rejilla + vec2(h2(rejilla.y, rejilla.x), h2(rejilla.x + 3.0, rejilla.y)) ) * 3.0 + 0.5;
    float de = length(p - centro);
    float brillo = (he - 0.972) / 0.028;
    vec3 colEstrella = h2(rejilla.y, rejilla.x + 1.0) < 0.7 ? vec3(0.85, 0.9, 1.0) : vec3(0.55, 0.7, 1.0);
    col += colEstrella * brillo * (1.0 - smoothstep(0.2, 1.0 + brillo * 0.6, de)) * (1.0 - 0.6 * mascara);
  }

  col = 1.0 - exp(-col * 1.1);
  salida = vec4(col, 1.0);
}
`;

export interface FondoRemolino {
  iniciar(): void;
  detener(): void;
  /** Acelera el remolino un momento (al avanzar de paso). */
  acelerar(segundos?: number): void;
}

function compilar(gl: WebGL2RenderingContext, tipo: number, fuente: string): WebGLShader | null {
  const shader = gl.createShader(tipo);
  if (!shader) return null;
  gl.shaderSource(shader, fuente);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Remolino: el shader no compiló', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

interface Programa {
  gl: WebGL2RenderingContext;
  uRes: WebGLUniformLocation | null;
  uPpp: WebGLUniformLocation | null;
  uT: WebGLUniformLocation | null;
  uU: WebGLUniformLocation | null;
  uOrigen: WebGLUniformLocation | null;
}

function crearPrograma(lienzo: HTMLCanvasElement): Programa | null {
  const gl = lienzo.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const vs = compilar(gl, gl.VERTEX_SHADER, VERTICES);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS);
  if (!vs || !fs) return null;
  const programa = gl.createProgram();
  if (!programa) return null;
  gl.attachShader(programa, vs);
  gl.attachShader(programa, fs);
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    console.warn('Remolino: el programa no enlazó', gl.getProgramInfoLog(programa));
    return null;
  }
  gl.useProgram(programa);
  // Un triángulo que cubre toda la pantalla.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(programa, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  return {
    gl,
    uRes: gl.getUniformLocation(programa, 'uRes'),
    uPpp: gl.getUniformLocation(programa, 'uPpp'),
    uT: gl.getUniformLocation(programa, 'uT'),
    uU: gl.getUniformLocation(programa, 'uU'),
    uOrigen: gl.getUniformLocation(programa, 'uOrigen'),
  };
}

export function crearRemolinoEstelar(lienzo: HTMLCanvasElement): FondoRemolino {
  const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let prog: Programa | null | undefined;

  let ancho = 0;
  let alto = 0;
  let ppp = 1;
  let raf = 0;
  let ultimo = 0;
  let giro = 0;
  let aceleronHasta = 0;
  let velocidad = 1;
  // Paralaje suave con el ratón.
  let objetivoX = 0;
  let objetivoY = 0;
  let paralajeX = 0;
  let paralajeY = 0;

  function dimensionar(): void {
    ppp = Math.min(window.devicePixelRatio || 1, PPP_MAX);
    ancho = window.innerWidth;
    alto = window.innerHeight;
    lienzo.width = Math.round(ancho * ppp);
    lienzo.height = Math.round(alto * ppp);
    prog?.gl.viewport(0, 0, lienzo.width, lienzo.height);
  }

  function cuadro(ahora: number): void {
    raf = requestAnimationFrame(cuadro);
    if (!prog) return;
    const dt = Math.min(0.05, ultimo ? (ahora - ultimo) / 1000 : 0.016);
    ultimo = ahora;
    const objetivoVel = (ahora < aceleronHasta ? VELOCIDAD_ACELERON : 1) * (reducido ? 0.25 : 1);
    velocidad += (objetivoVel - velocidad) * Math.min(1, dt * 2.5);
    giro += ((Math.PI * 2) / PERIODO_S) * velocidad * dt;
    paralajeX += (objetivoX - paralajeX) * Math.min(1, dt * 2);
    paralajeY += (objetivoY - paralajeY) * Math.min(1, dt * 2);

    const { gl } = prog;
    // Unidad del remolino: el alto en vertical; en pantallas anchas crece con el ancho para llenar la derecha.
    const unidad = Math.max(alto, ancho * 0.8);
    gl.uniform2f(prog.uRes, ancho, alto);
    gl.uniform1f(prog.uPpp, ppp);
    gl.uniform1f(prog.uT, giro);
    gl.uniform1f(prog.uU, unidad);
    gl.uniform2f(
      prog.uOrigen,
      ORIGEN_X * unidad + paralajeX * unidad * 0.01,
      ORIGEN_Y * alto + paralajeY * alto * 0.01,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const alMoverRaton = (e: PointerEvent): void => {
    objetivoX = (e.clientX / Math.max(1, ancho)) * 2 - 1;
    objetivoY = (e.clientY / Math.max(1, alto)) * 2 - 1;
  };

  return {
    iniciar() {
      if (raf) return;
      if (prog === undefined) {
        prog = crearPrograma(lienzo);
        // Sin WebGL2 (o si el shader falla): degradado fijo. La pantalla de inicio funciona igual.
        if (!prog) lienzo.classList.add('inicio-remolino--fijo');
      }
      if (!prog) return;
      dimensionar();
      ultimo = 0;
      window.addEventListener('resize', dimensionar);
      window.addEventListener('pointermove', alMoverRaton);
      raf = requestAnimationFrame(cuadro);
    },
    detener() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', dimensionar);
      window.removeEventListener('pointermove', alMoverRaton);
    },
    acelerar(segundos = 1.2) {
      aceleronHasta = performance.now() + segundos * 1000;
    },
  };
}
