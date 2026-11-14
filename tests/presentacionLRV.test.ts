// Pruebas de la presentación del LRV (src/game/presentacionLRV.ts): guion, duración, voz y saltar.
// Ejecutar: node --test tests/presentacionLRV.test.ts  (Node 22.6+ quita los tipos de forma nativa; sin dependencias).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DISTANCIA_A_PIE_KM,
  DISTANCIA_LRV_KM,
  GUION,
  MARGEN_VOZ_S,
  PRIMERA_ESCENA_SALTABLE,
  PresentacionLRV,
  RelojNarrado,
  SEGUNDOS_LISTO,
  TRAMO_LISTO,
  duracionMinimaS,
  infoNarracion,
  mandoEn,
  movimientoAmbiente,
  movimientoEn,
  poseEn,
  tramoParaIdioma,
  type EventoPresentacion,
  type Toma,
  type Tramo,
} from '../src/game/presentacionLRV.ts';
import { parsearGuion, quitarCues } from '../src/audio/guion.ts';

const es = JSON.parse(readFileSync(new URL('../src/i18n/es.json', import.meta.url), 'utf8')) as Record<string, string>;
const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;

/** Avanza la presentación a pasos de `dt` hasta `fin` segundos; la voz termina `vozS` s después de cada frase. */
function recorrer(p: PresentacionLRV, opciones: { vozS?: number | null; dt?: number; hastaS?: number } = {}): { eventos: EventoPresentacion[]; s: number } {
  const { vozS = 1, dt = 0.05, hastaS = 300 } = opciones;
  const eventos: EventoPresentacion[] = [...p.iniciar()];
  let finVoz = vozS === null ? Infinity : vozS;
  let s = 0;
  while (s < hastaS && p.fase !== 'terminada') {
    s += dt;
    finVoz -= dt;
    if (finVoz <= 0) {
      p.terminoVoz();
      finVoz = Infinity;
    }
    for (const e of p.actualizar(dt)) {
      eventos.push(e);
      if ((e.tipo === 'tramo' || e.tipo === 'listo') && vozS !== null) finVoz = vozS;
    }
  }
  return { eventos, s };
}

test('el orden de las escenas es el pedido: introducción, peso, distancias, chasis, ruedas, electrónica, energía, mando y cierre', () => {
  assert.deepEqual(
    GUION.map((e) => e.id),
    ['introduccion', 'peso', 'distancias', 'chasis', 'ruedas', 'electronica', 'energia', 'mando', 'cierre'],
  );
});

test('el guion nominal de cada tramo con voz mide lo que tarda su frase en español (±20 %, a 15 caracteres por segundo)', () => {
  for (const escena of GUION) {
    for (const tramo of escena.tramos) {
      if (!tramo.narracion) continue;
      const frase = parsearGuion(es[tramo.narracion]).texto.length / 15;
      assert.ok(Math.abs(tramo.minS - frase) <= 0.2 * frase, `${escena.id}/${tramo.narracion}: guion ${tramo.minS} s, frase ${frase.toFixed(1)} s`);
    }
  }
  assert.ok(duracionMinimaS() > 100);
});

test('no hay asientos en la presentación', () => {
  for (const escena of GUION) for (const tramo of escena.tramos) for (const m of tramo.marcas) assert.notEqual(m.resalte, 'asientos');
  assert.equal(es.pres_asientos, undefined);
});

test('los trazos de distancias guardan la proporción 3.45 km / 36 km y el largo se dibuja más rápido', () => {
  const tramo = GUION.find((e) => e.id === 'distancias')!.tramos[0];
  assert.ok(tramo.trazos);
  const [cd, ch] = tramo.trazos!.corto;
  const [ld, lh] = tramo.trazos!.largo;
  assert.ok(ld >= ch - 0.5, 'el largo empieza cuando termina el corto');
  // Velocidad relativa: largo (36 km) en lh-ld s frente a corto (3.45 km) en ch-cd s.
  assert.ok(DISTANCIA_LRV_KM / (lh - ld) > DISTANCIA_A_PIE_KM / (ch - cd));
  assert.match(es.rot_con_lrv, /36 km/);
});

