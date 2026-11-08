import type { OrbitObject } from "../content/orbits";
import { EARTH_FRAGMENT, NOISE_GLSL, PLANET_VERTEX } from "./shaders";
import { disposeScene, type SceneInstance, type Three } from "./sceneTypes";

export type OrbitsScene = SceneInstance & {
  setSelected: (index: number) => void;
  rotateBy: (horizontal: number, vertical: number) => void;
};

// Height is compressed logarithmically; Earth and spacecraft sizes are exaggerated.
const orbitRadius = (heightKm: number) => 2.5 + 1.12 * Math.log(heightKm / 420);
const TAU = Math.PI * 2;

/** Small illustrative spacecraft silhouettes, not engineering replicas. No remote assets. */
function spacecraft(T: Three, id: string) {
  const group = new T.Group();
  const silver = new T.MeshStandardMaterial({
    color: 0xdde5ee,
    metalness: 0.55,
    roughness: 0.38,
  });
  const gold = new T.MeshStandardMaterial({
    color: 0xd3a34b,
    metalness: 0.5,
    roughness: 0.5,
  });
  const solar = new T.MeshStandardMaterial({
    color: 0x254d94,
    emissive: 0x102446,
    metalness: 0.3,
    roughness: 0.4,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x102033, roughness: 0.9 });
  const part = (geometry: any, material: any, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    material: any,
    x = 0,
    y = 0,
    z = 0,
  ) => part(new T.BoxGeometry(w, h, d), material, x, y, z);
  const panel = (
    x: number,
    width: number,
    height: number,
    material = solar,
  ) => {
    box(width, 0.025, height, material, x);
    for (let i = 1; i < 5; i += 1) {
      box(0.008, 0.03, height, silver, x - width / 2 + (width * i) / 5);
    }
  };
  if (id === "iss") {
    box(1.05, 0.055, 0.055, silver);
    for (const x of [-0.43, -0.18, 0.18, 0.43]) panel(x, 0.12, 0.7, gold);
    const module = part(
      new T.CylinderGeometry(0.095, 0.095, 0.57, 12),
      silver,
      0,
      0.07,
    );
    module.rotation.x = Math.PI / 2;
    box(0.12, 0.1, 0.2, silver, 0.18, 0.08, 0.08);
  } else if (id === "hubble") {
    const tube = part(new T.CylinderGeometry(0.14, 0.14, 0.65, 20), silver);
    tube.rotation.x = Math.PI / 2;
    const opening = part(
      new T.CylinderGeometry(0.12, 0.12, 0.015, 20),
      dark,
      0,
      0,
      0.33,
    );
    opening.rotation.x = Math.PI / 2;
    panel(-0.32, 0.32, 0.36);
    panel(0.32, 0.32, 0.36);
    box(0.32, 0.16, 0.2, gold, 0, 0, -0.3);
  } else if (id === "spherex") {
    box(0.26, 0.18, 0.28, gold, 0, -0.16);
    for (let i = 0; i < 3; i += 1) {
      part(
        new T.ConeGeometry(0.3 - i * 0.045, 0.28, 12, 1, true),
        silver,
        0,
        i * 0.07,
      );
    }
    panel(0.42, 0.4, 0.34);
  } else {
    box(0.3, 0.32, 0.32, id === "galileo" ? gold : silver);
    if (id === "galileo") {
      panel(-0.43, 0.52, 0.3);
      panel(0.43, 0.52, 0.3);
    } else {
      panel(0.48, 0.64, 0.42);
      const dish = part(
        new T.ConeGeometry(0.19, 0.1, 20, 1, true),
        gold,
        -0.23,
        0.16,
      );
      dish.rotation.z = -0.65;
      box(0.12, 0.12, 0.18, dark, 0, 0, 0.22);
    }
  }
  return group;
}

