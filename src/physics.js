// 物理计算集中放在此文件，避免三维图、二维图和结果面板使用不同公式。
// 单位约定：
//   λ: nm 输入，内部换算为 μm
//   d, b: μm
//   L: cm
//   角度: UI 用 degree，三角函数用 radian

export const DEFAULT_PARAMS = Object.freeze({
  lambdaNm: 650,
  gratingUm: 5,
  distanceCm: 100,
  order: 1,
  slitUm: 2,
  slitCount: 40,
  diffractionEnabled: true,
  incidenceDeg: 0,
});

export const ORDER_VALUES = Object.freeze([-2, -1, 0, 1, 2]);

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wavelengthToColor(wavelengthNm) {
  // 可见光近似 RGB 映射。这里只用于教学可视化，不表示人眼视觉响应的严格色度计算。
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
  const rgb = [convert(red), convert(green), convert(blue)];
  const hex = `#${rgb.map((item) => item.toString(16).padStart(2, "0")).join("")}`;

  return {
    r: rgb[0],
    g: rgb[1],
    b: rgb[2],
    hex,
    css: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    three: Number.parseInt(hex.slice(1), 16),
  };
}

export function wavelengthBandName(wavelengthNm) {
  const wavelength = clamp(Number(wavelengthNm), 400, 700);
  if (wavelength < 430) return "紫光";
  if (wavelength < 485) return "蓝光";
  if (wavelength < 500) return "青光";
  if (wavelength < 565) return "绿光";
  if (wavelength < 590) return "黄光";
  if (wavelength < 625) return "橙光";
  return "红光";
}

export function toRad(deg) {
  return deg * DEG;
}

export function toDeg(rad) {
  return rad * RAD;
}

export function lambdaUm(params) {
  return params.lambdaNm / 1000;
}

function safeAsin(value) {
  if (value < -1 || value > 1) return null;
  return Math.asin(clamp(value, -1, 1));
}

function sinc(x) {
  // sin(x)/x 在 x=0 的极限为 1；直接相除会在主极大处得到 NaN。
  if (Math.abs(x) < 1e-8) return 1;
  return Math.sin(x) / x;
}

export function diffractionAngle(params, order = params.order) {
  const lam = lambdaUm(params);
  const d = params.gratingUm;
  const thetaI = toRad(params.incidenceDeg);
  const sinThetaM = Math.sin(thetaI) + (order * lam) / d;
  const thetaM = safeAsin(sinThetaM);

  if (thetaM === null) {
    return {
      order,
      valid: false,
      sinThetaM,
      thetaRad: null,
      thetaDeg: null,
      screenCm: null,
    };
  }

  return {
    order,
    valid: true,
    sinThetaM,
    thetaRad: thetaM,
    thetaDeg: toDeg(thetaM),
    screenCm: params.distanceCm * Math.tan(thetaM),
  };
}

export function orderRows(params, orders = ORDER_VALUES) {
  return orders.map((order) => diffractionAngle(params, order));
}

export function maximumOrder(params) {
  // 正入射时常见写法为 |j| <= d/λ；斜入射时正负级次上限不对称。
  // 这里直接枚举一个足够宽的范围，使用光栅方程判断是否存在实角度。
  const rows = [];
  for (let m = -20; m <= 20; m += 1) {
    const row = diffractionAngle(params, m);
    if (row.valid) rows.push(m);
  }
  return rows;
}

export function centralFringeWidthMm(params, slitUm = params.slitUm) {
  if (params.diffractionEnabled === false) return null;

  const lam = lambdaUm(params);
  const thetaI = toRad(params.incidenceDeg);
  const sinI = Math.sin(thetaI);

  // 单缝衍射第一暗纹满足 b(sinθ - sinθi)=±λ。
  // 若 b 太小，±1 级暗纹不存在，中央亮纹不能用“两侧第一暗纹间距”定义。
  const upper = safeAsin(sinI + lam / slitUm);
  const lower = safeAsin(sinI - lam / slitUm);
  if (upper === null || lower === null) return null;

  const widthCm = params.distanceCm * Math.abs(Math.tan(upper) - Math.tan(lower));
  return widthCm * 10;
}

