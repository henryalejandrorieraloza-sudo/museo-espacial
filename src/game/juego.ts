// Bucle principal del juego: pantalla de inicio (elección de control) → encuadre y calibración (solo con cámara)
// → museo y misiones (SPEC 2.1, 3, 7 y 8). Une la capa de entrada (input/), la lógica del museo (game/museo.ts),
// la misión lunar (game/luna.ts) y la interfaz (ui/). No sabe si las acciones vienen de la cámara o del teclado:
// en cada vuelta lee una LecturaEntrada y la reparte.

import { visual } from '../visual/museo';
import { crearVoz, dividirFrases, type Voz } from '../audio/voz';
import { cargarCatalogoVoz, type CatalogoVoz } from '../audio/lineaGrabada';
import { crearOyenteMentor } from './mentorVoz';
import { assetUrl } from '../tracking/assets';
import { alCambiarIdioma, idioma, LENGUA_VOZ, t, tGuion, type ClaveTexto } from '../i18n';
import { requireEl } from '../ui/dom';
import { crearCursor, type CursorUi } from '../ui/cursor';
import { crearInicioUi } from '../ui/inicioUi';
import { crearOpcionesUi } from '../ui/opcionesUi';
import { crearUi, type JuegoUi } from '../ui/juegoUi';
import { FuenteCamara } from '../input/camaraFuente';
import { FuenteTeclado } from '../input/tecladoFuente';
import type { FuenteEntrada, LecturaEntrada, Senal } from '../input/fuente';
import { cargarControl, cargarOpciones, guardarControl, guardarOpciones, type ModoControl, type Opciones } from './opciones';
import { Museo, type EventoMuseo } from './museo';
import { MisionLuna, metrosAPieLuna, type EntradaLuna, type EstadoLuna } from './luna';
import { DespliegueLRV } from './despliegueLRV';
import { SueloNaranja } from './sueloNaranja';
import { BalanceoCaminata, type EntradaBalanceo } from './balanceo';
import type { FaseDespliegueLRV } from '../visual/despliegueApollo17';
import { crearAnillo, type AnilloUi } from '../ui/anillo';
import { GUION, PresentacionLRV, opacidadMarca, type EventoPresentacion } from './presentacionLRV';
import { crearPresentacionUi, type PresentacionUi, type RotuloUi } from '../ui/presentacionUi';
import { CinematicaDespegue, borrarProgresoDespegue, cargarProgresoDespegue, type EventoCinematica } from './cinematicaDespegue';
import { crearCinematicaUi, type CinematicaUi } from '../ui/cinematicaUi';
import { DURACION_DESPLIEGUE_LRV_S } from '../visual/despliegueApollo17';
import { LRV_DESPEGUE } from '../visual/sitioApollo17';

/** Misión lunar activa (SPEC 8). Solo existe mientras la pantalla es la escena de Luna. */
let mision: MisionLuna | null = null;
/** Despliegue del LRV de la misión lunar activa: empieza plegado en la bahía del LM. */
let despliegue: DespliegueLRV | null = null;
/** Instante (s) de la última vuelta del despliegue: la animación avanza con el reloj, haya o no fotograma nuevo. */
let ultimoDespliegueS: number | null = null;
/** Suelo naranja de la estación 1 de la misión lunar activa (game/sueloNaranja.ts). */
let sueloNaranja: SueloNaranja | null = null;
/** Instante (s) de la última vuelta del suelo naranja, para su reloj (igual que el despliegue). */
let ultimoSueloS: number | null = null;
/**
 * La muestra del suelo naranja ya se recogió en esta sesión de la página: al volver a la misión el suelo sigue
 * hundido y sin halo ni avisos. Se pierde al recargar la página.
 */
let sueloRecogidoEnSesion = false;
/** La voz ya dijo que hay que mantener E para desplegar el LRV: hasta entonces, E no despliega. */
let instruccionDesplegarDicha = false;
/** Frases que solo se dicen una vez en la sesión de la página (ver decirUnaVez). */
const yaDichas = new Set<ClaveTexto>();
/** La voz ya dijo "Aprieta espacio para subirte" en esta visita: hasta entonces, el aplauso no sube al LRV. */
let subidaLista = false;
/** La voz ya explicó cómo conducir en esta visita: hasta entonces, caminar no mueve el LRV. */
let conduccionLista = false;
/** Tiempo máximo (s) que avanza el despliegue en una vuelta, para no saltar tras una pausa. */
const DT_MAX_DESPLIEGUE_S = 0.1;

/** Presentación del LRV en curso (entre la vitrina y la misión lunar), o null. */
let presentacion: PresentacionLRV | null = null;
/** Instante (s) de la última vuelta de la presentación: avanza con el reloj, haya o no fotograma de la cámara. */
let ultimaPresentacionS: number | null = null;
/** Frase de la presentación que está sonando: se vuelve a mostrar si se encienden los subtítulos con la tecla C. */
let frasePresentacion: string | null = null;
/** Desplazamiento del rótulo respecto a su pieza (px) cuando la marca no dice otro: encima. */
const ROTULO_ENCIMA_PX = [0, -80] as const;
/** Oscurecimiento del último plano mientras se ve "Estás listo para la misión". */
const OSCURO_LISTO = 0.35;

/** Cinemática del despegue del LM en curso (game/cinematicaDespegue.ts), o null. */
let cinematica: CinematicaDespegue | null = null;
/** Instante (s) de la última vuelta de la cinemática: avanza con el reloj, haya o no fotograma de la cámara. */
let ultimaCinematicaS: number | null = null;
/**
 * Se recargó la página con la cinemática a medias: segundo en que se reanuda al llegar a la Luna, o null. La partida
 * entra directo a la misión ya cumplida (LRV desplegado y muestra recogida) y la cinemática sigue desde ahí.
 */
