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

function formatCellNumber(value, digits) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
}

function formatMaybePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "--";
}

function reportConclusion(warnings) {
  return warnings.length ? "需要复查读数" : "符合理论值";
}

function reportWarningText(warnings) {
  return warnings.length ? warnings.join("；") : "反演结果与理论值接近，说明读数和几何关系处理合理。";
}

function timestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}

function collectReportData() {
  const mode = currentMode();
  const order = Math.abs(Math.round(readNumber("order")));
  const xPlus = readNumber("xPlus");
  const xMinus = readNumber("xMinus");
  const pair = symmetricPairDisplacementCm(xMinus, xPlus);
  const generatedAt = new Date();

  if (mode === "db") {
    const lambdaNm = readNumber("knownLambda");
    const distanceCm = readNumber("distance");
    const centralWidth = readNumber("centralWidth");
    const result = solveDb({
      lambdaNm,
      distanceCm,
      order,
      xMinusCm: xMinus,
      xPlusCm: xPlus,
      widthMm: centralWidth,
    });
    const refD = readNumber("referenceD");
    const refB = readNumber("referenceB");
    const dError = result.dUm ? Math.abs(result.dUm - refD) / refD : null;
    const bError = result.bUm ? Math.abs(result.bUm - refB) / refB : null;
    const conclusion = reportConclusion(result.warnings);
    const warningText = reportWarningText(result.warnings);
    const knownLine = `λ=${formatCellNumber(lambdaNm, 0)} nm，L=${formatCellNumber(distanceCm, 1)} cm，j=${order}`;
    const measureLine = `x(+j)=${formatCellNumber(xPlus, 2)} cm，x(-j)=${formatCellNumber(xMinus, 2)} cm，W0=${formatCellNumber(centralWidth, 2)} mm`;
    const resultLine = `d=${result.dUm === null ? "--" : result.dUm.toFixed(3)} μm，b=${result.bUm === null ? "--" : result.bUm.toFixed(2)} μm`;
    const errorLine = dError === null || bError === null ? "--" : `d:${formatMaybePercent(dError)}，b:${formatMaybePercent(bError)}`;

    return {
      mode,
      title: "实验报告草稿",
      experimentType: "由衍射图样反演光栅常数 d 与缝宽 b",
      generatedAt,
      fileName: `光栅衍射实验报告-求d-b-${timestampForFilename(generatedAt)}.xlsx`,
      text: `实验类型：由衍射图样反演光栅常数 d 与缝宽 b
已知条件：${knownLine}
测量数据：${measureLine}
计算结果：${resultLine}
相对误差：${errorLine}
说明：计算采用正入射光栅方程 d sinθ_j = jλ；中央包络半宽 W0/2 对应一阶暗纹，满足 b sinθ_暗1 = λ。屏幕几何关系用 sinθ=x/sqrt(x^2+L^2) 处理。`,
      rows: [
        ["实验类型", "实验类型", "由衍射图样反演光栅常数 d 与缝宽 b", "", "由 ±j 级亮纹求 d，由中央包络宽度求 b。"],
        ["已知条件", "入射波长 λ", formatCellNumber(lambdaNm, 0), "nm", "已知可见光波长。"],
        ["已知条件", "屏距 L", formatCellNumber(distanceCm, 1), "cm", "光栅到 CCD 屏幕的距离。"],
        ["已知条件", "衍射级次 j", String(order), "", "反演 d 时不能使用 j=0。"],
        ["参考值", "仿真标称 d", formatCellNumber(refD, 3), "μm", "用于误差核验。"],
        ["参考值", "仿真标称 b", formatCellNumber(refB, 2), "μm", "用于误差核验。"],
        ["测量数据", "x(+j)", formatCellNumber(xPlus, 2), "cm", "CCD 右侧第 +j 级亮纹位置。"],
        ["测量数据", "x(-j)", formatCellNumber(xMinus, 2), "cm", "CCD 左侧第 -j 级亮纹位置。"],
        ["测量数据", "平均位移 x_j", formatCellNumber(pair.meanCm, 2), "cm", "左右取平均以降低零点误差。"],
        ["测量数据", "左右对称偏差", pair.asymmetry === null ? "--" : formatMaybePercent(pair.asymmetry), "", "偏差过大时应复查读数或入射角。"],
        ["测量数据", "中央包络宽度 W0", formatCellNumber(centralWidth, 2), "mm", "中央主极大到两侧第一暗纹之间的总宽度。"],
        ["计算结果", "衍射角 θ_j", result.thetaDeg === null ? "--" : result.thetaDeg.toFixed(2), "°", "θ_j=arctan(x_j/L)。"],
        ["计算结果", "一阶暗纹角 θ_暗1", result.thetaDarkDeg === null ? "--" : result.thetaDarkDeg.toFixed(2), "°", "由 W0/2 与 L 的几何关系计算。"],
        ["计算结果", "反演光栅常数 d", result.dUm === null ? "--" : result.dUm.toFixed(3), "μm", "d=jλ/sinθ_j。"],
        ["计算结果", "反演缝宽 b", result.bUm === null ? "--" : result.bUm.toFixed(2), "μm", "b=λ/sinθ_暗1。"],
        ["误差分析", "d 相对误差", formatMaybePercent(dError), "", "|d_实验-d_理论|/d_理论×100%。"],
        ["误差分析", "b 相对误差", formatMaybePercent(bError), "", "|b_实验-b_理论|/b_理论×100%。"],
        ["实验结论", "结论", conclusion, "", warningText],
        ["公式说明", "屏幕几何", "sinθ=x/sqrt(x^2+L^2)", "", "该关系由 tanθ=x/L 严格推出，不使用小角度近似。"],
        ["公式说明", "光栅与单缝", "d sinθ_j=jλ；b sinθ_暗1=λ", "", "适用于正入射透射光栅的一阶暗纹宽度估算。"],
      ],
    };
  }

  const gratingUm = readNumber("knownD");
  const distanceCm = readNumber("distance");
  const reference = readNumber("referenceLambda");
  const result = solveLambda({
    gratingUm,
    distanceCm,
    order,
    xMinusCm: xMinus,
    xPlusCm: xPlus,
  });
  const relError = result.lambdaNm ? Math.abs(result.lambdaNm - reference) / reference : null;
  const conclusion = reportConclusion(result.warnings);
  const warningText = reportWarningText(result.warnings);
  const knownLine = `d=${formatCellNumber(gratingUm, 3)} μm，L=${formatCellNumber(distanceCm, 1)} cm，j=${order}`;
  const measureLine = `x(+j)=${formatCellNumber(xPlus, 2)} cm，x(-j)=${formatCellNumber(xMinus, 2)} cm`;
  const resultLine = `λ=${result.lambdaNm === null ? "--" : result.lambdaNm.toFixed(0)} nm`;
  const errorLine = relError === null ? "--" : formatMaybePercent(relError);

  return {
    mode,
    title: "实验报告草稿",
    experimentType: "由衍射图样反演激光波长 λ",
    generatedAt,
    fileName: `光栅衍射实验报告-求lambda-${timestampForFilename(generatedAt)}.xlsx`,
    text: `实验类型：由衍射图样反演激光波长 λ
已知条件：${knownLine}
测量数据：${measureLine}
计算结果：${resultLine}
相对误差：${errorLine}
说明：计算采用正入射光栅方程 d sinθ_j = jλ，并用 sinθ=x/sqrt(x^2+L^2) 处理屏幕几何关系。`,
    rows: [
      ["实验类型", "实验类型", "由衍射图样反演激光波长 λ", "", "由 ±j 级亮纹位置反推入射激光波长。"],
      ["已知条件", "光栅常数 d", formatCellNumber(gratingUm, 3), "μm", "已知光栅相邻狭缝中心间距。"],
      ["已知条件", "屏距 L", formatCellNumber(distanceCm, 1), "cm", "光栅到 CCD 屏幕的距离。"],
      ["已知条件", "衍射级次 j", String(order), "", "反演 λ 时不能使用 j=0。"],
      ["参考值", "参考波长 λ0", formatCellNumber(reference, 0), "nm", "用于误差核验。"],
      ["测量数据", "x(+j)", formatCellNumber(xPlus, 2), "cm", "CCD 右侧第 +j 级亮纹位置。"],
      ["测量数据", "x(-j)", formatCellNumber(xMinus, 2), "cm", "CCD 左侧第 -j 级亮纹位置。"],
      ["测量数据", "平均位移 x_j", formatCellNumber(pair.meanCm, 2), "cm", "左右取平均以降低零点误差。"],
      ["测量数据", "左右对称偏差", pair.asymmetry === null ? "--" : formatMaybePercent(pair.asymmetry), "", "偏差过大时应复查读数或入射角。"],
      ["计算结果", "衍射角 θ_j", result.thetaDeg === null ? "--" : result.thetaDeg.toFixed(2), "°", "θ_j=arctan(x_j/L)。"],
      ["计算结果", "反演波长 λ", result.lambdaNm === null ? "--" : result.lambdaNm.toFixed(0), "nm", "λ=d sinθ_j/j。"],
      ["计算结果", "颜色判断", result.lambdaNm === null ? "--" : wavelengthBandName(result.lambdaNm), "", "仅按可见光波段近似分类。"],
      ["误差分析", "相对误差", errorLine, "", "|λ_实验-λ_参考|/λ_参考×100%。"],
      ["实验结论", "结论", conclusion, "", warningText],
      ["公式说明", "屏幕几何", "sinθ=x/sqrt(x^2+L^2)", "", "该关系由 tanθ=x/L 严格推出，不使用小角度近似。"],
      ["公式说明", "光栅方程", "d sinθ_j=jλ", "", "本页默认正入射；有入射角时应改用 d(sinθ_j-sinθ_i)=jλ。"],
    ],
  };
}