export function solveSlitFromWidth(params, targetWidthMm) {
  if (!Number.isFinite(targetWidthMm) || targetWidthMm <= 0) return null;
  const lam = lambdaUm(params);

  // 二分求解 b。中央亮纹宽度随 b 增大而单调减小；下限略大于 λ，
  // 上限给到 100000 μm，可覆盖本课件交互范围以外的极端情况。
  let low = lam * 1.000001;
  let high = 100000;
  let lowWidth = centralFringeWidthMm(params, low);
  let highWidth = centralFringeWidthMm(params, high);

  if (lowWidth === null || highWidth === null) return null;
  if (targetWidthMm > lowWidth || targetWidthMm < highWidth) return null;

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const width = centralFringeWidthMm(params, mid);
    if (width === null) return null;

    if (width > targetWidthMm) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

export function simulatedMeasurement(params) {
  const theoreticalWidth = centralFringeWidthMm(params);
  if (theoreticalWidth === null) {
    return {
      measuredWidthMm: null,
      calculatedSlitUm: null,
      relativeError: null,
    };
  }

  // 这里用确定性的“仪器读数偏差”模拟实验测量，
  // 让误差来源可解释且可复现；真实实验可替换为人工读数。
  const measuredWidthMm = theoreticalWidth * 0.985;
  const calculatedSlitUm = solveSlitFromWidth(params, measuredWidthMm);
  const relativeError =
    calculatedSlitUm === null ? null : Math.abs(calculatedSlitUm - params.slitUm) / params.slitUm;

  return {
    measuredWidthMm,
    calculatedSlitUm,
    relativeError,
  };
}

function symmetricPairDisplacementCm(xMinusCm, xPlusCm) {
  const left = Math.abs(Number(xMinusCm));
  const right = Math.abs(Number(xPlusCm));
  const meanCm = (left + right) / 2;
  const asymmetry = meanCm > 0 ? Math.abs(left - right) / meanCm : null;

  return { meanCm, asymmetry };
}

function screenSinFromDisplacement(xCm, distanceCm) {
  const x = Math.abs(Number(xCm));
  const distance = Number(distanceCm);
  if (!Number.isFinite(x) || !Number.isFinite(distance) || x <= 0 || distance <= 0) return null;

  // 屏幕坐标由直角三角形给出：tanθ=x/L。
  // 反演 d 或 λ 时需要 sinθ，因此直接用 x/sqrt(x²+L²)，避免小角度近似带来的系统误差。
  return x / Math.sqrt(x ** 2 + distance ** 2);
}

export function solveStudentGratingAndSlitExperiment(input) {
  const lambdaNm = Number(input.lambdaNm);
  const distanceCm = Number(input.distanceCm);
  const order = Math.abs(Math.round(Number(input.order)));
  const envelopeWidthMm = Number(input.envelopeWidthMm);
  const pair = symmetricPairDisplacementCm(input.xMinusCm, input.xPlusCm);
  const warnings = [];

  if (!Number.isFinite(lambdaNm) || lambdaNm <= 0) warnings.push("λ 必须为正值。");
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) warnings.push("屏距 L 必须为正值。");
  if (!Number.isFinite(order) || order < 1) warnings.push("反演光栅常数不能使用 j=0，应选 j=1、2 ... 的明纹。");
  if (!Number.isFinite(pair.meanCm) || pair.meanCm <= 0) warnings.push("±j 级条纹位移不能同时为 0。");
  if (input.xMinusCm > 0 || input.xPlusCm < 0) warnings.push("建议按左侧负、右侧正记录 ±j 级位置，当前结果仍按绝对位移平均处理。");
  if (pair.asymmetry !== null && pair.asymmetry > 0.04) warnings.push("左右条纹不够对称，可能存在入射角未调零或读数误差。");

  const sinTheta = screenSinFromDisplacement(pair.meanCm, distanceCm);
  const lambdaUmValue = lambdaNm / 1000;
  const rawDUm = sinTheta && order >= 1 ? (order * lambdaUmValue) / sinTheta : null;
  const dUm = Number.isFinite(rawDUm) ? rawDUm : null;

  let bUm = null;
  if (Number.isFinite(envelopeWidthMm) && envelopeWidthMm > 0) {
    const halfEnvelopeCm = envelopeWidthMm / 20;
    const sinDark = screenSinFromDisplacement(halfEnvelopeCm, distanceCm);
    const rawBUm = sinDark ? lambdaUmValue / sinDark : null;
    bUm = Number.isFinite(rawBUm) ? rawBUm : null;
  } else {
    warnings.push("中央包络宽度 W0 必须为正值，才能由一阶暗纹反推缝宽 b。");
  }

  if (dUm !== null && bUm !== null && bUm > dUm) {
    warnings.push("计算得到 b>d；若 b 表示透光缝宽，该结果不符合真实透射光栅几何，应复查 W0 或 d。");
  }

  return {
    dUm,
    bUm,
    thetaDeg: sinTheta ? toDeg(Math.asin(sinTheta)) : null,
    asymmetry: pair.asymmetry,
    warnings,
  };
}