let reanudarCinematicaS: number | null = null;

/** Control con el que se juega. Decide qué textos de ayuda se muestran (gesto o tecla). */
let modoControl: ModoControl = 'camara';

/** Frase de voz de cada estado de la misión. `entrando_museo` se dice al abrir la escena, no aquí. */
const FRASES_LUNA: Partial<Record<EstadoLuna, ClaveTexto>> = {
  sentado_en_LRV: 'luna_sentado_en_LRV',
  golpeando: 'luna_golpeando',
};

/**
 * Frase del mentor al empezar algunas fases del despliegue del LRV (secuencia real: visual/despliegueApollo17.ts).
 * Las fases cortas se cuentan junto con la siguiente, para que cada frase tenga tiempo de terminar.
 */
const FRASES_DESPLIEGUE: Partial<Record<FaseDespliegueLRV, ClaveTexto>> = {
  liberacion: 'luna_despliegue_liberacion',
  chasisTrasero: 'luna_despliegue_chasis',
  bajadaDelantera: 'luna_despliegue_bajada',
  preparacion: 'luna_despliegue_preparacion',
  pruebaManejo: 'luna_despliegue_prueba',
  carga: 'luna_despliegue_carga',
};
/** La frase de "LRV listo" espera a que el mentor termine la de la carga. */
let listoPendiente = false;

/** Con teclado, estos textos nombran la tecla en vez del gesto. */
const TEXTO_TECLADO: Partial<Record<ClaveTexto, ClaveTexto>> = {
  ayuda: 'ayuda_teclado',
  entrar_aplauso: 'entrar_teclado',
  luna_entrando_museo: 'luna_entrando_museo_teclado',
  luna_lejos_LRV: 'luna_lejos_LRV_teclado',
  luna_LRV_desplegado: 'luna_LRV_desplegado_teclado',
  luna_cerca_de_roca: 'luna_cerca_de_roca_teclado',
  luna_golpeando: 'luna_golpeando_teclado',
  luna_mision_salida: 'luna_mision_salida_teclado',
  luna_bajado: 'luna_bajado_teclado',
  luna_bajado_muestra: 'luna_bajado_muestra_teclado',
  luna_despegue_libre: 'luna_despegue_libre_teclado',
};

/** Texto según el control: con teclado usa la variante que nombra la tecla, si existe. */
function texto(clave: ClaveTexto): string {
  return t(modoControl === 'teclado' ? (TEXTO_TECLADO[clave] ?? clave) : clave);
}

/** Igual que `texto`, pero con las marcas de gesto del mentor: solo para pasarlo a la voz. */
function textoGuion(clave: ClaveTexto): string {
  return tGuion(modoControl === 'teclado' ? (TEXTO_TECLADO[clave] ?? clave) : clave);
}

/**
 * Última explicación del mentor con subtítulo. Sirve para volver a leerla al cambiar de idioma: si el mentor
 * aún habla, se repite en el idioma nuevo; si ya terminó, solo se traduce el subtítulo que sigue en pantalla.
 */
interface Habla {
  clave: ClaveTexto;
  alTerminar?: () => void;
  /** El subtítulo es el texto entero (no frase a frase). */
  completo: boolean;
  /** Índice de la última frase mostrada. */
  frase: number;
}
let habla: Habla | null = null;
/** El mentor está hablando ahora mismo (lo dice la sincronía de la voz). */
let mentorHablando = false;
/** Textos de pantalla que se calculan al mostrarlos: se guarda su clave para volver a leerlos al cambiar de idioma. */
let claveMision: ClaveTexto | null = null;

/** Explica `clave` con voz y subtítulos. Sin voz, el subtítulo sale igual. No corta la anterior: `voz.hablar` la reemplaza. */
/** Tiempo (ms) que el subtítulo sigue en pantalla después de que termina la voz. */
const RETRASO_QUITAR_SUBTITULOS_MS = 1200;

function hablar(voz: Voz, ui: JuegoUi, clave: ClaveTexto, alTerminar?: () => void, completo = false): void {
  const h: Habla = { clave, alTerminar, completo, frase: -1 };
  habla = h;
  // Al terminar la voz, el subtítulo se quita con un poco de retraso, salvo que ya haya empezado otra explicación.
  const alAcabar = (): void => {
    window.setTimeout(() => {
      if (habla !== h) return;
      habla = null;
      ui.subtitulos(null);
    }, RETRASO_QUITAR_SUBTITULOS_MS);
    alTerminar?.();
  };
  if (completo) {
    ui.subtitulos(texto(clave));
    voz.hablar(textoGuion(clave), alAcabar);
    return;
  }
  voz.hablar(textoGuion(clave), alAcabar, (frase) => {
    h.frase++;
    ui.subtitulos(frase);
  });
}

/** Dice una frase solo la primera vez de la sesión; si ya se dijo, sigue con `alTerminar` de inmediato. */
function decirUnaVez(sesion: Sesion, clave: ClaveTexto, alTerminar?: () => void): void {
  if (yaDichas.has(clave)) {
    alTerminar?.();
    return;
  }
  yaDichas.add(clave);
  decirFrase(sesion.voz, sesion.ui, clave, alTerminar);
}

/**
 * Frases de la misión que esperan a que el mentor termine la anterior: nunca se corta una frase a medias. Se vacía
 * al salir de la misión o al cambiar de escena (así no suenan frases de una escena ya cerrada).
 */
const colaFrases: Array<() => void> = [];

