const shell = document.querySelector(".lab-shell");
const scriptBaseUrl = new URL(".", document.currentScript?.src || window.location.href);
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const UI_FONT_STACK = '"HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const NUMBER_FONT_STACK = '"Bahnschrift", "DIN Alternate", "Segoe UI", "Microsoft YaHei UI", sans-serif';

const presets = {
  lambda: {
    knownD: 5.519,
    distance: 142.4,
    order: 1,
    referenceLambda: 650,
    xPlus: 16.8,
    xMinus: -16.6,
  },
  db: {
    knownLambda: 650,
    distance: 100.0,
    order: 1,
    referenceD: 5.0,
    referenceB: 2.0,
    xPlus: 13.11,
    xMinus: -13.11,
    centralWidth: 687.31,
  },
};

const heroModel = {
  scene: null,
  loading: false,
  ready: false,
  failed: false,
};

function $(id) {
  return document.getElementById(id);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readNumber(id) {
  return Number($(id).value);
}

function setValue(id, value, digits) {
  if (!Number.isFinite(value)) return;
  $(id).value = Number(value).toFixed(digits);
}

function toDeg(rad) {
  return rad * RAD;
}

function wavelengthBandName(wavelengthNm) {
  const wavelength = clamp(Number(wavelengthNm), 400, 700);
  if (wavelength < 430) return "紫光";
  if (wavelength < 485) return "蓝光";
  if (wavelength < 500) return "青光";
  if (wavelength < 565) return "绿光";
  if (wavelength < 590) return "黄光";
  if (wavelength < 625) return "橙光";
  return "红光";
}

function wavelengthToColor(wavelengthNm) {
  // 可见光近似 RGB 映射，仅用于教学显示，不代表严格色度学计算。
  const wavelength = clamp(Number(wavelengthNm), 400, 700);
  let red = 0;
  let green = 0;
  let blue = 0;

  if (wavelength < 440) {
    red = (440 - wavelength) / 40;
    blue = 1;
  } else if (wavelength < 490) {
    green = (wavelength - 440) / 50;
    blue = 1;
  } else if (wavelength < 510) {
    green = 1;
    blue = (510 - wavelength) / 20;
  } else if (wavelength < 580) {
    red = (wavelength - 510) / 70;
    green = 1;
  } else if (wavelength < 645) {
    red = 1;
    green = (645 - wavelength) / 65;
  } else {
    red = 1;
  }

  const edgeFactor =
    wavelength < 420
      ? 0.3 + 0.7 * ((wavelength - 400) / 20)
      : wavelength > 680
        ? 0.3 + 0.7 * ((700 - wavelength) / 20)
        : 1;
  const gamma = 0.82;
  const convert = (channel) => Math.round(255 * (channel * edgeFactor) ** gamma);
  const [r, g, b] = [convert(red), convert(green), convert(blue)];
  return { r, g, b, css: `rgb(${r}, ${g}, ${b})` };
}

function sinc(x) {
  if (Math.abs(x) < 1e-8) return 1;
  return Math.sin(x) / x;
}

function screenSinFromDisplacement(xCm, distanceCm) {
  const x = Math.abs(Number(xCm));
  const distance = Number(distanceCm);
  if (!Number.isFinite(x) || !Number.isFinite(distance) || x <= 0 || distance <= 0) return null;

  // 几何关系为 tanθ=x/L。反演公式需要 sinθ，因此直接用
  // sinθ=x/sqrt(x²+L²)，避免把小角度近似误差混进实验结论。
  return x / Math.sqrt(x ** 2 + distance ** 2);
}

function symmetricPairDisplacementCm(xMinusCm, xPlusCm) {
  const left = Math.abs(Number(xMinusCm));
  const right = Math.abs(Number(xPlusCm));
  const meanCm = (left + right) / 2;
  const asymmetry = meanCm > 0 ? Math.abs(left - right) / meanCm : null;
  return { meanCm, asymmetry };
}

function diffractionAngle(lambdaNm, gratingUm, distanceCm, order) {
  const lam = lambdaNm / 1000;
  const sinTheta = (order * lam) / gratingUm;
  if (!Number.isFinite(sinTheta) || Math.abs(sinTheta) > 1) {
    return { valid: false, thetaRad: null, thetaDeg: null, screenCm: null };
  }
  const thetaRad = Math.asin(sinTheta);
  return {
    valid: true,
    thetaRad,
    thetaDeg: toDeg(thetaRad),
    screenCm: distanceCm * Math.tan(thetaRad),
  };
}

function centralWidthMm(lambdaNm, distanceCm, slitUm) {
  const lam = lambdaNm / 1000;
  if (!Number.isFinite(slitUm) || slitUm <= lam) return null;
  const thetaDark = Math.asin(lam / slitUm);
  return 2 * distanceCm * Math.tan(thetaDark) * 10;
}

function intensityAt(params, screenCm) {
  const lam = params.lambdaNm / 1000;
  const theta = Math.atan(screenCm / params.distanceCm);
  const deltaSin = Math.sin(theta);
  const beta = (Math.PI * params.slitUm * deltaSin) / lam;
  const gamma = (Math.PI * params.gratingUm * deltaSin) / lam;
  const envelope = sinc(beta) ** 2;
  const denominator = Math.sin(gamma);
  let gratingTerm = 1;

  // N 缝干涉项主极大处为 0/0 型，极限值应取 1。
  if (Math.abs(denominator) > 1e-8) {
    gratingTerm = (Math.sin(params.slitCount * gamma) / (params.slitCount * denominator)) ** 2;
  }

  return clamp(envelope * gratingTerm, 0, 1);
}

function solveDb(input) {
  const lambdaNm = Number(input.lambdaNm);
  const distanceCm = Number(input.distanceCm);
  const order = Math.abs(Math.round(Number(input.order)));
  const widthMm = Number(input.widthMm);
  const pair = symmetricPairDisplacementCm(input.xMinusCm, input.xPlusCm);
  const warnings = [];

  if (!Number.isFinite(lambdaNm) || lambdaNm <= 0) warnings.push("λ 必须为正值。");
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) warnings.push("L 必须为正值。");
  if (!Number.isFinite(order) || order < 1) warnings.push("反演 d 不能使用 j=0，应选 j=1、2 ... 的亮纹。");
  if (!Number.isFinite(pair.meanCm) || pair.meanCm <= 0) warnings.push("±j 级亮纹位移不能同时为 0。");
  if (input.xMinusCm > 0 || input.xPlusCm < 0) warnings.push("建议按左侧负、右侧正记录 ±j 级位置。");
  if (pair.asymmetry !== null && pair.asymmetry > 0.04) warnings.push("左右亮纹不够对称，可能有入射角偏差或读数误差。");

  const sinTheta = screenSinFromDisplacement(pair.meanCm, distanceCm);
  const lambdaUm = lambdaNm / 1000;
  const dUm = sinTheta && order >= 1 ? (order * lambdaUm) / sinTheta : null;

  let bUm = null;
  let thetaDarkDeg = null;
  if (Number.isFinite(widthMm) && widthMm > 0) {
    const halfWidthCm = widthMm / 20;
    const sinDark = screenSinFromDisplacement(halfWidthCm, distanceCm);
    bUm = sinDark ? lambdaUm / sinDark : null;
    thetaDarkDeg = sinDark ? toDeg(Math.asin(sinDark)) : null;
  } else {
    warnings.push("W0 必须为正值，才能用一阶暗纹反推 b。");
  }

  if (dUm !== null && bUm !== null && bUm > dUm) {
    warnings.push("得到 b>d；若 b 表示真实透光缝宽，该结果不符合透射光栅几何。");
  }

  return {
    dUm: Number.isFinite(dUm) ? dUm : null,
    bUm: Number.isFinite(bUm) ? bUm : null,
    thetaDeg: sinTheta ? toDeg(Math.asin(sinTheta)) : null,
    thetaDarkDeg,
    xMeanCm: pair.meanCm,
    asymmetry: pair.asymmetry,
    warnings,
  };
}

