#!/usr/bin/env node
// Genera el audio del mentor y los tiempos por palabra. NO forma parte de la app: se ejecuta a mano, con red y clave.
//
//   TTS_API_KEY=... node tools/generar-voz.mjs [--config tools/voz.config.json] [--dry-run] [--force]
//
// Por cada clave de `claves` (textos de src/i18n/es.json):
//   public/voz/<clave>.mp3    audio
//   public/voz/<clave>.json   { texto, words: [{ text, start, end }] }  (segundos)
//   public/voz/index.json     { lineas: [{ texto, audio, palabras }] }  (lo lee la app al arrancar)
// El texto que se envía al proveedor es el limpio (sin marcas {directo}, {exacto}…), que es el mismo que la app usa
// para buscar la línea. La clave de API se lee SOLO de la variable de entorno indicada en `apiKeyEnv`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const dryRun = args.includes('--dry-run');
const forzar = args.includes('--force');
const config = JSON.parse(readFileSync(resolve(raiz, opcion('--config', 'tools/voz.config.json')), 'utf8'));
const textos = JSON.parse(readFileSync(join(raiz, 'src/i18n/es.json'), 'utf8'));

// Misma lógica que src/audio/guion.ts (quitar marcas de gesto).
const CUES = ['heroico', 'exacto', 'directo', 'poderoso', 'honesto', 'cercano'];
const limpiar = (crudo) =>
  crudo
    .replace(new RegExp(`\\s*\\{(${CUES.join('|')})\\}`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Palabras con inicio y fin a partir de tiempos por carácter (ElevenLabs "with-timestamps"). */
export function palabrasDeCaracteres(caracteres, inicios, finales) {
  const palabras = [];
  let actual = null;
  caracteres.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (actual) palabras.push(actual);
      actual = null;
      return;
    }
    if (!actual) actual = { text: '', start: inicios[i], end: finales[i] };
    actual.text += c;
    actual.end = finales[i];
  });
  if (actual) palabras.push(actual);
  return palabras;
}

/**
 * Texto que se envía al proveedor: cada frase lleva al principio la etiqueta de tono (p. ej. [excited]) de la
 * primera marca de gesto que contenga, o `tonoBase` si no tiene ninguna. Las etiquetas no se ven en el texto limpio.
 */
export function textoConTonos(crudo, cfg) {
  const frases = crudo.match(/[^.!?…]+(?:[.!?…]+["”»)]*|$)/g) ?? [crudo];
  return frases
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
    .map((f) => {
      const marca = [...f.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).find((c) => cfg.tonos?.[c]);
      const tono = marca ? cfg.tonos[marca] : cfg.tonoBase;
      return tono ? `${tono} ${limpiar(f)}` : limpiar(f);
    })
    .join(' ');
}

const proveedores = {
  // Devuelve { audio: Buffer, words: [{ text, start, end }] }.
  async elevenlabs(texto, cfg, clave) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}/with-timestamps?output_format=mp3_44100_128`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: texto,
        model_id: cfg.model,
        language_code: cfg.language,
        ...(cfg.voiceSettings ? { voice_settings: cfg.voiceSettings } : {}),
      }),
    });
    if (!resp.ok) throw new Error(`ElevenLabs ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const datos = await resp.json();
    const a = datos.alignment ?? datos.normalized_alignment;
    return {
      audio: Buffer.from(datos.audio_base64, 'base64'),
      words: palabrasDeCaracteres(a.characters, a.character_start_times_seconds, a.character_end_times_seconds),
    };
  },
};

async function main() {
  const proveedor = proveedores[config.provider];
  if (!proveedor) throw new Error(`Proveedor "${config.provider}" no implementado. Disponibles: ${Object.keys(proveedores).join(', ')}`);
  const clave = process.env[config.apiKeyEnv];
  if (!dryRun && !clave) throw new Error(`Falta la variable de entorno ${config.apiKeyEnv} con la clave del proveedor.`);
  const salida = join(raiz, config.outputDir);
  if (!dryRun) mkdirSync(salida, { recursive: true });

  const lineas = [];
  for (const id of config.claves) {
    const crudo = textos[id];
    if (typeof crudo !== 'string') throw new Error(`La clave "${id}" no existe en src/i18n/es.json`);
    const texto = limpiar(crudo);
    const mp3 = join(salida, `${id}.mp3`);
    const json = join(salida, `${id}.json`);
    const enviado = textoConTonos(crudo, config);
    if (dryRun) {
      console.log(`[dry-run] ${id} (${texto.length} caracteres): ${enviado}`);
      continue;
    }
    if (!forzar && existsSync(mp3) && existsSync(json)) {
      console.log(`= ${id}: ya existe (usa --force para regenerar)`);
    } else {
      console.log(`+ ${id}: generando…`);
      const { audio, words: crudas } = await proveedor(enviado, config, clave);
      // Las etiquetas de tono ([excited]…) no son palabras habladas: se quitan para no desplazar los gestos.
      const words = crudas.filter((w) => !/^\[[^\]]*\]$/.test(w.text));
      writeFileSync(mp3, audio);
      writeFileSync(json, JSON.stringify({ texto, words }, null, 2));
    }
    lineas.push({ texto, audio: `${id}.mp3`, palabras: `${id}.json` });
  }
  if (!dryRun) {
    writeFileSync(join(salida, 'index.json'), JSON.stringify({ lineas }, null, 2));
    console.log(`Listo: ${lineas.length} líneas en ${config.outputDir}/`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