/** Dice una frase de voz con subtítulo. Si el mentor aún habla, la espera en cola y no corta la anterior. */
function decirFrase(voz: Voz, ui: JuegoUi, clave: ClaveTexto, alTerminar?: () => void, completo = false): void {
  if (mentorHablando || colaFrases.length > 0) {
    colaFrases.push(() => decirAhora(voz, ui, clave, alTerminar, completo));
    return;
  }
  decirAhora(voz, ui, clave, alTerminar, completo);
}

/** Dice la frase ya, sin esperar. Al terminar, arranca la siguiente de la cola (si la hay). */
function decirAhora(voz: Voz, ui: JuegoUi, clave: ClaveTexto, alTerminar?: () => void, completo = false): void {
  voz.cancelar();
  hablar(
    voz,
    ui,
    clave,
    () => {
      alTerminar?.();
      colaFrases.shift()?.();
    },
    completo,
  );
}

/** Vuelve a leer en el idioma nuevo todo lo que ya está en pantalla. */
function releerTextos(sesion: Sesion): void {
  const { ui, voz } = sesion;
  requireEl('ayuda').textContent = texto('ayuda');
  if (claveMision) ui.mostrarMision(t(claveMision));
  if (!habla) return;
  if (mentorHablando) {
    hablar(voz, ui, habla.clave, habla.alTerminar, habla.completo);
  } else if (ui.subtitulosVisibles()) {
    const frases = dividirFrases(texto(habla.clave));
    ui.subtitulos(habla.completo ? texto(habla.clave) : (frases[Math.min(Math.max(habla.frase, 0), frases.length - 1)] ?? null));
  }
}