function solveLambda(input) {
  const gratingUm = Number(input.gratingUm);
  const distanceCm = Number(input.distanceCm);
  const order = Math.abs(Math.round(Number(input.order)));
  const pair = symmetricPairDisplacementCm(input.xMinusCm, input.xPlusCm);
  const warnings = [];

  if (!Number.isFinite(gratingUm) || gratingUm <= 0) warnings.push("d 必须为正值。");
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) warnings.push("L 必须为正值。");
  if (!Number.isFinite(order) || order < 1) warnings.push("反演 λ 不能使用 j=0，应选 j=1、2 ... 的亮纹。");
  if (!Number.isFinite(pair.meanCm) || pair.meanCm <= 0) warnings.push("±j 级亮纹位移不能同时为 0。");
  if (input.xMinusCm > 0 || input.xPlusCm < 0) warnings.push("建议按左侧负、右侧正记录 ±j 级位置。");
  if (pair.asymmetry !== null && pair.asymmetry > 0.04) warnings.push("左右亮纹不够对称，可能有入射角偏差或读数误差。");

  const sinTheta = screenSinFromDisplacement(pair.meanCm, distanceCm);
  const lambdaNm = sinTheta && order >= 1 ? (gratingUm * sinTheta * 1000) / order : null;
  if (lambdaNm !== null && (lambdaNm < 400 || lambdaNm > 700)) {
    warnings.push("计算波长超出 400-700 nm 可见光范围；若光源为可见光，应复查 d、L 或亮纹位置。");
  }

  return {
    lambdaNm: Number.isFinite(lambdaNm) ? lambdaNm : null,
    thetaDeg: sinTheta ? toDeg(Math.asin(sinTheta)) : null,
    xMeanCm: pair.meanCm,
    asymmetry: pair.asymmetry,
    warnings,
  };
}

function currentMode() {
  return shell.dataset.mode === "db" ? "db" : "lambda";
}

function modeConfig() {
  const mode = currentMode();
  if (mode === "db") {
    return {
      lambdaNm: readNumber("knownLambda"),
      distanceCm: readNumber("distance"),
      order: Math.abs(Math.round(readNumber("order"))),
      gratingUm: readNumber("referenceD"),
      slitUm: readNumber("referenceB"),
      slitCount: 70,
    };
  }

  return {
    lambdaNm: readNumber("referenceLambda"),
    distanceCm: readNumber("distance"),
    order: Math.abs(Math.round(readNumber("order"))),
    gratingUm: readNumber("knownD"),
    slitUm: 2.0,
    slitCount: 70,
  };
}

function displayExtentCm(params) {
  const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, params.order);
  return Math.max(24, row.valid ? Math.abs(row.screenCm) * 1.9 : 24);
}

function formulaLine(symbolHtml, expressionHtml) {
  return `<p><span class="symbol">${symbolHtml}</span><span class="equals">=</span><span class="expression">${expressionHtml}</span></p>`;
}

function heroSceneParams(params = modeConfig()) {
  const selectedOrder = Math.max(1, Math.abs(Math.round(params.order || 1)));

  // 主实验的三维场景使用完整参数对象。学生页只暴露必要读数，
  // 这里补齐正入射、考虑单缝衍射和有效缝数，保证同一物理模型驱动光路与亮斑。
  return {
    lambdaNm: params.lambdaNm,
    gratingUm: params.gratingUm,
    distanceCm: params.distanceCm,
    slitUm: params.slitUm || 2.0,
    slitCount: params.slitCount || 70,
    order: selectedOrder,
    incidenceDeg: 0,
    diffractionEnabled: true,
  };
}

