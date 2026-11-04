import { guardarOpciones, RANGOS, normalizarOpciones, type Opciones } from '../game/opciones';
import { t, type ClaveTexto } from '../i18n';
import { requireEl } from './dom';

type Numerico =
  | 'sensibilidadCursor'
  | 'suavizadoCursor'
  | 'metrosPorPaso'
  | 'velocidadMax'
  | 'tiempoAceleracion'
  | 'sensibilidadGiro';

const NUMERICOS: { clave: Numerico; etiqueta: ClaveTexto; paso: number }[] = [
  { clave: 'sensibilidadCursor', etiqueta: 'opc_sensibilidad', paso: 0.1 },
  { clave: 'suavizadoCursor', etiqueta: 'opc_suavizado', paso: 0.05 },
  { clave: 'metrosPorPaso', etiqueta: 'opc_metros_paso', paso: 0.05 },
  { clave: 'velocidadMax', etiqueta: 'opc_velocidad_max', paso: 0.1 },
  { clave: 'tiempoAceleracion', etiqueta: 'opc_tiempo_aceleracion', paso: 0.05 },
  { clave: 'sensibilidadGiro', etiqueta: 'opc_sensibilidad_giro', paso: 0.05 },
];

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

/**
 * Panel de opciones (SPEC 13). Los cambios se aplican al momento y se guardan.
 * `onCambio` recibe siempre valores ya ajustados a su rango.
 */
export function crearOpcionesUi(actuales: Opciones, onCambio: (nuevas: Opciones) => void): void {
  const boton = requireEl<HTMLButtonElement>('opcionesBoton');
  const panel = requireEl('opciones');
  boton.textContent = t('opciones_boton');

  const selectMetodo = crear('select', { id: 'opcMetodo' }, [
    crear('option', { value: 'cursor' }, [t('opc_metodo_cursor')]),
    crear('option', { value: 'rayo' }, [t('opc_metodo_rayo')]),
  ]);
  const selectMano = crear('select', { id: 'opcMano' }, [
    crear('option', { value: 'Right' }, [t('opc_mano_derecha')]),
    crear('option', { value: 'Left' }, [t('opc_mano_izquierda')]),
  ]);
  const inputs = new Map<Numerico, HTMLInputElement>();

  const campos: Node[] = [
    crear('label', {}, [t('opc_metodo'), selectMetodo]),
    crear('label', {}, [t('opc_mano'), selectMano]),
  ];
  for (const { clave, etiqueta, paso } of NUMERICOS) {
    const [min, max] = RANGOS[clave];
    const input = crear('input', {
      type: 'number',
      min: String(min),
      max: String(max),
      step: String(paso),
    });
    inputs.set(clave, input);
    campos.push(crear('label', {}, [t(etiqueta), input]));
  }

  const cerrar = crear('button', { type: 'button' }, [t('opciones_cerrar')]);
  panel.replaceChildren(crear('h1', {}, [t('opciones_titulo')]), crear('div', { class: 'opciones-caja' }, [...campos, cerrar]));

  const mostrar = (o: Opciones): void => {
    selectMetodo.value = o.metodoSenalar;
    selectMano.value = o.manoSenaladora;
    for (const { clave } of NUMERICOS) {
      const input = inputs.get(clave);
      if (input) input.value = String(o[clave]);
    }
  };

  const leer = (): Opciones =>
    normalizarOpciones({
      metodoSenalar: selectMetodo.value,
      manoSenaladora: selectMano.value,
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
  for (const input of inputs.values()) input.addEventListener('change', aplicar);

  boton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });
  cerrar.addEventListener('click', () => {
    panel.hidden = true;
  });

  mostrar(actuales);
}