const mensajeDe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function iniciarJuego(container: HTMLElement): Promise<void> {
  // Audio grabado opcional (public/voz/, ver tools/README.md). Sin catálogo o si tarda, se usa la síntesis de voz.
  // Se carga en segundo plano: no retrasa el arranque, y las líneas que lleguen tarde se hablan con síntesis.
  const catalogoVoz: CatalogoVoz = new Map();
  void cargarCatalogoVoz(assetUrl('voz/')).then((c) => c.forEach((linea, clave) => catalogoVoz.set(clave, linea)));
  const voz = crearVoz(() => LENGUA_VOZ[idioma()], catalogoVoz);
  const oyenteMentor = crearOyenteMentor();
  voz.escuchar({
    ...oyenteMentor,
    alEstado(estado) {
      mentorHablando = estado === 'hablando';
      oyenteMentor.alEstado?.(estado);
    },
  });
  const museo = new Museo();
  const ui = crearUi(() => museo.volver());
  const presUi = crearPresentacionUi();
  const cineUi = crearCinematicaUi();
  /** Fuente de entrada, cuando ya exista (se elige después de montar los eventos). */
  let fuenteActiva: FuenteEntrada | null = null;
  const cursorUi = crearCursor();
  const anillo = crearAnillo();
  const inicio = crearInicioUi();
  const video = requireEl<HTMLVideoElement>('camara');
  // Opciones (SPEC 13): el panel modifica este mismo objeto al cambiar un valor.
  const opciones = cargarOpciones();

  museo.onEvento((evento: EventoMuseo) => {
    switch (evento.tipo) {
      case 'vitrinaSeleccionada':
        // El mentor explica la vitrina frase a frase; cada frase va como subtítulo al empezar.
        // Al terminar la última (no antes) se habilita entrar (SPEC 7.2).
        hablar(voz, ui, evento.id, () => museo.terminoVoz(evento.id));
        break;
      case 'vitrinaDeseleccionada':
        // Sin vitrina seleccionada no hay explicación ni entrada: se corta la voz y los textos.
        colaFrases.length = 0;
        voz.cancelar();
        habla = null;
        ui.subtitulos(null);
        break;
      case 'presentacionAbierta':
        // La animación del LRV entre la vitrina y la misión (game/presentacionLRV.ts). Sin entradas del museo; Enter
        // la salta (después de la introducción) y C enciende o apaga sus subtítulos.
        voz.cancelar();
        habla = null;
        ui.subtitulos(null);
        requireEl('ayuda').hidden = true;
        colaFrases.length = 0;
        presentacion = new PresentacionLRV();
        ultimaPresentacionS = null;
        frasePresentacion = null;
        presUi.mostrar(true);
        // Si la escena 3D no se pudo montar, se pasa directo a "Estás listo para la misión".
        if (!evento.visible) {
          presentacion.iniciar();
          presentacion.forzarFinal();
        }
        break;
      case 'misionAbierta':
        // Al salir de la presentación (si la hubo), se quita su capa. Lo demás de la misión no cambia.
        presentacion = null;
        presUi.mostrar(false);
        requireEl('ayuda').hidden = false;
        colaFrases.length = 0;
        voz.cancelar();
        habla = null;
        ui.subtitulos(null);
        if (evento.mision === 'luna') {
          // Misión lunar (SPEC 8): sin cartel de "en construcción". El primer aplauso dentro sienta al jugador.
          mision = new MisionLuna();
          // Al reanudar la cinemática del despegue tras recargar, la misión ya está cumplida.
          const reanudando = reanudarCinematicaS !== null;
          if (reanudando) sueloRecogidoEnSesion = true;
          // El LRV llega plegado en la bahía del LM: hay que mantener E para desplegarlo.
          despliegue = new DespliegueLRV(reanudando ? 'desplegado' : 'plegado');
          if (reanudando) visual.museo.poseDespliegueLRV(DURACION_DESPLIEGUE_LRV_S, 0);
          ultimoDespliegueS = null;
          sueloNaranja = new SueloNaranja(sueloRecogidoEnSesion);
          ultimoSueloS = null;
          visual.museo.recogerSueloNaranja(sueloRecogidoEnSesion ? 1 : 0);
          listoPendiente = false;
          // E no despliega nada hasta que la voz y los subtítulos hayan dicho cómo hacerlo.
          instruccionDesplegarDicha = false;
          subidaLista = false;
          conduccionLista = false;
          cursorUi.mostrar(false);
          if (reanudando) {
            // La cinemática arranca en el bucle (actualizarCinematica), donde ya está la sesión.
            mision.bloquear();
          } else {
            decirFrase(voz, ui, 'luna_entrando_museo', () => {
              instruccionDesplegarDicha = true;
            });
          }
        } else {
          claveMision = 'escena_marte_construccion';
          ui.mostrarMision(t(claveMision));
        }
        break;
      case 'regresoMuseo':
        // Se quita el texto de la escena y el mentor da su conclusión (voz y subtítulos).
        mision = null;
        despliegue = null;
        sueloNaranja = null;
        if (cinematica) {
          // Si se sale de la Luna con la cinemática a medias, se abandona (y no se reanuda al recargar).
          cinematica = null;
          cineUi.mostrar(false);
          borrarProgresoDespegue();
          fuenteActiva?.pausar(false);
        }
        reanudarCinematicaS = null;
        anillo.mostrar(null);
        ui.ocultarMision();
        claveMision = null;
        // Si el mentor aún habla de la misión, termina esa frase y luego da la conclusión.
        colaFrases.length = 0;
        decirFrase(voz, ui, 'regreso_museo', undefined, true);
        break;
    }
  });

  // El museo carga mientras el jugador elige el control.
  const escenaLista = visual.museo.iniciar(container);
  escenaLista.catch(() => {
    // El error se muestra al esperar la escena, más abajo.
  });

  let modo = await inicio.elegir(cargarControl() ?? 'camara');
  try {
    ui.aviso(t('cargando_museo'));
    await escenaLista;
  } catch (err) {
    ui.aviso(`Error: ${mensajeDe(err)}`);
    console.error(err);
    return;
  }

  // Con cámara: webcam y MediaPipe. Si fallan, se vuelve a la pantalla de inicio con el modo teclado marcado.
  let camara: FuenteCamara | null = null;
  while (modo === 'camara' && camara === null) {
    try {
      video.hidden = false;
      ui.aviso(t('arranque'));
      camara = await FuenteCamara.crear(video, opciones, (mensaje) => ui.aviso(mensaje));
    } catch (err) {
      console.error(err);
      video.hidden = true;
      ui.aviso(null);
      modo = await inicio.elegir('teclado', t('inicio_camara_fallo', { error: mensajeDe(err) }));
    }
  }
  modoControl = modo;
  guardarControl(modo);

  const opcionesUi = crearOpcionesUi(opciones, (nuevas) => Object.assign(opciones, nuevas), {
    modo,
    // Cambiar control: se guarda el otro modo y se vuelve a la pantalla de inicio con él marcado.
    onCambiar: () => {
      guardarControl(modo === 'teclado' ? 'camara' : 'teclado');
      location.reload();
    },
  });
  // En modo teclado no se pide la cámara ni se carga MediaPipe, y las manos 3D no se muestran.
  const fuente: FuenteEntrada = camara ?? new FuenteTeclado(container, opciones, opcionesUi);
  fuenteActiva = fuente;
  video.hidden = fuente.modo !== 'camara';
  opcionesUi.onVisibilidad((abierto) => fuente.pausar(abierto));
  requireEl('ayuda').textContent = texto('ayuda');

  const sesion: Sesion = { museo, ui, cursorUi, anillo, opciones, voz, presUi, cineUi, fuente };
  // Omitir (botón o Enter): salta al modo libre, con la pantalla en negro.
  cineUi.alOmitir(() => {
    if (cinematica) eventosCinematica(sesion, cinematica.saltar());
  });
  presUi.alTeclas(
    () => {
      if (presentacion?.saltar()) {
        voz.cancelar();
        ui.subtitulos(null);
      }
    },
    () => {
      // C: subtítulos de la animación. Se guarda como el resto de opciones.
      opciones.subtitulosPresentacion = !opciones.subtitulosPresentacion;
      guardarOpciones(opciones);
      if (presentacion?.fase !== 'listo' && presentacion?.fase !== 'terminada') {
        ui.subtitulos(opciones.subtitulosPresentacion ? frasePresentacion : null);
      }
    },
  );
  alCambiarIdioma(() => releerTextos(sesion));
  let avisoActual: string | null | undefined;
  const balanceo = new BalanceoCaminata();
  const bucle = (): void => {
    const ahoraS = performance.now() / 1000;
    museo.tick(ahoraS);
    const lectura = fuente.leer(ahoraS);
    if (lectura.aviso !== avisoActual) {
      avisoActual = lectura.aviso;
      ui.aviso(lectura.aviso);
    }
    // Mientras se ve la cinemática, la cámara es suya: no hay caminata, manos ni acciones del jugador.
    const enCinematica = cinematicaActiva();
    if (!enCinematica) {
      actualizarBalanceo(balanceo, sesion, lectura);
      dibujarManos(sesion, lectura);
    }
    actualizarDespliegue(sesion, lectura);
    actualizarSueloNaranja(sesion, lectura);
    actualizarPresentacion(sesion, ahoraS);
    actualizarCinematica(sesion, ahoraS);
    if (lectura.listo && lectura.hayDatos && !enCinematica) aplicarLectura(sesion, lectura);
    requestAnimationFrame(bucle);
  };
  requestAnimationFrame(bucle);

  // ¿Se recargó la página con la cinemática del despegue a medias? Entonces se vuelve directo a la Luna a terminarla.
  reanudarCinematicaS = cargarProgresoDespegue();
  if (reanudarCinematicaS !== null) museo.abrirMisionDirecta('luna');
}

