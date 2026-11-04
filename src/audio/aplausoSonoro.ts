// Aplauso por sonido (micrófono). Complementa al aplauso visual de tracking/gestures.ts.
//
// Un aplauso es un impulso muy corto y de banda ancha: sube de golpe sobre el ruido de fondo y
// tiene muchos cruces por cero. La voz y la música suben más despacio o cruzan el cero menos veces.
// La decisión (DetectorAplausoSonoro) es pura y no usa Web Audio, para poder probarla con señales
// sintéticas. MicAplausoSonoro solo captura el micrófono y alimenta al detector.

/** Un impulso debe superar este múltiplo del ruido de fondo (8 ≈ +18 dB). */
export const SONIDO_RATIO_IMPULSO_DEFAULT = 8;
/** Nivel RMS mínimo (≈ −34 dBFS): por debajo, es silencio y no hay aplauso. */
export const SONIDO_RMS_MIN_DEFAULT = 0.02;
/** Fracción mínima de muestras con cruce de signo (0–1). El ruido agudo de un aplauso supera esto. */
export const SONIDO_CRUCES_MIN_DEFAULT = 0.15;
/** Cooldown (s) entre aplausos sonoros; igual que el visual. */
export const SONIDO_COOLDOWN_S = 1.5;
/** Duración (s) del indicador combinado de /debug/. */
export const SONIDO_INDICADOR_S = 1.5;

/** Adaptación del ruido de fondo cuando la señal está en el suelo (rápida, ~0.5 s a 100 Hz). */
const SUELO_ALPHA_BAJO = 0.02;
/** Adaptación cuando hay sonido sostenido por encima del umbral (lenta, ~3 s): un ventilador
 *  no se confunde con un aplauso y un impulso aislado apenas mueve el suelo. */
const SUELO_ALPHA_ALTO = 0.003;
const SUELO_MIN = 1e-4;
/** Intervalo (ms) entre lecturas del micrófono. */
export const SONIDO_PERIODO_MS = 10;

export interface OpcionesSonido {
  ratioImpulso: number;
  rmsMin: number;
  crucesMin: number;
  cooldownS: number;
}

export const SONIDO_OPCIONES_DEFAULT: OpcionesSonido = {
  ratioImpulso: SONIDO_RATIO_IMPULSO_DEFAULT,
  rmsMin: SONIDO_RMS_MIN_DEFAULT,
  crucesMin: SONIDO_CRUCES_MIN_DEFAULT,
  cooldownS: SONIDO_COOLDOWN_S,
};

/** Una lectura de audio: instante (s), nivel RMS (0–1) y fracción de cruces por cero (0–1). */
export interface MuestraSonora {
  t: number;
  rms: number;
  cruces: number;
}

export type MotivoSonoro =
  | 'impulso + ruido agudo'
  | 'impulso sin ruido agudo'
  | 'impulso bajo'
  | 'impulso en cooldown';

export interface EstadoSonoro {
  /** Nivel de la última muestra sobre el ruido de fondo (dB). */
  nivelDb: number;
  rms: number;
  cruces: number;
  /** Último motivo de impulso registrado; null si aún no hubo ninguno. */
  motivo: MotivoSonoro | null;
}

/**
 * Detecta aplausos a partir de muestras RMS + cruces por cero, con un ruido de fondo adaptativo.
 * Se confirma un aplauso si, en esa muestra:
 *  - el nivel salta de menos a más del umbral (ratioImpulso × ruido de fondo) y es ≥ rmsMin;
 *  - la muestra tiene suficiente ruido agudo (cruces ≥ crucesMin);
 *  - no está dentro del cooldown.
 * Solo cuenta el primer fotograma que supera el umbral: un sonido sostenido no dispara varias veces.
 */
export class DetectorAplausoSonoro {
  private suelo: number | null = null;
  private previaRms = 0;
  private ultimoDisparo = Number.NEGATIVE_INFINITY;
  private ultimoEstado: EstadoSonoro | null = null;

  constructor(private readonly opciones: OpcionesSonido = SONIDO_OPCIONES_DEFAULT) {}

