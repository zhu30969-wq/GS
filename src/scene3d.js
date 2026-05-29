import * as THREE from "../vendor/three.module.js";
import { intensityAt, orderRows, stableVisibleDomainCm, toRad, wavelengthToColor } from "./physics.js";

const LASER_COLOR = 0xff2f46;
const CYAN = 0x79cfff;
const OPTICAL_AXIS_Y = 0;
const LASER_EXIT_LOCAL_X = 0.66;
const MIN_2D_ZOOM = 0.6;
const MAX_2D_ZOOM = 3;
const ORTHO_BASE_HALF_HEIGHT = 4.2;

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
  ctx.font = `600 ${fontSize}px "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  const lines = String(text).split("\n");
  const lineHeight = fontSize * 1.22;
  const firstY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, firstY + index * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 185, height / 185, 1);
  return sprite;
}

function makeGlowTexture(color = { r: 255, g: 47, b: 70 }) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const { r, g, b } = color;
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, `rgba(${r},${g},${b},0.95)`);
  gradient.addColorStop(0.42, `rgba(${r},${g},${b},0.35)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeScreenSpotTexture(color = { r: 255, g: 47, b: 70 }, selected = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const { r, g, b } = color;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // CCD/光屏是二维探测面。这里只画贴在屏面上的窄纵向亮纹，
  // 不再使用大面积径向光斑，避免误导成“空气中发光云团”。
  const vertical = ctx.createLinearGradient(64, 46, 64, 338);
  vertical.addColorStop(0, `rgba(${r},${g},${b},0)`);
  vertical.addColorStop(0.32, `rgba(${r},${g},${b},${selected ? 0.18 : 0.12})`);
  vertical.addColorStop(0.5, `rgba(${r},${g},${b},${selected ? 0.78 : 0.50})`);
  vertical.addColorStop(0.68, `rgba(${r},${g},${b},${selected ? 0.18 : 0.12})`);
  vertical.addColorStop(1, `rgba(${r},${g},${b},0)`);

  const horizontal = ctx.createLinearGradient(34, 0, 94, 0);
  horizontal.addColorStop(0, `rgba(${r},${g},${b},0)`);
  horizontal.addColorStop(0.38, `rgba(${r},${g},${b},${selected ? 0.38 : 0.24})`);
  horizontal.addColorStop(0.5, "rgba(255,255,255,0.92)");
  horizontal.addColorStop(0.62, `rgba(${r},${g},${b},${selected ? 0.38 : 0.24})`);
  horizontal.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = vertical;
  ctx.fillRect(45, 36, 38, 312);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = horizontal;
  ctx.fillRect(34, 68, 60, 248);
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = `rgba(${r},${g},${b},${selected ? 0.16 : 0.08})`;
  ctx.fillRect(58, 22, 12, 340);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLine(points, color, opacity = 0.82) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new THREE.Line(geometry, material);
}

