import * as THREE from "../vendor/three.module.js";
import { createSensorTexture } from "./scene-sensor.js";

const TABLE_Y = -1.65;

function materials() {
  const metal = (color, roughness, metalness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    shell: metal(0x45494d, 0.32),
    dark: metal(0x171b1e, 0.39, 0.5),
    silver: metal(0xbac2c6, 0.24, 0.85),
    satin: metal(0x7e898f, 0.32, 0.78),
    brass: metal(0xc69b58, 0.3, 0.75),
    copper: metal(0x98674d, 0.34),
    rubber: metal(0x101315, 0.85, 0),
    board: metal(0x21403b, 0.62, 0.12),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9bcbd4, roughness: 0.07, metalness: 0,
      transmission: 0.55, thickness: 0.12, ior: 1.52, transparent: true, opacity: 0.48, depthWrite: false }),
  };
}

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = !material.transparent;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function box(parent, material, dimensions, position, bevel = 0.015) {
  const [width, height, depth] = dimensions;
  const b = Math.min(bevel, width / 4, height / 4, depth / 4);
  const shape = new THREE.Shape();
  const w = width / 2 - b, h = height / 2 - b;
  shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h); shape.lineTo(-w, h); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: true,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, steps: 1 });
  geometry.center();
  return mesh(parent, geometry, material, ...position);
}

function cylinder(parent, material, radius, length, position, axis = "y", segments = 40) {
  const part = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, segments), material, ...position);
  if (axis === "x") part.rotation.z = Math.PI / 2;
  if (axis === "z") part.rotation.x = Math.PI / 2;
  return part;
}

function ring(parent, material, outer, inner, depth, position, axis = "x") {
  const profile = [[inner, -depth / 2], [outer, -depth / 2], [outer, depth / 2], [inner, depth / 2], [inner, -depth / 2]];
  const part = mesh(parent, new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 64), material, ...position);
  if (axis === "x") part.rotation.z = Math.PI / 2;
  if (axis === "z") part.rotation.x = Math.PI / 2;
  return part;
}

function screw(parent, m, position, axis = "y", radius = 0.037) {
  const group = new THREE.Group();
  group.position.set(...position);
  if (axis === "x") group.rotation.z = -Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  cylinder(group, m.silver, radius, 0.018, [0, 0, 0], "y", 24);
  cylinder(group, m.dark, radius * 0.46, 0.003, [0, 0.0105, 0], "y", 6);
  parent.add(group);
}

function knurled(parent, m, radius, length, position, axis = "z") {
  const group = new THREE.Group();
  group.position.set(...position);
  if (axis === "x") group.rotation.z = Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  cylinder(group, m.dark, radius, length, [0, 0, 0]);
  ring(group, m.satin, radius + 0.003, radius - 0.018, 0.025, [0, length / 2 - 0.02, 0], "y");
  const geometry = new THREE.BoxGeometry(0.012, length * 0.65, 0.014);
  const ribs = new THREE.InstancedMesh(geometry, m.satin, 32);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16;
    transform.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    transform.rotation.y = -a;
    transform.updateMatrix(); ribs.setMatrixAt(i, transform.matrix);
  }
  group.add(ribs); parent.add(group);
  return group;
}

function cable(parent, m, coordinates, radius = 0.027) {
  const curve = new THREE.CatmullRomCurve3(coordinates.map(p => new THREE.Vector3(...p)));
  return mesh(parent, new THREE.TubeGeometry(curve, 36, radius, 8, false), m.rubber);
}

function assembly(parent, name, offset) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.explodeOffset = new THREE.Vector3(...offset);
  group.userData.assembledPosition = group.position.clone();
  parent.add(group);
  return group;
}

