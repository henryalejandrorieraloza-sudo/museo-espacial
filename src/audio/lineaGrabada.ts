import type { Guion } from './guion';
import type { OyenteVoz, Sincronia } from './sincronia';

// Adaptador de líneas grabadas: { audioUrl, words: [{ text, start, end? }] }. Reproduce el audio con un
// HTMLAudioElement (para que el AnalyserNode dé amplitud real) y mueve la `Sincronia` con `audio.currentTime`.
// Si solo se conocen los inicios de palabra (sin `end`), vale igual: el fin de frase llega con la frase siguiente.

export interface PalabraTiempo {
  text: string;
  /** Segundos desde el inicio del audio. */
  start: number;
  end?: number;
}

export interface LineaGrabada {
  audioUrl: string;
  words: PalabraTiempo[];
}

/** Líneas disponibles, por texto limpio (sin marcas de gesto). */
export type CatalogoVoz = Map<string, LineaGrabada>;

export const claveTexto = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Carga `index.json` de `baseUrl` ({ lineas: [{ texto, audio, palabras }] }) y los JSON de palabras.
 * Si algo falla o tarda más de `esperaMs`, devuelve lo que haya (puede ser vacío): el juego sigue con la síntesis.
 */
export async function cargarCatalogoVoz(baseUrl: string, esperaMs = 3000): Promise<CatalogoVoz> {
  const catalogo: CatalogoVoz = new Map();
  const control = new AbortController();
  const corte = window.setTimeout(() => control.abort(), esperaMs);
  try {
    const resp = await fetch(`${baseUrl}index.json`, { signal: control.signal });
    if (!resp.ok) return catalogo;
    const indice = (await resp.json()) as { lineas?: { texto: string; audio: string; palabras: string }[] };
    await Promise.allSettled(
      (indice.lineas ?? []).map(async (l) => {
        const r = await fetch(`${baseUrl}${l.palabras}`, { signal: control.signal });
        if (!r.ok) return;
        const datos = (await r.json()) as { words?: PalabraTiempo[] } | PalabraTiempo[];
        const words = Array.isArray(datos) ? datos : (datos.words ?? []);
        if (words.length > 0) catalogo.set(claveTexto(l.texto), { audioUrl: `${baseUrl}${l.audio}`, words });
      }),
    );
  } catch {
    // Sin catálogo (no existe, sin red o tardó): se usa la síntesis de voz.
  } finally {
    window.clearTimeout(corte);
  }
  return catalogo;
}

/** Empareja las palabras del guion con las del audio; las que no encuentra las interpola. */
export function alinearTiempos(
  guion: Guion,
  words: readonly PalabraTiempo[],
): { inicios: number[]; finales: (number | undefined)[] } {
  const inicios: number[] = guion.palabras.map(() => Number.NaN);
  const fin: (number | undefined)[] = guion.palabras.map(() => undefined);
  let j = 0;
  guion.palabras.forEach((g, i) => {
    const n = normalizar(g.texto);
    if (n === '') return;
    for (let k = j; k < Math.min(j + 4, words.length); k++) {
      if (normalizar(words[k].text) === n) {
        inicios[i] = words[k].start;
        fin[i] = words[k].end;
        j = k + 1;
        return;
      }
    }
  });
  const total = words.length > 0 ? (words[words.length - 1].end ?? words[words.length - 1].start) : 0;
  for (let i = 0; i < inicios.length; i++) {
    if (!Number.isNaN(inicios[i])) continue;
    let a = i - 1;
    while (a >= 0 && Number.isNaN(inicios[a])) a--;
    let b = i + 1;
    while (b < inicios.length && Number.isNaN(inicios[b])) b++;
    const t0 = a >= 0 ? inicios[a] : 0;
    const t1 = b < inicios.length ? inicios[b] : total;
    inicios[i] = t0 + ((t1 - t0) * (i - a)) / (b - a);
  }
  const finales = guion.frases.map((f) => fin[f.ultima]);
  return { inicios, finales };
}

let contexto: AudioContext | null = null;
const fuentes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export interface Reproduccion {
  /** Corta el audio sin avisar a nadie (quien cancela ya sabe que cancela). */
  cancelar(): void;
}

/**
 * Reproduce `linea` y sincroniza `sync` con su tiempo. `alFinal` se llama al acabar el audio; `alFallo`, si no se
 * pudo cargar o reproducir (quien llama pasa entonces a la síntesis). Nunca deja el flujo parado: hay vigilancia.
 */
export function reproducirLinea(
  linea: LineaGrabada,
  guion: Guion,
  sync: Sincronia,
  oyente: () => OyenteVoz,
  alFinal: () => void,
  alFallo: () => void,
): Reproduccion {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = linea.audioUrl;
  const { inicios, finales } = alinearTiempos(guion, linea.words);
  let vivo = true;
  let cuadro = 0;
  let vigilante: number | undefined;

  // Amplitud real con AnalyserNode. Si el navegador no lo permite, el audio suena igual y los LED usan su pulso propio.
  let analizador: AnalyserNode | null = null;
  let datos: Uint8Array<ArrayBuffer> | null = null;
  try {
    contexto ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (contexto.state === 'suspended') void contexto.resume();
    analizador = contexto.createAnalyser();
    analizador.fftSize = 512;
    datos = new Uint8Array(analizador.fftSize);
    let fuente = fuentes.get(audio);
    if (!fuente) {
      fuente = contexto.createMediaElementSource(audio);
      fuentes.set(audio, fuente);
    }
    fuente.connect(analizador);
    analizador.connect(contexto.destination);
  } catch {
    analizador = null;
  }

  const limpiar = (): void => {
    vivo = false;
    cancelAnimationFrame(cuadro);
    window.clearTimeout(vigilante);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    try {
      analizador?.disconnect();
    } catch {
      // Ya desconectado.
    }
  };
  const vigilar = (ms: number): void => {
    window.clearTimeout(vigilante);
    vigilante = window.setTimeout(() => {
      if (!vivo) return;
      limpiar();
      alFallo();
    }, ms);
  };

  const tic = (): void => {
    if (!vivo) return;
    sync.avanzar(audio.currentTime, inicios, finales);
    if (analizador && datos) {
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (let i = 0; i < datos.length; i++) {
        const v = (datos[i] - 128) / 128;
        suma += v * v;
      }
      oyente().alAmplitud?.(Math.min(1, Math.sqrt(suma / datos.length) * 3.5));
    }
    cuadro = requestAnimationFrame(tic);
  };

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) vigilar(audio.duration * 1000 + 4000);
  });
  audio.addEventListener('playing', () => {
    if (!vivo) return;
    oyente().alEstado?.('hablando');
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(tic);
  });
  audio.addEventListener('pause', () => {
    // Pausa (no fin): el mentor se queda donde está y vuelve a neutro despacio.
    if (vivo && !audio.ended) sync.cancelar();
  });
  audio.addEventListener('ended', () => {
    if (!vivo) return;
    limpiar();
    alFinal();
  });
  audio.addEventListener('error', () => {
    if (!vivo) return;
    limpiar();
    alFallo();
  });

  vigilar(8000); // si en 8 s no ha empezado a sonar, se da por perdido
  audio.play().catch(() => {
    if (!vivo) return;
    limpiar();
    alFallo();
  });
  audio.addEventListener('playing', () => vigilar(((Number.isFinite(audio.duration) ? audio.duration : 30) + 4) * 1000), { once: true });

  return {
    cancelar() {
      if (vivo) limpiar();
    },
  };
}
