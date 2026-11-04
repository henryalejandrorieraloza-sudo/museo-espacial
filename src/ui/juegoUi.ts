import { t } from '../i18n';
import { requireEl } from './dom';

/** Los subtítulos del mentor se ocultan como mucho a los 30 s (SPEC 7.2). */
const SUBTITULO_MAX_MS = 30_000;

export interface JuegoUi {
  /** Mensaje de encuadre, calibración o seguimiento. null lo oculta. */
  aviso(texto: string | null): void;
  /** Subtítulo del mentor. null lo oculta. */
  subtitulos(texto: string | null): void;
  /** Indicación “Aplaude para entrar”. null la oculta. No depende del temporizador de los subtítulos. */
  indicarEntrar(texto: string | null): void;
  mostrarMision(titulo: string): void;
  ocultarMision(): void;
}

/** Overlay DOM sobre la escena: avisos, subtítulos, indicación de entrar y la pantalla temporal de misión. */
export function crearUi(onVolver: () => void): JuegoUi {
  const aviso = requireEl('aviso');
  const subtitulos = requireEl('subtitulos');
  const entrar = requireEl('entrar');
  const mision = requireEl('mision');
  const misionTitulo = requireEl('misionTitulo');
  const volver = requireEl<HTMLButtonElement>('volver');

  volver.textContent = t('volver_museo');
  volver.addEventListener('click', onVolver);

  let temporizadorSubtitulos: number | undefined;

  return {
    aviso(texto) {
      aviso.textContent = texto ?? '';
      aviso.hidden = texto === null;
    },
    indicarEntrar(texto) {
      entrar.textContent = texto ?? '';
      entrar.hidden = texto === null;
    },
    subtitulos(texto) {
      window.clearTimeout(temporizadorSubtitulos);
      subtitulos.textContent = texto ?? '';
      subtitulos.hidden = texto === null;
      if (texto !== null) {
        temporizadorSubtitulos = window.setTimeout(() => {
          subtitulos.hidden = true;
        }, SUBTITULO_MAX_MS);
      }
    },
    mostrarMision(titulo) {
      misionTitulo.textContent = titulo;
      mision.hidden = false;
    },
    ocultarMision() {
      mision.hidden = true;
    },
  };
}