test('mando: interruptor y movimiento del LRV (adelante avanza, a un lado gira, atrás frena, interruptor + atrás retrocede)', () => {
  const tramo = GUION.find((e) => e.id === 'mando')!.tramos[0];
  const poses = tramo.mando!;
  // Tras empujar adelante, el LRV ha avanzado (z negativo) y va rápido.
  const a = movimientoEn(poses, 7.3);
  assert.ok(a.z < -1 && a.v > 1);
  // A un lado: el rumbo cambia hacia la derecha (negativo) mientras sigue avanzando.
  const g0 = movimientoEn(poses, 7.9);
  const g1 = movimientoEn(poses, 9);
  assert.ok(g1.rumbo < g0.rumbo - 0.1 && g1.z < g0.z);
  // Atrás sin interruptor frena: la velocidad baja a cero y no retrocede.
  const f = movimientoEn(poses, 11.3);
  assert.ok(f.v >= 0 && f.v < 0.05);
  assert.equal(mandoEn(poses, 12.5).interruptor, 0);
  // Con el interruptor activado, atrás es marcha atrás.
  assert.ok(mandoEn(poses, 14).interruptor > 0.9);
  const r0 = movimientoEn(poses, 15);
  const r1 = movimientoEn(poses, 16.4);
  assert.ok(r1.v < 0 && r1.z > r0.z);
  // Es determinista: no depende del paso.
  assert.ok(Math.abs(movimientoEn(poses, 9, 1 / 30).z - movimientoEn(poses, 9, 1 / 120).z) < 0.05);
  // Marcas de la marcha atrás en la mitad derecha.
  assert.ok(tramo.marcas.some((m) => m.rotulo === 'rot_marcha_atras' && m.vista === 'derecha' && m.desde === 13));
});

test('todas las frases y rótulos existen en español y en inglés', () => {
  for (const escena of GUION) {
    for (const tramo of escena.tramos) {
      const claves = [tramo.narracion, ...tramo.marcas.map((m) => m.rotulo)].filter((c): c is NonNullable<typeof c> => c !== null);
      for (const clave of claves) {
        assert.ok(es[clave], `falta ${clave} en es.json`);
        assert.ok(en[clave], `falta ${clave} en en.json`);
      }
    }
  }
  for (const clave of ['pres_listo', 'pres_peso_tierra', 'pres_peso_luna', 'pres_peso_masa', 'pres_ayuda', 'pres_ayuda_intro']) {
    assert.ok(es[clave] && en[clave], clave);
  }
});

test('las cifras y el mando en T dicen lo mismo que la fuente', () => {
  assert.match(es.pres_peso, /460 libras/);
  assert.match(es.pres_peso, /76/);
  assert.match(en.pres_peso, /mass does not change/);
  assert.match(es.pres_intro, /Apolo 15, 16 y 17/);
  // El mando en T: hacia atrás frena; la marcha atrás va con un interruptor (NSSDC).
  assert.match(es.pres_mando_movimientos, /hacia atrás para frenar/);
  assert.match(es.pres_mando_movimientos, /interruptor/);
  assert.match(es.pres_navegacion, /giroscopio/);
  assert.match(es.rot_navegacion, /Giroscopio y odómetro/);
});

test('ningún movimiento grande de cámara es un latigazo: más de 25° de giro, 1 m de distancia o 0.8 m de mira tardan 1.5 s del guion o más', () => {
  const grande = (a: Toma, b: Toma): boolean =>
    Math.abs(b.az - a.az) > 25 || (Math.abs(b.dist - a.dist) > 1 && a.dist > 0) || Math.hypot(b.mira[0] - a.mira[0], b.mira[1] - a.mira[1], b.mira[2] - a.mira[2]) > 0.8;
  for (const escena of GUION) {
    for (const tramo of escena.tramos) {
      const tomas = [...tramo.tomas, ...(tramo.division?.derecha ?? []), ...(tramo.division?.izquierda ?? [])];
      for (let i = 1; i < tomas.length; i++) {
        if (tomas[i].t <= tomas[i - 1].t) continue; // alternativas de un idioma u otro
        if (grande(tomas[i - 1], tomas[i]) && tomas[i].ancla === undefined && tomas[i - 1].ancla === undefined && tramo.tomas.length > 0) {
          assert.ok(tomas[i].t - tomas[i - 1].t >= 1.5, `${escena.id}: movimiento de ${tomas[i].t - tomas[i - 1].t} s hacia t=${tomas[i].t}`);
        }
      }
    }
  }
});

