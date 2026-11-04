// Captura de depuración (solo en desarrollo): descarga el frame actual de las manos como JSON,
// para grabar poses reales y usarlas como pruebas. No se incluye en el build de producción.

import type { TrackingFrame } from '../tracking/tracker';

/** Descarga un JSON con los landmarks normalizados y en metros de cada mano, con su lateralidad. */
export function descargarCaptura(frame: TrackingFrame): void {
  const datos = {
    version: 1,
    fecha: new Date().toISOString(),
    ancho: frame.width,
    alto: frame.height,
    manos: frame.hands.map((m) => ({
      label: m.label,
      score: m.score,
      landmarks: m.landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      worldLandmarks: m.worldLandmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    })),
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `captura-mano-${Date.now()}.json`;
  enlace.click();
  URL.revokeObjectURL(url);
}
