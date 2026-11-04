// Voz del mentor con Web Speech API (SPEC 1 y 11). Desacoplada: el resto del juego solo llama a `hablar`
// y `cancelar`. Para usar archivos grabados, se cambia esta implementación y no el resto.
// Si el navegador no tiene voz, no pasa nada: los subtítulos se muestran igual.

export interface Voz {
  hablar(texto: string): void;
  cancelar(): void;
}

export function crearVoz(idioma = 'es-ES'): Voz {
  const sintesis: SpeechSynthesis | undefined = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  return {
    hablar(texto) {
      if (!sintesis) return;
      try {
        sintesis.cancel();
        const frase = new SpeechSynthesisUtterance(texto);
        frase.lang = idioma;
        sintesis.speak(frase);
      } catch {
        // Sin voz disponible: el texto queda en pantalla como subtítulo.
      }
    },
    cancelar() {
      try {
        sintesis?.cancel();
      } catch {
        // Nada que cancelar si el navegador no tiene voz.
      }
    },
  };
}
