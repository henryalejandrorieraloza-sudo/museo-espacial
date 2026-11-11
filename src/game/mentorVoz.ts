import type { OyenteVoz } from '../audio/voz';
import { visual } from '../visual/museo';

/**
 * Oyente que lleva la sincronía de la voz al robot-mentor: estado, gestos por marca (uno por frase) y amplitud de los LED.
 * Si el mentor no está visible (misiones), los gestos no se ven y el resto del juego no se entera.
 */
export function crearOyenteMentor(): OyenteVoz {
  return {
    alEstado(estado) {
      visual.museo.mentorEstado(estado === 'hablando' ? 'speaking' : 'idle');
      if (estado === 'quieto') visual.museo.mentorAmplitud(null);
    },
    alInicioFrase() {
      // El mentor solo usa esto para permitir un gesto nuevo por frase.
      visual.museo.mentorGesto('inicioFrase');
    },
    alCue(cue) {
      visual.museo.mentorGesto(cue);
    },
    alAmplitud(amplitud) {
      visual.museo.mentorAmplitud(amplitud);
    },
  };
}
