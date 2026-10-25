import type { Planet } from '../content/planets';
import { disposeScene, listen, type SolarSceneInstance, type Three } from './sceneTypes';

const PLANET_X_RADIUS = 12.5;

// Orbit radius is compressed so that every planet fits on screen (NOT to scale).
const orbitRadius = (au: number) => 1.5 + 1.35 * Math.sqrt(au);

type Body = { mesh: any; ring: any; radius: number; speed: number; angle: number };

/**
 * The interactive Solar System model. Ported from the approved design mock-up.
 * Distances are compressed and planet sizes exaggerated. Planet X is a hypothetical stand-in.
 */
export function startSolarScene(
  T: Three,
  host: HTMLElement,
  planets: Planet[],
  initialSelected: number,
  startPaused: boolean,
): SolarSceneInstance {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(45, 1, 0.1, 200);
  const group = new T.Group();
  scene.add(group);

  scene.add(new T.AmbientLight(0x6688aa, 0.55));
  // decay = 0 keeps planets evenly lit whatever their distance from the Sun
  scene.add(new T.PointLight(0xffffff, 1.8, 0, 0));

  group.add(new T.Mesh(new T.SphereGeometry(0.6, 32, 16), new T.MeshBasicMaterial({ color: 0xf5b942 })));
  group.add(
    new T.Mesh(
      new T.SphereGeometry(0.95, 24, 12),
      new T.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.14 }),
    ),
  );

  const makeRing = (radius: number, material: any) => {
    const points = [];
    for (let i = 0; i < 160; i += 1) {
      const a = (i / 160) * 6.2832;
      points.push(new T.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new T.LineLoop(new T.BufferGeometry().setFromPoints(points), material);
  };

  const bodies: Body[] = [];
  planets.forEach((planet) => {
    const radius = orbitRadius(planet.au);
    const ring = makeRing(radius, new T.LineBasicMaterial({ color: 0x6a8aa6, transparent: true, opacity: 0.25 }));
    const mesh = new T.Mesh(
      new T.SphereGeometry(planet.size, 24, 16),
      new T.MeshLambertMaterial({ color: planet.color }),
    );
    if (planet.name === 'Saturn') {
      const rings = new T.Mesh(
        new T.RingGeometry(planet.size * 1.35, planet.size * 2.1, 48),
        new T.MeshBasicMaterial({ color: 0xcdb98a, side: T.DoubleSide, transparent: true, opacity: 0.8 }),
      );
      rings.rotation.x = Math.PI / 2.3;
      mesh.add(rings);
    }
    group.add(ring, mesh);
    bodies.push({ mesh, ring, radius, speed: 0.8 / Math.sqrt(Math.pow(planet.au, 1.5)), angle: Math.random() * 6.28 });
  });

  // Planet X: wireframe marker on a dashed orbit at a stand-in radius
  const dashed = new T.LineDashedMaterial({
    color: 0xf5b942, dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.7,
  });
  const xRing = makeRing(PLANET_X_RADIUS, dashed);
  xRing.computeLineDistances();
  group.add(xRing);
  const xMesh = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), new T.MeshBasicMaterial({ color: 0xf5b942, wireframe: true }));
  group.add(xMesh);
  bodies.push({ mesh: xMesh, ring: xRing, radius: PLANET_X_RADIUS, speed: 0.02, angle: 2.2 });
  const planetXIndex = planets.length;

  // Decorative background points (random, not real stars)
  const starPositions: number[] = [];
  for (let i = 0; i < 700; i += 1) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * 6.28;
    const q = Math.sqrt(1 - u * u);
    starPositions.push(q * Math.cos(a) * 90, u * 90, q * Math.sin(a) * 90);
  }
  const starGeometry = new T.BufferGeometry();
  starGeometry.setAttribute('position', new T.Float32BufferAttribute(starPositions, 3));
  scene.add(
    new T.Points(starGeometry, new T.PointsMaterial({ color: 0xe7edf7, size: 1.2, sizeAttenuation: false })),
  );

  let selected = initialSelected;
  let paused = startPaused;
  let pitch = 0.45;
  let yaw = 0;
  let targetPitch = 0.45;
  let targetYaw = 0;
  let z = 24;
  let targetZ = 24;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let visible = true;
  let lastFrame = 0;
  group.rotation.x = pitch;

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  resize();

  const el: HTMLCanvasElement = renderer.domElement;
  const cleanups: Array<() => void> = [];
  cleanups.push(listen(window, 'resize', resize));
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    cleanups.push(() => observer.disconnect());
  }
  cleanups.push(
    listen(el, 'pointerdown', (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      el.setPointerCapture(event.pointerId);
    }),
    listen(el, 'pointermove', (event: PointerEvent) => {
      if (!dragging) return;
      targetYaw += (event.clientX - lastX) * 0.005;
      targetPitch = Math.max(0.05, Math.min(1.3, targetPitch + (event.clientY - lastY) * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    }),
    listen(el, 'pointerup', () => {
      dragging = false;
    }),
    listen(el, 'pointercancel', () => {
      dragging = false;
    }),
    listen(
      el,
      'wheel',
      (event: WheelEvent) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        targetZ = Math.max(8, Math.min(40, targetZ + event.deltaY * 0.02));
      },
      { passive: false },
    ),
  );
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.02 });
    io.observe(host);
    cleanups.push(() => io.disconnect());
  }

  let frame = 0;
  const loop = (t: number) => {
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden || t - lastFrame < 22) return;
    const dt = Math.min((t - lastFrame) / 1000, 0.1);
    lastFrame = t;
    bodies.forEach((body, i) => {
      if (!paused) body.angle += body.speed * dt * 0.35;
      body.mesh.position.set(Math.cos(body.angle) * body.radius, 0, Math.sin(body.angle) * body.radius);
      const on = i === selected;
      body.ring.material.opacity = on ? 0.85 : i === planetXIndex ? 0.5 : 0.22;
      body.mesh.scale.setScalar(on ? 1.6 : 1);
    });
    pitch += (targetPitch - pitch) * 0.08;
    yaw += (targetYaw - yaw) * 0.08;
    if (!dragging && !paused) targetYaw += 0.0005;
    group.rotation.x = pitch;
    group.rotation.y = yaw;
    z += (targetZ - z) * 0.08;
    cam.position.set(0, z * 0.2, z);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  };
  frame = requestAnimationFrame(loop);

  return {
    setSelected: (index) => {
      selected = index;
    },
    setPaused: (value) => {
      paused = value;
    },
    zoomBy: (delta) => {
      targetZ = Math.max(8, Math.min(40, targetZ + delta));
    },
    reset: () => {
      targetPitch = 0.45;
      targetZ = 24;
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup());
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (el.parentNode === host) host.removeChild(el);
    },
  };
}
