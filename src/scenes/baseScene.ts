import * as THREE from 'three';

export interface BaseScene {
  start(): void;
  dispose(): void;
}

/**
 * Escena base de Three.js: un suelo gris y una luz direccional.
 * Se adapta al tamaño de su contenedor.
 */
export function createBaseScene(container: HTMLElement): BaseScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1d22);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(4, 8, 5);
  scene.add(light);

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    start() {
      renderer.setAnimationLoop(() => renderer.render(scene, camera));
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
