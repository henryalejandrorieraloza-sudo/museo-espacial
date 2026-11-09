/** Pide la webcam frontal y la conecta al elemento <video> (el mismo que lee el seguimiento). */
export async function abrirWebcam(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

/** Detiene la webcam (por ejemplo, si MediaPipe no carga y se pasa al modo teclado). */
export function cerrarWebcam(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) for (const pista of stream.getTracks()) pista.stop();
  video.srcObject = null;
}
