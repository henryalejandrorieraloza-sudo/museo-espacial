// Efemérides del cielo de Apollo 17 en Taurus-Littrow. Uso:
//   node scripts/efemerides-apollo17.mjs                      → imprime Sol, Tierra y fase, y los compara con el ALSJ
//   node scripts/efemerides-apollo17.mjs <stars.6.json>       → además regenera src/visual/cieloEstrellas.ts
//
// No se usa en el build: el juego lee los valores ya calculados de src/visual/cielo.ts y src/visual/cieloEstrellas.ts.
// Sirve para documentar y repetir el cálculo.
//
// Fuentes de los algoritmos:
// - Sol: Meeus, "Astronomical Algorithms" (2.ª ed.), cap. 25 (precisión baja, ~0.01°).
// - Luna geocéntrica: Meeus, cap. 47, con los 30 términos mayores de longitud y distancia y los 20 de latitud.
// - Orientación de la Luna: IAU WGCCRE 2009 (Archinal et al. 2011, Celest. Mech. Dyn. Astr. 109:101), polo y meridiano.
// - Precesión de la fecha a J2000 en longitud eclíptica: Lieske et al. 1977 (p_A = 5029.0966″ T + 1.11113″ T²).
// Referencia de contraste: tabla "Sun and Earth: Altitudes and Azimuths" del Apollo Lunar Surface Journal
// (cálculos de J. Scotti y P. Fjeld, comprobados con JPL Horizons): https://www.nasa.gov/history/alsj/alsj-EarthSun_AltAz.html
// Catálogo de estrellas: Hipparcos (J2000) en el formato de d3-celestial (data/stars.6.json, licencia BSD-3).

import { readFileSync, writeFileSync } from 'node:fs';

const RAD = Math.PI / 180;
const sen = (g) => Math.sin(g * RAD);
const cos = (g) => Math.cos(g * RAD);

/** Sitio de aterrizaje del ALSJ (misma tabla de contraste): latitud y longitud selenográficas (°). */
const SITIO = { lat: 20.1653, lon: 30.7658 };
const RADIO_LUNA_KM = 1737.4;
const RADIO_TIERRA_KM = 6371.0;
/** ΔT = TT − UTC a finales de 1972 (s). */
const DELTA_T_S = 42.2;

/** Instantes de la tabla del ALSJ para Apollo 17 (UTC) y sus valores, para comparar. */
const CONTRASTE = [
  { evento: 'Aterrizaje', utc: '1972-12-11T19:54:58Z', sol: [13.33, 95.83], tierra: [45.52, 240.88] },
  { evento: 'Inicio EVA-1', utc: '1972-12-11T23:54:49Z', sol: [15.22, 96.58], tierra: [45.32, 240.72] },
  { evento: 'Fin EVA-1', utc: '1972-12-12T07:06:42Z', sol: [18.63, 97.96], tierra: [45.09, 240.42] },
];

function diaJuliano(fechaUtc) {
  return Date.parse(fechaUtc) / 86400000 + 2440587.5;
}

function norm360(g) {
  return ((g % 360) + 360) % 360;
}

/** Sol: longitud eclíptica geométrica de la fecha (°) y distancia (km). */
function sol(T) {
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sen(M) + (0.019993 - 0.000101 * T) * sen(2 * M) + 0.000289 * sen(3 * M);
  const nu = M + C;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cos(nu));
  return { lambda: norm360(L0 + C), beta: 0, distancia: R * 149597870.7 };
}

// Meeus, tabla 47.A: [D, M, M', F, Σl (1e-6 °), Σr (1e-3 km)]
const TABLA_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
];
// Meeus, tabla 47.B: [D, M, M', F, Σb (1e-6 °)]
const TABLA_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
];

