import {
  guardarOpciones,
  RANGOS,
  normalizarOpciones,
  tablaLimitesPorDefecto,
  type ModoControl,
  type Opciones,
} from '../game/opciones';
import type { TablaLimites } from '../visual/manoModelo';
import { t, type ClaveTexto } from '../i18n';
import { requireEl } from './dom';

type Numerico =
  | 'sensibilidadCursor'
  | 'suavizadoCursor'
  | 'metrosPorPaso'
  | 'velocidadMax'
  | 'tiempoAceleracion'
  | 'sensibilidadGiro'
  | 'tamanoMano'
  | 'separacionManos'
  | 'tiempoOcultarManoS'
  | 'umbralSaltoManoM';

const NUMERICOS: { clave: Numerico; etiqueta: ClaveTexto; paso: number }[] = [
  { clave: 'sensibilidadCursor', etiqueta: 'opc_sensibilidad', paso: 0.1 },
  { clave: 'suavizadoCursor', etiqueta: 'opc_suavizado', paso: 0.05 },
  { clave: 'metrosPorPaso', etiqueta: 'opc_metros_paso', paso: 0.05 },
  { clave: 'velocidadMax', etiqueta: 'opc_velocidad_max', paso: 0.1 },
  { clave: 'tiempoAceleracion', etiqueta: 'opc_tiempo_aceleracion', paso: 0.05 },
  { clave: 'sensibilidadGiro', etiqueta: 'opc_sensibilidad_giro', paso: 0.05 },
  { clave: 'tamanoMano', etiqueta: 'opc_tamano_mano', paso: 0.05 },
  { clave: 'separacionManos', etiqueta: 'opc_separacion_manos', paso: 0.01 },
  { clave: 'tiempoOcultarManoS', etiqueta: 'opc_tiempo_oculta_mano', paso: 0.1 },
  { clave: 'umbralSaltoManoM', etiqueta: 'opc_umbral_salto_mano', paso: 0.01 },
];

/** Deslizadores: se muestran como `range` y aplican el cambio mientras se arrastran. */
const DESLIZADORES: ReadonlySet<Numerico> = new Set<Numerico>(['tamanoMano', 'separacionManos']);

/** Crea un elemento con atributos y hijos (sin innerHTML). */
function crear<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  hijos: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...hijos);
  return el;
}

/** Control actual y qué hacer al pulsar "Cambiar control". */
export interface ControlOpciones {
  modo: ModoControl;
  onCambiar: () => void;
}

export interface OpcionesUi {
  abrir(): void;
  cerrar(): void;
  abierto(): boolean;
  /** Avisa cada vez que el panel se abre o se cierra (por ejemplo, para pausar el teclado). */
  onVisibilidad(oyente: (abierto: boolean) => void): void;
}

/**
 * Panel de opciones (SPEC 13). Los cambios se aplican al momento y se guardan.
 * `onCambio` recibe siempre valores ya ajustados a su rango.
 */