test('recorre todos los tramos en orden, dice "listo" y termina', () => {
  const p = new PresentacionLRV();
  const { eventos, s } = recorrer(p);
  const tramos = eventos.filter((e) => e.tipo === 'tramo');
  const total = GUION.reduce((n, e) => n + e.tramos.length, 0);
  assert.equal(tramos.length, total);
  assert.deepEqual(
    eventos.filter((e) => e.tipo !== 'tramo').map((e) => e.tipo),
    ['listo', 'fin'],
  );
  // Cada frase dura 1 s (voz simulada) más la pausa y el fundido de su escena; "listo" espera SEGUNDOS_LISTO.
  assert.ok(s >= SEGUNDOS_LISTO + total * 1.6);
  assert.ok(s <= SEGUNDOS_LISTO + total * 1.6 + GUION.length * 0.6 + 1);
});

test('un tramo espera a que termine su frase', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  const min = GUION[0].tramos[0].minS;
  // La voz dura 3 s más que el tramo: no pasa al siguiente hasta que termina.
  const eventos: EventoPresentacion[] = [];
  for (let s = 0; s < min + 3; s += 0.05) eventos.push(...p.actualizar(0.05));
  assert.equal(p.escena, 0);
  p.terminoVoz();
  for (let s = 0; s < 1.4; s += 0.05) eventos.push(...p.actualizar(0.05));
  assert.equal(p.escena, 1);
});

test('sin voz (nunca llega el fin), la presentación no se queda parada', () => {
  const p = new PresentacionLRV();
  const { eventos } = recorrer(p, { vozS: null, hastaS: 2000 });
  assert.equal(eventos.at(-1)?.tipo, 'fin');
  assert.equal(p.fase, 'terminada');
  assert.ok(MARGEN_VOZ_S > 0);
});

test('la introducción no se puede saltar; después, saltar va a "listo"', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  assert.equal(p.saltable, false);
  assert.equal(p.saltar(), false);
  p.terminoVoz();
  while (p.escena < PRIMERA_ESCENA_SALTABLE) p.actualizar(0.05);
  assert.equal(p.saltable, true);
  assert.equal(p.saltar(), true);
  assert.deepEqual(p.actualizar(0.05).map((e) => e.tipo), ['listo']);
  assert.equal(p.saltar(), false);
});

test('forzarFinal (sin escena 3D) va a "listo" y luego a "fin"', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  assert.deepEqual(p.forzarFinal().map((e) => e.tipo), ['listo']);
  p.terminoVoz();
  let fin = false;
  for (let s = 0; s < SEGUNDOS_LISTO + 1; s += 0.05) fin ||= p.actualizar(0.05).some((e) => e.tipo === 'fin');
  assert.ok(fin);
});

test('el fundido oscurece al final de una escena y aclara al empezar la siguiente', () => {
  const p = new PresentacionLRV();
  p.iniciar();
  p.terminoVoz();
  assert.equal(p.fundido, 0);
  while (p.fase === 'tramo') p.actualizar(0.05);
  assert.equal(p.fase, 'salida');
  p.actualizar(0.25);
  assert.ok(p.fundido > 0.3 && p.fundido < 0.7);
  while (p.fase === 'salida') p.actualizar(0.05);
  assert.equal(p.escena, 1);
  assert.ok(p.fundido > 0.5);
  p.actualizar(0.6);
  assert.equal(p.fundido, 0);
});

test('poseEn: interpola con ease-in-out, por el camino corto del azimut, y sale de la pose previa', () => {
  const tomas = [
    { t: 0, az: 170, el: 10, dist: 4, mira: [0, 0, 0] as const },
    { t: 2, az: -170, el: 30, dist: 2, mira: [1, 1, 1] as const },
  ];
  const medio = poseEn(tomas, 1, null);
  assert.ok(Math.abs(Math.abs(medio.az) - 180) < 1e-6);
  assert.ok(Math.abs(medio.el - 20) < 1e-6);
  assert.deepEqual(poseEn(tomas, 5, null).mira, [1, 1, 1]);
  const previa = { t: 0, az: 0, el: 0, dist: 10, mira: [0, 0, 0] as const };
  const conPrevia = poseEn([{ t: 2, az: 90, el: 0, dist: 10, mira: [0, 0, 0] }], 0, previa);
  assert.equal(conPrevia.az, 0);
});

// ---------------------------------------------------------------------------
// Sincronía con la voz: el guion se ajusta a la duración real de cada frase, en cada idioma
// ---------------------------------------------------------------------------