/** Estado que persiste entre fotogramas. */
interface Sesion {
  museo: Museo;
  ui: JuegoUi;
  cursorUi: CursorUi;
  /** Anillo de mantener E para desplegar el LRV. */
  anillo: AnilloUi;
  /** Opciones vivas: el panel las modifica en el mismo objeto. */
  opciones: Opciones;
  voz: Voz;
  presUi: PresentacionUi;
  cineUi: CinematicaUi;
  fuente: FuenteEntrada;
}

/** La cinemática del despegue lleva la cámara (hasta el modo libre; su fundido de salida ya deja jugar). */
function cinematicaActiva(): boolean {
  return cinematica !== null && !cinematica.enModoLibre;
}

/**
 * Empieza la cinemática del despegue (desde `desdeS`, o donde se quedó al recargar): el LRV queda aparcado donde filmó,
 * se calla el mentor y se pausa la entrada del jugador. Si la escena no la puede mostrar, pasa directo al modo libre.
 */
function iniciarCinematica(sesion: Sesion, desdeS: number): void {
  const { voz, ui, anillo, cursorUi, cineUi, fuente } = sesion;
  if (mision === null || cinematica !== null) return;
  mision.estacionarLRV(LRV_DESPEGUE, LRV_DESPEGUE.rumbo);
  colaFrases.length = 0;
  voz.cancelar();
  habla = null;
  ui.subtitulos(null);
  anillo.mostrar(null);
  cursorUi.mostrar(false);
  if (!visual.museo.iniciarDespegue()) {
    borrarProgresoDespegue();
    mision.liberar();
    decirFrase(voz, ui, 'luna_despegue_libre');
    return;
  }
  const c = new CinematicaDespegue(desdeS);
  cinematica = c;
  ultimaCinematicaS = null;
  requireEl('ayuda').hidden = true;
  // Pausada, la entrada no captura el ratón ni cuenta gestos; con teclado, suelta el puntero para poder pulsar Omitir.
  fuente.pausar(true);
  cineUi.mostrar(true);
  cineUi.omitible(true);
  // Al reanudar en mitad, la escena ya muestra la toma mientras termina el fundido del museo.
  visual.museo.actualizarDespegue(c.estado);
}

/** Eventos de la cinemática: al pasar al modo libre (con la pantalla en negro) y al terminar el fundido de salida. */
function eventosCinematica(sesion: Sesion, eventos: readonly EventoCinematica[]): void {
  const { cineUi, voz, ui, fuente } = sesion;
  for (const evento of eventos) {
    if (evento.tipo === 'texto') {
      // El mentor lee el texto que aparece en pantalla (el texto ya hace de subtítulo, abajo a la izquierda).
      const c = cinematica;
      colaFrases.length = 0;
      habla = null;
      ui.subtitulos(null);
      voz.cancelar();
      voz.hablar(tGuion(evento.clave), () => {
        if (c && cinematica === c) c.vozTermino(evento.clave);
      });
    } else if (evento.tipo === 'libre') {
      // Al omitir, la voz de la cinemática se corta.
      voz.cancelar();
      // Modo libre: el módulo de ascenso ya se fue y el jugador puede caminar por el valle.
      visual.museo.terminarDespegue();
      mision?.liberar();
      fuente.pausar(false);
      cineUi.omitible(false);
      cineUi.texto(null, 0);
      cineUi.aspecto(null, 0);
    } else if (evento.tipo === 'fin') {
      cinematica = null;
      ultimaCinematicaS = null;
      cineUi.mostrar(false);
      visual.museo.fundido(0);
      requireEl('ayuda').hidden = false;
      decirFrase(voz, ui, 'luna_despegue_libre');
    }
  }
}

/**
 * Cinemática del despegue, en cada vuelta del bucle: avanza la línea de tiempo y pone la toma, el fundido, el texto y
 * el aspecto de TV. Durante el fundido del museo (al reanudar tras recargar) espera: ese negro es del museo.
 */
function actualizarCinematica(sesion: Sesion, ahoraS: number): void {
  if (cinematica === null && reanudarCinematicaS !== null && mision !== null) {
    const desde = reanudarCinematicaS;
    reanudarCinematicaS = null;
    iniciarCinematica(sesion, desde);
  }
  const c = cinematica;
  if (c === null) return;
  if (sesion.museo.enTransicion) {
    ultimaCinematicaS = null;
    return;
  }
  const { cineUi } = sesion;
  const previo = ultimaCinematicaS;
  ultimaCinematicaS = ahoraS;
  const dtS = previo === null ? 0 : Math.min(DT_MAX_DESPLIEGUE_S, Math.max(0, ahoraS - previo));
  eventosCinematica(sesion, c.actualizar(dtS));
  if (cinematica !== c) return;
  const estado = c.estado;
  if (!c.enModoLibre) {
    visual.museo.actualizarDespegue(estado);
    const [texto] = c.textos;
    cineUi.texto(texto ? t(texto.clave) : null, texto?.opacidad ?? 0);
    cineUi.aspecto(estado.toma?.estilo ?? null, estado.sobreexposicion);
  }
  visual.museo.fundido(c.fundido);
}

/**
 * Frase de la presentación con la voz del mentor (la del robot del museo). Los subtítulos siguen la opción
 * `subtitulosPresentacion`; `conSubtitulos` = false para "Estás listo", que ya se lee en grande.
 */
function narrarPresentacion(sesion: Sesion, clave: ClaveTexto, alTerminar: () => void, conSubtitulos = true): void {
  const { voz, ui, opciones } = sesion;
  habla = null;
  colaFrases.length = 0;
  voz.cancelar();
  frasePresentacion = null;
  ui.subtitulos(null);
  voz.hablar(
    tGuion(clave),
    () => {
      // Al terminar la voz, la última frase deja de ser subtítulo: pulsar C después no la muestra muda.
      frasePresentacion = null;
      alTerminar();
    },
    (frase) => {
      if (!conSubtitulos) return;
      frasePresentacion = frase;
      ui.subtitulos(opciones.subtitulosPresentacion ? frase : null);
    },
  );
}