export class DiffractionScene {
  constructor(container) {
    this.container = container;
    this.view = "3d";
    this.displayMode = "rays";
    this.params = null;
    this.time = 0;
    this.drag = { active: false, x: 0, y: 0 };
    this.cameraState = { azimuth: 0.78, elevation: 0.48, radius: 8.4 };
    this.orthoZoom = 1;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x071017, 8, 18);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.orthoCamera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
    this.activeCamera = this.camera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.container.appendChild(this.renderer.domElement);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);

    this.spots = [];
    this.selectedPulse = null;

    this.addLighting();
    this.addStaticFloor();
    this.bindPointerCamera();
    this.resize();
    this.animate();

    window.addEventListener("resize", () => this.resize());
  }

  addLighting() {
    const ambient = new THREE.AmbientLight(0x9fb6d4, 0.56);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xcde7ff, 1.25);
    key.position.set(-3, 5, 4);
    this.scene.add(key);

    this.rimLight = new THREE.PointLight(LASER_COLOR, 2.2, 8);
    this.rimLight.position.set(-3.8, 0.6, 0);
    this.scene.add(this.rimLight);
  }

  addStaticFloor() {
    const grid = new THREE.GridHelper(12, 22, 0x31506b, 0x1b2b3b);
    grid.position.set(0.7, -1.22, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.34;
    this.root.add(grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 9),
      new THREE.MeshBasicMaterial({
        color: 0x0a1018,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.23;
    this.root.add(floor);
  }

  bindPointerCamera() {
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      if (this.view !== "3d") return;
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
    const halfHeight = ORTHO_BASE_HALF_HEIGHT / this.orthoZoom;
    this.orthoCamera.left = -halfHeight * aspect;
    this.orthoCamera.right = halfHeight * aspect;
    this.orthoCamera.top = halfHeight;
    this.orthoCamera.bottom = -halfHeight;
    this.orthoCamera.updateProjectionMatrix();
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
    this.activeCamera = view === "2d" ? this.orthoCamera : this.camera;
    this.updateCamera();
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    if (this.params) this.update(this.params);
  }

  updateCamera() {
    const target = new THREE.Vector3(0.4, 0.1, 0);
    if (this.view === "2d") {
      this.orthoCamera.position.set(0.4, 11, 0);
      this.orthoCamera.up.set(0, 0, -1);
      this.orthoCamera.lookAt(target);
      return;
    }

    const { azimuth, elevation, radius } = this.cameraState;
    const horizontal = Math.cos(elevation) * radius;
    this.camera.position.set(
      target.x + Math.cos(azimuth) * horizontal,
      target.y + Math.sin(elevation) * radius,
      target.z + Math.sin(azimuth) * horizontal,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
  }

  clearDynamic() {
    while (this.dynamic.children.length) {
      const child = this.dynamic.children.pop();
      child.traverse?.((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            material.map?.dispose?.();
            material.dispose?.();
          });
        } else {
          object.material?.map?.dispose?.();
          object.material?.dispose?.();
        }
      });
    }
    this.spots = [];
    this.selectedPulse = null;
  }

  update(params) {
    this.params = { ...params };
    this.clearDynamic();

    const thetaI = toRad(params.incidenceDeg);
    const gratingX = -1.05;
    const laserX = -4.75;
    const collimatorX = laserX + 1.45;
    const screenX = gratingX + 2.05 + (params.distanceCm / 200) * 3.15;
    const domain = stableVisibleDomainCm(params);
    const screenHalf = 2.25;
    const zScale = screenHalf / domain;
    // 入射光线必须通过激光器出射口、准直镜中心和光栅中心。
    // 先按光栅中心反推任意 x 位置处的 z 坐标，再把激光器模型摆到
    // “红色出射口”正好落在这条光线上，避免光线从机身内部或偏上方冒出。
    const incidentZAt = (x) => -Math.tan(thetaI) * (gratingX - x);
    const laserExitX = laserX + Math.cos(thetaI) * LASER_EXIT_LOCAL_X;
    const laserExitZ = incidentZAt(laserExitX);
    const laserModelZ = laserExitZ + Math.sin(thetaI) * LASER_EXIT_LOCAL_X;
    const collimatorZ = incidentZAt(collimatorX);
    const laserColor = wavelengthToColor(params.lambdaNm);
    this.rimLight?.color.setHex(laserColor.three);

    this.addOpticalRail(laserX, screenX);
    this.addLaser(laserX, laserModelZ, thetaI, params.lambdaNm, laserColor);
    this.addCollimator(collimatorX, collimatorZ, thetaI, laserColor);
    this.addGrating(gratingX, params.gratingUm);
    this.addScreen(screenX, params.distanceCm);
    this.addDimensionArrow(gratingX, screenX, -2.55, `L = ${params.distanceCm.toFixed(1)} cm`);

    const gratingPoint = new THREE.Vector3(gratingX, OPTICAL_AXIS_Y, 0);
    const laserPoint = new THREE.Vector3(laserExitX, OPTICAL_AXIS_Y, laserExitZ);
    const collimatorPoint = new THREE.Vector3(collimatorX, OPTICAL_AXIS_Y, collimatorZ);
    this.dynamic.add(makeLine([laserPoint, collimatorPoint], laserColor.three, 0.82));
    this.dynamic.add(makeLine([collimatorPoint, gratingPoint], laserColor.three, 0.92));

    const rows = orderRows(params);
    rows.forEach((row) => {
      if (!row.valid) return;
      const visibleScreenCm = Math.max(-domain, Math.min(domain, row.screenCm));
      const z = visibleScreenCm * zScale;
      const onScreen = Math.abs(row.screenCm) <= domain;
      const endpoint = new THREE.Vector3(screenX - 0.035, OPTICAL_AXIS_Y, z);
      const selected = row.order === params.order;
      const peak = onScreen ? intensityAt(params, row.screenCm) : 0;
      const opacity = onScreen ? (selected ? Math.max(0.22, 0.36 + peak * 0.56) : Math.max(0.10, peak * 0.42)) : 0.18;
      const ray = makeLine([gratingPoint, endpoint], laserColor.three, opacity);
      this.dynamic.add(ray);

      if (onScreen && peak > 0.006) {
        const spot = this.addScreenSpot(screenX - 0.07, z, selected, row.order, laserColor, peak);
        this.spots.push(spot);
      }

      if (selected && onScreen) {
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.052, 20, 20),
          new THREE.MeshBasicMaterial({ color: laserColor.three }),
        );
        pulse.userData = { start: gratingPoint.clone(), end: endpoint.clone() };
        this.selectedPulse = pulse;
        this.dynamic.add(pulse);
      }
    });

    if (this.displayMode === "intensity") {
      this.addIntensityBands(screenX, params, domain, zScale, laserColor);
    }
  }

  addOpticalRail(laserX, screenX) {
    const group = new THREE.Group();
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2633, metalness: 0.56, roughness: 0.3 });
    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x6f8499, transparent: true, opacity: 0.62 });
    const length = screenX - laserX + 1.15;
    const centerX = (screenX + laserX) / 2 - 0.1;

    [-0.56, 0.56].forEach((z) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.055, 0.055), railMaterial);
      rail.position.set(centerX, -1.5, z);
      group.add(rail);
    });

    const tickCount = Math.floor(length / 0.42);
    for (let i = 0; i <= tickCount; i += 1) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, i % 5 === 0 ? 0.42 : 0.22), tickMaterial);
      tick.position.set(centerX - length / 2 + i * 0.42, -1.44, 0);
      group.add(tick);
    }

    this.dynamic.add(group);
  }

  addLaser(x, z, thetaI, lambdaNm, laserColor) {
    const group = new THREE.Group();
    group.position.set(x, OPTICAL_AXIS_Y, z);
    group.rotation.y = -thetaI;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.58, 0.78),
      new THREE.MeshStandardMaterial({
        color: 0x111923,
        metalness: 0.55,
        roughness: 0.32,
      }),
    );
    group.add(body);

    const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x243140, metalness: 0.5, roughness: 0.34 });
    const finMaterial = new THREE.MeshStandardMaterial({ color: 0x344356, metalness: 0.58, roughness: 0.3 });
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
        color: 0x1d2b3a,
        metalness: 0.62,
        roughness: 0.25,
        emissive: laserColor.three,
        emissiveIntensity: 0.12,
      }),
    );
    face.rotation.z = Math.PI / 2;
    face.position.x = 0.56;
    group.add(face);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.09, 42),
      new THREE.MeshBasicMaterial({ color: laserColor.three }),
    );
    lens.rotation.z = Math.PI / 2;
    lens.position.x = LASER_EXIT_LOCAL_X;
    group.add(lens);

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
      new THREE.BoxGeometry(0.28, 0.86, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x16202b, metalness: 0.42, roughness: 0.44 }),
    );
    stand.position.set(-0.2, -0.73, 0);
    group.add(stand);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.18, 0.86),
      new THREE.MeshStandardMaterial({ color: 0x0d151e, metalness: 0.48, roughness: 0.36 }),
    );
    base.position.set(-0.18, -1.25, 0);
    group.add(base);

    const label = makeTextSprite(`激光器\nλ = ${lambdaNm.toFixed(0)} nm`, {
      color: laserColor.hex,
      fontSize: 34,
      width: 270,
      height: 98,
    });
    label.position.set(x + 0.05, -1.15, z + 0.7);
    label.scale.multiplyScalar(0.62);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addCollimator(x, z, thetaI, laserColor) {
    const group = new THREE.Group();
    group.position.set(x, OPTICAL_AXIS_Y, z);
    group.rotation.y = -thetaI;

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc6f0ff,
      roughness: 0.06,
      metalness: 0.02,
      transmission: 0.42,
      transparent: true,
      opacity: 0.34,
      emissive: laserColor.three,
      emissiveIntensity: 0.05,
    });

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.055, 64), glassMaterial);
    lens.rotation.z = Math.PI / 2;
    group.add(lens);

    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4b5c, metalness: 0.68, roughness: 0.24 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 12, 64), ringMaterial);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);

    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.18, 0.12), ringMaterial);
    holder.position.y = -0.72;
    group.add(holder);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.14, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x101923, metalness: 0.46, roughness: 0.36 }),
    );
    base.position.y = -1.38;
    group.add(base);

    const label = makeTextSprite("准直镜", {
      color: "#cceaff",
      fontSize: 32,
      width: 180,
      height: 72,
    });
    label.position.set(x, -1.22, z + 0.62);
    label.scale.multiplyScalar(0.5);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addGrating(x, dUm) {
    const group = new THREE.Group();
    group.position.set(x, 0, 0);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 2.85, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0xa8c7ee,
        metalness: 0.12,
        roughness: 0.12,
        transparent: true,
        opacity: 0.25,
      }),
    );
    group.add(glass);

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2936, metalness: 0.44, roughness: 0.28 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 1.66), frameMaterial);
    top.position.y = 1.47;
    group.add(top);
    const bottom = top.clone();
    bottom.position.y = -1.47;
    group.add(bottom);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.94, 0.08), frameMaterial);
    left.position.z = -0.83;
    group.add(left);
    const right = left.clone();
    right.position.z = 0.83;
    group.add(right);

    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8e9ff,
      metalness: 0.18,
      roughness: 0.3,
      emissive: 0x101a24,
    });
    for (let i = -12; i <= 12; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.62, 0.014), barMaterial);
      bar.position.z = i * 0.06;
      group.add(bar);
    }

    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x151f2b, metalness: 0.52, roughness: 0.34 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 1.45), baseMaterial);
    base.position.set(0, -1.56, 0);
    group.add(base);

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.18), baseMaterial);
    post.position.set(0, -1.18, 0);
    group.add(post);

    const knobMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8da0, metalness: 0.72, roughness: 0.24 });
    [-1, 1].forEach((side) => {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.12, 32), knobMaterial);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 1.08 * side, 0.96);
      group.add(knob);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.18), baseMaterial);
      clamp.position.set(0, 1.08 * side, 0.84);
      group.add(clamp);
    });

    const label = makeTextSprite(`光栅架\nd = ${dUm.toFixed(3)} μm`, {
      color: "#9ed2ff",
      fontSize: 32,
      width: 250,
      height: 86,
    });
    label.position.set(x, -1.42, 1.08);
    label.scale.multiplyScalar(0.54);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addScreen(x, distanceCm) {
    const group = new THREE.Group();
    group.position.x = x;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(4.9, 3.18),
      new THREE.MeshStandardMaterial({
        color: 0x141b25,
        roughness: 0.72,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    screen.rotation.y = Math.PI / 2;
    group.add(screen);

    const pixelMaterial = new THREE.MeshBasicMaterial({ color: 0x8fb2d8, transparent: true, opacity: 0.16 });
    for (let i = -10; i <= 10; i += 1) {
      const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 2.92, 0.006), pixelMaterial);
      vLine.position.set(-0.052, 0, i * 0.23);
      group.add(vLine);
    }
    for (let j = -5; j <= 5; j += 1) {
      const hLine = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 4.62), pixelMaterial);
      hLine.position.set(-0.054, j * 0.26, 0);
      group.add(hLine);
    }

    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x526070, metalness: 0.42, roughness: 0.32 });
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 5.05), edgeMaterial);
    horizontal.position.y = 1.62;
    group.add(horizontal);
    const horizontalBottom = horizontal.clone();
    horizontalBottom.position.y = -1.62;
    group.add(horizontalBottom);

    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.25, 0.05), edgeMaterial);
    vertical.position.z = -2.52;
    group.add(vertical);
    const verticalRight = vertical.clone();
    verticalRight.position.z = 2.52;
    group.add(verticalRight);

    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x182331, metalness: 0.55, roughness: 0.32 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, 0.22), standMaterial);
    stand.position.set(0.08, -2.12, 0);
    group.add(stand);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 1.25), standMaterial);
    base.position.set(0.08, -2.7, 0);
    group.add(base);

    const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x8fb2d8, transparent: true, opacity: 0.64 });
    const rulerLine = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 4.25), tickMaterial);
    rulerLine.position.set(-0.046, -1.34, 0);
    group.add(rulerLine);
    for (let i = -8; i <= 8; i += 1) {
      const isMajor = i % 5 === 0;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.014, isMajor ? 0.17 : 0.1, 0.012), tickMaterial);
      tick.position.set(-0.052, -1.34 + tick.geometry.parameters.height / 2, i * 0.24);
      group.add(tick);
    }

    const label = makeTextSprite(`CCD屏幕\nL = ${distanceCm.toFixed(1)} cm`, {
      color: "#cfe7ff",
      fontSize: 32,
      width: 260,
      height: 86,
    });
    label.position.set(x - 0.08, 1.9, 0.72);
    label.scale.multiplyScalar(0.54);
    this.dynamic.add(label);
    this.dynamic.add(group);
  }

  addScreenSpot(x, z, selected, order, laserColor, peak = 1) {
    const texture = makeScreenSpotTexture(laserColor, selected || order === 0);
    const baseOpacity = Math.min(0.9, 0.16 + peak * (selected || order === 0 ? 0.78 : 0.55));
    const width = selected || order === 0 ? 0.22 : 0.16;
    const height = selected || order === 0 ? 1.14 : 0.92;
    const spot = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    spot.rotation.y = Math.PI / 2;
    spot.position.set(x, 0, z);
    spot.userData.baseOpacity = baseOpacity;
    this.dynamic.add(spot);
    return spot;
  }

  addDimensionArrow(x0, x1, z, labelText) {
    const y = -1.02;
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
      fontSize: 34,
      width: 320,
      height: 76,
    });
    label.position.set((x0 + x1) / 2, y + 0.13, z - 0.18);
    label.scale.multiplyScalar(0.56);
    this.dynamic.add(label);
  }

  addIntensityBands(screenX, params, domain, zScale, laserColor) {
    const group = new THREE.Group();
    const sampleCount = 58;
    for (let i = 0; i < sampleCount; i += 1) {
      const t = i / (sampleCount - 1);
      const cm = -domain + 2 * domain * t;
      const intensity = intensityAt(params, cm);
      const z = cm * zScale;
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(0.035, 2.8),
        new THREE.MeshBasicMaterial({
          color: laserColor.three,
          transparent: true,
          opacity: intensity * 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      band.rotation.y = Math.PI / 2;
      band.position.set(screenX - 0.065, 0, z);
      group.add(band);
    }
    this.dynamic.add(group);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.time += 0.016;
    for (const spot of this.spots) {
      const base = spot.userData.baseOpacity ?? 0.64;
      spot.material.opacity = base + Math.sin(this.time * 3.6) * 0.045;
    }

    if (this.selectedPulse) {
      const { start, end } = this.selectedPulse.userData;
      const t = (Math.sin(this.time * 2.2) + 1) / 2;
      this.selectedPulse.position.lerpVectors(start, end, t);
      const scale = 0.7 + Math.sin(this.time * 8) * 0.16;
      this.selectedPulse.scale.setScalar(scale);
    }

    this.renderer.render(this.scene, this.activeCamera);
  }
}
