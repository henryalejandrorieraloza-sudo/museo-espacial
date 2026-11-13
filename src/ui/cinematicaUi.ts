import { alCambiarIdioma, t } from '../i18n';
import { requireEl } from './dom';
import type { EstiloToma } from '../game/cinematicaDespegue';

// Capa DOM de la cinemática del despegue (game/cinematicaDespegue.ts): texto abajo a la izquierda, botón Omitir (y
// Enter) y el aspecto de cada toma. La transmisión de TV de los años 70 se imita con un filtro CSS sobre el lienzo 3D
// (algo de desenfoque, color apagado y, al seguir al módulo, sobreexposición), grano animado con motas de color y
// viñeta con líneas. La cámara de cine de la ventana del LM lleva menos grano y un tono cálido.

export interface CinematicaUi {
  mostrar(visible: boolean): void;
  /** Aspecto de la toma actual. `sobreexposicion` (0–1) solo cuenta en las tomas de TV. null = sin efecto. */
  aspecto(estilo: EstiloToma | null, sobreexposicion: number): void;
  /** Texto ya traducido y su opacidad (0 lo oculta). */
  texto(texto: string | null, opacidad: number): void;
  /** El botón Omitir (y Enter) solo valen hasta el modo libre. */
  omitible(si: boolean): void;
  alOmitir(fn: () => void): void;
}

/** No reaccionar a teclas mientras se escribe en un campo (panel de opciones). */
function enCampo(objetivo: EventTarget | null): boolean {
  return objetivo instanceof HTMLInputElement || objetivo instanceof HTMLSelectElement || objetivo instanceof HTMLTextAreaElement;
}

/** Grano por estilo: opacidad de la capa de ruido y de la viñeta. */
const GRANO: Record<EstiloToma, number> = { limpio: 0, tv: 0.32, pelicula: 0.16 };
const VINETA: Record<EstiloToma, number> = { limpio: 0, tv: 1, pelicula: 0.8 };

/** Filtro CSS del lienzo 3D para cada estilo. En TV, la sobreexposición sube el brillo, baja el contraste y desenfoca. */
function filtroLienzo(estilo: EstiloToma | null, sobreexposicion: number): string {
  if (estilo === 'tv') {
    const s = Math.min(1, Math.max(0, sobreexposicion));
    return `blur(${(0.6 + 2.6 * s).toFixed(2)}px) saturate(${(0.72 - 0.3 * s).toFixed(2)}) contrast(${(1.12 - 0.35 * s).toFixed(2)}) brightness(${(1.08 + 0.85 * s).toFixed(2)})`;
  }
  if (estilo === 'pelicula') return 'blur(0.35px) sepia(0.18) saturate(0.85) contrast(1.06)';
  return '';
}

export function crearCinematicaUi(): CinematicaUi {
  const raiz = requireEl('cinematica');
  const grano = requireEl<HTMLCanvasElement>('cinematicaGrano');
  const vineta = requireEl('cinematicaVineta');
  const texto = requireEl('cinematicaTexto');
  const omitir = requireEl<HTMLButtonElement>('cinematicaOmitir');
  const ctx = grano.getContext('2d');
  const imagen = ctx?.createImageData(grano.width, grano.height) ?? null;
  let alOmitir: (() => void) | null = null;
  let visible = false;
  let filtroActual = '';

  const rotular = (): void => {
    omitir.textContent = t('cine_omitir');
  };
  rotular();
  alCambiarIdioma(rotular);

  omitir.addEventListener('click', () => alOmitir?.());
  window.addEventListener('keydown', (ev) => {
    if (!visible || omitir.hidden || ev.code !== 'Enter' || enCampo(ev.target)) return;
    ev.preventDefault();
    alOmitir?.();
  });

  /** Lienzo 3D (Three.js), para el filtro de TV. Se busca cada vez: lo crea visual/museo.ts al arrancar. */
  const lienzo = (): HTMLCanvasElement | null => document.querySelector<HTMLCanvasElement>('#scene canvas');

  const fijarFiltro = (filtro: string): void => {
    if (filtro === filtroActual) return;
    filtroActual = filtro;
    const l = lienzo();
    if (l) l.style.filter = filtro;
  };

  /** Ruido gris con algunas motas de color, como la señal de TV de las referencias. */
  const pintarGrano = (): void => {
    if (!ctx || !imagen) return;
    const d = imagen.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = Math.random() < 0.5 ? 70 : 0;
    }
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(Math.random() * (d.length / 4)) * 4;
      const c = Math.floor(Math.random() * 3);
      d[i] = c === 0 ? 255 : 60;
      d[i + 1] = c === 1 ? 255 : 60;
      d[i + 2] = c === 2 ? 255 : 90;
      d[i + 3] = 255;
    }
    ctx.putImageData(imagen, 0, 0);
  };

  return {
    mostrar(si) {
      visible = si;
      raiz.hidden = !si;
      if (!si) {
        fijarFiltro('');
        texto.style.opacity = '0';
      }
    },
    aspecto(estilo, sobreexposicion) {
      fijarFiltro(filtroLienzo(estilo, sobreexposicion));
      const g = estilo ? GRANO[estilo] : 0;
      grano.style.opacity = String(g);
      if (g > 0) pintarGrano();
      vineta.style.opacity = String(estilo ? VINETA[estilo] : 0);
      vineta.classList.toggle('pelicula', estilo === 'pelicula');
    },
    texto(contenido, opacidad) {
      if (contenido !== null && texto.textContent !== contenido) texto.textContent = contenido;
      texto.style.opacity = String(contenido === null ? 0 : opacidad);
    },
    omitible(si) {
      omitir.hidden = !si;
    },
    alOmitir(fn) {
      alOmitir = fn;
    },
  };
}
