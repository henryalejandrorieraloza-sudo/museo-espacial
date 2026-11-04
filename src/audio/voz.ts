// Voz del mentor con Web Speech API (SPEC 1, 7.2 y 11). Desacoplada: el resto del juego solo llama a `hablar`
// y `cancelar`. Para usar archivos grabados, se cambia esta implementación y no el resto.
//
// La explicación se reproduce frase a frase: al terminar una (evento onend) empieza la siguiente. Así Chrome
// no corta frases largas. Si no hay voces o la síntesis falla, cada frase dura lo que tardaría leída a
// CARACTERES_POR_SEGUNDO, de modo que el flujo del museo nunca se queda esperando (SPEC 7.2).

/** Ritmo del temporizador de respaldo cuando no hay voz (caracteres por segundo). */
export const CARACTERES_POR_SEGUNDO = 15;
/** Margen (ms) que se da a una frase con voz antes de darla por perdida si nunca llega su evento de fin. */
const MARGEN_VIGILANCIA_MS = 5000;

export interface Voz {
  /**
   * Habla `texto` frase a frase. `alFrase` recibe cada frase cuando empieza (para los subtítulos).
   * `alTerminar` se llama al acabar la última frase; no se llama si la explicación se cancela.
   */
  hablar(texto: string, alTerminar?: () => void, alFrase?: (frase: string) => void): void;
  /** Corta la voz y descarta la explicación en curso. No se llama a `alTerminar`. */
  cancelar(): void;
}

/** Divide un texto en frases, conservando el signo de puntuación final. */
export function dividirFrases(texto: string): string[] {
  const partes = texto.match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g) ?? [];
  return partes.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Duración (ms) de una frase leída al ritmo del respaldo. */
export function duracionRespaldoMs(frase: string): number {
  return Math.round((frase.length / CARACTERES_POR_SEGUNDO) * 1000);
}

export function crearVoz(idioma = 'es-ES'): Voz {
  const sintesis: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  /** Identificador de la explicación en curso: cancelar o empezar otra lo invalida, y sus eventos se ignoran. */
  let vigente = 0;
  /** Referencias vivas a las frases de la explicación en curso, para que el navegador no las recoja. */
  let frases: SpeechSynthesisUtterance[] = [];
  /** Temporizador de la frase en curso: respaldo sin voz, error o vigilancia de frases sin evento de fin. */
  let temporizador: number | undefined;

  const detener = (): void => {
    window.clearTimeout(temporizador);
    temporizador = undefined;
  };
  const programar = (ms: number, fn: () => void): void => {
    detener();
    temporizador = window.setTimeout(fn, ms);
  };
  const hayVoces = (): boolean => {
    try {
      return sintesis !== undefined && sintesis.getVoices().length > 0;
    } catch {
      return false;
    }
  };

  return {
    hablar(texto, alTerminar, alFrase) {
      const id = ++vigente;
      detener();
      frases = [];
      const trozos = dividirFrases(texto);
      let indice = 0;

      const siguiente = (): void => {
        if (id !== vigente) return;
        detener();
        if (indice >= trozos.length) {
          vigente++;
          frases = [];
          alTerminar?.();
          return;
        }
        const frase = trozos[indice++];
        alFrase?.(frase);

        // Cada frase termina una sola vez: por evento de fin, por error o por temporizador.
        let hecha = false;
        const terminarFrase = (): void => {
          if (hecha || id !== vigente) return;
          hecha = true;
          siguiente();
        };

        if (!sintesis || !hayVoces()) {
          programar(duracionRespaldoMs(frase), terminarFrase);
          return;
        }
        try {
          const utterance = new SpeechSynthesisUtterance(frase);
          utterance.lang = idioma;
          frases.push(utterance);
          utterance.onend = terminarFrase;
          // Un error no debe dejar el flujo parado: la frase sigue con el temporizador de respaldo.
          utterance.onerror = () => {
            if (!hecha && id === vigente) programar(duracionRespaldoMs(frase), terminarFrase);
          };
          sintesis.speak(utterance);
          // Vigilancia: si el navegador nunca envía el evento de fin, la frase avanza igualmente.
          programar(duracionRespaldoMs(frase) + MARGEN_VIGILANCIA_MS, terminarFrase);
        } catch {
          // Sin voz disponible o síntesis fallida: el subtítulo queda y la frase se lee por temporizador.
          programar(duracionRespaldoMs(frase), terminarFrase);
        }
      };

      try {
        sintesis?.cancel();
      } catch {
        // Nada que cancelar si el navegador no tiene voz.
      }
      siguiente();
    },
    cancelar() {
      vigente++;
      detener();
      frases = [];
      try {
        sintesis?.cancel();
      } catch {
        // Nada que cancelar si el navegador no tiene voz.
      }
    },
  };
}
