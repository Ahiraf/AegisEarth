import { ORBIT_OBJECTS } from "../content/orbits";
import { PLANETS } from "../content/planets";
import {
  LAYER_LIMITS,
  type WorldKind,
  layerAtAltitude,
} from "../content/worlds";
import { spacecraft } from "./spacecraft";
import type { Three } from "./sceneTypes";

export type SceneLabel = {
  index: number;
  x: number;
  y: number;
  visible: boolean;
};
export type WorldScene = {
  dispose(): void;
  zoomBy(amount: number): void;
  rotateBy(x: number, y: number): void;
  reset(): void;
  focus(): void;
  setSelected(index: number | null): void;
  seekOrbitMinutes(minutes: number): void;
  setPaused(paused: boolean): void;
  setAltitude(km: number): void;
  setInsets(left: number, right: number, bottom: number): void;
};

/** Educational renderings only. No ephemerides, real-time telemetry or physical radiative model. */
export function startWorldScene(
  T: Three,
  host: HTMLElement,
  kind: WorldKind,
  onPick: (index: number) => void,
  onLabels: (labels: SceneLabel[]) => void,
  onUnavailable: () => void,
  onTextureError: () => void,
): WorldScene {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = kind === "orbits" ? 1.2 : 1.15;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const scene = new T.Scene();
  scene.background = new T.Color("#030912");
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 300);
  const textures = new Set<any>();
  let disposed = false,
    dirty = true,
    paused = true,
    selected: number | null = null;
  let width = 1,
    height = 1,
    insetLeft = 0,
    insetRight = 0,
    insetBottom = 0,
    previous = 0,
    frame = 0;
  let yaw = kind === "atmosphere" ? 0.05 : 0.3;
  let pitch = kind === "solar" ? 0.75 : kind === "orbits" ? 0.45 : 0.08;
  let distance = 20,
    desiredDistance = 20,
    focused = false;
  const target = new T.Vector3(),
    desiredTarget = new T.Vector3();
  const loader = new T.TextureLoader();
  const texture = (name: string, color = true) => {
    const map = loader.load(
      `/textures/${name}`,
      () => {
        if (disposed) map.dispose();
        else dirty = true;
      },
      undefined,
      () => {
        if (!disposed) onTextureError();
      },
    );
    if (color) map.encoding = T.sRGBEncoding;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(map);
    return map;
  };
  const ambient = new T.AmbientLight(0xb2c9ef, kind === "solar" ? 0.45 : 0.65);
  scene.add(ambient);
  const light =
    kind === "solar"
      ? new T.PointLight(0xfff1dc, 2.1, 0, 0)
      : new T.DirectionalLight(0xfff6e8, 2.2);
  if (kind !== "solar") light.position.set(-6, 4, 6);
  scene.add(light);
  const orbitPhases = [1.2, 3.6, 4.7, 2.5, 0.2];
  if (kind === "orbits") {
    // Subtle blue fill reveals model silhouettes on Earth's dark side.
    // This is visual lighting only, not physical illumination telemetry.
    const fill = new T.DirectionalLight(0x6baee8, 0.48);
    fill.position.set(5, -2, -6);
    scene.add(fill);
  }
  const sphere = (radius: number, map: string, basic = false) =>
    new T.Mesh(
      new T.SphereGeometry(radius, 64, 40),
      basic
        ? new T.MeshBasicMaterial({ map: texture(map) })
        : new T.MeshStandardMaterial({
            map: texture(map),
            roughness: 0.9,
            metalness: 0,
          }),
    );
  // A low-cost atmospheric rim shader gives the educational shells real depth
  // without inventing measurements or needing any new asset/dependency.
  const lightShell = (
    radius: number,
    color: string | number,
    strength: number,
  ) => {
    const material = new T.ShaderMaterial({
      uniforms: {
        glowColor: { value: new T.Color(color) },
        glowStrength: { value: strength },
      },
      vertexShader: `
        varying vec3 surfaceNormal;
        varying vec3 viewDirection;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          surfaceNormal = normalize(normalMatrix * normal);
          viewDirection = normalize(-viewPosition.xyz);
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float glowStrength;
        varying vec3 surfaceNormal;
        varying vec3 viewDirection;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(surfaceNormal), normalize(viewDirection))), 2.5);
          gl_FragColor = vec4(glowColor, rim * glowStrength);
        }
      `,
      side: T.BackSide,
      blending: T.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    return new T.Mesh(new T.SphereGeometry(radius, 48, 32), material);
  };
  const globe = (radius: number) => {
    const group = new T.Group();
    const surface = sphere(radius, "2k_earth_daymap.jpg");
    surface.rotation.y = 0.8;
    group.add(surface);
    const clouds = new T.Mesh(
      new T.SphereGeometry(radius * 1.009, 64, 32),
      new T.MeshStandardMaterial({
        color: 0xffffff,
        alphaMap: texture("2k_earth_clouds.jpg", false),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        roughness: 1,
      }),
    );
    clouds.rotation.y = 0.8;
    group.add(clouds);
    // A second outer rim remains visible when the dark hemisphere faces the viewer.
    group.add(lightShell(radius * 1.065, 0x67bfff, 0.42));
    // Fresnel-like limb glow: a shader on the back of a slightly expanded sphere.
    group.add(
      new T.Mesh(
        new T.SphereGeometry(radius * 1.045, 48, 32),
        new T.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: T.BackSide,
          blending: T.AdditiveBlending,
          vertexShader:
            "varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}",
          fragmentShader:
            "varying vec3 n; varying vec3 v; void main(){float a=pow(1.-abs(dot(normalize(n),normalize(v))),3.); gl_FragColor=vec4(.12,.5,1.,a*.5);}",
        }),
      ),
    );
    return group;
  };
  // Deterministic star distribution, avoiding a changing background on every visit.
  const starPositions = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) {
    const y = 1 - (2 * (i + 0.5)) / 1100,
      angle = i * 2.399963;
    const r = Math.sqrt(1 - y * y);
    starPositions.set(
      [Math.cos(angle) * r * 110, y * 110, Math.sin(angle) * r * 110],
      i * 3,
    );
  }
  const stars = new T.BufferGeometry();
  stars.setAttribute("position", new T.BufferAttribute(starPositions, 3));
  scene.add(
    new T.Points(
      stars,
      new T.PointsMaterial({
        color: 0xa8c6e7,
        size: 0.13,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
      }),
    ),
  );
  const entries: {
    anchor: any;
    mesh: any;
    radius: number;
    orbit?: any;
    orbitRadius?: number;
    angle: number;
    speed: number;
  }[] = [];
  const pickables: any[] = [];
  const addPick = (object: any, index: number) => {
    object.traverse((part: any) => {
      if (part.isMesh) {
        part.userData.index = index;
        pickables.push(part);
      }
    });
  };
  const orbitLine = (
    radius: number,
    color: string,
    parent: any,
    opacity = 0.25,
  ) => {
    const points = Array.from({ length: 240 }, (_, i) => {
      const angle = (i / 240) * Math.PI * 2;
      return new T.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
    });
    const line = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    parent.add(line);
    return line;
  };
  let earth: any;
  let altitudeMarker: any;
  const atmosphereShells: any[] = [];
  const atmosphereRadii = [2.35, 2.55, 2.83, 3.15, 3.65, 4.45];
  const altitudeRadius = (km: number) => {
    const index = layerAtAltitude(km);
    const fraction =
      (Math.log1p(km) - Math.log1p(LAYER_LIMITS[index])) /
      (Math.log1p(LAYER_LIMITS[index + 1]) - Math.log1p(LAYER_LIMITS[index]));
    return (
      atmosphereRadii[index] +
      Math.max(0, Math.min(1, fraction)) *
        (atmosphereRadii[index + 1] - atmosphereRadii[index])
    );
  };
  if (kind === "solar") {
    const sun = sphere(1.05, "2k_sun.jpg", true);
    scene.add(sun);
    const glow = new T.Mesh(
      new T.SphereGeometry(1.14, 40, 24),
      new T.MeshBasicMaterial({
        color: 0xffb64b,
        transparent: true,
        opacity: 0.12,
        side: T.BackSide,
      }),
    );
    scene.add(glow);
    // Translucent corona is illustrative lighting, not a solar radiation model.
    scene.add(lightShell(1.33, 0xffbf64, 0.8));
    scene.add(lightShell(1.56, 0xff7b34, 0.25));
    const radii = [2.4, 3.7, 5.1, 6.7, 9.3, 12.6, 16.1, 19.5];
    const sizes = [0.2, 0.32, 0.34, 0.27, 0.82, 0.72, 0.49, 0.47];
    const maps = [
      "mercury",
      "venus_atmosphere",
      "earth_daymap",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
    ];
    const angles = [0.4, 2.1, 4.7, 3.2, 5.6, 1.35, 3.8, 0.3];
    PLANETS.forEach((planet, i) => {
      const anchor = new T.Group();
      const mesh =
        i === 2 ? globe(sizes[i]) : sphere(sizes[i], `2k_${maps[i]}.jpg`);
      mesh.rotation.z = i === 6 ? 1.7 : i === 5 ? 0.47 : 0.05;
      anchor.add(mesh);
      scene.add(anchor);
      if (i === 5) {
        const ringGeo = new T.RingGeometry(sizes[i] * 1.3, sizes[i] * 2.3, 100);
        const pos = ringGeo.attributes.position,
          uv = ringGeo.attributes.uv;
        for (let n = 0; n < pos.count; n++)
          uv.setXY(
            n,
            Math.hypot(pos.getX(n), pos.getY(n)) / sizes[i] - 1.3,
            0.5,
          );
        const rings = new T.Mesh(
          ringGeo,
          new T.MeshStandardMaterial({
            map: texture("2k_saturn_ring_alpha.png"),
            transparent: true,
            side: T.DoubleSide,
            roughness: 1,
            depthWrite: false,
          }),
        );
        rings.rotation.x = Math.PI / 2;
        mesh.add(rings);
      }
      const orbit = orbitLine(radii[i], "#67839e", scene);
      addPick(mesh, i);
      entries.push({
        anchor,
        mesh,
        radius: sizes[i],
        orbit,
        orbitRadius: radii[i],
        angle: angles[i],
        speed: 0.15 / Math.sqrt(planet.au ** 3),
      });
    });
  } else if (kind === "orbits") {
    earth = globe(1.7);
    scene.add(earth);
    orbitLine(1.72, "#7fb8c8", scene, 0.2);
    ORBIT_OBJECTS.forEach((object, i) => {
      const plane = new T.Group();
      plane.rotation.y = [0, 1, -0.6, 1.8, 0][i];
      plane.rotation.z = (object.inclinationDeg * Math.PI) / 180;
      scene.add(plane);
      const radius = 2.9 + 1.2 * Math.log(object.placementKm / 420);
      const orbit = orbitLine(radius, object.color, plane, 0.5);
      const anchor = new T.Group(),
        mesh = spacecraft(T, object.id);
      mesh.scale.setScalar(i === 0 ? 0.8 : 0.95);
      anchor.add(mesh);
      plane.add(anchor);
      addPick(mesh, i);
      entries.push({
        anchor,
        mesh,
        radius: 0.6,
        orbit,
        orbitRadius: radius,
        angle: orbitPhases[i],
        speed: (Math.PI * 2) / (object.periodHours * 12),
      });
    });
  } else {
    earth = globe(2.35);
    scene.add(earth);
    const colors = ["#7be0a6", "#4cc3f0", "#7b9cff", "#b194fa", "#efb77d"];
    // Volumetric-looking, faint spherical rims sit behind the cutaway diagram.
    // Their radii are the same exaggerated teaching distances used by the rings.
    atmosphereRadii.slice(1).forEach((radius, index) => {
      const shell = lightShell(radius, colors[index], index < 2 ? 0.22 : 0.15);
      atmosphereShells.push(shell);
      scene.add(shell);
    });
    for (let i = 0; i < 5; i++) {
      // Open limb cutaway: thickness is exaggerated to make the lower layers discoverable.
      const mesh = new T.Mesh(
        new T.RingGeometry(
          atmosphereRadii[i],
          atmosphereRadii[i + 1],
          140,
          1,
          -1.45,
          2.9,
        ),
        new T.MeshBasicMaterial({
          color: colors[i],
          transparent: true,
          opacity: 0.17,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      );
      scene.add(mesh);
      const arcPoints = Array.from({ length: 141 }, (_, n) => {
        const a = -1.45 + (n / 140) * 2.9;
        return new T.Vector3(
          Math.cos(a) * atmosphereRadii[i + 1],
          Math.sin(a) * atmosphereRadii[i + 1],
          0.02,
        );
      });
      const layerRim = new T.Line(
        new T.BufferGeometry().setFromPoints(arcPoints),
        new T.LineBasicMaterial({
          color: colors[i],
          transparent: true,
          opacity: 0.5,
        }),
      );
      scene.add(layerRim);
      const anchor = new T.Object3D();
      const angle = -0.95 + i * 0.43,
        r = (atmosphereRadii[i] + atmosphereRadii[i + 1]) / 2;
      anchor.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.05);
      scene.add(anchor);
      addPick(mesh, i);
      entries.push({
        anchor,
        mesh,
        orbit: layerRim,
        radius: 0.1,
        angle: 0,
        speed: 0,
      });
    }
    altitudeMarker = new T.Mesh(
      new T.SphereGeometry(0.082, 24, 16),
      new T.MeshBasicMaterial({ color: 0xffffff }),
    );
    altitudeMarker.add(lightShell(0.14, 0x9ceaff, 0.9));
    altitudeMarker.position.set(altitudeRadius(5), 0, 0.12);
    scene.add(altitudeMarker);
    const markerLine = new T.Line(
      new T.BufferGeometry().setFromPoints([
        new T.Vector3(2.35, 0, 0.1),
        new T.Vector3(4.45, 0, 0.1),
      ]),
      new T.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.06,
        gapSize: 0.05,
        transparent: true,
        opacity: 0.7,
      }),
    );
    markerLine.computeLineDistances();
    scene.add(markerLine);
  }
  const fit = () => {
    const extent = kind === "solar" ? 21.5 : kind === "orbits" ? 9.4 : 5.1;
    const availableWidth = Math.max(
      width * 0.35,
      width - insetLeft - insetRight,
    );
    const availableHeight = Math.max(height * 0.35, height - insetBottom);
    return (
      (extent / Math.tan((camera.fov * Math.PI) / 360)) *
      Math.max(height / availableHeight, height / availableWidth) *
      1.08
    );
  };
  const resize = () => {
    width = Math.max(host.clientWidth, 1);
    height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.setViewOffset(
      width,
      height,
      (insetRight - insetLeft) / 2,
      insetBottom / 2,
      width,
      height,
    );
    camera.updateProjectionMatrix();
    if (!focused) desiredDistance = fit();
    dirty = true;
  };
  resize();
  distance = desiredDistance;
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const worldPosition = new T.Vector3(),
    projected = new T.Vector3();
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const update = (now: number) => {
    frame = requestAnimationFrame(update);
    if (disposed || document.hidden || now - previous < 32) return;
    const dt = previous ? Math.min((now - previous) / 1000, 0.06) : 0;
    previous = now;
    if (paused && !dirty) return;
    entries.forEach((entry, i) => {
      if (!paused) entry.angle += entry.speed * dt;
      if (entry.orbitRadius) {
        entry.anchor.position.set(
          Math.cos(entry.angle) * entry.orbitRadius,
          0,
          Math.sin(entry.angle) * entry.orbitRadius,
        );
        if (kind === "orbits") entry.mesh.rotation.y = -entry.angle;
        else if (!paused) entry.mesh.rotation.y += dt * 0.08;
      }
      if (entry.orbit)
        entry.orbit.material.opacity =
          selected === i ? 0.85 : selected === null ? 0.35 : 0.15;
      if (kind === "atmosphere")
        entry.mesh.material.opacity = selected === i ? 0.32 : 0.12;
    });
    if (kind === "atmosphere") {
      atmosphereShells.forEach((shell, index) => {
        shell.material.uniforms.glowStrength.value =
          selected === index ? 0.39 : index < 2 ? 0.18 : 0.12;
      });
    }
    if (earth && !paused)
      earth.rotation.y +=
        dt * (kind === "orbits" ? (-Math.PI * 2) / (23.934 * 12) : 0.025);
    desiredTarget.set(0, 0, 0);
    if (focused && selected !== null && kind !== "atmosphere")
      entries[selected]?.anchor.getWorldPosition(desiredTarget);
    const ease = reduced() ? 1 : 0.14;
    target.lerp(desiredTarget, ease);
    distance += (desiredDistance - distance) * ease;
    camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    renderer.render(scene, camera);
    canvas.dataset.selected = selected === null ? "" : String(selected);
    canvas.dataset.focused = String(focused);
    // Observe real camera zoom independently of the layout's off-centre viewport.
    // A screen-space label's distance from the browser centre is not a zoom metric
    // when the directory shifts the camera's optical centre.
    canvas.dataset.cameraDistance = distance.toFixed(4);
    canvas.dataset.cameraInsetRight = String(insetRight);
    const labels = entries.map((entry, index) => {
      entry.anchor.getWorldPosition(worldPosition);
      projected.copy(worldPosition).project(camera);
      const isBehindEarth =
        kind === "orbits" &&
        camera.position.distanceTo(worldPosition) > camera.position.length() &&
        new T.Ray(
          camera.position,
          worldPosition.clone().sub(camera.position).normalize(),
        ).distanceToPoint(new T.Vector3()) < 1.73;
      return {
        index,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        visible:
          projected.z < 1 &&
          projected.z > -1 &&
          Math.abs(projected.x) < 0.95 &&
          Math.abs(projected.y) < 0.93 &&
          !isBehindEarth,
      };
    });
    onLabels(labels);
    dirty =
      target.distanceTo(desiredTarget) > 0.001 ||
      Math.abs(distance - desiredDistance) > 0.001;
    canvas.dataset.settled = String(!dirty);
  };
  frame = requestAnimationFrame(update);
  let drag: { x: number; y: number; startX: number; startY: number } | null =
    null;
  const rotate = (x: number, y: number) => {
    yaw += x;
    pitch = Math.max(-1.35, Math.min(1.35, pitch + y));
    dirty = true;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag) return;
    rotate(-(event.clientX - drag.x) * 0.006, (event.clientY - drag.y) * 0.005);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const raycaster = new T.Raycaster();
  const up = (event: PointerEvent) => {
    if (!drag) return;
    const click =
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (!click) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new T.Vector2(
        ((event.clientX - rect.left) / width) * 2 - 1,
        (-(event.clientY - rect.top) / height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (
      hit &&
      (!earth ||
        kind !== "orbits" ||
        !raycaster
          .intersectObject(earth, true)
          .some((h: any) => h.distance < hit.distance))
    )
      onPick(hit.object.userData.index);
  };
  const cancel = () => {
    drag = null;
  };
  const zoomBy = (amount: number) => {
    const minimum =
      focused && selected !== null
        ? Math.max(0.8, entries[selected].radius * 2)
        : kind === "atmosphere"
          ? 3
          : 2.6;
    desiredDistance = Math.max(
      minimum,
      Math.min(140, desiredDistance * Math.exp(amount * 0.12)),
    );
    dirty = true;
  };
  const wheel = (event: WheelEvent) => {
    if (!event.deltaY) return;
    event.preventDefault();
    const pixels =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
    zoomBy(Math.max(-2, Math.min(2, pixels / 120)));
  };
  const lost = (event: Event) => {
    event.preventDefault();
    onUnavailable();
  };
  const visible = () => {
    dirty = true;
    previous = 0;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  // Labels belong to the viewport too; scrolling a detail panel stays independent.
  const wheelTarget = host.parentElement ?? host;
  wheelTarget.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", visible);
  return {
    zoomBy,
    rotateBy: rotate,
    reset() {
      focused = false;
      target.set(0, 0, 0);
      yaw = kind === "atmosphere" ? 0.05 : 0.3;
      pitch = kind === "solar" ? 0.75 : kind === "orbits" ? 0.45 : 0.08;
      desiredDistance = fit();
      dirty = true;
    },
    focus() {
      if (selected === null || kind === "atmosphere") return;
      focused = true;
      desiredDistance = Math.max(2.8, entries[selected].radius * 6.5);
      dirty = true;
    },
    setSelected(index) {
      selected = index;
      if (index === null) {
        focused = false;
        desiredDistance = fit();
      } else if (focused)
        desiredDistance = Math.max(2.8, entries[index].radius * 6.5);
      dirty = true;
    },
    seekOrbitMinutes(minutes) {
      if (kind !== "orbits") return;
      entries.forEach((entry, i) => {
        entry.angle = orbitPhases[i] + 2 * Math.PI * minutes / (60 * ORBIT_OBJECTS[i].periodHours);
      });
      if (earth) earth.rotation.y = -2 * Math.PI * minutes / (60 * 23.934);
      dirty = true;
    },
    setPaused(value) {
      paused = value;
      previous = 0;
      dirty = true;
    },
    setAltitude(km) {
      if (altitudeMarker) {
        altitudeMarker.position.x = altitudeRadius(km);
        altitudeMarker.material.color.set(
          ["#7be0a6", "#4cc3f0", "#7b9cff", "#b194fa", "#efb77d"][
            layerAtAltitude(km)
          ],
        );
      }
      dirty = true;
    },
    setInsets(left, right, bottom) {
      insetLeft = left;
      insetRight = right;
      insetBottom = bottom;
      resize();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      wheelTarget.removeEventListener("wheel", wheel);
      canvas.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", visible);
      const geometries = new Set<any>(),
        materials = new Set<any>();
      scene.traverse((object: any) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material)
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((m: any) => materials.add(m));
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