/** Luna geocéntrica: longitud y latitud eclípticas de la fecha (°) y distancia (km). */
function luna(T) {
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  const A3 = 313.45 + 481266.484 * T;
  const factorE = (m) => (Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E * E : 1);
  let sl = 0;
  let sr = 0;
  let sb = 0;
  for (const [d, m, mp, f, l, r] of TABLA_LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    sl += l * factorE(m) * sen(arg);
    sr += r * factorE(m) * cos(arg);
  }
  for (const [d, m, mp, f, b] of TABLA_B) {
    sb += b * factorE(m) * sen(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sen(A1) + 1962 * sen(Lp - F) + 318 * sen(A2);
  sb += -2235 * sen(Lp) + 382 * sen(A3) + 175 * sen(A1 - F) + 175 * sen(A1 + F) + 127 * sen(Lp - Mp) - 115 * sen(Lp + Mp);
  return { lambda: norm360(Lp + sl / 1e6), beta: sb / 1e6, distancia: 385000.56 + sr / 1000 };
}

/** Eclíptica de la fecha → ecuatorial J2000 (vector en km). */
function eclipticaAJ2000({ lambda, beta, distancia }, T) {
  const pA = (5029.0966 * T + 1.11113 * T * T) / 3600;
  const l = lambda - pA;
  const eps = 23.4392911;
  const x = cos(beta) * cos(l);
  const y = cos(beta) * sen(l);
  const z = sen(beta);
  return [x * distancia, (y * cos(eps) - z * sen(eps)) * distancia, (y * sen(eps) + z * cos(eps)) * distancia];
}

/** Orientación IAU de la Luna: polo (α0, δ0) y meridiano W (°) para `d` días TDB desde J2000. */
function orientacionLuna(d) {
  const T = d / 36525;
  const E = [
    125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.064993 * d, 276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ];
  const s = (i) => sen(E[i - 1]);
  const c = (i) => cos(E[i - 1]);
  const a0 = 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.07 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13);
  const d0 = 66.5392 + 0.013 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13);
  const W = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4) + 0.0252 * s(5) - 0.0066 * s(6) - 0.0047 * s(7) - 0.0046 * s(8) + 0.0028 * s(9) + 0.0052 * s(10) + 0.004 * s(11) + 0.0019 * s(12) - 0.0044 * s(13);
  return { a0, d0, W };
}

const mul = (A, v) => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
const mulM = (A, B) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
const rotZ = (g) => [[cos(g), sen(g), 0], [-sen(g), cos(g), 0], [0, 0, 1]];
const rotX = (g) => [[1, 0, 0], [0, cos(g), sen(g)], [0, -sen(g), cos(g)]];
const resta = (a, b) => a.map((x, i) => x - b[i]);
const largo = (a) => Math.hypot(...a);
const unit = (a) => a.map((x) => x / largo(a));
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Matriz J2000 → horizonte local del sitio (filas: este, norte, cénit). */
function matrizHorizonte(d) {
  const { a0, d0, W } = orientacionLuna(d);
  const cuerpo = mulM(rotZ(W), mulM(rotX(90 - d0), rotZ(90 + a0)));
  const { lat, lon } = SITIO;
  const este = [-sen(lon), cos(lon), 0];
  const norte = [-sen(lat) * cos(lon), -sen(lat) * sen(lon), cos(lat)];
  const cenit = [cos(lat) * cos(lon), cos(lat) * sen(lon), sen(lat)];
  return mulM([este, norte, cenit], cuerpo);
}

function altAz(enu) {
  const u = unit(enu);
  return [Math.asin(u[2]) / RAD, norm360(Math.atan2(u[0], u[1]) / RAD)];
}

function calcular(fechaUtc) {
  const jdTT = diaJuliano(fechaUtc) + DELTA_T_S / 86400;
  const d = jdTT - 2451545.0;
  const T = d / 36525;
  const H = matrizHorizonte(d);
  const pLuna = eclipticaAJ2000(luna(T), T);
  const pSol = eclipticaAJ2000(sol(T), T);
  // Posición del sitio en J2000 (km): centro de la Luna + radio en la dirección del cénit local.
  const cenitJ2000 = [H[2][0], H[2][1], H[2][2]];
  const sitio = pLuna.map((x, i) => x + cenitJ2000[i] * RADIO_LUNA_KM);
  const haciaSol = resta(pSol, sitio);
  const haciaTierra = resta([0, 0, 0], sitio);
  // Fase de la Tierra vista desde la Luna: ángulo Sol–Tierra–Luna.
  const anguloFase = Math.acos(punto(unit(pSol), unit(pLuna))) / RAD;
  return {
    H,
    sol: altAz(mul(H, haciaSol)),
    tierra: altAz(mul(H, haciaTierra)),
    distanciaTierraKm: largo(haciaTierra),
    radioAngularTierraGrados: Math.asin(RADIO_TIERRA_KM / largo(haciaTierra)) / RAD,
    anguloFaseTierraGrados: anguloFase,
    fraccionIluminadaTierra: (1 + cos(anguloFase)) / 2,
  };
}

