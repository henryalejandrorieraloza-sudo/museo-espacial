import { requireEl } from './dom';

export interface CursorUi {
  /** Muestra u oculta el cursor (se oculta con el método de rayo). */
  mostrar(visible: boolean): void;
  /** Coloca el cursor en una posición de pantalla (0–1). `atenuado` lo deja visible pero tenue. */
  mover(x: number, y: number, atenuado: boolean): void;
}

/** Cursor circular que sigue el dedo índice (SPEC 4). Solo dibuja; la lógica está en game/cursor.ts. */
export function crearCursor(): CursorUi {
  const el = requireEl('cursor');

  return {
    mostrar(visible) {
      el.hidden = !visible;
    },
    mover(x, y, atenuado) {
      el.style.transform = `translate(${x * window.innerWidth}px, ${y * window.innerHeight}px) translate(-50%, -50%)`;
      el.classList.toggle('atenuado', atenuado);
    },
  };
}