function pedestal(parent, m, width = 0.8, depth = 0.86, top = -0.48, x = 0) {
  box(parent, m.dark, [width, 0.15, depth], [x, TABLE_Y + 0.075, 0]);
  box(parent, m.satin, [width - 0.1, 0.035, depth - 0.08], [x, TABLE_Y + 0.168, 0]);
  box(parent, m.shell, [width - 0.17, 0.09, depth - 0.16], [x, TABLE_Y + 0.23, 0]);
  const bottom = TABLE_Y + 0.28;
  cylinder(parent, m.silver, 0.078, top - bottom, [x, (top + bottom) / 2, 0]);
  cylinder(parent, m.shell, 0.14, 0.44, [x, bottom + 0.22, 0]);
  knurled(parent, m, 0.105, 0.13, [x, bottom + 0.32, 0.19]);
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    screw(parent, m, [x + dx * (width / 2 - 0.1), TABLE_Y + 0.16, dz * (depth / 2 - 0.1)]);
  }
  box(parent, m.brass, [0.08, 0.012, 0.12], [x, TABLE_Y + 0.283, depth / 2 - 0.16]);
}

function namePlate(parent, m, text, dimensions, position, rotationY = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#151a1c"; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#d2dbdf"; ctx.font = "500 42px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const plate = mesh(parent, new THREE.PlaneGeometry(...dimensions), new THREE.MeshBasicMaterial({ map, toneMapped: false }), ...position);
  plate.rotation.y = rotationY;
  return plate;
}

function laser(m, color) {
  const g = new THREE.Group(); g.name = "laser";
  pedestal(g, m, 1.15, 0.96, -0.3, -0.16);
  box(g, m.shell, [1.08, 0.1, 0.78], [0, -0.28, 0]);
  box(g, m.dark, [0.08, 0.55, 0.78], [-0.5, 0.02, 0]);
  const top = assembly(g, "laser-heat-sink", [0, 1.2, 0]);
  box(top, m.shell, [1.08, 0.08, 0.78], [0, 0.3, 0]);
  for (let i = 0; i < 9; i++) box(top, m.shell, [0.035, 0.13, 0.7], [-0.44 + i * 0.11, 0.4, 0]);
  for (const sign of [-1, 1]) {
    const side = assembly(g, `laser-side-${sign}`, [0, 0.18, sign * 0.62]);
    box(side, m.shell, [1.06, 0.54, 0.045], [0, 0.015, sign * 0.38]);
    for (const x of [-0.43, 0.43]) for (const y of [-0.18, 0.2]) screw(side, m, [x, y, sign * 0.409], "z", 0.028);
    if (sign === 1) namePlate(side, m, "LASER", [0.48, 0.12], [-0.05, 0.04, 0.406]);
  }
  const core = assembly(g, "laser-optical-module", [0, 0.32, 0]);
  box(core, m.copper, [0.58, 0.12, 0.4], [-0.06, -0.17, 0]);
  cylinder(core, m.brass, 0.145, 0.62, [-0.04, 0, 0], "x");
  ring(core, m.silver, 0.153, 0.128, 0.08, [0.23, 0, 0]);
  box(core, m.board, [0.25, 0.025, 0.33], [-0.33, -0.2, 0]);
  box(g, m.shell, [0.08, 0.55, 0.76], [0.5, 0, 0]);
  ring(g, m.dark, 0.25, 0.11, 0.1, [0.58, 0, 0]);
  ring(g, m.satin, 0.15, 0.097, 0.045, [0.645, 0, 0]);
  const aperture = cylinder(g, new THREE.MeshBasicMaterial({ color: color.three, toneMapped: false }), 0.095, 0.006, [0.66, 0, 0], "x");
  aperture.name = "laser-aperture";
  for (const y of [-0.2, 0.2]) for (const z of [-0.28, 0.28]) screw(g, m, [0.545, y, z], "x", 0.028);
  cylinder(g, m.brass, 0.065, 0.13, [-0.59, -0.14, 0.15], "x");
  cable(g, m, [[-0.66, -0.14, 0.15], [-0.93, -0.2, 0.18], [-1.03, -1.25, 0.36], [-0.55, -1.6, 0.86], [0.1, -1.6, 1.08]]);
  return g;
}

