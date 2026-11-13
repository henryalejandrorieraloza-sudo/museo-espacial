import { alCambiarIdioma, t } from '../i18n';
import { requireEl } from './dom';

// Capa DOM de la presentación del LRV (game/presentacionLRV.ts): fundido entre escenas, rótulos sobre las piezas,
// tarjeta del peso, ayuda de teclas y el mensaje final. Va por debajo de los subtítulos, que son los del juego
// (#subtitulos), para que se lean siempre, también durante los fundidos.

/** Rótulo a dibujar: texto ya traducido, posición en pantalla (px) y opacidad (0–1). */
export interface RotuloUi {
  texto: string;
  x: number;
  y: number;
  opacidad: number;
}

export interface PresentacionUi {
  mostrar(visible: boolean): void;
  /** Opacidad del negro entre escenas (0–1). */
  fundido(opacidad: number): void;
  rotulos(lista: readonly RotuloUi[]): void;
  /** Opacidad de la tarjeta del peso (0 la oculta). */
  peso(opacidad: number): void;
  /** Línea que separa las dos mitades de la vista dividida. */
  division(visible: boolean): void;
  ayuda(texto: string | null): void;
  /** Mensaje final ("Estás listo para la misión"). null lo oculta. */
  listo(texto: string | null): void;
  /** Teclas mientras se ve la presentación: Enter salta y C enciende o apaga los subtítulos. */
  alTeclas(saltar: () => void, alternarSubtitulos: () => void): void;
}

/** No reaccionar a teclas mientras se escribe en un campo (panel de opciones). */
function enCampo(objetivo: EventTarget | null): boolean {
  return objetivo instanceof HTMLInputElement || objetivo instanceof HTMLSelectElement || objetivo instanceof HTMLTextAreaElement;
}

export function crearPresentacionUi(): PresentacionUi {
  const raiz = requireEl('presentacion');
  const fundido = requireEl('presentacionFundido');
  const capaRotulos = requireEl('presentacionRotulos');
  const peso = requireEl('presentacionPeso');
  const ayuda = requireEl('presentacionAyuda');
  const listo = requireEl('presentacionListo');
  const rotulos: HTMLDivElement[] = [];
  const linea = document.createElement('div');
  linea.className = 'presentacion-division';
  linea.hidden = true;
  raiz.appendChild(linea);
  let visible = false;
  let alSaltar: (() => void) | null = null;
  let alSubtitulos: (() => void) | null = null;

  const rellenarPeso = (): void => {
    const columna = (titulo: string, valor: string): HTMLDivElement => {
      const div = document.createElement('div');
      div.className = 'presentacion-peso-columna';
      const v = document.createElement('strong');
      v.textContent = valor;
      const tt = document.createElement('span');
      tt.textContent = titulo;
      div.append(v, tt);
      return div;
    };
    const fila = document.createElement('div');
    fila.className = 'presentacion-peso-fila';
    fila.append(columna(t('pres_peso_tierra'), '460 lb'), columna(t('pres_peso_luna'), '76 lb'));
    const masa = document.createElement('p');
    masa.textContent = t('pres_peso_masa');
    peso.replaceChildren(fila, masa);
  };
  rellenarPeso();
  alCambiarIdioma(rellenarPeso);

  window.addEventListener('keydown', (ev) => {
    if (!visible || ev.repeat || enCampo(ev.target)) return;
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
      ev.preventDefault();
      alSaltar?.();
    } else if (ev.code === 'KeyC') {
      alSubtitulos?.();
    }
  });

  return {
    mostrar(v) {
      visible = v;
      raiz.hidden = !v;
      if (!v) {
        fundido.style.opacity = '0';
        for (const r of rotulos) r.hidden = true;
        peso.hidden = true;
        listo.hidden = true;
        linea.hidden = true;
      }
    },
    fundido(opacidad) {
      fundido.style.opacity = String(Math.min(1, Math.max(0, opacidad)));
    },
    rotulos(lista) {
      while (rotulos.length < lista.length) {
        const div = document.createElement('div');
        div.className = 'presentacion-rotulo';
        capaRotulos.appendChild(div);
        rotulos.push(div);
      }
      rotulos.forEach((div, i) => {
        const r = lista[i];
        if (!r || r.opacidad <= 0.001) {
          div.hidden = true;
          return;
        }
        div.hidden = false;
        if (div.textContent !== r.texto) div.textContent = r.texto;
        // Dentro de la pantalla, con margen: el rótulo nunca se sale por un borde.
        const ancho = window.innerWidth;
        const alto = window.innerHeight;
        const medio = div.offsetWidth / 2 + 8;
        const x = Math.min(ancho - medio, Math.max(medio, r.x));
        const y = Math.min(alto - 120, Math.max(56, r.y));
        div.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        div.style.opacity = r.opacidad.toFixed(3);
      });
    },
    division(v) {
      linea.hidden = !v;
    },
    peso(opacidad) {
      peso.hidden = opacidad <= 0.001;
      peso.style.opacity = opacidad.toFixed(3);
    },
    ayuda(texto) {
      ayuda.textContent = texto ?? '';
      ayuda.hidden = texto === null;
    },
    listo(texto) {
      listo.textContent = texto ?? '';
      listo.hidden = texto === null;
    },
    alTeclas(saltar, alternarSubtitulos) {
      alSaltar = saltar;
      alSubtitulos = alternarSubtitulos;
    },
  };
}