function drawHeroFallback(params = heroSceneParams()) {
  const canvas = $("studentHeroFallback");
  if (!canvas || heroModel.ready) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const color = wavelengthToColor(params.lambdaNm);
  const beam = color.css;
  const benchY = height * 0.77;
  const laserX = width * 0.13;
  const lensX = width * 0.34;
  const gratingX = width * 0.54;
  const screenX = width * 0.79;
  const screenW = Math.min(width * 0.18, 150);
  const screenH = height * 0.6;
  const screenTop = height * 0.15;
  const screenMid = screenTop + screenH / 2;
  const centerY = height * 0.51;
  const domain = displayExtentCm(params);
  const toScreenY = (screenCm) => screenMid - (screenCm / domain) * (screenH * 0.46);

  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0a1421");
  background.addColorStop(0.55, "#07101a");
  background.addColorStop(1, "#04080e");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(137, 180, 222, 0.13)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const bench = ctx.createLinearGradient(0, benchY - 18, 0, benchY + 26);
  bench.addColorStop(0, "#26384d");
  bench.addColorStop(1, "#0d1724");
  ctx.fillStyle = bench;
  ctx.beginPath();
  ctx.moveTo(width * 0.04, benchY + 18);
  ctx.lineTo(width * 0.86, benchY + 18);
  ctx.lineTo(width * 0.95, benchY - 16);
  ctx.lineTo(width * 0.12, benchY - 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(174, 203, 235, 0.35)";
  for (let x = width * 0.1; x < width * 0.9; x += 25) {
    for (let y = benchY - 10; y < benchY + 12; y += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.strokeStyle = beam;
  ctx.lineWidth = 2;
  ctx.shadowColor = beam;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(laserX + 68, centerY);
  ctx.lineTo(lensX - 16, centerY);
  ctx.moveTo(lensX + 16, centerY);
  ctx.lineTo(gratingX, centerY);
  ctx.stroke();

  [-3, -2, -1, 0, 1, 2, 3].forEach((order) => {
    const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, Math.abs(order));
    if (!row.valid) return;
    const screenCm = order < 0 ? -row.screenCm : row.screenCm;
    const targetY = toScreenY(screenCm);
    const peak = intensityAt(params, screenCm);
    const selected = Math.abs(order) === params.order;
    ctx.globalAlpha = order === 0 ? 0.9 : selected ? 0.78 : Math.max(0.18, peak * 0.7);
    ctx.lineWidth = order === 0 || selected ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.moveTo(gratingX, centerY);
    ctx.lineTo(screenX, targetY);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#111a27";
  ctx.strokeStyle = "#4b6a8d";
  ctx.lineWidth = 1.5;
  ctx.roundRect(laserX - 30, centerY - 24, 88, 48, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#26364a";
  ctx.fillRect(laserX - 16, centerY + 26, 42, 22);
  ctx.fillStyle = "#0b111b";
  ctx.fillRect(laserX - 34, centerY + 48, 96, 10);
  ctx.fillStyle = beam;
  ctx.shadowColor = beam;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(laserX + 60, centerY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const glass = ctx.createLinearGradient(lensX - 16, 0, lensX + 16, 0);
  glass.addColorStop(0, "rgba(143, 207, 255, 0.12)");
  glass.addColorStop(0.5, "rgba(219, 244, 255, 0.72)");
  glass.addColorStop(1, "rgba(69, 147, 255, 0.18)");
  ctx.fillStyle = glass;
  ctx.strokeStyle = "#72b8ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(lensX, centerY, 14, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#142033";
  ctx.fillRect(lensX - 22, benchY - 42, 44, 8);
  ctx.fillRect(lensX - 6, benchY - 44, 12, 28);

  ctx.fillStyle = "#111927";
  ctx.fillRect(gratingX - 12, centerY - 64, 24, 128);
  ctx.fillStyle = "#e8f2ff";
  ctx.fillRect(gratingX - 5, centerY - 58, 10, 116);
  ctx.strokeStyle = "#172236";
  ctx.lineWidth = 1;
  for (let x = gratingX - 4; x <= gratingX + 4; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x, centerY - 56);
    ctx.lineTo(x, centerY + 56);
    ctx.stroke();
  }
  ctx.fillStyle = "#142033";
  ctx.fillRect(gratingX - 28, benchY - 38, 56, 10);
  ctx.fillRect(gratingX - 6, benchY - 66, 12, 30);

  ctx.fillStyle = "#080e17";
  ctx.strokeStyle = "#314963";
  ctx.lineWidth = 2;
  ctx.fillRect(screenX, screenTop, screenW, screenH);
  ctx.strokeRect(screenX, screenTop, screenW, screenH);
  ctx.strokeStyle = "rgba(117, 162, 214, 0.22)";
  ctx.lineWidth = 1;
  for (let x = screenX + screenW / 5; x < screenX + screenW; x += screenW / 5) {
    ctx.beginPath();
    ctx.moveTo(x, screenTop);
    ctx.lineTo(x, screenTop + screenH);
    ctx.stroke();
  }
  for (let y = screenTop + screenH / 5; y < screenTop + screenH; y += screenH / 5) {
    ctx.beginPath();
    ctx.moveTo(screenX, y);
    ctx.lineTo(screenX + screenW, y);
    ctx.stroke();
  }

  [-3, -2, -1, 0, 1, 2, 3].forEach((order) => {
    const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, Math.abs(order));
    if (!row.valid) return;
    const screenCm = order < 0 ? -row.screenCm : row.screenCm;
    const y = toScreenY(screenCm);
    if (y < screenTop || y > screenTop + screenH) return;
    const peak = intensityAt(params, screenCm);
    const selected = Math.abs(order) === params.order || order === 0;
    const alpha = Math.min(0.92, selected ? 0.58 + peak * 0.32 : 0.18 + peak * 0.42);
    const spot = ctx.createRadialGradient(screenX + screenW * 0.5, y, 1, screenX + screenW * 0.5, y, 38);
    spot.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    spot.addColorStop(0.18, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
    spot.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.ellipse(screenX + screenW * 0.5, y, selected ? 18 : 12, selected ? 38 : 28, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#d9ecff";
  ctx.font = `700 12px ${UI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText(`激光器 ${params.lambdaNm.toFixed(0)} nm`, laserX + 14, centerY - 42);
  ctx.fillText("准直镜", lensX, centerY - 66);
  ctx.fillText(`光栅架 d=${params.gratingUm.toFixed(3)} μm`, gratingX, centerY - 76);
  ctx.fillText(`CCD 屏幕 L=${params.distanceCm.toFixed(1)} cm`, screenX + screenW / 2, screenTop - 10);
}

function drawIntroApparatus(params = modeConfig()) {
  const canvas = $("introApparatusCanvas");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const color = wavelengthToColor(params.lambdaNm);
  const order = Math.max(1, Math.abs(Math.round(params.order || 1)));

  // 该图是课堂操作区的紧凑二维装置图，只表达几何路径和读数关系；
  // 精确强度分布仍由 CCD 图样和光强曲线负责，避免在小图中混淆主极大宽度。
  const laserX = width * 0.13;
  const lensX = width * 0.34;
  const gratingX = width * 0.54;
  const screenX = width * 0.77;
  const centerY = height * 0.52;
  const screenH = height * 0.72;
  const screenTop = centerY - screenH / 2;
  const screenW = Math.min(width * 0.075, 54);
  const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, order);
  const peakOffset = row.valid ? clamp(row.screenCm / Math.max(18, Math.abs(row.screenCm) * 1.8), 0.16, 0.42) * screenH : screenH * 0.26;
  const topSpotY = centerY - peakOffset;
  const bottomSpotY = centerY + peakOffset;

  ctx.clearRect(0, 0, width, height);

  const benchY = height * 0.78;
  const bench = ctx.createLinearGradient(0, benchY - 18, 0, benchY + 24);
  bench.addColorStop(0, "#f8fbff");
  bench.addColorStop(1, "#dfeaf8");
  ctx.fillStyle = bench;
  ctx.beginPath();
  ctx.moveTo(width * 0.05, benchY + 20);
  ctx.lineTo(width * 0.86, benchY + 20);
  ctx.lineTo(width * 0.93, benchY - 18);
  ctx.lineTo(width * 0.13, benchY - 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c3d3e8";
  ctx.stroke();

  ctx.fillStyle = "rgba(116, 140, 170, 0.42)";
  for (let x = width * 0.13; x < width * 0.9; x += 24) {
    for (let y = benchY - 10; y < benchY + 12; y += 15) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#0e1826";
  ctx.strokeStyle = "#3b4a5d";
  ctx.lineWidth = 1.4;
  ctx.roundRect(laserX - 42, centerY - 20, 86, 40, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#25364b";
  ctx.fillRect(laserX - 26, centerY + 22, 42, 18);
  ctx.fillStyle = "#0c1420";
  ctx.fillRect(laserX - 48, centerY + 40, 105, 10);
  ctx.fillStyle = "#d9e5f5";
  ctx.fillRect(laserX - 20, centerY - 34, 44, 7);

  ctx.fillStyle = color.css;
  ctx.shadowColor = color.css;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(laserX + 49, centerY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = color.css;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(laserX + 52, centerY);
  ctx.lineTo(lensX - 18, centerY);
  ctx.moveTo(lensX + 18, centerY);
  ctx.lineTo(gratingX, centerY);
  ctx.stroke();

  const lensFill = ctx.createLinearGradient(lensX - 14, 0, lensX + 14, 0);
  lensFill.addColorStop(0, "rgba(130, 190, 255, 0.12)");
  lensFill.addColorStop(0.5, "rgba(225, 247, 255, 0.82)");
  lensFill.addColorStop(1, "rgba(53, 138, 240, 0.18)");
  ctx.fillStyle = lensFill;
  ctx.strokeStyle = "#1d63d8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(lensX, centerY, 13, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#122033";
  ctx.fillRect(lensX - 20, centerY + 48, 40, 9);
  ctx.fillRect(lensX - 5, centerY + 18, 10, 34);

  ctx.fillStyle = "#101827";
  ctx.fillRect(gratingX - 15, centerY - 55, 30, 110);
  ctx.fillStyle = "#f8fafc";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1;
  ctx.fillRect(gratingX - 6, centerY - 50, 12, 100);
  ctx.strokeRect(gratingX - 6, centerY - 50, 12, 100);
  for (let x = gratingX - 4; x <= gratingX + 4; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x, centerY - 47);
    ctx.lineTo(x, centerY + 47);
    ctx.stroke();
  }
  ctx.fillStyle = "#122033";
  ctx.fillRect(gratingX - 29, centerY + 58, 58, 10);
  ctx.fillRect(gratingX - 5, centerY + 24, 10, 36);

  ctx.strokeStyle = color.css;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(gratingX + 7, centerY);
  ctx.lineTo(screenX, centerY);
  ctx.moveTo(gratingX + 7, centerY);
  ctx.lineTo(screenX, topSpotY);
  ctx.moveTo(gratingX + 7, centerY);
  ctx.lineTo(screenX, bottomSpotY);
  ctx.stroke();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.58;
  ctx.beginPath();
  ctx.moveTo(gratingX + 7, centerY);
  ctx.lineTo(screenX, centerY - screenH * 0.43);
  ctx.moveTo(gratingX + 7, centerY);
  ctx.lineTo(screenX, centerY + screenH * 0.43);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#f9fbff";
  ctx.strokeStyle = "#8aa3c3";
  ctx.lineWidth = 2;
  ctx.fillRect(screenX, screenTop, screenW, screenH);
  ctx.strokeRect(screenX, screenTop, screenW, screenH);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(screenX + screenW + 22, screenTop, 2, screenH);
  ctx.strokeStyle = "#27364b";
  for (let y = screenTop + 10; y < screenTop + screenH; y += 10) {
    ctx.beginPath();
    ctx.moveTo(screenX + 4, y);
    ctx.lineTo(screenX + screenW - 4, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#263a64";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(screenX + screenW + 14, topSpotY);
  ctx.lineTo(screenX + screenW + 14, bottomSpotY);
  ctx.moveTo(screenX + screenW + 10, topSpotY);
  ctx.lineTo(screenX + screenW + 18, topSpotY);
  ctx.moveTo(screenX + screenW + 10, bottomSpotY);
  ctx.lineTo(screenX + screenW + 18, bottomSpotY);
  ctx.stroke();

  ctx.fillStyle = "#102657";
  ctx.font = `700 13px ${UI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText("激光器", laserX, centerY - 45);
  ctx.fillText(`${params.lambdaNm.toFixed(0)} nm`, laserX, centerY + 6);
  ctx.fillText("准直镜", lensX, centerY - 58);
  ctx.fillText("光栅", gratingX, centerY - 66);
  ctx.fillText("屏", screenX + screenW / 2, screenTop - 10);
  ctx.fillText(`+${order}`, screenX + screenW + 42, topSpotY + 5);
  ctx.fillText("0", screenX + screenW + 42, centerY + 5);
  ctx.fillText(`-${order}`, screenX + screenW + 42, bottomSpotY + 5);
  ctx.fillText("xⱼ", screenX + screenW + 34, centerY);

  ctx.strokeStyle = "#60758f";
  ctx.lineWidth = 1.2;
  const dimY = benchY - 12;
  ctx.beginPath();
  ctx.moveTo(gratingX, dimY);
  ctx.lineTo(screenX, dimY);
  ctx.moveTo(gratingX, dimY - 5);
  ctx.lineTo(gratingX, dimY + 5);
  ctx.moveTo(screenX, dimY - 5);
  ctx.lineTo(screenX, dimY + 5);
  ctx.stroke();
  ctx.fillText("L", (gratingX + screenX) / 2, dimY - 6);

  $("introApparatusCaption").innerHTML =
    currentMode() === "db" ? "d sinθ<sub>j</sub> = jλ；b sinθ<sub>暗1</sub> = λ" : "d sinθ<sub>j</sub> = jλ";
}

async function initHeroModel() {
  const root = $("studentHeroScene");
  if (!root || heroModel.ready || heroModel.loading || heroModel.failed) return;

  heroModel.loading = true;
  try {
    const { DiffractionScene } = await import(new URL("scene3d.js", scriptBaseUrl).href);
    heroModel.scene = new DiffractionScene(root);
    heroModel.scene.cameraState = { azimuth: 2.18, elevation: 0.36, radius: 8.6 };
    heroModel.scene.setView("3d");
    heroModel.scene.setDisplayMode("rays");
    heroModel.ready = true;
    heroModel.loading = false;
    $("studentHeroFallback")?.classList.add("hidden");
    root.classList.add("ready");
    heroModel.scene.resize();
    heroModel.scene.update(heroSceneParams());
  } catch (error) {
    // file:// 打开页面或浏览器禁用模块加载时，三维模块可能无法导入。
    // 这时保留 Canvas 兜底图，避免学生端看到空白实验装置。
    console.warn("三维建模加载失败，已切换到轻量 Canvas 后备图。", error);
    heroModel.failed = true;
    heroModel.loading = false;
    drawHeroFallback(heroSceneParams());
  }
}

function updateHeroModel(params = modeConfig()) {
  const sceneParams = heroSceneParams(params);
  if (heroModel.ready && heroModel.scene) {
    heroModel.scene.update(sceneParams);
    return;
  }

  drawHeroFallback(sceneParams);
  initHeroModel();
}

function applyPreset(mode) {
  const preset = presets[mode];
  Object.entries(preset).forEach(([key, value]) => {
    const element = $(key);
    if (!element) return;
    element.value = String(value);
  });
}

function setMode(mode, resetValues = true) {
  shell.dataset.mode = mode === "db" ? "db" : "lambda";
  document.querySelectorAll("[data-mode-button]").forEach((button) => {
    button.classList.toggle("active", button.dataset.modeButton === shell.dataset.mode);
  });

  if (resetValues) applyPreset(shell.dataset.mode);

  if (shell.dataset.mode === "db") {
    $("heroTitle").textContent = "由衍射图样反演光栅常数 d 与缝宽 b";
    $("heroSubtitle").innerHTML = "已知 λ、L 与亮纹位置 x<sub>j</sub>，反推光栅常数 d；由中央包络宽度 W<sub>0</sub> 反推缝宽 b。";
    $("inversionTitle").textContent = "反演 d、b";
    $("stepInvertLabel").textContent = "反演 d、b";
    $("stepInvertSub").textContent = "计算光栅常数与缝宽";
    $("heroFormulaBadge").innerHTML = "d sin θⱼ = jλ<span>b sin θ暗1 = λ</span>";
  } else {
    $("heroTitle").textContent = "由衍射图样反演激光波长 λ";
    $("heroSubtitle").innerHTML = "已知光栅常数 d、屏距 L 与亮纹位置 x<sub>j</sub>，反推出激光波长 λ。";
    $("inversionTitle").textContent = "反演 λ";
    $("stepInvertLabel").textContent = "反演波长";
    $("stepInvertSub").textContent = "计算入射波长 λ";
    $("heroFormulaBadge").innerHTML = "d sin θⱼ = jλ";
  }

  render();
}

function renderPrinciple() {
  const mode = currentMode();
  const principleItems =
    mode === "db"
      ? [
          {
            label: "目标",
            html: "根据 ±j 级亮纹位置反演光栅常数 d；由中央包络宽度 W<sub>0</sub> 反演缝宽 b。",
          },
          { label: "已知", html: "激光波长 λ、屏距 L、衍射级次 j。" },
          { label: "测量", html: "x<sub>+j</sub>、x<sub>-j</sub>、中央包络宽度 W<sub>0</sub>。" },
          {
            label: "公式",
            html: "d sinθ<sub>j</sub> = jλ；b sinθ<sub>暗1</sub> = λ。",
            formula: true,
          },
        ]
      : [
          { label: "目标", html: "根据 ±j 级亮纹位置反演激光波长 λ。" },
          { label: "已知", html: "光栅常数 d、屏距 L、衍射级次 j。" },
          { label: "测量", html: "x<sub>+j</sub>、x<sub>-j</sub>，取平均位移 x<sub>j</sub>。" },
          {
            label: "公式",
            html: "d sinθ<sub>j</sub> = jλ，因此 λ = d sinθ<sub>j</sub> / j。",
            formula: true,
          },
        ];
  $("principleList").innerHTML = principleItems
    .map(
      (item) =>
        `<li class="${item.formula ? "formula-row" : ""}"><strong>${item.label}：</strong><span>${item.html}</span></li>`,
    )
    .join("");

  $("principleFormula").innerHTML = "";

  // 操作引导按“输入条件 -> CCD 读数 -> 几何角度 -> 反演目标量”拆分，
  // 避免把测量动作和公式计算混在同一句里，学生更容易逐步操作。
  const guideItems =
    mode === "db"
      ? [
          "输入已知量 λ、L，并选择非零衍射级次 j。",
          "读取 CCD 上 +j 与 -j 级亮纹位置，计算平均位移 x<sub>j</sub>。",
          "测量中央包络宽度 W<sub>0</sub>，用 W<sub>0</sub>/2 确定一阶暗纹角 θ<sub>暗1</sub>。",
          "由 d = jλ/sinθ<sub>j</sub> 求光栅常数 d；由 b = λ/sinθ<sub>暗1</sub> 求缝宽 b。",
        ]
      : [
          "输入已知光栅常数 d、屏距 L，并选择非零衍射级次 j。",
          "读取 CCD 上 +j 与 -j 级亮纹位置，计算平均位移 x<sub>j</sub>。",
          "由 θ<sub>j</sub> = arctan(x<sub>j</sub>/L) 得衍射角，再用 λ = d sinθ<sub>j</sub>/j 反演波长。",
        ];
  $("guideList").innerHTML = guideItems.map((item) => `<li>${item}</li>`).join("");
}

function fillTheoryReadings() {
  const params = modeConfig();
  const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, params.order);
  if (row.valid) {
    setValue("xPlus", row.screenCm, 2);
    setValue("xMinus", -row.screenCm, 2);
  }

  if (currentMode() === "db") {
    const width = centralWidthMm(params.lambdaNm, params.distanceCm, params.slitUm);
    if (width !== null) setValue("centralWidth", width, 2);
  }
  render();
}

function addReadingError() {
  const mode = currentMode();
  const params = modeConfig();
  const row = diffractionAngle(params.lambdaNm, params.gratingUm, params.distanceCm, params.order);
  if (row.valid) {
    // 这里用确定性的偏差模拟人工读数，不使用随机数，保证课堂演示可复现。
    const offset = mode === "lambda" ? 0.18 : 0.08;
    setValue("xPlus", row.screenCm + offset, 2);
    setValue("xMinus", -row.screenCm + offset * 0.35, 2);
  }

  if (mode === "db") {
    const width = centralWidthMm(params.lambdaNm, params.distanceCm, params.slitUm);
    if (width !== null) setValue("centralWidth", width * 0.992, 2);
  }
  render();
}

function drawFringes() {
  const canvas = $("fringeCanvas");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const params = modeConfig();
  const color = wavelengthToColor(params.lambdaNm);
  const measuredPlus = readNumber("xPlus");
  const measuredMinus = readNumber("xMinus");
  const extent = displayExtentCm(params);
  const plot = { left: 20, right: 20, top: 16, bottom: 36 };
  const plotW = width - plot.left - plot.right;
  const centerY = (height - plot.bottom + plot.top) / 2;

  const toX = (cm) => plot.left + ((cm + extent) / (2 * extent)) * plotW;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#030507";
  ctx.fillRect(0, 0, width, height - plot.bottom + 10);

  ctx.strokeStyle = "rgba(120, 150, 180, 0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const x = plot.left + (plotW * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, height - plot.bottom + 10);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i += 1) {
    const y = plot.top + ((height - plot.bottom - plot.top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plotW, y);
    ctx.stroke();
  }

  for (let px = 0; px < plotW; px += 1) {
    const cm = -extent + (2 * extent * px) / plotW;
    const intensity = intensityAt(params, cm);
    if (intensity < 0.002) continue;
    const alpha = Math.min(0.95, 0.08 + intensity ** 0.5 * 0.78);
    const strip = ctx.createLinearGradient(0, plot.top, 0, height - plot.bottom);
    strip.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    strip.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
    strip.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    ctx.fillStyle = strip;
    ctx.fillRect(plot.left + px, plot.top, 1.5, height - plot.bottom - plot.top);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  for (let px = 0; px <= plotW; px += Math.max(10, plotW / 96)) {
    ctx.beginPath();
    ctx.moveTo(plot.left + px, plot.top);
    ctx.lineTo(plot.left + px, height - plot.bottom);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(toX(0), plot.top);
  ctx.lineTo(toX(0), height - plot.bottom);
  ctx.stroke();

  [
    { value: 0, label: "0" },
    { value: measuredPlus, label: `+${params.order}` },
    { value: measuredMinus, label: `-${params.order}` },
  ].forEach((marker) => {
    const x = toX(marker.value);
    ctx.strokeStyle = marker.value === 0 ? "rgba(255,255,255,0.55)" : "rgba(24, 150, 255, 0.95)";
    ctx.setLineDash(marker.value === 0 ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, height - plot.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 15px ${NUMBER_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(marker.label, x, height - 16);
  });

  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = `600 11px ${UI_FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText(`CCD 窗口：-${extent.toFixed(1)} cm 到 +${extent.toFixed(1)} cm`, plot.left + 8, 15);
  ctx.textAlign = "right";
  ctx.fillText("点击图样左右侧可修正 ±j 读数", plot.left + plotW - 8, 15);
}

function updateReadingFromCanvas(event) {
  const canvas = $("fringeCanvas");
  const rect = canvas.getBoundingClientRect();
  const params = modeConfig();
  const extent = displayExtentCm(params);
  const plot = { left: 20, right: 20 };
  const x = event.clientX - rect.left;
  const plotW = rect.width - plot.left - plot.right;
  if (x < plot.left || x > plot.left + plotW) return;

  const cm = -extent + (2 * extent * (x - plot.left)) / plotW;
  // 左半屏记录 -j 级，右半屏记录 +j 级。这里只改变读数，不改变理论模型。
  if (cm < 0) {
    setValue("xMinus", cm, 2);
  } else {
    setValue("xPlus", cm, 2);
  }
  render();
}

function render() {
  renderPrinciple();
  drawFringes();

  const mode = currentMode();
  const params = modeConfig();
  $("heroLaserLabel").textContent = `${params.lambdaNm.toFixed(0)} nm`;
  $("heroDLabel").textContent = `d = ${params.gratingUm.toFixed(3)} μm`;
  $("heroLLabel").textContent = `L = ${params.distanceCm.toFixed(1)} cm`;
  drawIntroApparatus(params);
  const pair = symmetricPairDisplacementCm(readNumber("xMinus"), readNumber("xPlus"));
  $("xMean").textContent = Number.isFinite(pair.meanCm) ? pair.meanCm.toFixed(2) : "--";
  $("ccdWindow").textContent = `±${displayExtentCm(params).toFixed(1)} cm`;
  $("symmetryDetail").textContent = pair.asymmetry === null ? "--" : `${(pair.asymmetry * 100).toFixed(2)}%`;
  $("selectedFringe").textContent = `±${Math.abs(Math.round(readNumber("order")))} 级`;
  $("measurementHint").textContent =
    mode === "db" ? "点击条纹修正 x；W0 用中央包络读取" : "点击条纹修正 x；左右取平均降低零点误差";

  if (mode === "db") {
    const lambdaNm = readNumber("knownLambda");
    const distanceCm = readNumber("distance");
    const result = solveDb({
      lambdaNm,
      distanceCm,
      order: readNumber("order"),
      xMinusCm: readNumber("xMinus"),
      xPlusCm: readNumber("xPlus"),
      widthMm: readNumber("centralWidth"),
    });
    const refD = readNumber("referenceD");
    const refB = readNumber("referenceB");
    const dError = result.dUm ? Math.abs(result.dUm - refD) / refD : null;
    const bError = result.bUm ? Math.abs(result.bUm - refB) / refB : null;
    const maxError = Math.max(dError ?? Infinity, bError ?? Infinity);

    $("thetaFormula").innerHTML = [
      formulaLine("θ<sub>j</sub>", "arctan(x<sub>j</sub>/L)"),
      formulaLine(
        "θ<sub>j</sub>",
        result.thetaDeg === null
          ? "--"
          : `arctan(${result.xMeanCm.toFixed(2)} / ${distanceCm.toFixed(1)}) = ${result.thetaDeg.toFixed(2)}°`,
      ),
    ].join("");
    $("thetaResult").innerHTML = result.thetaDeg === null ? "--" : `${result.thetaDeg.toFixed(2)}°`;
    $("darkThetaLine").innerHTML =
      result.thetaDarkDeg === null
        ? ""
        : `中央包络半宽 W<sub>0</sub>/2 对应 θ<sub>暗1</sub> = ${result.thetaDarkDeg.toFixed(2)}°。`;
    $("inversionFormula").innerHTML = [
      formulaLine("d", "jλ/sinθ<sub>j</sub>"),
      formulaLine(
        "d",
        result.dUm === null || result.thetaDeg === null
          ? "--"
          : `${Math.round(readNumber("order"))} × ${(lambdaNm / 1000).toFixed(3)} μm / sin${result.thetaDeg.toFixed(2)}° = ${result.dUm.toFixed(3)} μm`,
      ),
      formulaLine("b", "λ/sinθ<sub>暗1</sub>"),
      formulaLine(
        "b",
        result.bUm === null || result.thetaDarkDeg === null
          ? "--"
          : `${(lambdaNm / 1000).toFixed(3)} μm / sin${result.thetaDarkDeg.toFixed(2)}° = ${result.bUm.toFixed(2)} μm`,
      ),
    ].join("");
    $("dResult").textContent = result.dUm === null ? "--" : `${result.dUm.toFixed(3)} μm`;
    $("bResult").textContent = result.bUm === null ? "--" : `${result.bUm.toFixed(2)} μm`;
    $("analysisMain").textContent =
      result.dUm === null || result.bUm === null ? "--" : `d=${result.dUm.toFixed(3)} μm，b=${result.bUm.toFixed(2)} μm`;
    $("analysisReference").textContent = `d=${refD.toFixed(3)} μm，b=${refB.toFixed(2)} μm`;
    $("analysisError").textContent =
      dError === null || bError === null ? "--" : `d:${(dError * 100).toFixed(2)}%，b:${(bError * 100).toFixed(2)}%`;
    renderWarning(result.warnings);
  } else {
    const gratingUm = readNumber("knownD");
    const distanceCm = readNumber("distance");
    const result = solveLambda({
      gratingUm,
      distanceCm,
      order: readNumber("order"),
      xMinusCm: readNumber("xMinus"),
      xPlusCm: readNumber("xPlus"),
    });
    const reference = readNumber("referenceLambda");
    const relError = result.lambdaNm ? Math.abs(result.lambdaNm - reference) / reference : null;

    $("thetaFormula").innerHTML = [
      formulaLine("θ<sub>j</sub>", "arctan(x<sub>j</sub>/L)"),
      formulaLine(
        "θ<sub>j</sub>",
        result.thetaDeg === null
          ? "--"
          : `arctan(${result.xMeanCm.toFixed(2)} / ${distanceCm.toFixed(1)}) = ${result.thetaDeg.toFixed(2)}°`,
      ),
    ].join("");
    $("thetaResult").innerHTML = result.thetaDeg === null ? "--" : `${result.thetaDeg.toFixed(2)}°`;
    $("darkThetaLine").innerHTML = "";
    $("inversionFormula").innerHTML = [
      formulaLine("λ", "d sinθ<sub>j</sub> / j"),
      formulaLine(
        "λ",
        result.lambdaNm === null || result.thetaDeg === null
          ? "--"
          : `${gratingUm.toFixed(3)} μm × sin${result.thetaDeg.toFixed(2)}° / ${Math.round(readNumber("order"))} = ${result.lambdaNm.toFixed(0)} nm`,
      ),
    ].join("");
    $("lambdaResult").textContent = result.lambdaNm === null ? "--" : `${result.lambdaNm.toFixed(0)} nm`;
    $("colorBand").textContent = result.lambdaNm === null ? "--" : wavelengthBandName(result.lambdaNm);
    $("colorBand").style.color = result.lambdaNm === null ? "" : wavelengthToColor(result.lambdaNm).css;
    $("analysisMain").textContent = result.lambdaNm === null ? "--" : `λ=${result.lambdaNm.toFixed(0)} nm`;
    $("analysisReference").textContent = `${reference.toFixed(0)} nm`;
    $("analysisError").textContent = relError === null ? "--" : `${(relError * 100).toFixed(2)}%`;
    renderWarning(result.warnings);
  }
}

function renderWarning(warnings) {
  const line = $("warningLine");
  if (warnings.length) {
    line.textContent = warnings.join("；");
    line.classList.add("active");
  } else {
    line.textContent = "反演结果与理论值接近，说明读数和几何关系处理合理。";
    line.classList.remove("active");
  }
}

function generateReport() {
  const mode = currentMode();
  const resultText =
    mode === "db"
      ? `实验类型：由衍射图样反演光栅常数 d 与缝宽 b
已知条件：λ=${readNumber("knownLambda").toFixed(0)} nm，L=${readNumber("distance").toFixed(1)} cm，j=${Math.round(readNumber("order"))}
测量数据：x(+j)=${readNumber("xPlus").toFixed(2)} cm，x(-j)=${readNumber("xMinus").toFixed(2)} cm，W0=${readNumber("centralWidth").toFixed(2)} mm
计算结果：${$("analysisMain").textContent}
相对误差：${$("analysisError").textContent}
说明：计算采用正入射光栅方程 d sinθ_j = jλ，并用 sinθ=x/sqrt(x²+L²) 处理屏幕几何关系。`
      : `实验类型：由衍射图样反演激光波长 λ
已知条件：d=${readNumber("knownD").toFixed(3)} μm，L=${readNumber("distance").toFixed(1)} cm，j=${Math.round(readNumber("order"))}
测量数据：x(+j)=${readNumber("xPlus").toFixed(2)} cm，x(-j)=${readNumber("xMinus").toFixed(2)} cm
计算结果：${$("analysisMain").textContent}
相对误差：${$("analysisError").textContent}
说明：计算采用正入射光栅方程 d sinθ_j = jλ，并用 sinθ=x/sqrt(x²+L²) 处理屏幕几何关系。`;

  $("reportText").value = resultText;
  $("reportPanel").hidden = false;
  $("reportPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  document.querySelectorAll("[data-mode-button]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.modeButton));
  });

  document.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });

  $("fillTheory").addEventListener("click", fillTheoryReadings);
  $("addError").addEventListener("click", addReadingError);
  $("resetMode").addEventListener("click", () => setMode(currentMode()));
  $("zoomFringe").addEventListener("click", () => {
    const card = document.querySelector(".measurement-card");
    card.classList.toggle("zoomed");
    $("zoomFringe").textContent = card.classList.contains("zoomed") ? "退出放大" : "放大视图";
    drawFringes();
  });
  $("fringeCanvas").addEventListener("click", updateReadingFromCanvas);
  $("generateReport").addEventListener("click", generateReport);
  $("finishReport").addEventListener("click", generateReport);
  $("showGuide").addEventListener("click", () => document.querySelector(".stepper").scrollIntoView({ behavior: "smooth" }));
  $("openGuide").addEventListener("click", () => document.querySelector(".stepper").scrollIntoView({ behavior: "smooth" }));
  window.addEventListener("resize", () => {
    drawFringes();
    drawIntroApparatus(modeConfig());
  });
}

function init() {
  bindEvents();
  const query = new URLSearchParams(window.location.search);
  setMode(query.get("mode") === "db" ? "db" : "lambda");
}

init();