type Textos = Record<string, string>;
interface Muestra {
  t: number;
  nu: number;
  pose: Toma;
}
interface RegistroTramo {
  clave: string;
  tramo: Tramo;
  muestras: Muestra[];
  /** Instantes (s del tramo) de inicio de la voz, del fin de la voz y de cada marca de plano. */
  vozInicio: number;
  vozFin: number;
  marcas: { id: string; t: number }[];
  /** Instante (s del tramo) en que terminó el tramo. */
  fin: number;
}

/**
 * Recorre la presentación como lo hace juego.ts, con una voz simulada de `cps` caracteres por segundo (más una pausa en
 * cada frase) que dice las marcas de plano de `textos` en su palabra. `marcasPerdidas`: la voz no avisa de las marcas.
 */
function simular(textos: Textos, cps: number, opciones: { marcasPerdidas?: boolean; hastaEscena?: number } = {}): RegistroTramo[] {
  const p = new PresentacionLRV();
  const registros: RegistroTramo[] = [];
  const dt = 1 / 60;
  let actual: RegistroTramo | null = null;
  let plan: { vozInicio: number; marcas: { id: string; t: number }[]; vozFin: number; dicho: number; empezo: boolean; fin: boolean } | null = null;
  let previa: Toma | null = null;
  let ultimaPose: Toma | null = null;
  let tramoAnterior: Tramo | null = null;
  const empezar = (escena: number, nTramo: number): void => {
    const tramo = GUION[escena].tramos[nTramo];
    const clave = tramo.narracion!;
    const guion = parsearGuion(textos[clave]);
    p.fijarNarracion(infoNarracion(guion));
    // Cada frase añade una pausa de 0.25 s antes de empezar, salvo la primera.
    const frases = guion.frases;
    const tiempoDe = (pos: number): number => {
      const n = frases.filter((f) => f.inicio <= pos).length - 1;
      return 0.5 + pos / cps + Math.max(0, n) * 0.25;
    };
    const marcas: { id: string; t: number }[] = [];
    for (const w of guion.palabras) for (const id of w.planos) marcas.push({ id, t: tiempoDe(w.inicio) });
    plan = { vozInicio: 0.5, marcas, vozFin: tiempoDe(guion.texto.length), dicho: 0, empezo: false, fin: false };
    actual = { clave, tramo: p.tramoActual!, muestras: [], vozInicio: plan.vozInicio, vozFin: plan.vozFin, marcas, fin: 0 };
    registros.push(actual);
  };
  let eventos = p.iniciar();
  for (let paso = 0; paso < 60 * 400 && p.fase !== 'terminada'; paso++) {
    for (const e of eventos) {
      if (e.tipo === 'tramo') {
        if (opciones.hastaEscena !== undefined && e.escena > opciones.hastaEscena) return registros;
        empezar(e.escena, e.tramo);
      } else if (e.tipo === 'listo') {
        p.terminoVoz();
      }
    }
    if (p.fase === 'tramo' && plan && actual) {
      const t = p.tiempoTramo;
      if (!plan.empezo && t >= plan.vozInicio) {
        plan.empezo = true;
        p.vozEmpezo();
      }
      while (!opciones.marcasPerdidas && plan.dicho < plan.marcas.length && t >= plan.marcas[plan.dicho].t) p.planoDicho(plan.marcas[plan.dicho++].id);
      if (!plan.fin && t >= plan.vozFin) {
        plan.fin = true;
        p.terminoVoz();
      }
      const tramo = p.tramoActual!;
      if (tramo !== tramoAnterior) {
        previa = ultimaPose;
        tramoAnterior = tramo;
      }
      const pose = poseEn(tramo.tomas, p.tiempoNominal, previa);
      ultimaPose = pose;
      actual.muestras.push({ t, nu: p.tiempoNominal, pose });
      actual.fin = t;
    }
    eventos = p.actualizar(dt);
  }
  return registros;
}

/** Cuánto se movió la cámara entre dos poses, en proporción a lo lejos que está: giros en radianes y distancia y mira relativas. */
function movimientoRelativo(a: Toma, b: Toma): number {
  const rad = Math.PI / 180;
  let daz = Math.abs(b.az - a.az) % 360;
  if (daz > 180) daz = 360 - daz;
  const mira = Math.hypot(b.mira[0] - a.mira[0], b.mira[1] - a.mira[1], b.mira[2] - a.mira[2]);
  return daz * rad + Math.abs(b.el - a.el) * rad + Math.abs(b.dist - a.dist) / a.dist + mira / a.dist;
}