function generateReport({ scroll = true } = {}) {
  const report = collectReportData();

  $("reportText").value = report.text;
  $("reportPanel").hidden = false;
  if (scroll) $("reportPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  return report;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let name = "";
  let number = index + 1;
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - remainder - 1) / 26);
  }
  return name;
}

function worksheetCell(value, rowIndex, columnIndex, styleId = 0) {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${xmlEscape(value)}</t></is></c>`;
}

function buildWorksheetXml(report) {
  // 导出的 Excel 按用户要求只保留四列表格：
  // 类别、项目、数值、单位。右侧长“说明”列不再写入工作表，
  // 公式和结论仍作为普通数据行保留，避免信息缺失。
  const rows = [
    { height: 34, cells: [{ value: report.title, style: 1, mergeAcross: 3 }] },
    {
      height: 30,
      cells: [
        { value: "导出时间", style: 7 },
        { value: report.generatedAt.toLocaleString("zh-CN", { hour12: false }), style: 8, mergeAcross: 2 },
      ],
    },
    { height: 30, cells: ["类别", "项目", "数值", "单位"].map((value) => ({ value, style: 2 })) },
    ...report.rows.map((row) => ({
      height: 30,
      cells: [
        { value: row[0], style: 3 },
        { value: row[1], style: 4 },
        { value: row[2], style: 5 },
        { value: row[3], style: 6 },
      ],
    })),
  ];
  const mergeRefs = [];
  const rowXml = rows
    .map((row, rowOffset) => {
      const rowIndex = rowOffset + 1;
      let columnIndex = 0;
      const cells = row.cells
        .map((cell) => {
          const currentColumn = columnIndex;
          const mergeAcross = Number(cell.mergeAcross || 0);
          if (mergeAcross > 0) {
            mergeRefs.push(
              `${columnName(currentColumn)}${rowIndex}:${columnName(currentColumn + mergeAcross)}${rowIndex}`,
            );
          }
          columnIndex += mergeAcross + 1;
          return worksheetCell(cell.value, rowIndex, currentColumn, cell.style);
        })
        .join("");
      return `<row r="${rowIndex}" ht="${row.height}" customHeight="1">${cells}</row>`;
    })
    .join("");
  const mergeXml = mergeRefs.length
    ? `<mergeCells count="${mergeRefs.length}">${mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="24"/>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="36" customWidth="1"/>
    <col min="4" max="4" width="12" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  ${mergeXml}
</worksheet>`;
}

function buildWorkbookParts(report) {
  return [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      path: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(report.title)}</dc:title>
  <dc:subject>${xmlEscape(report.experimentType)}</dc:subject>
  <dc:creator>光栅衍射交互实验</dc:creator>
  <cp:lastModifiedBy>光栅衍射交互实验</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${report.generatedAt.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${report.generatedAt.toISOString()}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      path: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>光栅衍射交互实验</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="1" baseType="lpstr"><vt:lpstr>实验报告</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="实验报告" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      path: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <!--
    导出表格样式与课程参考图一致：
    全表使用宋体；表头和分类列用淡蓝底；数值列用亮蓝色突出；
    单位列保持黑色，所有单元格居中并使用浅蓝细边框。
  -->
  <fonts count="6">
    <font><sz val="12"/><color rgb="FF000000"/><name val="宋体"/><family val="3"/></font>
    <font><sz val="16"/><color rgb="FF003B82"/><name val="宋体"/><family val="3"/></font>
    <font><sz val="13"/><color rgb="FF003B82"/><name val="宋体"/><family val="3"/></font>
    <font><sz val="12"/><color rgb="FF003B82"/><name val="宋体"/><family val="3"/></font>
    <font><sz val="12"/><color rgb="FF075BFF"/><name val="宋体"/><family val="3"/></font>
    <font><sz val="13"/><color rgb="FF000000"/><name val="宋体"/><family val="3"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E9FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F7FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFC8DAF2"/></left><right style="thin"><color rgb="FFC8DAF2"/></right><top style="thin"><color rgb="FFC8DAF2"/></top><bottom style="thin"><color rgb="FFC8DAF2"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
    { path: "xl/worksheets/sheet1.xml", content: buildWorksheetXml(report) },
  ];
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function putUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function putUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { time, date: (year << 9) | (month << 5) | day };
}

function buildZipBlob(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  const stamp = dosDateTime();
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    putUint32(localView, 0, 0x04034b50);
    putUint16(localView, 4, 20);
    putUint16(localView, 6, 0);
    putUint16(localView, 8, 0);
    putUint16(localView, 10, stamp.time);
    putUint16(localView, 12, stamp.date);
    putUint32(localView, 14, crc);
    putUint32(localView, 18, dataBytes.length);
    putUint32(localView, 22, dataBytes.length);
    putUint16(localView, 26, nameBytes.length);
    putUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    parts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    putUint32(centralView, 0, 0x02014b50);
    putUint16(centralView, 4, 20);
    putUint16(centralView, 6, 20);
    putUint16(centralView, 8, 0);
    putUint16(centralView, 10, 0);
    putUint16(centralView, 12, stamp.time);
    putUint16(centralView, 14, stamp.date);
    putUint32(centralView, 16, crc);
    putUint32(centralView, 20, dataBytes.length);
    putUint32(centralView, 24, dataBytes.length);
    putUint16(centralView, 28, nameBytes.length);
    putUint16(centralView, 30, 0);
    putUint16(centralView, 32, 0);
    putUint16(centralView, 34, 0);
    putUint16(centralView, 36, 0);
    putUint32(centralView, 38, 0);
    putUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralStart = offset;
  const centralBytes = concatBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  putUint32(endView, 0, 0x06054b50);
  putUint16(endView, 4, 0);
  putUint16(endView, 6, 0);
  putUint16(endView, 8, files.length);
  putUint16(endView, 10, files.length);
  putUint32(endView, 12, centralBytes.length);
  putUint32(endView, 16, centralStart);
  putUint16(endView, 20, 0);

  return new Blob([concatBytes([...parts, centralBytes, end])], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildXlsxBlob(report) {
  // XLSX 本质是 OpenXML 文件夹结构再打包为 ZIP。这里用无压缩 ZIP，
  // 体积略大但结构稳定，不依赖第三方库，离线和 GitHub Pages 环境都能运行。
  return buildZipBlob(buildWorkbookParts(report));
}

function exportExcelReport() {
  const report = generateReport({ scroll: false });
  const blob = buildXlsxBlob(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = report.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const status = $("exportStatus");
  if (status) status.textContent = `已生成 Excel：${report.fileName}`;
  $("saveStatus").textContent = "Excel 数据已导出";
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
  $("exportExcel").addEventListener("click", exportExcelReport);
  $("exportExcelFromReport").addEventListener("click", exportExcelReport);
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