export function crearOpcionesUi(actuales: Opciones, onCambio: (nuevas: Opciones) => void, control: ControlOpciones): OpcionesUi {
  const boton = requireEl<HTMLButtonElement>('opcionesBoton');
  const panel = requireEl('opciones');
  boton.textContent = t('opciones_boton');

  const selectMetodo = crear('select', { id: 'opcMetodo' }, [
    crear('option', { value: 'cursor' }, [t('opc_metodo_cursor')]),
    crear('option', { value: 'rayo' }, [t('opc_metodo_rayo')]),
  ]);
  const checkAjuste = crear('input', { type: 'checkbox', id: 'opcAjusteMano' });
  const selectMano = crear('select', { id: 'opcMano' }, [
    crear('option', { value: 'Right' }, [t('opc_mano_derecha')]),
    crear('option', { value: 'Left' }, [t('opc_mano_izquierda')]),
  ]);
  const inputs = new Map<Numerico, HTMLInputElement>();
  const valores = new Map<Numerico, HTMLSpanElement>();

  // Control (cámara o teclado): se cambia en la pantalla de inicio.
  const nombreControl = t(control.modo === 'teclado' ? 'inicio_control_teclado' : 'inicio_control_camara');
  const cambiarControl = crear('button', { type: 'button', class: 'opciones-control' }, [t('opc_cambiar_control')]);
  cambiarControl.addEventListener('click', control.onCambiar);

  const campos: Node[] = [
    crear('div', { class: 'opciones-fila' }, [crear('span', {}, [t('opc_control', { modo: nombreControl })]), cambiarControl]),
    crear('label', {}, [t('opc_metodo'), selectMetodo]),
    crear('label', {}, [t('opc_mano'), selectMano]),
  ];
  for (const { clave, etiqueta, paso } of NUMERICOS) {
    const [min, max] = RANGOS[clave];
    const esDeslizador = DESLIZADORES.has(clave);
    const input = crear('input', {
      type: esDeslizador ? 'range' : 'number',
      min: String(min),
      max: String(max),
      step: String(paso),
    });
    inputs.set(clave, input);
    if (esDeslizador) {
      const valor = crear('span', {}, []);
      valores.set(clave, valor);
      campos.push(crear('label', {}, [t(etiqueta), input, valor]));
    } else {
      campos.push(crear('label', {}, [t(etiqueta), input]));
    }
  }

  campos.push(crear('label', {}, [checkAjuste, t('opc_ajuste_mano')]));

  // Topes de las articulaciones de la mano (grados): mínimo y máximo por parámetro. Se aplican al momento.
  const limInputs = new Map<string, [HTMLInputElement, HTMLInputElement]>();
  const filasLim: Node[] = [];
  for (const [articulacion, params] of Object.entries(tablaLimitesPorDefecto())) {
    for (const nombre of Object.keys(params)) {
      const clave = `lim_${articulacion}_${nombre}` as ClaveTexto;
      const min = crear('input', { type: 'number', min: '-180', max: '180', step: '1', 'aria-label': t('opc_limites_min') });
      const max = crear('input', { type: 'number', min: '-180', max: '180', step: '1', 'aria-label': t('opc_limites_max') });
      min.addEventListener('change', () => aplicar());
      max.addEventListener('change', () => aplicar());
      limInputs.set(`${articulacion}.${nombre}`, [min, max]);
      filasLim.push(crear('div', { class: 'lim-fila' }, [crear('span', {}, [t(clave)]), min, max]));
    }
  }
  const restaurarLim = crear('button', { type: 'button' }, [t('opc_limites_restaurar')]);
  restaurarLim.addEventListener('click', () => {
    const defecto = tablaLimitesPorDefecto();
    for (const [clave, [min, max]] of limInputs) {
      const [art, par] = clave.split('.');
      const v = defecto[art]?.[par];
      if (v) {
        min.value = String(v[0]);
        max.value = String(v[1]);
      }
    }
    aplicar();
  });
  campos.push(crear('details', {}, [crear('summary', {}, [t('opc_limites_titulo')]), ...filasLim, restaurarLim]));

  const cerrar = crear('button', { type: 'button' }, [t('opciones_cerrar')]);
  panel.replaceChildren(crear('h1', {}, [t('opciones_titulo')]), crear('div', { class: 'opciones-caja' }, [...campos, cerrar]));

  const mostrar = (o: Opciones): void => {
    selectMetodo.value = o.metodoSenalar;
    selectMano.value = o.manoSenaladora;
    checkAjuste.checked = o.ajusteManoModelo;
    for (const { clave } of NUMERICOS) {
      const input = inputs.get(clave);
      if (input) input.value = String(o[clave]);
      const valor = valores.get(clave);
      if (valor) valor.textContent = String(o[clave]);
    }
    for (const [clave, [min, max]] of limInputs) {
      const [art, par] = clave.split('.');
      const v = o.limitesMano[art]?.[par];
      if (v) {
        min.value = String(v[0]);
        max.value = String(v[1]);
      }
    }
  };

  const leerLimites = (): TablaLimites => {
    const tabla: TablaLimites = {};
    for (const [clave, [min, max]] of limInputs) {
      const [art, par] = clave.split('.');
      tabla[art] ??= {};
      const a = min.value === '' ? NaN : Number(min.value);
      const b = max.value === '' ? NaN : Number(max.value);
      tabla[art][par] = [a, b];
    }
    return tabla;
  };

  const leer = (): Opciones =>
    normalizarOpciones({
      metodoSenalar: selectMetodo.value,
      manoSenaladora: selectMano.value,
      ajusteManoModelo: checkAjuste.checked,
      limitesMano: leerLimites(),
      ...Object.fromEntries(NUMERICOS.map(({ clave }) => [clave, Number(inputs.get(clave)?.value)])),
    });

  const aplicar = (): void => {
    const nuevas = leer();
    guardarOpciones(nuevas);
    mostrar(nuevas);
    onCambio(nuevas);
  };

  selectMetodo.addEventListener('change', aplicar);
  selectMano.addEventListener('change', aplicar);
  checkAjuste.addEventListener('change', aplicar);
  for (const [clave, input] of inputs) {
    // Los deslizadores aplican en vivo mientras se arrastran; los campos numéricos al confirmar.
    input.addEventListener(DESLIZADORES.has(clave) ? 'input' : 'change', aplicar);
  }

  const oyentes: ((abierto: boolean) => void)[] = [];
  const estaAbierto = (): boolean => !panel.hidden;
  const ponerVisible = (visible: boolean): void => {
    if (estaAbierto() === visible) return;
    panel.hidden = !visible;
    for (const oyente of oyentes) oyente(visible);
  };
  boton.addEventListener('click', () => ponerVisible(!estaAbierto()));
  cerrar.addEventListener('click', () => ponerVisible(false));

  mostrar(actuales);

  return {
    abrir: () => ponerVisible(true),
    cerrar: () => ponerVisible(false),
    abierto: estaAbierto,
    onVisibilidad: (oyente) => oyentes.push(oyente),
  };
}