const idiomas: [string, Textos][] = [['es', es], ['en', en]];
const voces = [11, 15, 21];

test('las marcas de plano del texto existen en el guion, en el mismo orden, y cada ancla de una toma o marca está definida', () => {
  for (const [nombre, textos] of idiomas) {
    for (const escena of GUION) {
      for (const tramo of escena.tramos) {
        const ids = new Set((tramo.anclas ?? []).map((a) => a.id));
        const guionTexto = tramo.narracion ? parsearGuion(textos[tramo.narracion]) : null;
        const enTexto = guionTexto?.palabras.flatMap((w) => w.planos.map((id) => ({ id, pos: w.inicio }))) ?? [];
        for (const m of enTexto) assert.ok(ids.has(m.id), `${nombre}/${tramo.narracion}: la marca {@${m.id}} no está en las anclas del tramo`);
        // El orden del guion es el del texto.
        const orden = [...(tramo.anclas ?? [])].sort((x, y) => x.t - y.t).map((a) => a.id).filter((id) => enTexto.some((m) => m.id === id));
        assert.deepEqual(orden, enTexto.map((m) => m.id), `${nombre}/${tramo.narracion}: orden de las marcas`);
        for (const x of [...tramo.tomas, ...tramo.marcas]) {
          if (x.ancla) assert.ok(ids.has(x.ancla.replace(/^!/, '')), `ancla ${x.ancla} sin definir en ${escena.id}`);
        }
      }
    }
  }
  // Las marcas no se ven en el texto.
  assert.equal(quitarCues(es.pres_ruedas), es.pres_ruedas.replace(/\{@[a-z0-9_]+\}/g, ''));
  assert.ok(!t_sinMarcas(es.pres_ruedas).includes('{@'));
});
const t_sinMarcas = (x: string): string => quitarCues(x);

test('sin la marca de un idioma, sus tomas y rótulos desaparecen (inglés: sin "Diseñadas para rodar" no hay plano abierto de las ruedas)', () => {
  const tramo = GUION.find((e) => e.id === 'ruedas')!.tramos[0];
  const esT = tramoParaIdioma(tramo, new Set(['malla', 'chevrones', 'disenadas']));
  const enT = tramoParaIdioma(tramo, new Set(['malla', 'chevrones']));
  assert.ok(esT.tomas.some((x) => x.dist > 5));
  assert.ok(!enT.tomas.some((x) => x.dist > 5));
  assert.equal(enT.tomas.at(-1)!.t, tramo.minS, 'en inglés la última toma sigue llegando al final del guion');
  assert.equal(esT.marcas.filter((m) => m.resalte === 'chevrones').length, 1);
  assert.equal(enT.marcas.filter((m) => m.resalte === 'chevrones').length, 1);
});

