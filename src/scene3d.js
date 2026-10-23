import * as THREE from "../vendor/three.module.js";
import { diffractionAngle, intensityAt, maximumOrder, stableVisibleDomainCm, toRad, wavelengthToColor } from "./physics.js";
import { createSensorTexture } from "./scene-sensor.js";
import { createOpticalHardware, addStudioEnvironment } from "./optics-hardware.js?v=video-apparatus-20261023";

const CYAN = 0x79cfff;
const OPTICAL_AXIS_Y = 0;
const LASER_EXIT_LOCAL_X = 0.66;
const TABLE_Y = -1.65;
const SCREEN_HALF_WIDTH = 2.25;
const DEFAULT_CAMERA = Object.freeze({ azimuth: 1.98, elevation: 0.38, radius: 9.4 });
const MIN_2D_ZOOM = 0.6;
const MAX_2D_ZOOM = 3;
const ORTHO_BASE_HALF_HEIGHT = 4.2;
const SPRITE_TEXT_FONT = '"HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const SPRITE_MATH_FONT = '"Cambria Math", "STIX Two Math", "Times New Roman", serif';
const SPRITE_PHYSICS_SYMBOL_PATTERN = /(θ(?:[ⱼᵢ₀₁₂])?|φ|λ|Δ|δ|ρ|α|β|(?<![A-Za-z])(?:d|b|j|N|W|L|I|R|x|y|w|k|u|n)(?:[ⱼᵢ₀₁₂])?(?![A-Za-z]))/gu;

function spriteTextSegments(text) {
  const value = String(text);
  const segments = [];
  let cursor = 0;
  SPRITE_PHYSICS_SYMBOL_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(SPRITE_PHYSICS_SYMBOL_PATTERN)) {
    if (match.index > cursor) segments.push({ text: value.slice(cursor, match.index), variable: false });
    segments.push({ text: match[0], variable: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), variable: false });
  return segments.length ? segments : [{ text: value, variable: false }];
}

function makeTextSprite(text, options = {}) {
  const {
    color = "#d9ecff",
    fontSize = 46,
    width = 420,
    height = 110,
    background = "rgba(0,0,0,0)",
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  const lines = String(text).split("\n");
  const lineHeight = fontSize * 1.22;
  const firstY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    const segments = spriteTextSegments(line);
    const setFont = (variable) => {
      ctx.font = `${variable ? "italic 500" : "600"} ${fontSize}px ${variable ? SPRITE_MATH_FONT : SPRITE_TEXT_FONT}`;
    };
    const totalWidth = segments.reduce((sum, segment) => {
      setFont(segment.variable);
      return sum + ctx.measureText(segment.text).width;
    }, 0);
    let drawX = width / 2 - totalWidth / 2;
    ctx.textAlign = "left";
    segments.forEach((segment) => {
      setFont(segment.variable);
      ctx.fillText(segment.text, drawX, firstY + index * lineHeight);
      drawX += ctx.measureText(segment.text).width;
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 185, height / 185, 1);
  return sprite;
}

function makeLine(points, color, opacity = 0.82) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  return new THREE.Line(geometry, material);
}

function machinedBox(width, height, depth, bevel = 0.025) {
  const b = Math.min(bevel, width / 5, height / 5, depth / 5);
  const w = width / 2 - b, h = height / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h);
  shape.lineTo(w, -h);
  shape.lineTo(w, h);
  shape.lineTo(-w, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * b, steps: 1, bevelEnabled: true,
    bevelThickness: b, bevelSize: b, bevelSegments: 2,
  });
  geometry.center();
  return geometry;
}

function addPart(group, geometry, material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = !material.transparent;
  part.receiveShadow = true;
  group.add(part);
  return part;
}

function addBolt(group, material, x, y, z, axis = "y", radius = 0.045) {
  const bolt = addPart(group, new THREE.CylinderGeometry(radius, radius, 0.024, 6), material, x, y, z);
  if (axis === "x") bolt.rotation.z = Math.PI / 2;
  if (axis === "z") bolt.rotation.x = Math.PI / 2;
  return bolt;
}

