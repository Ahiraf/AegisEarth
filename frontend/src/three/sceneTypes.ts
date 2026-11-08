// Small controls that the React wrappers use to steer a running 3D scene.
export type SceneInstance = {
  dispose: () => void;
  zoomBy: (delta: number) => void;
  reset: () => void;
  setPaused: (paused: boolean) => void;
};

/** three.js, loaded on demand. Typed loosely on purpose (see types/three-shim.d.ts). */
export type Three = typeof import('three');

/** Registers an event listener and returns a function that removes it. */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void;
export function listen(
  target: Window,
  type: string,
  handler: (event: never) => void,
  options?: AddEventListenerOptions,
): () => void;
export function listen(
  target: HTMLElement | Window,
  type: string,
  handler: (event: never) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler as EventListener, options);
  return () => target.removeEventListener(type, handler as EventListener, options);
}

/** Frees GPU memory held by everything in a scene. */
export function disposeScene(scene: { traverse: (cb: (object: any) => void) => void }): void {
  scene.traverse((object) => {
    object.geometry?.dispose?.();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose?.());
    else material?.dispose?.();
  });
}