for (const [nombre, textos] of idiomas) {
  for (const cps of voces) {
    test(`[${nombre}, voz a ${cps} caracteres/s] cada plano cae en su palabra y el movimiento termina con la frase`, () => {
      const registros = simular(textos, cps);
      assert.equal(registros.length, GUION.reduce((n, e) => n + e.tramos.length, 0));
      registros.forEach((r, i) => {
        const etiqueta = `${nombre}/${r.clave}`;
        // El guion avanza siempre hacia delante.
        for (let k = 1; k < r.muestras.length; k++) assert.ok(r.muestras[k].nu >= r.muestras[k - 1].nu - 1e-9, `${etiqueta}: el guion retrocede`);
        // Al terminar el tramo (voz + pausa), el guion ha llegado a su último instante.
        const ultima = r.muestras.at(-1)!;
        assert.ok(ultima.nu >= r.tramo.minS - 0.6, `${etiqueta}: terminó en ${ultima.nu.toFixed(2)} de ${r.tramo.minS} s del guion`);
        // El tramo dura lo que la voz más la pausa: ni antes ni mucho después.
        assert.ok(r.fin >= r.vozFin && r.fin <= r.vozFin + 0.8, `${etiqueta}: terminó ${(r.fin - r.vozFin).toFixed(2)} s después de la voz`);
        // Cada marca: cuando suena su palabra, el guion está en su instante (la primera frase de cada idioma calibra el ritmo).
        // El margen es el de lo que el guion corre durante el suavizado del reloj (0.3 s), más lo que se equivoque la previsión.
        const calibrado = i > 0;
        for (const m of r.marcas) {
          const ancla = r.tramo.anclas?.find((a) => a.id === m.id);
          if (!ancla) continue;
          const sigue = r.muestras.find((x) => x.t >= m.t);
          if (!sigue) continue;
          const ritmoGuion = (r.tramo.minS - ancla.t) / Math.max(0.5, r.vozFin - m.t);
          const tolerancia = (calibrado ? 0.6 : 1.5) + 0.5 * ritmoGuion;
          assert.ok(Math.abs(sigue.nu - ancla.t) <= tolerancia, `${etiqueta}: {@${m.id}} a ${sigue.nu.toFixed(2)} s del guion en vez de ${ancla.t}`);
        }
      });
    });

    test(`[${nombre}, voz a ${cps} caracteres/s] la cámara no da saltos y no está quieta más de 1 s mientras habla el narrador`, () => {
      const registros = simular(textos, cps);
      for (const r of registros) {
        const etiqueta = `${nombre}/${r.clave}`;
        const seleccion = r.tramo.tomas.length > 0;
        if (!seleccion) continue; // la escena del mando usa la vista dividida (se prueba aparte)
        // Sin latigazos (60 fotogramas por segundo): como mucho 150°/s de giro y 3.5 veces la distancia a la cámara por segundo.
        for (let k = 1; k < r.muestras.length; k++) {
          const a = r.muestras[k - 1].pose;
          const b = r.muestras[k].pose;
          let giro = Math.abs(b.az - a.az) % 360;
          if (giro > 180) giro = 360 - giro;
          giro = ((giro + Math.abs(b.el - a.el)) * Math.PI) / 180;
          const traslado = movimientoRelativo(a, b) - giro;
          assert.ok(giro * 60 <= (150 * Math.PI) / 180, `${etiqueta}: giro de ${((giro * 60 * 180) / Math.PI).toFixed(0)}°/s en t=${r.muestras[k].t.toFixed(2)}`);
          assert.ok(traslado * 60 <= 3.5, `${etiqueta}: traslado de ${(traslado * 60).toFixed(1)}/s en t=${r.muestras[k].t.toFixed(2)}`);
        }
        // Quieta no: en cualquier ventana de 1 s de narración, la toma se mueve algo (sin contar el movimiento de fondo).
        const desde = r.vozInicio;
        const hasta = r.vozFin;
        for (let t = desde; t + 1 <= hasta; t += 0.25) {
          const a = r.muestras.find((x) => x.t >= t)!;
          const b = r.muestras.find((x) => x.t >= t + 1)!;
          assert.ok(movimientoRelativo(a.pose, b.pose) >= 0.0015, `${etiqueta}: cámara quieta entre ${t.toFixed(2)} y ${(t + 1).toFixed(2)} s`);
        }
      }
    });
  }

  test(`[${nombre}] si la voz no avisa de las marcas, el guion sigue su previsión y termina igual`, () => {
    const registros = simular(textos, 15, { marcasPerdidas: true });
    for (const r of registros) {
      const ultima = r.muestras.at(-1)!;
      assert.ok(ultima.nu >= r.tramo.minS - 0.8, `${nombre}/${r.clave}: terminó en ${ultima.nu.toFixed(2)} de ${r.tramo.minS}`);
    }
  });
}

test('el reloj aprende el ritmo de la voz: tras una frase lenta, prevé las siguientes más largas', () => {
  const p = new PresentacionLRV();
  const antes = p.segundosPorCaracter;
  simular(es, 8, { hastaEscena: 3 });
  const q = new PresentacionLRV();
  assert.equal(q.segundosPorCaracter, antes);
  // El reloj de un tramo, con ritmo propio, corrige su previsión en cuanto una marca llega tarde.
  const ritmo = { segPorCaracter: 1 / 15 };
  const tramo = GUION.find((e) => e.id === 'ruedas')!.tramos[0];
  const guion = parsearGuion(es.pres_ruedas);
  const reloj = new RelojNarrado(tramo, infoNarracion(guion), ritmo);
  reloj.vozEmpezo(0.5);
  for (let t = 0; t < 4.4; t += 1 / 60) reloj.actualizar(1 / 60, t);
  reloj.planoDicho('malla', 4.5);
  assert.ok(ritmo.segPorCaracter > 1 / 15, 'la voz va más lenta que la prevista y el ritmo sube');
});