export function startOrbitsScene(
  T: Three,
  host: HTMLElement,
  objects: OrbitObject[],
  initialSelected: number,
  startPaused: boolean,
  onPick: (index: number) => void,
  onUnavailable: () => void,
): OrbitsScene {
  // Retain the last frame while paused/offscreen, including browser screenshots.
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(43, 1, 0.1, 120);
  scene.add(new T.AmbientLight(0x94b6e0, 1.15));
  const sunlight = new T.DirectionalLight(0xfff2dc, 2.2);
  sunlight.position.set(4, 5, 6);
  scene.add(sunlight);

  const earth = new T.Mesh(
    new T.SphereGeometry(1.4, 64, 32),
    new T.ShaderMaterial({
      uniforms: { uSun: { value: new T.Vector3(1, 0.6, 0.8).normalize() } },
      vertexShader: PLANET_VERTEX,
      fragmentShader: NOISE_GLSL.replace(/OCT/g, "4") + EARTH_FRAGMENT,
    }),
  );
  earth.rotation.y = 0.6;
  scene.add(earth);
  scene.add(
    new T.Mesh(
      new T.SphereGeometry(1.44, 40, 24),
      new T.MeshBasicMaterial({
        color: 0x4cc3f0,
        transparent: true,
        opacity: 0.08,
        side: T.BackSide,
      }),
    ),
  );
  const ring = (radius: number, color: string, opacity: number) => {
    const points = Array.from({ length: 192 }, (_, i) => {
      const angle = (i / 192) * TAU;
      return new T.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
    });
    return new T.LineLoop(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color, transparent: true, opacity }),
    );
  };
  const equator = ring(1.46, "#8aa3b9", 0.5);
  scene.add(equator);
  const axis = new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, -1.9, 0),
      new T.Vector3(0, 1.9, 0),
    ]),
    new T.LineDashedMaterial({ color: 0x6a8aa6, dashSize: 0.1, gapSize: 0.1 }),
  );
  axis.computeLineDistances();
  scene.add(axis);

  const bodies = objects.map((object, index) => {
    const plane = new T.Group();
    // Node orientations and initial positions are composed for legibility, not ephemerides.
    plane.rotation.y = [0, 1, -0.6, 1.8, 0][index];
    const tilt = new T.Group();
    tilt.rotation.z = (object.inclinationDeg * Math.PI) / 180;
    plane.add(tilt);
    scene.add(plane);
    const radius = orbitRadius(object.placementKm);
    const track = ring(radius, object.color, 0.3);
    const model = spacecraft(T, object.id);
    const halo = new T.Mesh(
      new T.RingGeometry(0.43, 0.47, 40),
      new T.MeshBasicMaterial({
        color: object.color,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    const hitTarget = new T.Mesh(
      new T.SphereGeometry(0.48, 12, 8),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    model.add(hitTarget);
    model.traverse((child: any) => {
      child.userData.orbitIndex = index;
    });
    tilt.add(track, model);
    scene.add(halo);
    return {
      track,
      model,
      halo,
      radius,
      angle: [1.2, 3.6, 4.7, 2.5, 0.2][index],
      plane,
      object,
    };
  });
  const starPositions = [];
  for (let i = 0; i < 220; i += 1) {
    const a = i * 2.39996;
    const y = 1 - (2 * (i + 0.5)) / 220;
    const r = Math.sqrt(1 - y * y) * 45;
    starPositions.push(Math.cos(a) * r, y * 45, Math.sin(a) * r);
  }
  const stars = new T.BufferGeometry();
  stars.setAttribute(
    "position",
    new T.Float32BufferAttribute(starPositions, 3),
  );
  scene.add(
    new T.Points(
      stars,
      new T.PointsMaterial({
        color: 0x8aa3b9,
        size: 1.2,
        sizeAttenuation: false,
      }),
    ),
  );

  let selected = initialSelected;
  let paused = startPaused;
  let yaw = 0.55;
  let pitch = 0.5;
  let distance = 23;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let targetDistance = distance;
  let dirty = true;
  let visible = true;
  let disposed = false;
  let lost = false;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let frame = 0;
  let previous = 0;
  const cleanups: Array<() => void> = [];
  function listen<E extends Event>(
    type: string,
    listener: (event: E) => void,
    options?: AddEventListenerOptions,
  ) {
    canvas.addEventListener(type, listener as EventListener, options);
    cleanups.push(() =>
      canvas.removeEventListener(type, listener as EventListener, options),
    );
  }
  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const resizer = new ResizeObserver(resize);
  resizer.observe(host);
  resize();
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    dirty = true;
  });
  observer.observe(host);
  const rotate = (horizontal: number, vertical: number) => {
    targetYaw += horizontal;
    targetPitch = Math.max(-1.1, Math.min(1.3, targetPitch + vertical));
    dirty = true;
  };
  const zoom = (delta: number) => {
    targetDistance = Math.max(8, Math.min(36, targetDistance + delta));
    dirty = true;
  };
  listen<PointerEvent>("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  listen<PointerEvent>("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    rotate(-dx * 0.006, dy * 0.005);
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const raycaster = new T.Raycaster();
  listen<PointerEvent>("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (moved) return;
    const bounds = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new T.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(
      bodies.map((body) => body.model),
      true,
    )[0];
    const earthHit = raycaster.intersectObject(earth)[0];
    if (hit && (!earthHit || hit.distance < earthHit.distance))
      onPick(hit.object.userData.orbitIndex);
  });
  listen("pointercancel", () => {
    dragging = false;
  });
  listen("lostpointercapture", () => {
    dragging = false;
  });
  // Leave ordinary vertical scrolling alone, especially on touch screens.
  listen<WheelEvent>(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom(event.deltaY * 0.015);
    },
    { passive: false },
  );
  listen("webglcontextlost", (event) => {
    if (disposed) return;
    event.preventDefault();
    lost = true;
    onUnavailable();
  });

  const position = new T.Vector3();
  const loop = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    if (!visible || document.hidden || lost) {
      previous = now;
      return;
    }
    if (now - previous < 32) return;
    const dt = Math.min((now - previous) / 1000, 0.08);
    previous = now;
    if (paused && !dirty) return;
    if (!paused) earth.rotation.y -= (TAU * dt) / (23.934 * 12);
    bodies.forEach((body, index) => {
      if (!paused) body.angle += (TAU * dt) / (body.object.periodHours * 12);
      body.model.position.set(
        Math.cos(body.angle) * body.radius,
        0,
        Math.sin(body.angle) * body.radius,
      );
      body.model.rotation.y = -body.angle;
      body.model.scale.setScalar(index === selected ? 1.25 : 0.85);
      body.track.material.opacity = index === selected ? 0.95 : 0.28;
    });
    yaw += (targetYaw - yaw) * 0.18;
    pitch += (targetPitch - pitch) * 0.18;
    distance += (targetDistance - distance) * 0.18;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(0, 0, 0);
    scene.updateMatrixWorld(true);
    bodies.forEach((body, index) => {
      body.model.getWorldPosition(position);
      body.halo.position.copy(position);
      body.halo.quaternion.copy(camera.quaternion);
      body.halo.visible = index === selected;
    });
    renderer.render(scene, camera);
    dirty =
      Math.abs(targetYaw - yaw) +
        Math.abs(targetPitch - pitch) +
        Math.abs(targetDistance - distance) >
      0.001;
  };
  frame = requestAnimationFrame(loop);
  return {
    setSelected(index) {
      selected = index;
      dirty = true;
    },
    setPaused(value) {
      paused = value;
      dirty = true;
    },
    zoomBy: zoom,
    rotateBy: rotate,
    reset() {
      targetYaw = 0.55;
      targetPitch = 0.5;
      targetDistance = 23;
      dirty = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizer.disconnect();
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
