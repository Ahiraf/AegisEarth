import * as T from "three";
import { SVGRenderer } from "three/examples/jsm/renderers/SVGRenderer.js";
import { spacecraft } from "./spacecraft";
import { disposeScene } from "./sceneTypes";
import type { GuideScene } from "../features/sky/guide/targets";

// Project lightweight 3D teaching models into SVG. Multiple lessons share the page
// without competing with the movie atlas for phone WebGL contexts.
export function skyGuideScene(host: HTMLElement, subject: GuideScene) {
  const renderer = new SVGRenderer();
  renderer.setPrecision(2);
  renderer.setClearColor(0x081522);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-3, 3, 2, -2, 0.1, 40);
  camera.position.set(0, 1.15, 8);
  camera.lookAt(0, 0, 0);
  scene.add(new T.AmbientLight(0xcbdcef, 0.8));
  const light = new T.DirectionalLight(0xffe5bd, 1.05);
  light.position.set(-3, 5, 5);
  scene.add(light);
  const model = new T.Group();
  scene.add(model);
  function ball(radius: number, color: number, parent = model) {
    const m = new T.Mesh(
      new T.SphereGeometry(radius, 18, 12),
      new T.MeshLambertMaterial({ color }),
    );
    parent.add(m);
    return m;
  }
  function ring(radius: number, color: number, parent = model) {
    const vertices = Array.from(
      { length: 80 },
      (_, i) =>
        new T.Vector3(
          radius * Math.cos((i * Math.PI) / 40),
          0,
          radius * Math.sin((i * Math.PI) / 40),
        ),
    );
    const line = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(vertices),
      new T.LineBasicMaterial({ color }),
    );
    parent.add(line);
    return line;
  }
  let seed = 973;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function points(vertices: any[], color: number, size: number, parent: any) {
    const cloud = new T.Points(
      new T.BufferGeometry().setFromPoints(vertices),
      new T.PointsMaterial({ color, size }),
    );
    parent.add(cloud);
  }
  points(
    Array.from(
      { length: 65 },
      () => new T.Vector3(random() * 10 - 5, random() * 5 - 2.5, -4 - random()),
    ),
    0x7293a7,
    0.018,
    scene,
  );
  let animate: (t: number) => void;
  switch (subject) {
    case "spherex": {
      const earth = ball(0.76, 0x529dd2);
      earth.position.x = -0.45;
      const path = ring(1.65, 0x537f98);
      path.position.x = earth.position.x;
      const scope = spacecraft(T, "spherex");
      model.add(scope);
      model.rotation.z = -0.22;
      animate = (t) => {
        scope.position.set(
          earth.position.x + 1.65 * Math.cos(t),
          0,
          1.65 * Math.sin(t),
        );
        scope.rotation.set(0.2, t + 0.3, -0.35);
      };
      break;
    }
    case "barnards-star": {
      const star = ball(0.44, 0xf48c63);
      animate = (t) => {
        star.position.set(1.45 * Math.sin(t), 0.35 * Math.sin(t), 0.4);
      };
      break;
    }
    case "epsilon-indi-b": {
      const a = ball(0.49, 0xc98153),
        b = ball(0.38, 0xa15f46);
      ring(0.88, 0x846b59);
      ring(1.27, 0x5b5a61);
      model.rotation.x = 0.36;
      animate = (t) => {
        a.position.set(0.88 * Math.cos(t), 0, 0.88 * Math.sin(t));
        b.position.set(-1.27 * Math.cos(t), 0, -1.27 * Math.sin(t));
      };
      break;
    }
    case "wise-0855": {
      ball(0.61, 0x978a85);
      const waves = [1, 2, 3].map(() => ring(1, 0xc4836a));
      model.rotation.x = 0.5;
      animate = (t) => {
        waves.forEach((wave, i) =>
          wave.scale.setScalar(0.68 + 1.25 * ((t / 3 + i / 3) % 1)),
        );
      };
      break;
    }
    case "rw-aurigae": {
      ball(0.57, 0xffc27a);
      const disk = new T.Group();
      model.add(disk);
      for (const r of [1.1, 1.28, 1.48]) ring(r, 0x926f62, disk);
      for (let i = 0; i < 19; i++) {
        const p = ball(0.07 + random() * 0.12, 0x725b57, disk),
          a = (random() - 0.5) * 0.85,
          r = 1.2 + random() * 0.23;
        p.position.set(r * Math.sin(a), random() * 0.16, r * Math.cos(a));
      }
      model.rotation.z = 0.16;
      animate = (t) => {
        disk.rotation.y = t;
      };
      break;
    }
    case "r-draconis": {
      const star = ball(0.83, 0xdb8052);
      animate = (t) => {
        const phase = (Math.sin(t * 1.8) + 1) / 2;
        star.scale.setScalar(0.8 + 0.34 * phase);
        star.material.color.setRGB(
          0.57 + 0.4 * phase,
          0.21 + 0.24 * phase,
          0.14 + 0.12 * phase,
        );
      };
      break;
    }
    case "m101": {
      const disk = new T.Group();
      model.add(disk);
      ball(0.2, 0xffdfb0, disk);
      for (let arm = 0; arm < 4; arm++) {
        const dots = Array.from({ length: 170 }, () => {
          const r = 0.14 + 1.55 * random(),
            a = (arm * Math.PI) / 2 + 2.9 * r + (random() - 0.5) * 0.48;
          return new T.Vector3(
            r * Math.cos(a),
            (random() - 0.5) * 0.09,
            r * Math.sin(a),
          );
        });
        points(dots, arm % 2 ? 0xd9b996 : 0x9dc6df, 0.036, disk);
      }
      animate = (t) => {
        disk.rotation.set(0.85 + 0.35 * Math.sin(t), t * 0.27, 0.12);
      };
      break;
    }
  }
  function draw(phase: number) {
    animate(phase);
    renderer.render(scene, camera);
  }
  function resize() {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    const half = Math.max(1.5, (2.15 * h) / w);
    camera.top = half;
    camera.bottom = -half;
    camera.right = (half * w) / h;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  return {
    draw,
    resize,
    dispose() {
      disposeScene(scene);
      renderer.domElement.remove();
    },
  };
}
