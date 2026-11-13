import type { Three } from "./sceneTypes";

export function spacecraft(T: Three, id: string) {
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
    color: 0x162c62,
    emissive: 0x06142d,
    metalness: 0.3,
    roughness: 0.4,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x102033, roughness: 0.75 });
  const blueGlass = new T.MeshStandardMaterial({
    color: 0x214a87,
    metalness: 0.36,
    roughness: 0.32,
    emissive: 0x071a39,
    emissiveIntensity: 0.22,
  });
  const white = new T.MeshStandardMaterial({
    color: 0xdce6ed,
    metalness: 0.2,
    roughness: 0.74,
  });
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
  // Segmented solar arrays: readable close-up detail, deliberately enlarged
  // with the rest of these educational spacecraft models.
  const panel = (
    x: number,
    width: number,
    height: number,
    material = blueGlass,
  ) => {
    box(width + 0.026, 0.023, height + 0.026, silver, x);
    box(width, 0.033, height, material, x);
    for (let i = 1; i < 7; i += 1)
      box(0.004, 0.039, height, silver, x - width / 2 + (width * i) / 7);
    for (let i = 1; i < 11; i += 1)
      box(width, 0.039, 0.004, silver, x, 0, -height / 2 + (height * i) / 11);
    box(width + 0.028, 0.031, 0.012, silver, x, 0, -height / 2);
    box(width + 0.028, 0.031, 0.012, silver, x, 0, height / 2);
  };
  const strut = (
    start: [number, number, number],
    end: [number, number, number],
    radius: number,
    material = silver,
  ) => {
    const a = new T.Vector3(...start);
    const b = new T.Vector3(...end);
    const axis = b.clone().sub(a);
    const link = part(
      new T.CylinderGeometry(radius, radius, axis.length(), 8),
      material,
    );
    link.position.copy(a.add(b).multiplyScalar(0.5));
    link.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      axis.normalize(),
    );
    return link;
  };
  if (id === "iss") {
    // Truss, eight solar wings, pressurised modules, radiators and a docking node.
    box(1.55, 0.045, 0.055, silver);
    for (const x of [-0.65, -0.43, 0.43, 0.65]) panel(x, 0.16, 1.05);
    // Distinctive long truss, solar wings and lightweight triangular bracing.
    for (const x of [-0.74, -0.46, 0.46, 0.74]) {
      strut([x, 0.04, -0.52], [x, 0.12, -0.1], 0.007);
      strut([x, 0.04, 0.52], [x, 0.12, 0.1], 0.007);
    }
    for (let i = 0; i < 12; i++) {
      const brace = box(0.13, 0.012, 0.012, silver, -0.72 + i * 0.13, 0.035);
      brace.rotation.z = (i % 2 ? 1 : -1) * 0.5;
    }
    const module = part(
      new T.CylinderGeometry(0.095, 0.095, 0.85, 24),
      silver,
      0,
      0.07,
    );
    module.rotation.x = Math.PI / 2;
    for (const z of [-0.32, -0.1, 0.12, 0.34]) {
      const seam = part(
        new T.TorusGeometry(0.098, 0.009, 6, 24),
        dark,
        0,
        0.07,
        z,
      );
      seam.rotation.z = Math.PI / 2;
    }
    const crossModule = part(
      new T.CylinderGeometry(0.075, 0.075, 0.5, 20),
      silver,
      0,
      0.13,
      -0.12,
    );
    crossModule.rotation.z = Math.PI / 2;
    part(new T.SphereGeometry(0.11, 16, 12), silver, 0, 0.08, 0.41);
    box(0.22, 0.008, 0.5, silver, -0.23, -0.1, 0.04);
    box(0.22, 0.008, 0.5, silver, 0.23, -0.1, 0.04);
    // White radiator surfaces, cargo modules and a visible docking port.
    for (const x of [-0.29, 0.29]) {
      box(0.12, 0.018, 0.43, white, x, -0.13, -0.16);
      box(0.12, 0.018, 0.43, white, x, -0.13, 0.23);
    }
    part(
      new T.CylinderGeometry(0.07, 0.07, 0.09, 24),
      dark,
      0,
      0.08,
      0.49,
    ).rotation.x = Math.PI / 2;
    const arm = box(0.45, 0.016, 0.016, gold, 0.28, 0.22, 0.1);
    arm.rotation.z = 0.45;
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
    const rim = part(
      new T.TorusGeometry(0.132, 0.012, 8, 32),
      silver,
      0,
      0,
      0.344,
    );
    rim.rotation.z = 0.3;
    for (const z of [-0.22, 0, 0.23])
      part(new T.TorusGeometry(0.143, 0.008, 6, 24), dark, 0, 0, z);
    const door = box(0.28, 0.015, 0.22, silver, 0, 0.17, 0.39);
    door.rotation.x = -0.7;
    box(0.8, 0.025, 0.025, silver);
    panel(-0.32, 0.32, 0.36);
    panel(0.32, 0.32, 0.36);
    box(0.32, 0.16, 0.2, gold, 0, 0, -0.3);
    for (const z of [-0.21, 0.09]) box(0.28, 0.006, 0.012, white, 0, 0.14, z);
    strut([0, 0.13, -0.3], [0.14, 0.36, -0.43], 0.009);
    part(new T.SphereGeometry(0.025, 12, 8), gold, 0.14, 0.36, -0.43);
  } else if (id === "spherex") {
    box(0.26, 0.18, 0.28, gold, 0, -0.16);
    for (let i = 0; i < 3; i += 1) {
      part(
        new T.CylinderGeometry(0.3 - i * 0.045, 0.105, 0.24, 48, 1, true),
        silver,
        0,
        i * 0.07,
      );
    }
    part(new T.CylinderGeometry(0.08, 0.08, 0.24, 24), dark, 0, 0.18);
    const rim = part(new T.TorusGeometry(0.077, 0.009, 6, 24), gold, 0, 0.3);
    rim.rotation.x = Math.PI / 2;
    silver.side = T.DoubleSide;
    panel(0.42, 0.4, 0.34);
    // Nested sunshields and a compact service bus distinguish the telescope.
    part(new T.TorusGeometry(0.3, 0.008, 8, 48), gold, 0, 0.12).rotation.x =
      Math.PI / 2;
    part(new T.TorusGeometry(0.21, 0.006, 8, 48), white, 0, 0.26).rotation.x =
      Math.PI / 2;
    strut([0, -0.18, 0], [0.45, 0, 0], 0.013, silver);
    box(0.11, 0.08, 0.18, dark, -0.16, -0.2, 0);
  } else {
    box(0.3, 0.32, 0.32, id === "galileo" ? gold : silver);
    if (id === "galileo") {
      box(1.1, 0.02, 0.02, silver);
      panel(-0.43, 0.52, 0.3);
      panel(0.43, 0.52, 0.3);
      part(new T.CylinderGeometry(0.1, 0.1, 0.03, 24), silver, 0, -0.19);
      for (const x of [-0.08, 0.08])
        part(new T.CylinderGeometry(0.017, 0.017, 0.18, 10), gold, x, -0.29);
      strut([0.02, 0.17, 0], [0.02, 0.42, 0], 0.014, silver);
      part(new T.SphereGeometry(0.065, 16, 12), white, 0.02, 0.43, 0);
      for (const x of [-0.09, 0.09]) box(0.11, 0.005, 0.19, white, x, 0.165, 0);
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
      const telescope = part(
        new T.CylinderGeometry(0.075, 0.075, 0.2, 24),
        silver,
        0.13,
        0.07,
        0.22,
      );
      telescope.rotation.x = Math.PI / 2;
      part(new T.SphereGeometry(0.07, 16, 12), dark, 0.13, 0.07, 0.33);
      // Instrument deck, antenna boom and a small radiator.
      box(0.24, 0.01, 0.21, white, -0.09, -0.17, -0.08);
      strut([-0.12, 0.12, 0], [-0.41, 0.39, 0.03], 0.013, gold);
      part(new T.SphereGeometry(0.038, 14, 12), gold, -0.41, 0.39, 0.03);
    }
  }
  return group;
}