function collimator(m) {
  const g = new THREE.Group(); g.name = "collimator";
  pedestal(g, m, 0.85, 0.9, -0.48);
  ring(g, m.shell, 0.57, 0.46, 0.2, [0, 0, 0]);
  ring(g, m.satin, 0.575, 0.535, 0.045, [0.09, 0, 0]);
  const optic = assembly(g, "collimator-lens", [-0.45, 0.3, 0]);
  const lens = mesh(optic, new THREE.SphereGeometry(0.455, 48, 28), m.glass);
  lens.scale.x = 0.17; lens.name = "collimator-optical-center";
  const retainer = assembly(g, "collimator-retainer", [-0.9, 0.6, 0]);
  ring(retainer, m.silver, 0.533, 0.435, 0.055, [-0.12, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    screw(retainer, m, [-0.155, Math.cos(a) * 0.493, Math.sin(a) * 0.493], "x", 0.025);
  }
  knurled(g, m, 0.095, 0.18, [0, -0.2, 0.65]);
  cylinder(g, m.brass, 0.038, 0.18, [0, -0.2, 0.51], "z");
  return g;
}

function squareFrame(parent, m, x, material = m.shell, width = 1.78, height = 2.18) {
  for (const s of [-1, 1]) {
    box(parent, material, [0.12, 0.12, width], [x, s * (height - 0.12) / 2, 0]);
    box(parent, material, [0.12, height - 0.24, 0.12], [x, 0, s * (width - 0.12) / 2]);
  }
}

function grating(m, params) {
  const g = new THREE.Group(); g.name = "grating-holder";
  pedestal(g, m, 1.02, 1.65, -1.06);
  cylinder(g, m.dark, 0.4, 0.09, [0, -1.3, 0]);
  ring(g, m.silver, 0.405, 0.33, 0.025, [0, -1.245, 0], "y");
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24;
    const mark = mesh(g, new THREE.BoxGeometry(0.008, 0.003, i % 4 === 0 ? 0.055 : 0.025), m.dark,
      Math.sin(a) * 0.366, -1.23, Math.cos(a) * 0.366);
    mark.rotation.y = a;
  }
  squareFrame(g, m, 0.08);
  const carrier = assembly(g, "grating-cartridge", [-0.62, 0.35, 0]);
  squareFrame(carrier, m, -0.07, m.satin, 1.62, 2.03);
  const ruling = document.createElement("canvas"); ruling.width = 2048; ruling.height = 64;
  const ctx = ruling.getContext("2d");
  ctx.fillStyle = "rgba(123,172,183,0.12)"; ctx.fillRect(0, 0, 2048, 64);
  const count = Math.max(2, Math.round(params.slitCount));
  const period = ruling.width / count;
  const opaque = 1 - Math.min(1, params.slitUm / params.gratingUm);
  ctx.fillStyle = "rgba(176,193,199,0.86)";
  for (let i = 0; i < count; i++) ctx.fillRect(i * period, 0, period * opaque, 64);
  const map = new THREE.CanvasTexture(ruling); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const surface = mesh(carrier, new THREE.PlaneGeometry(1.48, 1.88),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, transparent: true, depthWrite: false }), -0.073);
  surface.rotation.y = -Math.PI / 2; surface.name = "grating-rulings";
  const clamps = assembly(g, "grating-clamps", [-0.95, 0.4, 0]);
  for (const s of [-1, 1]) {
    box(clamps, m.dark, [0.07, 0.24, 0.18], [-0.16, s * 0.76, 0.78]);
    screw(clamps, m, [-0.206, s * 0.76, 0.78], "x", 0.043);
    cylinder(g, m.brass, 0.045, 0.19, [0.05, s * 0.76, 0.96], "z");
    knurled(g, m, 0.112, 0.15, [0.05, s * 0.76, 1.08]);
    for (const t of [-1, 1]) screw(g, m, [-0.005, s * 1.01, t * 0.8], "x", 0.028);
  }
  return g;
}