export class DiffractionScene {
  constructor(container, { fitViewport = false, studio = false } = {}) {
    this.container = container;
    this.fitViewport = fitViewport;
    this.studio = studio;
    this.explodeAmount = 0;
    this.explodeTarget = 0;
    this.focusName = "all";
    this.autoRotate = false;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.view = "3d";
    this.displayMode = "rays";
    this.params = null;
    this.drag = { active: false, x: 0, y: 0 };
    this.cameraState = { ...DEFAULT_CAMERA };
    this.orthoZoom = 1;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x111820, 20, 46);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.orthoCamera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
    this.activeCamera = this.camera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x111820, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "光栅衍射实验装置三维模型");
    if (studio) {
      this.renderer.setClearColor(0x090d10, 1);
      this.scene.fog.color.set(0x090d10);
      this.environmentTarget = addStudioEnvironment(this.scene, this.renderer);
      this.labelLayer = document.createElement("div");
      this.labelLayer.className = "apparatus-labels";
      this.container.appendChild(this.labelLayer);
    }

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);

    this.needsRender = true;
    this.updateKey = "";

    this.addLighting();
    this.addStaticFloor();
    this.bindPointerCamera();
    this.resize();
    this.animate();

    window.addEventListener("resize", () => this.resize());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xe5edf5, 0x44515e, 1.6));
    const key = new THREE.DirectionalLight(0xfff3df, 2.6);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 0.5, far: 24 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 3;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4def6, 1.2);
    fill.position.set(-5, 3, -6);
    this.scene.add(fill);
    const edge = new THREE.DirectionalLight(0xe7f0ff, 1.5);
    edge.position.set(6, 4, 1);
    this.scene.add(edge);
  }

  addStaticFloor() {
    const grid = new THREE.GridHelper(22, 44, this.studio ? 0x344142 : 0x405064, this.studio ? 0x1c2428 : 0x27333f);
    grid.position.set(0, TABLE_Y - 0.2, 0);
    grid.material.transparent = true;
    grid.material.opacity = this.studio ? 0.15 : 0.28;
    this.root.add(grid);

    const bench = addPart(this.root, machinedBox(11.8, 0.16, 6.6, 0.04),
      new THREE.MeshStandardMaterial({ color: this.studio ? 0x252b2e : 0x35404a, metalness: 0.32, roughness: 0.65 }),
      -0.55, TABLE_Y - 0.08, 0);
    bench.castShadow = false;
    const holes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.026, 0.026, 0.003, 10),
      new THREE.MeshBasicMaterial({ color: 0x10171d }), 23 * 13);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let ix = 0; ix < 23; ix++) for (let iz = 0; iz < 13; iz++) {
      matrix.makeTranslation(-6.05 + ix * 0.5, TABLE_Y + 0.002, -3 + iz * 0.5);
      holes.setMatrixAt(index++, matrix);
    }
    this.root.add(holes);
    if (this.studio) {
      const edge = new THREE.MeshStandardMaterial({ color: 0x717b80, metalness: 0.7, roughness: 0.3 });
      [-3.3, 3.3].forEach(z => addPart(this.root, machinedBox(11.8, 0.04, 0.025, 0.005), edge, -0.55, TABLE_Y - 0.05, z));
    }
  }

  bindPointerCamera() {
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      if (this.view !== "3d") return;
      this.setAutoRotate(false);
      this.drag.active = true;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.renderer.domElement.setPointerCapture(event.pointerId);
    });

    this.renderer.domElement.addEventListener("pointermove", (event) => {
      if (!this.drag.active || this.view !== "3d") return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.cameraState.azimuth += dx * 0.006;
      this.cameraState.elevation = Math.max(0.18, Math.min(1.05, this.cameraState.elevation + dy * 0.004));
      this.updateCamera();
    });

    this.renderer.domElement.addEventListener("pointerup", (event) => {
      this.drag.active = false;
      try {
        this.renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // 浏览器可能已自动释放 pointer capture；无需中断渲染。
      }
    });
    this.renderer.domElement.addEventListener("pointercancel", () => { this.drag.active = false; });

    this.renderer.domElement.addEventListener("wheel", (event) => {
      if (this.view === "2d") {
        event.preventDefault();
        const wheelScale = Math.exp(-event.deltaY * 0.0012);
        this.set2dZoom(this.orthoZoom * wheelScale);
        return;
      }

      if (this.view !== "3d") return;
      event.preventDefault();
      this.cameraState.radius = Math.max(6.1, Math.min(11.5, this.cameraState.radius + event.deltaY * 0.006));
      this.updateCamera();
    }, { passive: false });
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const aspect = width / height;
    this.updateOrthoProjection(aspect);
    this.updateCamera();
  }

  updateOrthoProjection(aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight)) {
    // 2D 视图使用正交相机。缩放时只改变可视范围，不移动物体坐标，
    // 因此光栅常数、屏距和衍射级次的位置关系不会被视觉交互破坏。
    const baseHalfHeight = this.fitViewport
      ? Math.max(ORTHO_BASE_HALF_HEIGHT, 6.4 / Math.max(aspect, 0.1))
      : ORTHO_BASE_HALF_HEIGHT;
    const halfHeight = baseHalfHeight / this.orthoZoom;
    this.orthoCamera.left = -halfHeight * aspect;
    this.orthoCamera.right = halfHeight * aspect;
    this.orthoCamera.top = halfHeight;
    this.orthoCamera.bottom = -halfHeight;
    this.orthoCamera.updateProjectionMatrix();
    this.needsRender = true;
  }

  set2dZoom(value) {
    const numeric = Number(value);
    const nextZoom = Math.max(MIN_2D_ZOOM, Math.min(MAX_2D_ZOOM, Number.isFinite(numeric) ? numeric : 1));
    if (Math.abs(nextZoom - this.orthoZoom) < 0.001) return this.orthoZoom;

    this.orthoZoom = nextZoom;
    this.updateOrthoProjection();
    this.container.dispatchEvent(new CustomEvent("scene2dzoomchange", { detail: { zoom: this.orthoZoom } }));
    return this.orthoZoom;
  }

  setView(view) {
    this.view = view;
    if (view === "2d") {
      this.explodeAmount = this.explodeTarget = 0;
      this.autoRotate = false;
      this.focusName = "all";
      this.applyExplode();
    }
    this.activeCamera = view === "2d" ? this.orthoCamera : this.camera;
    this.placeLabels();
    this.updateCamera();
    this.applyStudioVisibility();
    this.dispatchStudioState();
  }

  placeLabels() {
    this.dynamic.children.forEach((part) => {
      if (!part.userData.planPosition) return;
      part.position.copy(this.view === "2d" ? part.userData.planPosition : part.userData.spatialPosition);
    });
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    if (this.params) this.update(this.params);
  }

  updateCamera() {
    this.needsRender = true;
    const target = new THREE.Vector3(-0.65, -0.15, 0);
    if (this.studio) target.y += this.explodeAmount * 0.25;
    let fittedRadius = DEFAULT_CAMERA.radius;
    let focusBounds = null;
    if (this.studio && this.focusName !== "all") {
      const focused = this.dynamic.getObjectByName(this.focusName);
      if (focused) {
        focusBounds = new THREE.Box3().setFromObject(focused).expandByScalar(0.15);
        focusBounds.getCenter(target);
      }
    }
    if (this.fitViewport && this.framePoints) {
      const { azimuth, elevation } = DEFAULT_CAMERA;
      const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
      const right = new THREE.Vector3(Math.sin(azimuth), 0, -Math.cos(azimuth));
      const up = new THREE.Vector3().crossVectors(direction, right);
      const vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.88;
      // Fit once against the default orientation; orbiting does not pump the camera zoom.
      for (const corner of this.framePoints) {
        const point = corner.clone().sub(target);
        fittedRadius = Math.max(fittedRadius, point.dot(direction) + Math.max(
          Math.abs(point.dot(right)) / (vertical * this.camera.aspect),
          Math.abs(point.dot(up)) / vertical,
        ));
      }
    }
    if (focusBounds) {
      const size = focusBounds.getSize(new THREE.Vector3());
      const sphereRadius = size.length() / 2;
      const halfFov = Math.min(THREE.MathUtils.degToRad(this.camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect));
      fittedRadius = sphereRadius / Math.sin(halfFov) * 1.12;
    } else if (this.studio) {
      fittedRadius *= 1 + this.explodeAmount * 0.14;
    }
    const framingScale = fittedRadius / DEFAULT_CAMERA.radius;
    if (this.fitViewport) {
      this.scene.fog.near = 20 * framingScale;
      this.scene.fog.far = 46 * framingScale;
    }
    if (this.view === "2d") {
      this.orthoCamera.position.set(-0.65, 11, 0);
      this.orthoCamera.up.set(0, 0, -1);
      this.orthoCamera.lookAt(target);
      return;
    }

    const { azimuth, elevation, radius } = this.cameraState;
    // Widen the initial mobile framing without moving instruments or changing the user's zoom.
    const framedRadius = radius * framingScale;
    const horizontal = Math.cos(elevation) * framedRadius;
    this.camera.position.set(
      target.x + Math.cos(azimuth) * horizontal,
      target.y + Math.sin(elevation) * framedRadius,
      target.z + Math.sin(azimuth) * horizontal,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  resetCamera() {
    this.cameraState = { ...DEFAULT_CAMERA };
    this.focusName = "all";
    this.setAutoRotate(false);
    this.updateCamera();
    this.applyStudioVisibility();
    this.dispatchStudioState();
  }

  setFocus(name) {
    if (!this.studio || this.view !== "3d") return;
    this.focusName = ["laser", "collimator", "grating-holder", "ccd-detector"].includes(name) ? name : "all";
    this.cameraState = { ...DEFAULT_CAMERA, azimuth: this.focusName === "ccd-detector" ? 2.5 : DEFAULT_CAMERA.azimuth };
    this.applyStudioVisibility();
    this.updateCamera();
    this.dispatchStudioState();
  }

  setAutoRotate(enabled) {
    this.autoRotate = Boolean(enabled && this.studio && this.view === "3d");
    this.dispatchStudioState();
  }

  setExplode(value) {
    if (!this.studio || this.view !== "3d") return;
    this.explodeTarget = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.reducedMotion) this.explodeAmount = this.explodeTarget;
    this.applyExplode();
    this.updateCamera();
    this.dispatchStudioState();
  }

  dispatchStudioState() {
    if (!this.studio) return;
    this.container.dispatchEvent(new CustomEvent("studiostatechange", { detail: {
      view: this.view, focus: this.focusName, explosion: this.explodeTarget, rotating: this.autoRotate,
    } }));
  }

  applyExplode() {
    if (!this.studio) return;
    const measuring = this.explodeAmount < 0.001 && this.explodeTarget === 0;
    this.dynamic.traverse(part => {
      if (part.userData.explodeOffset) {
        part.position.copy(part.userData.assembledPosition).addScaledVector(part.userData.explodeOffset, this.explodeAmount);
      }
      if (part.name === "optical-path" || part.name === "sensor-irradiance" || part.name === "detector-scale") part.visible = measuring;
      if (part.name === "sensor-inactive") part.visible = !measuring;
      if (part.name === "explosion-guides") part.visible = this.explodeAmount > 0.02;
    });
    for (const { guide, part } of this.explosionGuides || []) {
      const positions = guide.geometry.attributes.position;
      positions.setXYZ(1, part.position.x, part.position.y, part.position.z);
      positions.needsUpdate = true;
      guide.computeLineDistances();
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
    this.applyStudioVisibility();
  }

  applyStudioVisibility() {
    if (!this.studio || !this.hardware) return;
    const complete = this.focusName === "all";
    this.hardware.forEach(group => { group.visible = complete || group.name === this.focusName; });
    this.dynamic.children.forEach(part => {
      if (this.hardware.includes(part)) return;
      part.visible = complete && (part.name !== "optical-path" || (this.explodeAmount < 0.001 && this.explodeTarget === 0));
    });
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
  }

  addStudioHardware(positions, thetaI, params, domain, color) {
    this.hardware = createOpticalHardware(params, domain, color);
    this.explosionGuides = [];
    this.labelLayer.replaceChildren();
    const names = ["激光器", "准直镜", "光栅架", "CCD 采样面"];
    this.hardware.forEach((group, index) => {
      group.position.set(...positions[index]);
      if (index < 2) group.rotation.y = -thetaI;
      const moving = [];
      group.traverse(part => { if (part.userData.explodeOffset) moving.push(part); });
      moving.forEach(part => {
        const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineDashedMaterial({ color: 0x75898d, dashSize: 0.05, gapSize: 0.045, transparent: true, opacity: 0.45, depthWrite: false }));
        guide.name = "explosion-guides";
        group.add(guide);
        this.explosionGuides.push({ guide, part });
      });
      this.dynamic.add(group);
      const label = document.createElement("span");
      label.className = "apparatus-label";
      const number = document.createElement("span"); number.textContent = `0${index + 1}`;
      label.append(number, document.createTextNode(names[index]));
      this.labelLayer.append(label);
      group.userData.label = label;
      group.userData.labelHeight = [0.85, 0.95, 1.5, 1.65][index];
    });
  }

  positionStudioLabels() {
    if (!this.studio || !this.hardware) return;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    const points = [];
    this.hardware.forEach(group => {
      const label = group.userData.label;
      const show = this.focusName === "all" || this.focusName === group.name;
      label.hidden = !show;
      if (!show) return;
      const anchor = this.view === "2d"
        ? new THREE.Vector3(group.position.x, 0, group.position.z - (group.name === "ccd-detector" ? 2.8 : 1.25))
        : new THREE.Vector3(group.position.x, group.userData.labelHeight + this.explodeAmount * 0.9, group.position.z);
      anchor.project(this.activeCamera);
      const w = label.offsetWidth;
      points.push({ label, x: Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, (anchor.x + 1) * width / 2)),
        y: Math.max(label.offsetHeight + 12, Math.min(height - 32, (1 - anchor.y) * height / 2)), w });
    });
    points.sort((a, b) => a.x - b.x);
    points.forEach((p, i) => {
      const candidates = [0, -38, 38, -76, 76, -114, 114, 152].map(offset => p.y + offset);
      p.y = candidates.find(y => {
        if (y < p.label.offsetHeight + 12 || y > height - 32) return false;
        if (this.view === "3d" && p.x + p.w / 2 > width - 66 && y - p.label.offsetHeight < 62 && y > 12) return false;
        return points.slice(0, i).every(other => Math.abs(p.x - other.x) >= (p.w + other.w) / 2 + 8 || Math.abs(y - other.y) >= 35);
      }) ?? p.y;
      p.label.style.left = `${p.x}px`; p.label.style.top = `${p.y}px`;
    });
  }

  clearDynamic() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.dynamic.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.filter(Boolean).forEach((material) => {
        materials.add(material);
        if (material.map) textures.add(material.map);
      });
    });
    this.dynamic.clear();
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  update(params) {
    this.params = { ...params };
    const key = [params.lambdaNm, params.gratingUm, params.slitUm, params.slitCount,
      params.distanceCm, params.incidenceDeg, params.diffractionEnabled, this.displayMode].join("|");
    if (key === this.updateKey) return;
    this.updateKey = key;
    this.clearDynamic();

    const thetaI = toRad(params.incidenceDeg);
    const gratingX = -1.05;
    const laserX = -4.75;
    const collimatorX = laserX + 1.45;
    const screenX = gratingX + 2.05 + (params.distanceCm / 200) * 3.15;
    const domain = stableVisibleDomainCm(params);
    const zScale = SCREEN_HALF_WIDTH / domain;
    // Rotate around the laser's center, then transform its aperture onto the incident axis.
    const incidentZAt = (x) => -Math.tan(thetaI) * (gratingX - x);
    const laserExitX = laserX + Math.cos(thetaI) * LASER_EXIT_LOCAL_X;
    const laserModelZ = incidentZAt(laserX);
    const laserExitZ = laserModelZ + Math.sin(thetaI) * LASER_EXIT_LOCAL_X;
    const collimatorZ = incidentZAt(collimatorX);
    const laserColor = wavelengthToColor(params.lambdaNm);

    this.addOpticalRail(laserX, screenX);
    if (this.studio) {
      this.addStudioHardware([[laserX, 0, laserModelZ], [collimatorX, 0, collimatorZ], [gratingX, 0, 0], [screenX, 0, 0]], thetaI, params, domain, laserColor);
    } else {
      this.addLaser(laserX, laserModelZ, thetaI, laserColor);
      this.addCollimator(collimatorX, collimatorZ, thetaI);
      this.addGrating(gratingX, params);
      this.addScreen(screenX, params, domain, laserColor);
    }
    this.addDimensionArrow(gratingX, screenX, 2.86, `L = ${params.distanceCm.toFixed(1)} cm`);

    const gratingPoint = new THREE.Vector3(gratingX, OPTICAL_AXIS_Y, 0);
    const laserPoint = new THREE.Vector3(laserExitX, OPTICAL_AXIS_Y, laserExitZ);
    const collimatorPoint = new THREE.Vector3(collimatorX, OPTICAL_AXIS_Y, collimatorZ);
    this.addBeam(laserPoint, collimatorPoint, laserColor.three, 0.9);
    this.addBeam(collimatorPoint, gratingPoint, laserColor.three, 0.9);

    maximumOrder(params).forEach((order) => {
      const row = diffractionAngle(params, order);
      if (!row.valid || Math.abs(row.screenCm) > domain) return;
      const peak = intensityAt(params, row.screenCm);
      if (peak < 0.003) return;
      const endpoint = new THREE.Vector3(screenX - 0.15, OPTICAL_AXIS_Y, row.screenCm * zScale);
      this.addBeam(gratingPoint, endpoint, laserColor.three, 0.1 + Math.sqrt(peak) * 0.7);
    });
    this.renderer.shadowMap.needsUpdate = true;
    this.placeLabels();
    this.framePoints = [];
    const names = ["laser", "collimator", "grating-holder", "ccd-detector"];
    this.dynamic.children.filter((part) => names.includes(part.name)).forEach((part) => {
      const bounds = new THREE.Box3().setFromObject(part).expandByScalar(0.1);
      bounds.max.y += 0.6;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) this.framePoints.push(new THREE.Vector3(x, y, z));
    });
    this.applyExplode();
    this.updateCamera();
    this.needsRender = true;
  }

  addBeam(start, end, color, opacity) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) return;
    const beam = new THREE.Group();
    beam.name = "optical-path";
    beam.userData = { start: start.clone(), end: end.clone() };
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    [
      [0.008, opacity], [0.025, opacity * 0.13],
    ].forEach(([radius, alpha]) => {
      const part = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      beam.add(part);
    });
    this.dynamic.add(beam);
  }

  addOpticalRail(laserX, screenX) {
    const group = new THREE.Group();
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x93a2b1, metalness: 0.6, roughness: 0.3 });
    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x96acbf, transparent: true, opacity: 0.58 });
    const length = screenX - laserX + 1.15;
    const centerX = (screenX + laserX) / 2 - 0.1;

    [-0.56, 0.56].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.025, 0.035), railMaterial);
      rail.position.set(centerX, TABLE_Y + 0.012, z);
      group.add(rail);
    });

    const tickCount = Math.floor(length / 0.42);
    for (let i = 0; i <= tickCount; i += 1) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, i % 5 === 0 ? 0.42 : 0.22), tickMaterial);
      tick.position.set(centerX - length / 2 + i * 0.42, TABLE_Y + 0.004, 0);
      tick.scale.y = 0.04;
      group.add(tick);
    }

    this.dynamic.add(group);
  }

  addLaser(x, z, thetaI, laserColor) {
    const group = new THREE.Group();
    group.name = "laser";
    group.position.set(x, OPTICAL_AXIS_Y, z);
    group.rotation.y = -thetaI;

    const body = new THREE.Mesh(
      machinedBox(1.05, 0.58, 0.78, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x687888,
        metalness: 0.38,
        roughness: 0.32,
      }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x294965, metalness: 0.35, roughness: 0.34 });
    const finMaterial = new THREE.MeshStandardMaterial({ color: 0x34414e, metalness: 0.48, roughness: 0.3 });
    for (let i = 0; i < 7; i += 1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.72), finMaterial);
      fin.position.set(-0.38 + i * 0.11, 0.37, 0);
      group.add(fin);
    }

    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.025), detailMaterial);
    sidePanel.position.set(-0.1, -0.02, 0.405);
    group.add(sidePanel);
    const sidePanelBack = sidePanel.clone();
    sidePanelBack.position.z = -0.405;
    group.add(sidePanelBack);

    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.08, 48),
      new THREE.MeshStandardMaterial({
        color: 0x34414b,
        metalness: 0.42,
        roughness: 0.25,
        emissive: laserColor.three,
        emissiveIntensity: 0.025,
      }),
    );
    face.rotation.z = Math.PI / 2;
    face.position.x = 0.56;
    group.add(face);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.04, 36),
      new THREE.MeshBasicMaterial({ color: laserColor.three, toneMapped: false }),
    );
    lens.rotation.z = Math.PI / 2;
    lens.position.x = LASER_EXIT_LOCAL_X;
    lens.name = "laser-aperture";
    group.add(lens);
    const apertureRim = addPart(group, new THREE.TorusGeometry(0.135, 0.026, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xb6c3ce, metalness: 0.65, roughness: 0.22 }), 0.678, 0, 0);
    apertureRim.rotation.y = Math.PI / 2;

    const screwMaterial = new THREE.MeshStandardMaterial({ color: 0x95a6b8, metalness: 0.75, roughness: 0.22 });
    [-1, 1].forEach((yy) => {
      [-1, 1].forEach((zz) => {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.018, 18), screwMaterial);
        screw.rotation.z = Math.PI / 2;
        screw.position.set(LASER_EXIT_LOCAL_X + 0.006, yy * 0.22, zz * 0.27);
        group.add(screw);
      });
    });

    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 18, 18),
      new THREE.MeshBasicMaterial({ color: laserColor.three }),
    );
    indicator.position.set(-0.46, 0.17, 0.41);
    group.add(indicator);

    const stand = new THREE.Mesh(
      machinedBox(0.28, 1.12, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x516170, metalness: 0.45, roughness: 0.35 }),
    );
    stand.position.set(-0.2, -0.87, 0);
    stand.castShadow = true;
    group.add(stand);

    const base = new THREE.Mesh(
      machinedBox(1.12, 0.18, 0.86),
      new THREE.MeshStandardMaterial({ color: 0x3b4856, metalness: 0.42, roughness: 0.36 }),
    );
    base.position.set(-0.18, TABLE_Y + 0.09, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    [-0.58, 0.22].forEach((xx) => [-0.3, 0.3].forEach((zz) => addBolt(group, screwMaterial, xx, TABLE_Y + 0.19, zz)));
    [-0.28, 0.1].forEach((xx) => [-0.12, 0.12].forEach((yy) => addBolt(group, screwMaterial, xx, yy, 0.425, "z", 0.025)));
    const heightLock = addPart(group, new THREE.CylinderGeometry(0.105, 0.105, 0.13, 20), detailMaterial, -0.2, -0.85, 0.25);
    heightLock.rotation.x = Math.PI / 2;

    const label = makeTextSprite("激光器", {
      color: "#e0eaf4",
      fontSize: 48,
      width: 210,
      height: 76,
    });
    label.position.set(x, 0.92, z);
    label.userData = { spatialPosition: label.position.clone(), planPosition: new THREE.Vector3(x, 0.1, z + 0.85) };
    label.scale.multiplyScalar(1.05);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addCollimator(x, z, thetaI) {
    const group = new THREE.Group();
    group.name = "collimator";
    group.position.set(x, OPTICAL_AXIS_Y, z);
    group.rotation.y = -thetaI;

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb1d4e5,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.35,
      ior: 1.52,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 24), glassMaterial);
    lens.scale.x = 0.19;
    group.add(lens);

    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x91a5b9, metalness: 0.56, roughness: 0.24 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 12, 56), ringMaterial);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.04;
    ring.castShadow = true;
    group.add(ring);
    const backRing = ring.clone();
    backRing.position.x = 0.04;
    group.add(backRing);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      addBolt(group, ringMaterial, -0.09, Math.cos(angle) * 0.51, Math.sin(angle) * 0.51, "x", 0.035);
    }

    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.94, 24), ringMaterial);
    holder.position.y = -0.97;
    holder.castShadow = true;
    group.add(holder);
    const clampMaterial = new THREE.MeshStandardMaterial({ color: 0x364759, metalness: 0.45, roughness: 0.32 });
    addPart(group, new THREE.CylinderGeometry(0.12, 0.12, 0.34, 24), clampMaterial, 0, -1.23, 0);
    const knob = addPart(group, new THREE.CylinderGeometry(0.09, 0.09, 0.12, 20), clampMaterial, 0, -1.23, 0.17);
    knob.rotation.x = Math.PI / 2;

    const base = new THREE.Mesh(
      machinedBox(0.72, 0.18, 0.78),
      clampMaterial,
    );
    base.position.y = TABLE_Y + 0.09;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    [-0.23, 0.23].forEach((xx) => addBolt(group, ringMaterial, xx, TABLE_Y + 0.19, 0.23));

    const label = makeTextSprite("准直镜", {
      color: "#cceaff",
      fontSize: 48,
      width: 210,
      height: 76,
    });
    label.position.set(x, 1.15, z - 0.1);
    label.userData = { spatialPosition: label.position.clone(), planPosition: new THREE.Vector3(x, 0.1, z + 0.9) };
    label.scale.multiplyScalar(1.05);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addGrating(x, params) {
    const group = new THREE.Group();
    group.name = "grating-holder";
    group.position.set(x, 0, 0);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 1.98, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xb6d6ea,
        metalness: 0.12,
        roughness: 0.12,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    group.add(glass);

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x738ba1, metalness: 0.48, roughness: 0.28 });
    const top = new THREE.Mesh(machinedBox(0.14, 0.12, 1.72), frameMaterial);
    top.position.y = 1.05;
    group.add(top);
    const bottom = top.clone();
    bottom.position.y = -1.05;
    group.add(bottom);
    const left = new THREE.Mesh(machinedBox(0.14, 2.1, 0.12), frameMaterial);
    left.position.z = -0.83;
    group.add(left);
    const right = left.clone();
    right.position.z = 0.83;
    group.add(right);

    const ruling = document.createElement("canvas");
    ruling.width = 1024;
    ruling.height = 64;
    const context = ruling.getContext("2d");
    const count = Math.max(2, Math.round(params.slitCount));
    const period = ruling.width / count;
    const opaqueFraction = 1 - Math.min(1, params.slitUm / params.gratingUm);
    context.fillStyle = "rgba(194,215,231,0.85)";
    for (let i = 0; i < count; i++) context.fillRect(i * period, 0, period * opaqueFraction, ruling.height);
    const rulingTexture = new THREE.CanvasTexture(ruling);
    rulingTexture.colorSpace = THREE.SRGBColorSpace;
    rulingTexture.anisotropy = 4;
    const bars = addPart(group, new THREE.PlaneGeometry(1.5, 1.96),
      new THREE.MeshBasicMaterial({ map: rulingTexture, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, toneMapped: false }), -0.036, 0, 0);
    bars.rotation.y = -Math.PI / 2;

    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x3c5065, metalness: 0.46, roughness: 0.34 });
    const base = new THREE.Mesh(machinedBox(0.8, 0.18, 1.62), baseMaterial);
    base.position.set(0, TABLE_Y + 0.09, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.42, 24), frameMaterial);
    post.position.set(0, -1.27, 0);
    post.castShadow = true;
    group.add(post);

    const knobMaterial = new THREE.MeshStandardMaterial({ color: 0xb6c5d3, metalness: 0.6, roughness: 0.24 });
    [-1, 1].forEach((side) => {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 32), knobMaterial);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 0.78 * side, 0.96);
      group.add(knob);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.18), baseMaterial);
      clamp.position.set(0, 0.78 * side, 0.84);
      group.add(clamp);
    });

    [-0.27, 0.27].forEach((xx) => [-0.58, 0.58].forEach((zz) => addBolt(group, knobMaterial, xx, TABLE_Y + 0.19, zz)));
    const label = makeTextSprite("光栅架", {
      color: "#cde6fa",
      fontSize: 48,
      width: 210,
      height: 76,
    });
    label.position.set(x, 1.68, 0);
    label.userData = { spatialPosition: label.position.clone(), planPosition: new THREE.Vector3(x, 0.1, 1.2) };
    label.scale.multiplyScalar(1.05);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addScreen(x, params, domain, laserColor) {
    const group = new THREE.Group();
    group.name = "ccd-detector";
    group.position.x = x;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3a48, metalness: 0.35, roughness: 0.36 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xa3b4c3, metalness: 0.6, roughness: 0.25 });
    addPart(group, machinedBox(0.22, 2.5, 5.0, 0.035), bodyMaterial, 0.01);
    const sensor = addPart(group, new THREE.PlaneGeometry(4.5, 2.12),
      new THREE.MeshBasicMaterial({ map: createSensorTexture(params, domain, laserColor),
        toneMapped: false, side: THREE.DoubleSide }), -0.15);
    sensor.rotation.y = -Math.PI / 2;
    sensor.name = "sensor-irradiance";
    sensor.userData.domainCm = domain;
    sensor.castShadow = false;
    sensor.receiveShadow = false;
    [-1, 1].forEach((side) => {
      addPart(group, machinedBox(0.1, 0.08, 5.02), trimMaterial, -0.07, side * 1.23, 0);
      addPart(group, machinedBox(0.1, 2.5, 0.08), trimMaterial, -0.07, 0, side * 2.48);
      [-1, 1].forEach((other) => addBolt(group, trimMaterial, -0.124, side * 1.13, other * 2.36, "x", 0.04));
    });
    for (let i = -5; i <= 5; i++) addPart(group, new THREE.BoxGeometry(0.08, 1.5, 0.045), bodyMaterial, 0.16, 0, i * 0.27);
    const connector = addPart(group, new THREE.CylinderGeometry(0.09, 0.09, 0.2, 20), trimMaterial, 0.24, -0.76, 0.8);
    connector.rotation.z = Math.PI / 2;
    addPart(group, machinedBox(0.3, 0.28, 0.36), bodyMaterial, 0.18, -0.76, -0.5);
    addPart(group, machinedBox(0.28, 0.3, 0.32), trimMaterial, 0.08, -1.36, 0);
    addPart(group, machinedBox(1.04, 0.18, 1.64), bodyMaterial, 0.08, TABLE_Y + 0.09, 0);
    [-0.27, 0.43].forEach((xx) => [-0.6, 0.6].forEach((zz) => addBolt(group, trimMaterial, xx, TABLE_Y + 0.19, zz)));
    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0xa8c1d5, transparent: true, opacity: 0.62, toneMapped: false });
    addPart(group, new THREE.BoxGeometry(0.008, 0.01, 4.5), tickMaterial, -0.154, -1.12, 0);
    for (let i = -8; i <= 8; i += 1) {
      const height = i % 4 === 0 ? 0.09 : 0.045;
      addPart(group, new THREE.BoxGeometry(0.008, height, 0.009), tickMaterial, -0.154, -1.12 + height / 2, i * 4.5 / 16);
    }
    const label = makeTextSprite("CCD 采样面", {
      color: "#e0eaf4",
      fontSize: 48,
      width: 350,
      height: 76,
    });
    label.position.set(x, 1.83, 0);
    label.userData = { spatialPosition: label.position.clone(), planPosition: new THREE.Vector3(x, 0.1, 2.96) };
    label.scale.multiplyScalar(1.05);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addDimensionArrow(x0, x1, z, labelText) {
    const y = TABLE_Y + 0.055;
    const line = makeLine([new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z)], CYAN, 0.72);
    this.dynamic.add(line);

    const coneMaterial = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.76 });
    const left = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 22), coneMaterial);
    left.rotation.z = Math.PI / 2;
    left.position.set(x0, y, z);
    this.dynamic.add(left);

    const right = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 22), coneMaterial);
    right.rotation.z = -Math.PI / 2;
    right.position.set(x1, y, z);
    this.dynamic.add(right);

    const label = makeTextSprite(labelText, {
      color: "#9ed2ff",
      fontSize: 36,
      width: 320,
      height: 76,
    });
    label.position.set((x0 + x1) / 2, y + 0.14, z + 0.2);
    label.scale.multiplyScalar(0.9);
    this.dynamic.add(label);
  }

  animate(time = performance.now()) {
    requestAnimationFrame(timestamp => this.animate(timestamp));
    const dt = Math.min(0.05, Math.max(0, (time - (this.lastFrameTime ?? time)) / 1000));
    this.lastFrameTime = time;
    if (this.container.clientWidth === 0 || document.hidden) return;
    if (Math.abs(this.explodeTarget - this.explodeAmount) > 0.0001) {
      this.explodeAmount += (this.explodeTarget - this.explodeAmount) * (1 - Math.exp(-dt * 7));
      if (Math.abs(this.explodeTarget - this.explodeAmount) < 0.0001) this.explodeAmount = this.explodeTarget;
      this.applyExplode();
      this.updateCamera();
    }
    if (this.autoRotate && !this.drag.active) {
      this.cameraState.azimuth += dt * 0.16;
      this.updateCamera();
    }
    if (this.needsRender) {
      this.renderer.render(this.scene, this.activeCamera);
      this.positionStudioLabels();
      this.needsRender = false;
    }
  }
}
