import type { CueNombre, Guion } from './guion';

// Sincronía entre la voz y el mentor. La voz (síntesis o audio grabado) avisa de en qué frase y palabra va;
// esta clase convierte eso en eventos para el mentor: inicio y fin de frase, gestos (cues) y estado.
// No usa DOM: la fuente de tiempos (audio.currentTime, eventos boundary o temporizadores) queda fuera.

export interface OyenteVoz {
  /** 'hablando' al empezar una línea; 'quieto' al terminar, cancelar o pausar. */
  alEstado?(estado: 'hablando' | 'quieto'): void;
  alInicioFrase?(info: { indice: number; pregunta: boolean; cueEnPrimeraPalabra: boolean }): void;
  /** Una palabra con marca de gesto acaba de empezar a sonar. */
  alCue?(cue: CueNombre, palabra: string): void;
  /** Una palabra con marca de plano de cámara ("{@id}") acaba de empezar a sonar (presentación del LRV). */
  alPlano?(id: string, palabra: string): void;
  alFinFrase?(info: { indice: number; pregunta: boolean }): void;
  /** Amplitud real (0..1) del audio, una vez por fotograma. Solo con audio grabado. */
  alAmplitud?(amplitud: number): void;
}

export class Sincronia {
  private siguientePalabra = 0;
  private abierta = -1;
  private ultimaFrase = -1;
  private readonly fraseDe: number[];

  constructor(
    readonly guion: Guion,
    private readonly oyente: () => OyenteVoz,
    private readonly alFrase?: (texto: string) => void,
  ) {
    this.fraseDe = guion.palabras.map((_, i) => guion.frases.findIndex((f) => i >= f.primera && i <= f.ultima));
  }

  empezar(): void {
    this.oyente().alEstado?.('hablando');
  }

  /** Empieza la frase `n` (cierra la anterior si seguía abierta). El subtítulo sale aquí. */
  frase(n: number): void {
    if (n <= this.ultimaFrase || n >= this.guion.frases.length) return;
    if (this.abierta >= 0) this.finFrase(this.abierta);
    const f = this.guion.frases[n];
    this.ultimaFrase = n;
    this.abierta = n;
    this.alFrase?.(f.texto);
    this.oyente().alInicioFrase?.({
      indice: n,
      pregunta: f.pregunta,
      cueEnPrimeraPalabra: this.guion.palabras[f.primera].cues.length > 0,
    });
  }

  /** La palabra `i` empieza a sonar: dispara sus marcas (y las de palabras anteriores que no se hubieran visto). */
  palabra(i: number): void {
    const hasta = Math.min(i, this.guion.palabras.length - 1);
    for (let w = this.siguientePalabra; w <= hasta; w++) {
      const fr = this.fraseDe[w];
      if (fr >= 0) this.frase(fr);
      for (const cue of this.guion.palabras[w].cues) this.oyente().alCue?.(cue, this.guion.palabras[w].texto);
      for (const id of this.guion.palabras[w].planos) this.oyente().alPlano?.(id, this.guion.palabras[w].texto);
    }
    this.siguientePalabra = Math.max(this.siguientePalabra, hasta + 1);
  }

  finFrase(n: number): void {
    if (this.abierta !== n) return;
    this.abierta = -1;
    this.oyente().alFinFrase?.({ indice: n, pregunta: this.guion.frases[n].pregunta });
  }

  /**
   * Fuente con tiempos: `inicios[i]` es cuándo empieza la palabra i (s) y `finales[n]`, cuándo termina la frase n
   * (si se conoce). Se llama cada fotograma con el tiempo actual.
   */
  avanzar(t: number, inicios: readonly number[], finales?: readonly (number | undefined)[]): void {
    let i = this.siguientePalabra;
    while (i < inicios.length && inicios[i] <= t) i++;
    if (i > this.siguientePalabra) this.palabra(i - 1);
    if (this.abierta >= 0 && this.siguientePalabra > this.guion.frases[this.abierta].ultima) {
      const fin = finales?.[this.abierta];
      if (fin !== undefined && t >= fin) this.finFrase(this.abierta);
    }
  }

  /** Fin natural de la línea. */
  terminar(): void {
    if (this.abierta >= 0) this.finFrase(this.abierta);
    this.oyente().alEstado?.('quieto');
  }

  /** Corte (cancelar o pausa): no se cierra la frase con un gesto de final; el mentor vuelve a neutro. */
  cancelar(): void {
    this.abierta = -1;
    this.oyente().alEstado?.('quieto');
  }
}
