// Pantalla de inicio: título del museo, elección de control y botón "Empezar".
// Se muestra antes del juego y otra vez si la cámara falla, para ofrecer el modo teclado.

import type { ModoControl } from '../game/opciones';
import { t, type ClaveTexto } from '../i18n';
import { requireEl } from './dom';

export interface InicioUi {
  /**
   * Muestra la pantalla con `preferido` marcado y espera a que el jugador pulse "Empezar".
   * Con `error`, muestra el mensaje encima de las opciones (por ejemplo, si la cámara falló).
   */
  elegir(preferido: ModoControl, error?: string): Promise<ModoControl>;
}

const OPCIONES: { modo: ModoControl; titulo: ClaveTexto; descripcion: ClaveTexto }[] = [
  { modo: 'camara', titulo: 'inicio_control_camara', descripcion: 'inicio_control_camara_desc' },
  { modo: 'teclado', titulo: 'inicio_control_teclado', descripcion: 'inicio_control_teclado_desc' },
];

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

export function crearInicioUi(): InicioUi {
  const seccion = requireEl('inicio');
  const error = crear('p', { class: 'inicio-error', role: 'alert' });
  const radios = new Map<ModoControl, HTMLInputElement>();
  const filas = OPCIONES.map(({ modo, titulo, descripcion }) => {
    const radio = crear('input', { type: 'radio', name: 'control', value: modo });
    radios.set(modo, radio);
    return crear('label', { class: 'inicio-opcion' }, [
      radio,
      crear('span', {}, [crear('strong', {}, [t(titulo)]), crear('small', {}, [t(descripcion)])]),
    ]);
  });
  const empezar = crear('button', { type: 'button', class: 'inicio-empezar' }, [t('inicio_empezar')]);
  seccion.replaceChildren(
    crear('div', { class: 'inicio-caja' }, [
      crear('h1', {}, [t('inicio_titulo')]),
      error,
      crear('fieldset', {}, [crear('legend', {}, [t('inicio_elige')]), ...filas]),
      empezar,
    ]),
  );

  return {
    elegir(preferido, mensaje) {
      error.textContent = mensaje ?? '';
      error.hidden = !mensaje;
      const radio = radios.get(preferido);
      if (radio) radio.checked = true;
      seccion.hidden = false;
      empezar.focus();
      return new Promise((resolver) => {
        const alEmpezar = (): void => {
          empezar.removeEventListener('click', alEmpezar);
          seccion.hidden = true;
          // Quita el foco del botón oculto: así la barra espaciadora no lo vuelve a pulsar.
          empezar.blur();
          resolver(radios.get('teclado')?.checked ? 'teclado' : 'camara');
        };
        empezar.addEventListener('click', alEmpezar);
      });
    },
  };
}
