import { disposeScene, type Three } from "./sceneTypes";
import type { LessonView } from "../content/planetXLessons";

export type ModelSettings = {
  view: LessonView;
  playing: boolean;
  angle: number;
};
export type ModelLabel = { text: string; x: number; y: number; color: string };
const tau = Math.PI * 2;

// Illustrative ellipses sharing a solar focus. Units and elapsed time are compressed.
const neptune = { a: 4.8, e: 0.01, tilt: 0.02, turn: 0 };
const candidate = { a: 9.5, e: 0.18, tilt: 0.28, turn: -0.28 };
const icyOrbits = [
  { a: 6.1, e: 0.43, tilt: 0.29, turn: 2.8 },
  { a: 6.9, e: 0.48, tilt: -0.24, turn: 2.65 },
  { a: 7.4, e: 0.46, tilt: 0.42, turn: 2.94 },
];

export function startPlanetXScene(
  T: Three,
  host: HTMLElement,
  initial: ModelSettings,
  label: (labels: ModelLabel[]) => void,
  onLost: () => void,
) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  const canvas = renderer.domElement;
  host.appendChild(canvas);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-12, 12, 8, -8, 0.1, 120);
  // Fixed distant stars give the camera a quiet reference field as bodies move.
  let seed = 1945;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const starPositions = Array.from({ length: 14000 }, () => {
    const azimuth = random() * tau,
      y = 2 * random() - 1;
    const radial = 54 * Math.sqrt(1 - y * y);
    return new T.Vector3(
      radial * Math.cos(azimuth),
      54 * y,
      radial * Math.sin(azimuth),
    );
  });
  const stars = new T.Points(
    new T.BufferGeometry().setFromPoints(starPositions),
    new T.PointsMaterial({
      size: 1.35,
      sizeAttenuation: false,
      color: 0xc2d4e8,
      transparent: true,
      opacity: 0.53,
      depthWrite: false,
    }),
  );
  scene.add(stars);
  const loader = new T.TextureLoader();
  const textures: any[] = [];
  let settings = initial;
  let frame = 0,
    last = 0,
    elapsed = 0;
  let disposed = false,
    visible = true;
  let width = 1,
    height = 1;

  function invalidate() {
    if (!disposed && visible && !document.hidden && !frame)
      frame = requestAnimationFrame(draw);
  }
  function surface(
    radius: number,
    file: string,
    tint: number,
    luminous = false,
  ) {
    const material = luminous
      ? new T.MeshBasicMaterial()
      : new T.MeshLambertMaterial();
    material.color.setHex(tint);
    const map = loader.load("/textures/" + file, () => {
      if (disposed) return;
      material.map = map;
      material.needsUpdate = true;
      invalidate();
    });
    map.encoding = T.sRGBEncoding;
    textures.push(map);
    const mesh = new T.Mesh(new T.SphereGeometry(radius, 64, 48), material);
    scene.add(mesh);
    return mesh;
  }
  const sun = surface(1.5, "2k_sun.jpg", 0xffedb0, true);
  const blue = surface(1.04, "2k_neptune.jpg", 0xffffff);
  const imagined = surface(1.12, "2k_saturn.jpg", 0xffbc8b);
  blue.rotation.z = -0.49;
  imagined.rotation.z = 0.31;
  const sunlight = new T.PointLight(0xfff3df, 1.65);
  scene.add(sunlight, new T.AmbientLight(0xc8dbff, 0.58));
  // A soft, camera-facing corona leaves the texture on the solar disk visible.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const ctx = glowCanvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, "#fff2b5");
  glow.addColorStop(0.35, "#ffc365");
  glow.addColorStop(0.47, "rgba(255,152,48,.35)");
  glow.addColorStop(1, "rgba(255,116,22,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const glowTexture = new T.CanvasTexture(glowCanvas);
  textures.push(glowTexture);
  const corona = new T.Sprite(
    new T.SpriteMaterial({
      map: glowTexture,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }),
  );
  corona.scale.set(7.8, 7.8, 1);
  scene.add(corona);

  function position(orbit: typeof neptune, phase: number) {
    const x = orbit.a * (Math.cos(phase) - orbit.e);
    const z = orbit.a * Math.sqrt(1 - orbit.e ** 2) * Math.sin(phase);
    return new T.Vector3(
      x,
      z * Math.sin(orbit.tilt),
      z * Math.cos(orbit.tilt),
    ).applyAxisAngle(new T.Vector3(0, 1, 0), orbit.turn);
  }
  function track(orbit: typeof neptune, color: number, dashed = false) {
    const geometry = new T.BufferGeometry().setFromPoints(
      Array.from({ length: 241 }, (_, i) => position(orbit, (i * tau) / 240)),
    );
    const options = { color, transparent: true, opacity: dashed ? 0.76 : 0.64 };
    const material = dashed
      ? new T.LineDashedMaterial({ ...options, dashSize: 0.27, gapSize: 0.19 })
      : new T.LineBasicMaterial(options);
    const line = new T.Line(geometry, material);
    if (dashed) line.computeLineDistances();
    scene.add(line);
    return line;
  }
  const blueTrack = track(neptune, 0x7abcf8);
  const goldTrack = track(candidate, 0xffbf76, true);
  const icy = icyOrbits.map((orbit, i) => {
    const line = track(orbit, 0x67c9ca);
    const body = new T.Mesh(
      new T.IcosahedronGeometry(0.21 + 0.025 * i, 1),
      new T.MeshStandardMaterial({
        color: 0xa8dee0,
        flatShading: true,
        roughness: 1,
      }),
    );
    scene.add(body);
    return { orbit, line, body };
  });
  const sightings = [1.28, 0.96, 0.64].map((phase) => {
    const ring = new T.Mesh(
      new T.RingGeometry(0.13, 0.18, 36),
      new T.MeshBasicMaterial({ color: 0xffca7a, side: T.DoubleSide }),
    );
    ring.position.copy(position(candidate, phase));
    scene.add(ring);
    return ring;
  });
  const sightingDot = new T.Mesh(
    new T.SphereGeometry(0.09, 12, 8),
    new T.MeshBasicMaterial({ color: 0xffedbd }),
  );
  scene.add(sightingDot);
  const axis = new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(0, -1.45, 0),
      new T.Vector3(0, 1.45, 0),
    ]),
    new T.LineBasicMaterial({ color: 0xb6dffc }),
  );
  const spot = new T.Mesh(
    new T.SphereGeometry(0.045, 16, 12),
    new T.MeshBasicMaterial({ color: 0xffffff }),
  );
  spot.position.set(0, 0.2, 1.025);
  blue.add(axis, spot);
  const target = new T.Vector3();

  function draw(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (settings.playing && last) elapsed += Math.min((now - last) / 1000, 0.1);
    last = now;
    const view = settings.view;
    const close = view === "spin";
    const withIce = view === "clue" || view === "test";
    blue.position.copy(position(neptune, 2.69 + (close ? 0 : elapsed * 0.19)));
    blue.rotation.order = "ZXY";
    blue.rotation.y = elapsed * (close ? 0.68 : 0.28);
    sun.rotation.y = elapsed * 0.09;
    imagined.position.copy(
      position(candidate, 0.29 - (view === "test" ? elapsed * 0.059 : 0)),
    );
    imagined.rotation.y = elapsed * 0.23;
    imagined.visible = goldTrack.visible =
      view === "prediction" || view === "test";
    for (const [i, item] of icy.entries()) {
      item.line.visible = item.body.visible = withIce;
      if (withIce)
        item.body.position.copy(
          position(item.orbit, [2.1, 4.3, 1][i] + elapsed * 0.08),
        );
    }
    sun.visible = corona.visible = blueTrack.visible = !close;
    axis.visible = spot.visible = close;
    target.set(0, 0, 0);
    if (close) target.copy(blue.position);
    // During the spin lesson the viewpoint follows Neptune, keeping its sunlit face in view.
    const yaw =
      (settings.angle * Math.PI) / 180 +
      (close ? Math.atan2(-target.x, -target.z) + 0.65 : 0);
    const pitch = close ? 0.16 : 0.48;
    camera.position
      .set(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      )
      .multiplyScalar(40)
      .add(target);
    camera.lookAt(target);
    const aspect = width / height;
    const halfWidth = Math.max(
      close ? 1.95 : 12.1,
      aspect * (close ? 1.75 : 5.9),
    );
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfWidth / aspect;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Repeat the three observing visits. In the paused opening frame the rings
    // provide the same position history without requiring animation.
    const visit = Math.floor(elapsed / 1.4) % sightings.length;
    const showHistory = !settings.playing && elapsed === 0;
    sightingDot.visible = view === "sightings";
    sightingDot.position.copy(
      sightings[showHistory ? sightings.length - 1 : visit].position,
    );
    sightings.forEach((ring, index) => {
      ring.visible =
        view === "prediction" ||
        (sightingDot.visible && (showHistory || index <= visit));
      ring.quaternion.copy(camera.quaternion);
    });
    const labels: ModelLabel[] = [];
    function locate(text: string, point: any, radius: number, color: string) {
      const p = point.clone().project(camera);
      labels.push({
        text,
        x: ((p.x + 1) * width) / 2,
        y: ((1 - p.y) * height) / 2 + (radius * width) / (2 * halfWidth) + 5,
        color,
      });
    }
    if (!close) locate("Sun", sun.position, 1.5, "#ffe0a0");
    if (!close) locate("Neptune", blue.position, 1.04, "#bbdbff");
    if (close)
      locate(
        "Neptune’s axis",
        blue.localToWorld(new T.Vector3(0, 1.48, 0)),
        -0.2,
        "#d2ebff",
      );
    if (imagined.visible)
      locate("Planet X · hypothetical", imagined.position, 1.12, "#ffcf92");
    if (view === "sightings")
      locate(
        `Faint dot · visit ${showHistory ? sightings.length : visit + 1}`,
        sightingDot.position,
        0.65,
        "#ffcf92",
      );
    if (withIce) locate("Icy world", icy[0].body.position, 0.24, "#b9e2e3");
    label(labels);
    renderer.render(scene, camera);
    if (settings.playing) invalidate();
  }

  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    invalidate();
  });
  resize.observe(host);
  function resume() {
    last = 0;
    invalidate();
  }
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  observer.observe(host);
  document.addEventListener("visibilitychange", resume);
  canvas.addEventListener("webglcontextlost", onLost);
  return {
    update(next: ModelSettings) {
      if (settings.view !== next.view) elapsed = 0;
      settings = next;
      resume();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      canvas.removeEventListener("webglcontextlost", onLost);
      disposeScene(scene);
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