export function solveStudentWavelengthExperiment(input) {
  const gratingUm = Number(input.gratingUm);
  const distanceCm = Number(input.distanceCm);
  const order = Math.abs(Math.round(Number(input.order)));
  const pair = symmetricPairDisplacementCm(input.xMinusCm, input.xPlusCm);
  const warnings = [];

  if (!Number.isFinite(gratingUm) || gratingUm <= 0) warnings.push("光栅常数 d 必须为正值。");
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) warnings.push("屏距 L 必须为正值。");
  if (!Number.isFinite(order) || order < 1) warnings.push("反演波长不能使用 j=0，应选 j=1、2 ... 的明纹。");
  if (!Number.isFinite(pair.meanCm) || pair.meanCm <= 0) warnings.push("±j 级条纹位移不能同时为 0。");
  if (input.xMinusCm > 0 || input.xPlusCm < 0) warnings.push("建议按左侧负、右侧正记录 ±j 级位置，当前结果仍按绝对位移平均处理。");
  if (pair.asymmetry !== null && pair.asymmetry > 0.04) warnings.push("左右条纹不够对称，可能存在入射角未调零或读数误差。");

  const sinTheta = screenSinFromDisplacement(pair.meanCm, distanceCm);
  const rawLambdaNm = sinTheta && order >= 1 ? (gratingUm * sinTheta * 1000) / order : null;
  const lambdaNm = Number.isFinite(rawLambdaNm) ? rawLambdaNm : null;

  if (lambdaNm !== null && (lambdaNm < 400 || lambdaNm > 700)) {
    warnings.push("计算波长超出 400-700 nm 可见光范围；若光源确为可见光，应复查 d、L 或条纹位置。");
  }

  return {
    lambdaNm,
    thetaDeg: sinTheta ? toDeg(Math.asin(sinTheta)) : null,
    asymmetry: pair.asymmetry,
    warnings,
  };
}

export function geometryWarnings(params) {
  const warnings = [];
  if (params.diffractionEnabled !== false && params.slitUm > params.gratingUm) {
    warnings.push("当前 b>d；若 b 表示透射缝宽，则不满足真实透射光栅几何，只能作等效包络演示。");
  }
  if (!Number.isFinite(params.slitCount) || params.slitCount < 2) {
    warnings.push("缝数 N 必须不小于 2；N 越大，主极大越窄、越尖锐。");
  }
  if (params.diffractionEnabled !== false && params.slitUm <= lambdaUm(params)) {
    warnings.push("当前 b≤λ，单缝第一暗纹不存在，中央明纹宽度不能按两侧第一暗纹定义。");
  }
  const selected = diffractionAngle(params, params.order);
  if (!selected.valid) {
    warnings.push(`当前 j=${params.order} 不满足 |sinθ_j|≤1，该级衍射不存在。`);
  }
  return warnings;
}

export function intensityEnvelopeAt(params, screenCm) {
  if (params.diffractionEnabled === false) return 1;

  const lam = lambdaUm(params);
  const theta = Math.atan(screenCm / params.distanceCm);
  const thetaI = toRad(params.incidenceDeg);
  const deltaSin = Math.sin(theta) - Math.sin(thetaI);
  const beta = (Math.PI * params.slitUm * deltaSin) / lam;

  // 单缝衍射包络：I_env/I0 = (sinβ/β)^2。
  // 它决定多缝主极大的总体强弱，不能与光栅方程给出的主极大位置混为一谈。
  return clamp(sinc(beta) ** 2, 0, 1);
}