function detector(m, params, domain, color) {
  const g = new THREE.Group(); g.name = "ccd-detector";
  box(g, m.dark, [1.1, 0.17, 1.76], [0.1, TABLE_Y + 0.085, 0]);
  box(g, m.silver, [0.26, 0.35, 0.44], [0.09, -1.35, 0]);
  for (const x of [-0.29, 0.49]) for (const z of [-0.63, 0.63]) screw(g, m, [x, TABLE_Y + 0.18, z]);
  squareFrame(g, m, 0, m.shell, 5.02, 2.5);
  const front = assembly(g, "detector-front-bezel", [-0.5, 0.1, 0]);
  squareFrame(front, m, -0.11, m.satin, 5, 2.48);
  for (const y of [-1.15, 1.15]) for (const z of [-2.38, 2.38]) screw(front, m, [-0.18, y, z], "x", 0.035);
  const board = assembly(g, "detector-sensor-board", [0.55, 0.3, 0]);
  box(board, m.board, [0.035, 2.2, 4.65], [-0.07, 0, 0]);
  const sensor = mesh(board, new THREE.PlaneGeometry(4.5, 2.12), new THREE.MeshBasicMaterial({
    map: createSensorTexture(params, domain, color), toneMapped: false, side: THREE.FrontSide,
  }), -0.15);
  sensor.rotation.y = -Math.PI / 2; sensor.name = "sensor-irradiance"; sensor.userData.domainCm = domain;
  sensor.castShadow = false; sensor.receiveShadow = false;
  const inactive = mesh(board, new THREE.PlaneGeometry(4.5, 2.12),
    new THREE.MeshStandardMaterial({ color: 0x242b38, metalness: 0.55, roughness: 0.27 }), -0.151);
  inactive.rotation.y = -Math.PI / 2; inactive.name = "sensor-inactive"; inactive.visible = false;
  for (let i = -3; i <= 3; i++) {
    box(board, m.dark, [0.07, 0.32, 0.32], [-0.01, 0.48, i * 0.55]);
    box(board, m.dark, [0.06, 0.16, 0.28], [-0.01, -0.55, i * 0.55]);
    for (let j = -2; j <= 2; j++) box(board, m.brass, [0.012, 0.045, 0.015], [0.03, 0.675, i * 0.55 + j * 0.05]);
  }
  const rear = assembly(g, "detector-rear-cover", [1.12, 0.55, 0]);
  box(rear, m.shell, [0.11, 2.44, 4.94], [0.19, 0, 0]);
  for (let i = -9; i <= 9; i++) box(rear, m.dark, [0.07, 1.45, 0.035], [0.27, 0.1, i * 0.22]);
  namePlate(rear, m, "CCD / SENSOR", [1.12, 0.25], [0.251, -0.95, -0.4], Math.PI / 2);
  cylinder(rear, m.silver, 0.09, 0.16, [0.32, -0.79, 1.4], "x");
  cylinder(rear, m.dark, 0.062, 0.19, [0.37, -0.79, 1.4], "x");
  cable(rear, m, [[0.47, -0.79, 1.4], [0.7, -1, 1.4], [0.72, -1.55, 1.65], [0.35, -1.6, 2.1], [-0.15, -1.6, 2.7]]);
  const scale = new THREE.Group(); scale.name = "detector-scale";
  for (let i = -16; i <= 16; i++) box(scale, m.silver, [0.006, i % 4 === 0 ? 0.065 : 0.032, 0.009], [-0.174, -1.1, i * 4.5 / 32], 0);
  g.add(scale);
  return g;
}

export function createOpticalHardware(params, domain, color) {
  const m = materials();
  return [laser(m, color), collimator(m), grating(m, params), detector(m, params, domain, color)];
}

export function addStudioEnvironment(scene, renderer) {
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(0x272b30);
  const panel = (color, intensity, position, scale) => {
    const object = new THREE.Mesh(new THREE.PlaneGeometry(...scale), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    object.material.color.multiplyScalar(intensity);
    object.position.set(...position); object.lookAt(0, 0, 0); environment.add(object);
  };
  panel(0xe5edf1, 4, [0, 7, 1], [12, 4]);
  panel(0xd3e1ed, 2.5, [-4, 2, 6], [10, 3]);
  panel(0xf4dec7, 3, [5, 1, -4], [3, 6]);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(environment, 0.08, 0.1, 40);
  scene.environment = target.texture;
  generator.dispose();
  environment.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  return target;
}