/** Reacciona a los eventos de la presentación: frase de cada tramo, "Estás listo" y paso a la misión. */
function eventosPresentacion(sesion: Sesion, p: PresentacionLRV, eventos: readonly EventoPresentacion[]): void {
  const { voz, ui, presUi, museo } = sesion;
  const alTerminar = (): void => {
    if (presentacion === p) p.terminoVoz();
  };
  for (const evento of eventos) {
    if (evento.tipo === 'tramo') {
      const clave = GUION[evento.escena]?.tramos[evento.tramo]?.narracion ?? null;
      if (clave) {
        narrarPresentacion(sesion, clave, alTerminar);
      } else {
        voz.cancelar();
        frasePresentacion = null;
        ui.subtitulos(null);
      }
    } else if (evento.tipo === 'listo') {
      presUi.rotulos([]);
      presUi.division(false);
      presUi.peso(0);
      presUi.ayuda(null);
      presUi.fundido(OSCURO_LISTO);
      presUi.listo(t('pres_listo'));
      narrarPresentacion(sesion, 'pres_listo', alTerminar, false);
    } else if (evento.tipo === 'fin') {
      museo.terminarPresentacion();
    }
  }
}

/**
 * Presentación del LRV, en cada vuelta del bucle (no solo con fotograma de la cámara): avanza el guion, mueve la
 * escena 3D y pone los rótulos, la tarjeta del peso, el fundido y la ayuda de teclas.
 */
function actualizarPresentacion(sesion: Sesion, ahoraS: number): void {
  const p = presentacion;
  if (p === null) return;
  const { presUi } = sesion;
  const previo = ultimaPresentacionS;
  ultimaPresentacionS = ahoraS;
  const dtS = previo === null ? 0 : Math.min(DT_MAX_DESPLIEGUE_S, Math.max(0, ahoraS - previo));
  eventosPresentacion(sesion, p, p.fase === 'espera' ? p.iniciar() : p.actualizar(dtS));
  if (presentacion !== p || p.fase === 'listo' || p.fase === 'terminada') return;

  const tramo = p.tramoActual;
  if (!tramo) return;
  const tiempo = p.tiempoTramo;
  const posiciones = visual.museo.actualizarPresentacion({ tramo, t: tiempo, dtS });
  const rotulos: RotuloUi[] = [];
  tramo.marcas.forEach((m, i) => {
    const pos = posiciones[i];
    if (!m.rotulo || !pos?.enPantalla) return;
    const [dx, dy] = m.rotuloPx ?? ROTULO_ENCIMA_PX;
    rotulos.push({ texto: t(m.rotulo), x: pos.x + dx, y: pos.y + dy, opacidad: opacidadMarca(m, tiempo) });
  });
  presUi.rotulos(rotulos);
  presUi.division(!!tramo.division);
  const peso = tramo.tarjetaPeso;
  presUi.peso(peso ? opacidadMarca({ resalte: 'lrv', rotulo: null, desde: peso[0], hasta: peso[1] }, tiempo) : 0);
  presUi.fundido(p.fundido);
  presUi.ayuda(t(p.saltable ? 'pres_ayuda' : 'pres_ayuda_intro'));
}

/** Sin caminata: el balanceo se va a cero. */
const SIN_BALANCEO: EntradaBalanceo = { caminando: false, pasosNuevos: 0, pasosPorSegundo: 0 };

/**
 * Balanceo de la cámara al caminar (solo visual): en el museo y a pie en la Luna. Sentado en el LRV, en Marte o
 * durante una transición, no hay caminata: la amplitud baja a cero.
 */
function actualizarBalanceo(balanceo: BalanceoCaminata, sesion: Sesion, lectura: LecturaEntrada): void {
  const enMuseo = mision === null && sesion.museo.pantalla.tipo === 'museo';
  const aPieEnLuna = mision !== null && mision.aPie;
  const caminaVisible = (enMuseo || aPieEnLuna) && !sesion.museo.enTransicion;
  visual.museo.fijarBalanceo(balanceo.avanzar(lectura.ahoraS, caminaVisible ? lectura.balanceo : SIN_BALANCEO));
}

/** Las manos del avatar copian las detectadas por la cámara (SPEC 5.5). Con teclado no hay manos. */
function dibujarManos(sesion: Sesion, lectura: LecturaEntrada): void {
  if (lectura.manos === 'ocultar') {
    visual.museo.ocultarManos();
    return;
  }
  if (!lectura.manos) return;
  const { opciones } = sesion;
  visual.museo.actualizarManos(lectura.manos.manos, lectura.manos.ancho, lectura.manos.alto, opciones.tamanoMano, {
    separacion: opciones.separacionManos,
    ajuste: opciones.ajusteManoModelo,
    limites: opciones.limitesMano,
    ahoraS: lectura.ahoraS,
    tiempoOcultarS: opciones.tiempoOcultarManoS,
    umbralSaltoM: opciones.umbralSaltoManoM,
  });
}