export function intensityAt(params, screenCm, effectiveSlits = params.slitCount) {
  const lam = lambdaUm(params);
  const theta = Math.atan(screenCm / params.distanceCm);
  const thetaI = toRad(params.incidenceDeg);
  const deltaSin = Math.sin(theta) - Math.sin(thetaI);
  const gamma = (Math.PI * params.gratingUm * deltaSin) / lam;
  const slitCount = Math.max(2, Math.round(Number(effectiveSlits) || 2));

  // N 缝干涉项：I_N/I0 = [sin(Nγ)/(N sinγ)]^2。
  // 当 sinγ≈0 时处于主极大位置，极限值为 1；直接相除会产生 0/0。
  const envelope = params.diffractionEnabled === false ? 1 : intensityEnvelopeAt(params, screenCm);
  let gratingTerm = 1;
  const denominator = Math.sin(gamma);
  if (Math.abs(denominator) > 1e-8) {
    gratingTerm = (Math.sin(slitCount * gamma) / (slitCount * denominator)) ** 2;
  }

  return clamp(envelope * gratingTerm, 0, 1);
}

export function principalMaximumHalfWidthCm(params, order) {
  const lam = lambdaUm(params);
  const n = Math.max(2, Math.round(Number(params.slitCount) || 2));
  const thetaI = toRad(params.incidenceDeg);
  const centerSin = Math.sin(thetaI) + (order * lam) / params.gratingUm;
  const leftSin = centerSin - lam / (n * params.gratingUm);
  const rightSin = centerSin + lam / (n * params.gratingUm);
  const left = safeAsin(leftSin);
  const right = safeAsin(rightSin);
  if (left === null || right === null) return null;

  // 相邻暗纹到主极大中心的距离近似表征主极大半宽，用于绘图自适应采样。
  const leftX = params.distanceCm * Math.tan(left);
  const rightX = params.distanceCm * Math.tan(right);
  return Math.abs(rightX - leftX) / 2;
}

export function chartDomainCm(params) {
  const raw = chartDomainRawCm(params, [params.lambdaNm]);
  return niceDomainCm(raw);
}

export function stableVisibleDomainCm(params) {
  // 教学屏幕的“可视窗口”应由屏距和画面比例决定，而不是由某个衍射级次的位置反推。
  // 否则调节 λ 或 d 时，坐标域会为了容纳远处级次而突然缩放，造成非物理抖动。
  // 这里取约 ±1.2L 的屏上范围；改变光栅常数时，亮斑连续移动，超出窗口则自然离屏。
  return clamp(params.distanceCm * 1.2, 40, 520);
}

function chartDomainRawCm(params, lambdaSamples) {
  const extents = [];
  for (const lambdaNm of lambdaSamples) {
    const sampledParams = { ...params, lambdaNm };
    const validPositions = orderRows(sampledParams)
      .filter((row) => row.valid)
      .map((row) => Math.abs(row.screenCm));
    if (validPositions.length) extents.push(Math.max(...validPositions) * 1.16);

    const centralWidth = centralFringeWidthMm(sampledParams);
    if (centralWidth !== null) extents.push((centralWidth / 20) * 1.08);
  }
  return Math.max(10, ...extents);
}

function niceDomainCm(raw) {
  if (raw <= 20) return Math.ceil(raw / 5) * 5;
  if (raw <= 80) return Math.ceil(raw / 10) * 10;
  if (raw <= 200) return Math.ceil(raw / 20) * 20;
  return Math.min(520, Math.ceil(raw / 50) * 50);
}

export function buildExportRows(params, samples = 220) {
  const domain = chartDomainCm(params);
  const rows = [["屏幕位置 x (cm)", "相对光强 I/I0", "单缝包络 sinc²"]];
  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const x = -domain + 2 * domain * t;
    rows.push([x.toFixed(5), intensityAt(params, x).toFixed(8), intensityEnvelopeAt(params, x).toFixed(8)]);
  }
  return rows;
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((item) => String(item).padStart(2, "0")).join(":");
}
