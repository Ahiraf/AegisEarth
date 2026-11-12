import { ATMOSPHERE_FRAGMENT, CLOUD_FRAGMENT, EARTH_FRAGMENT, NOISE_GLSL, PLANET_VERTEX } from './shaders';
import { disposeScene, listen, type SceneInstance, type Three } from './sceneTypes';

/**
 * The decorative Earth in the hero. Ported from the approved design mock-up.
 * It is artwork, not data. Throws if WebGL is not available (the caller shows a message).
 */
export function startEarthScene(T: Three, host: HTMLElement, startPaused: boolean): SceneInstance {
  const mobile = window.matchMedia('(max-width:760px)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  const renderer = new T.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(38, 1, 0.1, 200);

  const noise = NOISE_GLSL.replace(/OCT/g, mobile ? '4' : '6');
  const sun = new T.Vector3(1, 0.32, 0.55).normalize();
  const uniforms = { uSun: { value: sun } };
  const makeMaterial = (fragment: string, withNoise: boolean, extra: Record<string, unknown> = {}) =>
    new T.ShaderMaterial({
      uniforms,
      vertexShader: PLANET_VERTEX,
      fragmentShader: (withNoise ? noise : '') + fragment,
      ...extra,
    });

  const seg = mobile ? 48 : 96;
  const group = new T.Group();
  scene.add(group);
  const earth = new T.Mesh(new T.SphereGeometry(1, seg, seg / 2), makeMaterial(EARTH_FRAGMENT, true));
  const clouds = new T.Mesh(
    new T.SphereGeometry(1.005, seg, seg / 2),
    makeMaterial(CLOUD_FRAGMENT, true, { transparent: true, depthWrite: false }),
  );
  const atmosphere = new T.Mesh(
    new T.SphereGeometry(1.022, 64, 32),
    makeMaterial(ATMOSPHERE_FRAGMENT, false, {
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
  );
  // Keep the procedural layers visible until their local images are ready.
  const loader = new T.TextureLoader();
  let disposed = false;
  const surfaceMap = loader.load('/textures/2k_earth_daymap.jpg', () => {
    if (disposed) return;
    earth.material.dispose();
    earth.material = new T.MeshLambertMaterial({ map: surfaceMap });
    earth.material.onBeforeCompile = (shader: { fragmentShader: string }) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <encodings_fragment>', 'gl_FragColor = LinearTosRGB(gl_FragColor);',
      );
    };
  });
  surfaceMap.encoding = T.sRGBEncoding;
  const cloudMap = loader.load('/textures/2k_earth_clouds.jpg', () => {
    if (disposed) return;
    clouds.material.dispose();
    clouds.material = new T.MeshLambertMaterial({
      alphaMap: cloudMap, transparent: true, opacity: 0.88, depthWrite: false,
    });
  });
  const sunlight = new T.DirectionalLight(0xfffaf3, 2.1);
  sunlight.position.copy(sun);
  scene.add(sunlight, new T.AmbientLight(0xaac7ef, 0.14));
  clouds.rotation.y = -Math.PI / 2;
  group.add(earth, clouds, atmosphere);
  group.rotation.z = -0.41;

  // Decorative background points (random, not real stars)
  const count = mobile ? 900 : 2200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * 6.2832;
    const r = Math.sqrt(1 - u * u);
    const R = 80;
    positions.set([r * Math.cos(a) * R, u * R, r * Math.sin(a) * R], i * 3);
    const b = 0.25 + Math.pow(Math.random(), 3) * 0.75;
    const t = Math.random();
    colors.set([b * (0.8 + 0.2 * t), b * 0.9, b * (1 - 0.15 * t)], i * 3);
  }
  const starGeometry = new T.BufferGeometry();
  starGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  const stars = new T.Points(
    starGeometry,
    new T.PointsMaterial({
      size: mobile ? 1.1 : 1.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    }),
  );
  scene.add(stars);

  const DEFAULT_Z = mobile ? 4.6 : 3.5;
  let z = DEFAULT_Z;
  let targetZ = DEFAULT_Z;
  let pitch = 0;
  let yaw = 0;
  let targetPitch = 0;
  let targetYaw = 0;
  let parallaxX = 0;
  let parallaxY = 0;
  let targetParallaxX = 0;
  let targetParallaxY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let paused = startPaused;
  let visible = true;
  let lastFrame = 0;
  let spin = -Math.PI / 2;

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    // On wide screens, move the planet to the right so the headline has room.
    const halfWidth = Math.tan((19 * Math.PI) / 180) * DEFAULT_Z * cam.aspect;
    const x = w > 900 ? halfWidth * 0.42 : w > 760 ? halfWidth * 0.3 : 0;
    group.position.x = x;
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
      targetPitch = Math.max(-0.7, Math.min(0.7, targetPitch + (event.clientY - lastY) * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    }),
    listen(el, 'pointerup', () => {
      dragging = false;
    }),
    listen(el, 'pointercancel', () => {
      dragging = false;
    }),
    // Zoom with the mouse wheel only while Ctrl/Cmd is held, so normal scrolling still works.
    listen(
      el,
      'wheel',
      (event: WheelEvent) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        targetZ = Math.max(2.4, Math.min(6, targetZ + event.deltaY * 0.004));
      },
      { passive: false },
    ),
  );
  if (!mobile && !reduce) {
    cleanups.push(
      listen(window, 'pointermove', (event: PointerEvent) => {
        targetParallaxX = (event.clientX / window.innerWidth - 0.5) * 0.4;
        targetParallaxY = (event.clientY / window.innerHeight - 0.5) * 0.2;
      }),
    );
  }

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
    if (!visible || document.hidden || t - lastFrame < (mobile ? 33 : 20)) return;
    lastFrame = t;
    if (!paused) {
      spin += 0.0009;
      clouds.rotation.y += 0.00096;
      stars.rotation.y += 0.00002;
    }
    earth.rotation.y = spin;
    pitch += (targetPitch - pitch) * 0.08;
    yaw += (targetYaw - yaw) * 0.08;
    group.rotation.x = pitch;
    group.rotation.y = yaw;
    parallaxX += (targetParallaxX - parallaxX) * 0.04;
    parallaxY += (targetParallaxY - parallaxY) * 0.04;
    z += (targetZ - z) * 0.08;
    cam.position.set(parallaxX, 0.15 - parallaxY, z);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  };
  frame = requestAnimationFrame(loop);

  return {
    setPaused: (value) => {
      paused = value;
    },
    zoomBy: (delta) => {
      targetZ = Math.max(2.4, Math.min(6, targetZ + delta));
    },
    reset: () => {
      targetPitch = 0;
      targetYaw = 0;
      targetParallaxX = 0;
      targetParallaxY = 0;
      targetZ = DEFAULT_Z;
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      surfaceMap.dispose();
      cloudMap.dispose();
      cleanups.forEach((cleanup) => cleanup());
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (el.parentNode === host) host.removeChild(el);
    },
  };
}
