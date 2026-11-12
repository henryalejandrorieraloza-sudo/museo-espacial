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
import { cargarControl, cargarOpciones, guardarControl, type ModoControl, type Opciones } from './opciones';
import { Museo, type EventoMuseo } from './museo';
import { MisionLuna, type EntradaLuna, type EstadoLuna } from './luna';

/** Misión lunar activa (SPEC 8). Solo existe mientras la pantalla es la escena de Luna. */
let mision: MisionLuna | null = null;

/** Control con el que se juega. Decide qué textos de ayuda se muestran (gesto o tecla). */
let modoControl: ModoControl = 'camara';

/** Frase de voz de cada estado de la misión. `entrando_museo` se dice al abrir la escena, no aquí. */
const FRASES_LUNA: Partial<Record<EstadoLuna, ClaveTexto>> = {
  sentado_en_LRV: 'luna_sentado_en_LRV',
  cerca_de_roca: 'luna_cerca_de_roca',
  golpeando: 'luna_golpeando',
  muestra_recogida: 'luna_muestra_recogida',
};

/** Con teclado, estos textos nombran la tecla en vez del gesto. */
const TEXTO_TECLADO: Partial<Record<ClaveTexto, ClaveTexto>> = {
  ayuda: 'ayuda_teclado',
  entrar_aplauso: 'entrar_teclado',
  luna_entrando_museo: 'luna_entrando_museo_teclado',
  luna_lejos_LRV: 'luna_lejos_LRV_teclado',
  luna_sentado_en_LRV: 'luna_sentado_en_LRV_teclado',
  luna_cerca_de_roca: 'luna_cerca_de_roca_teclado',
  luna_golpeando: 'luna_golpeando_teclado',
  luna_muestra_recogida: 'luna_muestra_recogida_teclado',
  luna_bajado: 'luna_bajado_teclado',
  luna_bajado_muestra: 'luna_bajado_muestra_teclado',
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
let claveEntrar: ClaveTexto | null = null;
let claveMision: ClaveTexto | null = null;

/** Explica `clave` con voz y subtítulos. Sin voz, el subtítulo sale igual. No corta la anterior: `voz.hablar` la reemplaza. */
function hablar(voz: Voz, ui: JuegoUi, clave: ClaveTexto, alTerminar?: () => void, completo = false): void {
  const h: Habla = { clave, alTerminar, completo, frase: -1 };
  habla = h;
  if (completo) {
    ui.subtitulos(texto(clave));
    voz.hablar(textoGuion(clave), alTerminar);
    return;
  }
  voz.hablar(textoGuion(clave), alTerminar, (frase) => {
    h.frase++;
    ui.subtitulos(frase);
  });
}

/** Dice una frase de voz con subtítulo. Corta la anterior para que no se pisen. */
function decirFrase(voz: Voz, ui: JuegoUi, clave: ClaveTexto): void {
  voz.cancelar();
  hablar(voz, ui, clave);
}

/** Vuelve a leer en el idioma nuevo todo lo que ya está en pantalla. */
function releerTextos(sesion: Sesion): void {
  const { ui, voz } = sesion;
  requireEl('ayuda').textContent = texto('ayuda');
  if (claveEntrar) ui.indicarEntrar(texto(claveEntrar));
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
  const cursorUi = crearCursor();
  const inicio = crearInicioUi();
  const video = requireEl<HTMLVideoElement>('camara');
  // Opciones (SPEC 13): el panel modifica este mismo objeto al cambiar un valor.
  const opciones = cargarOpciones();

  museo.onEvento((evento: EventoMuseo) => {
    switch (evento.tipo) {
      case 'vitrinaSeleccionada':
        // El mentor explica la vitrina frase a frase; cada frase va como subtítulo al empezar.
        // Al terminar la última (no antes) se habilita entrar (SPEC 7.2).
        ui.indicarEntrar(null);
        claveEntrar = null;
        hablar(voz, ui, evento.id, () => museo.terminoVoz(evento.id));
        break;
      case 'listoParaEntrar':
        claveEntrar = 'entrar_aplauso';
        ui.indicarEntrar(texto('entrar_aplauso'));
        break;
      case 'vitrinaDeseleccionada':
        // Sin vitrina seleccionada no hay explicación ni entrada: se corta la voz y los textos.
        voz.cancelar();
        habla = null;
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        claveEntrar = null;
        break;
      case 'misionAbierta':
        voz.cancelar();
        habla = null;
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        claveEntrar = null;
        if (evento.mision === 'luna') {
          // Misión lunar (SPEC 8): sin cartel de "en construcción". El primer aplauso dentro sienta al jugador.
          mision = new MisionLuna();
          cursorUi.mostrar(false);
          decirFrase(voz, ui, 'luna_entrando_museo');
        } else {
          claveMision = 'escena_marte_construccion';
          ui.mostrarMision(t(claveMision));
        }
        break;
      case 'regresoMuseo':
        // Se quita el texto de la escena y el mentor da su conclusión (voz y subtítulos).
        mision = null;
        ui.ocultarMision();
        claveMision = null;
        hablar(voz, ui, 'regreso_museo', undefined, true);
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
  video.hidden = fuente.modo !== 'camara';
  opcionesUi.onVisibilidad((abierto) => fuente.pausar(abierto));
  requireEl('ayuda').textContent = texto('ayuda');

  const sesion: Sesion = { museo, ui, cursorUi, opciones, voz };
  alCambiarIdioma(() => releerTextos(sesion));
  let avisoActual: string | null | undefined;
  const bucle = (): void => {
    const ahoraS = performance.now() / 1000;
    museo.tick(ahoraS);
    const lectura = fuente.leer(ahoraS);
    if (lectura.aviso !== avisoActual) {
      avisoActual = lectura.aviso;
      ui.aviso(lectura.aviso);
    }
    dibujarManos(sesion, lectura);
    if (lectura.listo && lectura.hayDatos) aplicarLectura(sesion, lectura);
    requestAnimationFrame(bucle);
  };
  requestAnimationFrame(bucle);
}

/** Estado que persiste entre fotogramas. */
interface Sesion {
  museo: Museo;
  ui: JuegoUi;
  cursorUi: CursorUi;
  /** Opciones vivas: el panel las modifica en el mismo objeto. */
  opciones: Opciones;
  voz: Voz;
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
    if (lectura.conMovimiento && !sesion.museo.enTransicion) {
      visual.museo.moverCamara(lectura.giroGrados, aPie ? lectura.avanceM : 0, lectura.cabeceoGrados, aPie ? lectura.lateralM : 0);
    }
    aplicarLuna(sesion, {
      ahoraS,
      dtS: lectura.dtS,
      aplauso: lectura.aplauso,
      metros: aPie ? 0 : lectura.avanceM,
      jugador: visual.museo.posicionJugador(),
      volanteGrados: lectura.volanteGrados,
      velocidadGolpeHombrosS: lectura.golpeHombrosS,
      agarreNuevo: lectura.agarreNuevo,
      bajarse: lectura.bajarse,
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
    haloVisible: mision.haloVisible,
  });
  for (const evento of eventos) {
    if (evento.tipo === 'estado') {
      const clave = FRASES_LUNA[evento.estado];
      if (clave) decirFrase(sesion.voz, sesion.ui, clave);
    } else if (evento.tipo === 'golpeFallido') {
      decirFrase(sesion.voz, sesion.ui, 'luna_golpe_fallido');
    } else if (evento.tipo === 'bajado') {
      decirFrase(sesion.voz, sesion.ui, evento.conMuestra ? 'luna_bajado_muestra' : 'luna_bajado');
    } else if (evento.tipo === 'lejosDelLRV') {
      decirFrase(sesion.voz, sesion.ui, 'luna_lejos_LRV');
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