/** Reparte una lectura con datos: a la misión lunar si está activa, o al museo. */
function aplicarLectura(sesion: Sesion, lectura: LecturaEntrada): void {
  const { ahoraS } = lectura;
  const apuntando = senalar(sesion, lectura.senal);

  // Escena lunar: volante, caminata, golpe y agarre van a la máquina de estados (SPEC 8).
  // A pie, el jugador camina y mira como en el museo; sentado, la caminata mueve el LRV y el giro solo la vista.
  if (mision !== null) {
    const aPie = mision.aPie;
    // Misión cumplida: se puede mirar alrededor, pero no caminar (ni de lado).
    const puedeCaminar = aPie && !mision.bloqueada;
    // A pie en la Luna, el avance tiene el tope de la Luna (luna.ts); el museo no lo usa.
    const avancePie = puedeCaminar ? metrosAPieLuna(lectura.avanceM, lectura.dtS) : 0;
    if (lectura.conMovimiento && !sesion.museo.enTransicion) {
      visual.museo.moverCamara(lectura.giroGrados, avancePie, lectura.cabeceoGrados, puedeCaminar ? lectura.lateralM : 0);
    }
    aplicarLuna(sesion, {
      ahoraS,
      dtS: lectura.dtS,
      // A pie con el LRV ya desplegado, el aplauso no sube hasta que la voz diga cómo hacerlo.
      aplauso: lectura.aplauso && (!aPie || subidaLista || despliegue?.desplegado !== true),
      // Sentado, caminar mueve el LRV solo cuando la voz ya explicó cómo conducir.
      metros: aPie || !conduccionLista ? 0 : lectura.avanceM,
      jugador: visual.museo.posicionJugador(),
      volanteGrados: lectura.volanteGrados,
      velocidadGolpeHombrosS: lectura.golpeHombrosS,
      agarreNuevo: lectura.agarreNuevo,
      // Mientras suena la explicación de los controles (la primera vez al subirte), B no baja del LRV.
      bajarse: lectura.bajarse && !(mentorHablando && habla?.clave === 'luna_sentado_en_LRV'),
      lrvDesplegado: despliegue?.desplegado ?? true,
    });
    return;
  }

  // Sin datos de movimiento (p. ej. sin cara), el movimiento se congela (SPEC 6). El aplauso sí cuenta.
  if (!lectura.conMovimiento) {
    if (lectura.aplauso) {
      sesion.museo.actualizar({ ahoraS, giroGrados: 0, cabeceoGrados: 0, metros: 0, lateralMetros: 0, apuntando: null, accion: true });
    }
    return;
  }

  sesion.museo.actualizar({
    ahoraS,
    giroGrados: lectura.giroGrados,
    cabeceoGrados: lectura.cabeceoGrados,
    metros: lectura.avanceM,
    lateralMetros: lectura.lateralM,
    apuntando,
    // Entrar y volver a la escena solo con aplauso o barra espaciadora (SPEC 5.2 y 7.2).
    accion: lectura.aplauso,
  });
}

/**
 * Despliegue del LRV, en cada vuelta del bucle (no solo con fotograma nuevo, para que la animación no se congele):
 * mantener E llena el anillo; lleno, arranca la animación y el mentor cuenta cada fase. Durante el fundido de
 * entrada no avanza.
 */
function actualizarDespliegue(sesion: Sesion, lectura: LecturaEntrada): void {
  const { anillo, ui, voz } = sesion;
  if (mision === null || despliegue === null) return;
  const previo = ultimoDespliegueS;
  ultimoDespliegueS = lectura.ahoraS;
  const enTransicion = sesion.museo.enTransicion;
  const dtS = previo === null || enTransicion ? 0 : Math.min(DT_MAX_DESPLIEGUE_S, Math.max(0, lectura.ahoraS - previo));
  const estadoPrevio = despliegue.estado;
  const eventos = despliegue.actualizar(dtS, lectura.listo && lectura.desplegarMantenido && !enTransicion && instruccionDesplegarDicha);
  // Solo mientras se pliega (y en el fotograma en que se completa, para ocultarlo): después, el anillo es de la recogida.
  if (estadoPrevio === 'plegado' || despliegue.estado === 'plegado') {
    anillo.mostrar(despliegue.estado === 'plegado' && despliegue.anillo > 0 ? despliegue.anillo : null);
  }
  // Plegado, la pose no cambia (entrarEscena ya lo dejó en la bahía); después de terminar, la lleva la misión.
  if (estadoPrevio === 'desplegando' || despliegue.estado === 'desplegando') {
    visual.museo.poseDespliegueLRV(despliegue.tiempoS, dtS);
  }
  for (const evento of eventos) {
    if (evento.tipo === 'fase') {
      const clave = FRASES_DESPLIEGUE[evento.fase];
      if (clave) decirFrase(voz, ui, clave);
    } else if (evento.tipo === 'terminado') {
      listoPendiente = true;
    }
  }
  if (listoPendiente && !mentorHablando) {
    listoPendiente = false;
    // Hasta que la voz diga "Aprieta espacio para subirte", el aplauso no sube al LRV.
    decirFrase(voz, ui, 'luna_LRV_desplegado', () => {
      subidaLista = true;
    });
  }
}

/**
 * Suelo naranja de la estación 1 (game/sueloNaranja.ts), en cada vuelta del bucle como el despliegue. Con el LRV
 * desplegado: avisa al acercarse (voz y subtítulos, dos frases) y, a pie dentro de la zona, mantener E llena el anillo
 * del despliegue. Al recoger, el mentor cuenta el suelo y la escena lo desvanece y hunde.
 */