test('Enter: saltar lleva al plano final (revelación), sin errores y sin pasar de nuevo por la animación, también en inglés', () => {
  for (const textos of [es, en]) {
    const p = new PresentacionLRV();
    p.iniciar();
    p.terminoVoz();
    while (p.escena < 4) p.actualizar(0.05);
    p.fijarNarracion(infoNarracion(parsearGuion(textos[GUION[4].tramos[0].narracion!])));
    for (let s = 0; s < 1; s += 0.05) p.actualizar(0.05);
    assert.ok(p.saltar());
    const eventos = p.actualizar(0.05);
    assert.deepEqual(eventos.map((e) => e.tipo), ['listo']);
    assert.equal(p.tramoActual, TRAMO_LISTO);
    assert.equal(p.tiempoNominal, p.tiempoTramo);
    // El plano final empieza donde terminó la escena de cierre (el LRV en el borde del cráter) y la cámara no se para.
    const cierre = GUION.at(-1)!.tramos[0];
    const ultimaToma = cierre.tomas.at(-1)!;
    const primera = TRAMO_LISTO.tomas[0];
    assert.equal(movimientoRelativo(ultimaToma, primera), 0);
    assert.equal(TRAMO_LISTO.avance!.metros, cierre.avance!.metros);
    for (let t = 0; t < 8; t += 1) {
      assert.ok(movimientoRelativo(poseEn(TRAMO_LISTO.tomas, t, null), poseEn(TRAMO_LISTO.tomas, t + 1, null)) >= 0.003, `plano final quieto en t=${t}`);
    }
    p.terminoVoz();
    let fin = false;
    for (let s = 0; s < SEGUNDOS_LISTO + 1; s += 0.05) fin ||= p.actualizar(0.05).some((e) => e.tipo === 'fin');
    assert.ok(fin);
  }
});

test('el último plano de la animación es una revelación: la cámara se abre hasta ver el LRV entero y el terreno', () => {
  const cierre = GUION.at(-1)!.tramos[0];
  const primera = cierre.tomas[0];
  const ultima = cierre.tomas.at(-1)!;
  assert.ok(ultima.dist >= primera.dist * 1.5 && ultima.el > primera.el, 'plano más abierto y más alto');
  assert.equal(ultima.t, cierre.minS, 'llega justo al final de la frase');
  assert.ok(GUION.at(-1)!.tramos[0].avance && GUION.at(-1)!.tramos[0].camaraSigueLRV);
});

test('movimiento de fondo: nunca se detiene y no pega saltos', () => {
  assert.deepEqual(movimientoAmbiente(0), { az: 0, el: 0, distRel: 1 });
  let prev = movimientoAmbiente(0);
  for (let t = 1 / 60; t < 60; t += 1 / 60) {
    const m = movimientoAmbiente(t);
    assert.ok(Math.abs(m.az - prev.az) < 0.1 && Math.abs(m.el - prev.el) < 0.05);
    prev = m;
  }
  for (let t = 0; t < 40; t += 0.5) {
    const a = movimientoAmbiente(t);
    const b = movimientoAmbiente(t + 1);
    assert.ok(Math.abs(b.az - a.az) + Math.abs(b.el - a.el) > 0.05, `quieto en t=${t}`);
  }
});

test('la primera toma de cada escena está en t=0 en los dos idiomas (la escena entra con un fundido, no con un barrido desde la anterior)', () => {
  for (const escena of GUION) {
    const primero = escena.tramos[0];
    if (primero.tomas.length === 0) continue; // vista dividida
    for (const activas of [new Set((primero.anclas ?? []).map((a) => a.id)), new Set<string>()]) {
      const efectivo = tramoParaIdioma(primero, activas);
      assert.equal(efectivo.tomas[0].t, 0, `${escena.id} con ${[...activas].join(',') || 'ninguna marca'}`);
    }
  }
});

test('la vista dividida del mando: la cámara de cada mitad tampoco está quieta', () => {
  const tramo = GUION.find((e) => e.id === 'mando')!.tramos[0];
  for (const camara of [tramo.division!.izquierda, tramo.division!.derecha]) {
    for (let t = 0; t + 1 <= tramo.minS; t += 0.5) {
      assert.ok(movimientoRelativo(poseEn(camara, t, null), poseEn(camara, t + 1, null)) >= 0.002, `quieta en t=${t}`);
    }
  }
});