  /** Procesa una muestra. Devuelve true solo en el instante en que se confirma un aplauso. */
  push(m: MuestraSonora): boolean {
    const o = this.opciones;
    if (this.suelo === null) this.suelo = Math.max(m.rms, SUELO_MIN);

    const umbral = this.suelo * o.ratioImpulso;
    const impulso = m.rms >= umbral && this.previaRms < umbral;
    let disparo = false;
    let motivo = this.ultimoEstado?.motivo ?? null;

    if (impulso) {
      if (m.rms < o.rmsMin) {
        motivo = 'impulso bajo';
      } else if (m.cruces < o.crucesMin) {
        motivo = 'impulso sin ruido agudo';
      } else if (m.t - this.ultimoDisparo < o.cooldownS) {
        motivo = 'impulso en cooldown';
      } else {
        disparo = true;
        motivo = 'impulso + ruido agudo';
        this.ultimoDisparo = m.t;
      }
    }

    // Actualiza el ruido de fondo: rápido en silencio, lento cuando hay sonido sostenido.
    const alpha = m.rms >= umbral ? SUELO_ALPHA_ALTO : SUELO_ALPHA_BAJO;
    this.suelo = Math.max(SUELO_MIN, this.suelo + (m.rms - this.suelo) * alpha);
    this.previaRms = m.rms;

    const nivelDb = 20 * Math.log10(Math.max(m.rms, 1e-9) / this.suelo);
    this.ultimoEstado = { nivelDb, rms: m.rms, cruces: m.cruces, motivo };
    return disparo;
  }

  /** Último estado conocido; null antes de la primera muestra. */
  get estado(): EstadoSonoro | null {
    return this.ultimoEstado;
  }
}

/**
 * Captura el micrófono y lo alimenta al detector cada SONIDO_PERIODO_MS.
 * Se desactivan el procesado de voz del navegador (cancelación de eco, supresión de ruido y
 * control automático de ganancia): atenúan justo los impulsos que buscamos.
 * El audio no se envía a los altavoces, así que no hay retroalimentación.
 */
export class MicAplausoSonoro {
  private readonly detector = new DetectorAplausoSonoro();
  private readonly buffer: Float32Array<ArrayBuffer>;
  private timer: number | undefined;
  /** Instante (s) del último aplauso sonoro; -Infinity si nunca. */
  ultimoAplauso = Number.NEGATIVE_INFINITY;

  private constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly analyser: AnalyserNode,
  ) {
    this.buffer = new Float32Array(analyser.fftSize);
  }

  /** Pide el micrófono y arranca la lectura. Lanza error si el usuario lo deniega o no hay micrófono. */
  static async start(): Promise<MicAplausoSonoro> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('este navegador no permite usar el micrófono');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const mic = new MicAplausoSonoro(ctx, stream, analyser);
    if (ctx.state !== 'running') {
      // Algunos navegadores bloquean el audio hasta un gesto del usuario.
      const reanudar = () => void ctx.resume();
      document.addEventListener('pointerdown', reanudar, { once: true });
    }
    mic.timer = window.setInterval(() => mic.tick(), SONIDO_PERIODO_MS);
    return mic;
  }

  /** True mientras el navegador no deja leer el audio (hay que pulsar la página). */
  get pendiente(): boolean {
    return this.ctx.state !== 'running';
  }

  /** Último estado del detector; null si aún no hay muestras. */
  get estado(): EstadoSonoro | null {
    return this.detector.estado;
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.stream.getTracks().forEach((track) => track.stop());
    void this.ctx.close();
  }

  private tick(): void {
    this.analyser.getFloatTimeDomainData(this.buffer);
    const n = this.buffer.length;
    let suma = 0;
    let cruces = 0;
    for (let i = 0; i < n; i++) {
      const x = this.buffer[i];
      suma += x * x;
      if (i > 0 && (x >= 0) !== (this.buffer[i - 1] >= 0)) cruces++;
    }
    const t = performance.now() / 1000;
    const muestra: MuestraSonora = { t, rms: Math.sqrt(suma / n), cruces: cruces / (n - 1) };
    if (this.detector.push(muestra)) this.ultimoAplauso = t;
  }
}