function actualizarSueloNaranja(sesion: Sesion, lectura: LecturaEntrada): void {
  const { anillo } = sesion;
  if (mision === null || sueloNaranja === null || despliegue === null) return;
  const previo = ultimoSueloS;
  ultimoSueloS = lectura.ahoraS;
  const enTransicion = sesion.museo.enTransicion;
  const dtS = previo === null || enTransicion ? 0 : Math.min(DT_MAX_DESPLIEGUE_S, Math.max(0, lectura.ahoraS - previo));
  const aPie = mision.aPie;
  const eventos = sueloNaranja.update({
    dtS,
    jugador: visual.museo.posicionJugador(),
    lrv: mision.posicion,
    aPie,
    manteniendoE: lectura.listo && lectura.desplegarMantenido && !enTransicion,
    activo: despliegue.desplegado,
  });
  // Con el LRV plegado, el anillo lo lleva el despliegue: aquí solo se dibuja después de desplegar.
  if (despliegue.desplegado) anillo.mostrar(sueloNaranja.anilloProgreso > 0 ? sueloNaranja.anilloProgreso : null);
  visual.museo.recogerSueloNaranja(sueloNaranja.hundimiento);
  for (const evento of eventos) {
    if (evento.tipo === 'cercania') {
      decirUnaVez(sesion, 'luna_suelo_junto', () => decirUnaVez(sesion, 'luna_suelo_bajate'));
    } else if (evento.tipo === 'puedeRecoger') {
      decirUnaVez(sesion, 'luna_suelo_manten');
    } else if (evento.tipo === 'recogido') {
      sueloRecogidoEnSesion = true;
      anillo.mostrar(null);
      celebrarMision(sesion);
    }
  }
}

/**
 * Misión cumplida: la muestra ya está en la bolsa. El mentor dice "Misión cumplida" y explica por qué importó el suelo
 * y el papel del LRV; al terminar empieza la cinemática del despegue y, después, el modo libre (con cómo volver al
 * museo). Hasta entonces el jugador se queda quieto (MisionLuna.bloquear). Las frases van en cola.
 */
function celebrarMision(sesion: Sesion): void {
  if (mision === null || mision.bloqueada) return;
  mision.bloquear();
  const { voz, ui } = sesion;
  decirFrase(voz, ui, 'luna_mision_cumplida');
  // Al terminar la frase del LRV empieza la cinemática del despegue (game/cinematicaDespegue.ts). Si mientras tanto el
  // jugador volvió al museo, ya no es la misma misión y no arranca.
  const esta = mision;
  decirFrase(voz, ui, 'luna_suelo_recogido', () => {
    if (mision === esta) iniciarCinematica(sesion, 0);
  });
}

/** Avanza la misión lunar un fotograma, actualiza la escena y reacciona a los eventos (voz, volver). */
function aplicarLuna(sesion: Sesion, entrada: EntradaLuna): void {
  if (mision === null || sesion.museo.enTransicion) return;
  const eventos = mision.update(entrada);
  visual.museo.actualizarLuna({
    x: mision.posicion.x,
    z: mision.posicion.z,
    rumboGrados: mision.rumboGrados,
    direccionGrados: mision.direccionGrados,
    dtS: entrada.dtS,
    sentado: !mision.aPie,
    // El halo azul marca el suelo naranja: desaparece al recoger la muestra (y al volver a la misión, sigue oculto).
    haloVisible: mision.haloVisible && !(sueloNaranja?.recogidoYa ?? false),
  });
  for (const evento of eventos) {
    if (evento.tipo === 'estado') {
      const clave = FRASES_LUNA[evento.estado];
      // Muestra por el golpe con el LRV: misma celebración que recoger el suelo con E.
      if (evento.estado === 'muestra_recogida') {
        celebrarMision(sesion);
      } else if (evento.estado === 'sentado_en_LRV') {
        // La primera vez de la sesión se explican los controles; después, solo "anda más". Hasta que termine la frase,
        // caminar no mueve el LRV.
        const clave = yaDichas.has('luna_sentado_en_LRV') ? 'luna_sentado_otra' : 'luna_sentado_en_LRV';
        yaDichas.add('luna_sentado_en_LRV');
        decirFrase(sesion.voz, sesion.ui, clave, () => {
          conduccionLista = true;
        });
      } else if (clave) {
        decirFrase(sesion.voz, sesion.ui, clave);
      }
    } else if (evento.tipo === 'golpeFallido') {
      decirFrase(sesion.voz, sesion.ui, 'luna_golpe_fallido');
    } else if (evento.tipo === 'bajado') {
      // La primera bajada de la sesión dice que te bajaste; las siguientes, solo que estás afuera.
      const clave = yaDichas.has('luna_te_bajaste') ? 'luna_afuera' : 'luna_te_bajaste';
      yaDichas.add('luna_te_bajaste');
      decirFrase(sesion.voz, sesion.ui, clave);
    } else if (evento.tipo === 'lejosDelLRV') {
      decirFrase(sesion.voz, sesion.ui, 'luna_lejos_LRV');
    } else if (evento.tipo === 'lrvPlegado') {
      // Desplegándose, el mentor ya va contando el despliegue: no se le interrumpe.
      if (despliegue?.estado === 'plegado') decirFrase(sesion.voz, sesion.ui, 'luna_LRV_plegado');
    } else if (evento.tipo === 'volver') {
      sesion.museo.volver();
    }
  }
}

/**
 * Dibuja el cursor (o nada, con el rayo) y devuelve la vitrina señalada, o null.
 * Fuera del museo no hay vitrinas que señalar: el cursor se oculta.
 */
function senalar(sesion: Sesion, senal: Senal | null): string | null {
  const { cursorUi } = sesion;
  if (sesion.museo.pantalla.tipo !== 'museo' || senal === null) {
    cursorUi.mostrar(false);
    return null;
  }
  if (senal.tipo === 'rayo') {
    cursorUi.mostrar(false);
    return senal.direccion ? visual.museo.vitrinaEnDireccion(senal.direccion) : null;
  }
  // Cursor: sigue la punta del índice (cámara) o es la mira del centro (teclado). Atenuado, no señala.
  cursorUi.mostrar(true);
  cursorUi.mover(senal.x, senal.y, !senal.activo);
  return senal.activo ? visual.museo.vitrinaEnPantalla(senal.x, senal.y) : null;
}
