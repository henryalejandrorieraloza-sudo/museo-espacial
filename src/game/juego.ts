// Bucle principal del juego: pantalla de inicio (elección de control) → encuadre y calibración (solo con cámara)
// → museo y misiones (SPEC 2.1, 3, 7 y 8). Une la capa de entrada (input/), la lógica del museo (game/museo.ts),
// la misión lunar (game/luna.ts) y la interfaz (ui/). No sabe si las acciones vienen de la cámara o del teclado:
// en cada vuelta lee una LecturaEntrada y la reparte.

import { visual } from '../visual/museo';
import { crearVoz, type Voz } from '../audio/voz';
import { t, type ClaveTexto } from '../i18n';
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
  luna_sentado_en_LRV: 'luna_sentado_en_LRV_teclado',
  luna_cerca_de_roca: 'luna_cerca_de_roca_teclado',
  luna_golpeando: 'luna_golpeando_teclado',
  luna_muestra_recogida: 'luna_muestra_recogida_teclado',
};

/** Texto según el control: con teclado usa la variante que nombra la tecla, si existe. */
function texto(clave: ClaveTexto): string {
  return t(modoControl === 'teclado' ? (TEXTO_TECLADO[clave] ?? clave) : clave);
}

/** Dice una frase de voz con subtítulo. Corta la anterior para que no se pisen. Sin voz, el subtítulo sale igual. */
function decirFrase(voz: Voz, ui: JuegoUi, clave: ClaveTexto): void {
  voz.cancelar();
  voz.hablar(texto(clave), undefined, (frase) => ui.subtitulos(frase));
}

const mensajeDe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function iniciarJuego(container: HTMLElement): Promise<void> {
  const voz = crearVoz('es-ES');
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
        voz.hablar(
          t(evento.id),
          () => museo.terminoVoz(evento.id),
          (frase) => ui.subtitulos(frase),
        );
        break;
      case 'listoParaEntrar':
        ui.indicarEntrar(texto('entrar_aplauso'));
        break;
      case 'vitrinaDeseleccionada':
        // Sin vitrina seleccionada no hay explicación ni entrada: se corta la voz y los textos.
        voz.cancelar();
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        break;
      case 'misionAbierta':
        voz.cancelar();
        ui.subtitulos(null);
        ui.indicarEntrar(null);
        if (evento.mision === 'luna') {
          // Misión lunar (SPEC 8): sin cartel de "en construcción". El primer aplauso dentro sienta al jugador.
          mision = new MisionLuna();
          cursorUi.mostrar(false);
          decirFrase(voz, ui, 'luna_entrando_museo');
        } else {
          ui.mostrarMision(t('escena_marte_construccion'));
        }
        break;
      case 'regresoMuseo':
        // Se quita el texto de la escena y el mentor da su conclusión (voz y subtítulos).
        mision = null;
        ui.ocultarMision();
        ui.subtitulos(t('regreso_museo'));
        voz.hablar(t('regreso_museo'));
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
  if (mision !== null) {
    aplicarLuna(sesion, {
      ahoraS,
      dtS: lectura.dtS,
      aplauso: lectura.aplauso,
      metros: lectura.avanceM,
      volanteGrados: lectura.volanteGrados,
      velocidadGolpeHombrosS: lectura.golpeHombrosS,
      agarreNuevo: lectura.agarreNuevo,
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
    sentado: mision.estado !== 'entrando_museo',
    rocaResaltada: mision.rocaResaltada,
  });
  for (const evento of eventos) {
    if (evento.tipo === 'estado') {
      const clave = FRASES_LUNA[evento.estado];
      if (clave) decirFrase(sesion.voz, sesion.ui, clave);
    } else if (evento.tipo === 'golpeFallido') {
      decirFrase(sesion.voz, sesion.ui, 'luna_golpe_fallido');
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