const f = (x) => x.toFixed(2).padStart(7);
console.log('Evento          | Sol alt/az (calc)  | Sol ALSJ        | Tierra alt/az (calc) | Tierra ALSJ');
for (const c of CONTRASTE) {
  const r = calcular(c.utc);
  console.log(`${c.evento.padEnd(15)} | ${f(r.sol[0])} ${f(r.sol[1])} | ${f(c.sol[0])} ${f(c.sol[1])} | ${f(r.tierra[0])} ${f(r.tierra[1])}   | ${f(c.tierra[0])} ${f(c.tierra[1])}`);
}

/** Instante de la escena: 1 h después del inicio de la EVA-1, con el LRV recién desplegado junto al LM (ver src/visual/cielo.ts). */
const ESCENA_UTC = '1972-12-12T00:54:49Z';
const e = calcular(ESCENA_UTC);
console.log(`\nEscena ${ESCENA_UTC}`);
console.log(`  Sol    alt ${e.sol[0].toFixed(2)}°  az ${e.sol[1].toFixed(2)}°`);
console.log(`  Tierra alt ${e.tierra[0].toFixed(2)}°  az ${e.tierra[1].toFixed(2)}°  distancia ${e.distanciaTierraKm.toFixed(0)} km  radio angular ${e.radioAngularTierraGrados.toFixed(3)}°`);
console.log(`  Fase de la Tierra: ángulo ${e.anguloFaseTierraGrados.toFixed(1)}°, fracción iluminada ${(e.fraccionIluminadaTierra * 100).toFixed(1)} %`);
console.log('  Matriz J2000 → (este, norte, cénit):');
for (const fila of e.H) console.log('   ', fila.map((x) => x.toFixed(6)).join(', '));

const catalogo = process.argv[2];
if (catalogo) {
  const datos = JSON.parse(readFileSync(catalogo, 'utf8'));
  const MAG_MAX = 5.0;
  const estrellas = datos.features
    .filter((s) => s.properties.mag <= MAG_MAX)
    .map((s) => {
      const [lon, dec] = s.geometry.coordinates;
      const ar = norm360(lon);
      const bv = Number.parseFloat(s.properties.bv);
      return [ar, dec, s.properties.mag, Number.isFinite(bv) ? bv : 0.6];
    })
    .sort((a, b) => a[2] - b[2]);
  const plano = estrellas.flatMap(([ar, dec, mag, bv]) => [ar.toFixed(3), dec.toFixed(3), mag.toFixed(2), bv.toFixed(2)]);
  const lineas = [];
  for (let i = 0; i < plano.length; i += 24) lineas.push('  ' + plano.slice(i, i + 24).join(','));
  const ts = `// Generado por scripts/efemerides-apollo17.mjs: no editar a mano.
// Estrellas de magnitud ≤ ${MAG_MAX} del catálogo Hipparcos (J2000), tomadas de d3-celestial (data/stars.6.json, BSD-3).
// Cuatro números por estrella: ascensión recta (°), declinación (°), magnitud visual e índice de color B−V.
// ${estrellas.length} estrellas, ordenadas de más a menos brillante.

export const ESTRELLAS_J2000: readonly number[] = [
${lineas.join(',\n')},
];
`;
  writeFileSync(new URL('../src/visual/cieloEstrellas.ts', import.meta.url), ts);
  console.log(`\n${estrellas.length} estrellas escritas en src/visual/cieloEstrellas.ts`);
}
