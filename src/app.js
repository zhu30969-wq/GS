import {
  DEFAULT_PARAMS,
  ORDER_VALUES,
  buildExportRows,
  centralFringeWidthMm,
  diffractionAngle,
  formatTime,
  geometryWarnings,
  intensityEnvelopeAt,
  intensityAt,
  maximumOrder,
  orderRows,
  principalMaximumHalfWidthCm,
  simulatedMeasurement,
  solveStudentGratingAndSlitExperiment,
  solveStudentWavelengthExperiment,
  stableVisibleDomainCm,
  wavelengthBandName,
  wavelengthToColor,
} from "./physics.js";

const UI_FONT_STACK = '"HarmonyOS Sans SC", "MiSans", "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif';
const NUMBER_FONT_STACK = '"Bahnschrift", "DIN Alternate", "Segoe UI", "Microsoft YaHei UI", sans-serif';
const MIN_2D_ZOOM = 0.6;
const MAX_2D_ZOOM = 3;
const STEP_2D_ZOOM = 0.1;

const state = {
  params: { ...DEFAULT_PARAMS },
  running: false,
  elapsedSeconds: 0,
  lastTick: null,
  mode: "rays",
  view: "3d",
  module: "operation",
  theorySlide: 0,
  renderPending: false,
  sceneReady: false,
  sceneLoading: false,
  zoom2d: 1,
};

const controls = {
  lambda: ["lambda", "lambdaNumber", "lambdaNm", 0],
  grating: ["grating", "gratingNumber", "gratingUm", 3],
  distance: ["distance", "distanceNumber", "distanceCm", 1],
  slit: ["slit", "slitNumber", "slitUm", 1],
  slits: ["slits", "slitsNumber", "slitCount", 0],
  incidence: ["incidence", "incidenceNumber", "incidenceDeg", 1],
};

const sceneRoot = document.getElementById("sceneRoot");
const sceneOverlay = document.getElementById("sceneOverlay");
const patternCanvas = document.getElementById("diffractionPattern");
const ccdCanvas = document.getElementById("ccdView");
const chartCanvas = document.getElementById("intensityChart");
const diagramLayer = document.querySelector("#rayDiagram .diagram-layer");

const theoryPages = [
  {
    title: "01 光栅的基本概念",
    summary: "光栅常数 d、单缝宽度 b、屏距 L、波长 λ 和衍射级次 j 是描述光栅衍射的核心参数。",
  },
  {
    title: "02 光栅衍射原理",
    summary: "光栅衍射由多缝干涉主极大与单缝衍射包络共同决定；主极大位置由光栅方程确定，包络决定整体亮度分布。",
  },
  {
    title: "03 衍射公式推导",
    summary: "相邻狭缝光程差为 Δ = d sinθ；当 Δ = jλ 时形成明纹，屏上位置应优先按几何关系 y_j = L tanθ_j 计算。",
  },
  {
    title: "04 衍射条纹特征",
    summary: "正入射时条纹关于中央主极大对称；d、λ、L、N 改变会分别影响条纹间距、展开尺度和主极大宽度。",
  },
  {
    title: "05 中央明纹宽度",
    summary: "中央明纹宽度来自单缝衍射包络的一阶暗纹位置，小角度下 Δy ≈ 2λL/b，可用于反推单缝宽度 b。",
  },
  {
    title: "06 实验测量原理",
    summary: "测量波长 λ、屏距 L 和第 j 级明纹位移 y_j 后，先求 θ_j，再由 d = jλ / sinθ_j 反推光栅常数。",
  },
  {
    title: "07 误差分析",
    summary: "读数、屏距、入射角和小角度近似都会引入误差；相对误差按 |d实验 − d理论| / d理论 × 100% 评估。",
  },
];

const theoryVisuals = [
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>01</strong><span>光栅的基本概念</span></header>
      <article class="visual-card grating-definition">
        <h3>光栅的定义</h3>
        <p>光栅是一种具有大量等间距、相互平行狭缝或刻线的周期性光学元件。它会使入射光发生衍射，并使不同狭缝或刻线产生的光波相干叠加，从而在屏幕上形成按级次 j 分布的明暗条纹。</p>
        <p class="muted-line">本实验采用透射光栅的多缝模型：光栅常数 d 表示相邻狭缝中心间距，单缝宽度 b 决定单缝衍射包络。</p>
      </article>
      <div class="visual-grid three">
        <article class="visual-card wide apparatus-detail-card">
          <h3>光栅结构示意图</h3>
          <svg class="ray-sketch apparatus-sketch" viewBox="0 0 820 380" role="img" aria-label="激光通过准直镜和光栅后在屏幕上形成 j 级明纹">
            <defs>
              <pattern id="cadGridA" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M26 0H0V26" fill="none" stroke="#5f7890" stroke-opacity=".16" stroke-width="1"/>
              </pattern>
              <linearGradient id="tableA" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#182a3a"/><stop offset=".56" stop-color="#0f1c2a"/><stop offset="1" stop-color="#09131f"/>
              </linearGradient>
              <linearGradient id="laserBodyA" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#27364a"/><stop offset=".48" stop-color="#0f1724"/><stop offset="1" stop-color="#050b12"/>
              </linearGradient>
              <linearGradient id="lensA" x1="0" x2="1">
                <stop stop-color="#42b7ff" stop-opacity=".12"/><stop offset=".48" stop-color="#dff8ff" stop-opacity=".68"/><stop offset="1" stop-color="#42b7ff" stop-opacity=".18"/>
              </linearGradient>
              <linearGradient id="metalA" x1="0" y1="0" x2="1" y2="0">
                <stop stop-color="#23364b"/><stop offset=".45" stop-color="#aec4d8"/><stop offset="1" stop-color="#40566d"/>
              </linearGradient>
              <linearGradient id="screenFaceA" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#162235"/><stop offset=".58" stop-color="#08111c"/><stop offset="1" stop-color="#1e2e43"/>
              </linearGradient>
              <radialGradient id="spotA" cx="50%" cy="50%" r="62%">
                <stop stop-color="#ffffff"/><stop offset=".18" stop-color="#ffd5d2"/><stop offset=".46" stop-color="#ff3140" stop-opacity=".9"/><stop offset="1" stop-color="#ff3140" stop-opacity="0"/>
              </radialGradient>
              <filter id="redGlowA" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="softShadowA" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#000814" flood-opacity=".42"/>
              </filter>
              <marker id="arrowA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 Z" fill="#9fc8ff"/>
              </marker>
            </defs>

            <rect x="0" y="0" width="820" height="380" rx="12" fill="#08131f"/>
            <rect x="0" y="0" width="820" height="380" fill="url(#cadGridA)" opacity=".82"/>

            <g class="optical-table" filter="url(#softShadowA)">
              <polygon points="54,250 700,250 766,324 110,324" fill="url(#tableA)" stroke="#3c5873"/>
              <g stroke="#607d99" stroke-opacity=".28" stroke-width="1">
                <path d="M84 258H710"/><path d="M106 278H728"/><path d="M128 300H748"/>
                <path d="M104 250L160 324"/><path d="M164 250L218 324"/><path d="M224 250L277 324"/>
                <path d="M284 250L336 324"/><path d="M344 250L394 324"/><path d="M404 250L453 324"/>
                <path d="M464 250L512 324"/><path d="M524 250L570 324"/><path d="M584 250L630 324"/>
                <path d="M644 250L690 324"/>
              </g>
              <g fill="#7f9db7" opacity=".62">
                <circle cx="122" cy="270" r="2"/><circle cx="178" cy="270" r="2"/><circle cx="234" cy="270" r="2"/>
                <circle cx="290" cy="270" r="2"/><circle cx="346" cy="270" r="2"/><circle cx="402" cy="270" r="2"/>
                <circle cx="458" cy="270" r="2"/><circle cx="514" cy="270" r="2"/><circle cx="570" cy="270" r="2"/>
                <circle cx="626" cy="270" r="2"/><circle cx="682" cy="270" r="2"/>
                <circle cx="154" cy="300" r="2"/><circle cx="214" cy="300" r="2"/><circle cx="274" cy="300" r="2"/>
                <circle cx="334" cy="300" r="2"/><circle cx="394" cy="300" r="2"/><circle cx="454" cy="300" r="2"/>
                <circle cx="514" cy="300" r="2"/><circle cx="574" cy="300" r="2"/><circle cx="634" cy="300" r="2"/>
                <circle cx="694" cy="300" r="2"/>
              </g>
            </g>

            <g class="apparatus-part" transform="translate(70 135)" filter="url(#softShadowA)">
              <rect x="8" y="90" width="118" height="16" rx="4" fill="#0b1220" stroke="#39516b"/>
              <rect x="38" y="54" width="52" height="40" rx="5" fill="#18263a" stroke="#4d6883"/>
              <path d="M0 18H96L116 34V66H14L0 54Z" fill="url(#laserBodyA)" stroke="#60758c"/>
              <rect x="68" y="4" width="58" height="42" rx="7" fill="#0b111b" stroke="#4d647c"/>
              <rect x="98" y="12" width="34" height="26" rx="5" fill="#111b28" stroke="#7c91a5"/>
              <circle cx="136" cy="25" r="10" fill="#ff2634" filter="url(#redGlowA)"/>
              <circle cx="136" cy="25" r="4" fill="#fff4f4"/>
              <text x="48" y="-12">激光器</text>
              <text x="18" y="10" class="small-label">单色平行光源</text>
            </g>

            <g class="apparatus-part" transform="translate(266 114)" filter="url(#softShadowA)">
              <rect x="-32" y="118" width="82" height="14" rx="4" fill="#0b1220" stroke="#39516b"/>
              <rect x="-6" y="88" width="28" height="34" rx="5" fill="#18263a" stroke="#4d6883"/>
              <ellipse cx="8" cy="52" rx="23" ry="62" fill="url(#lensA)" stroke="#8bd7ff" stroke-width="3"/>
              <ellipse cx="8" cy="52" rx="13" ry="52" fill="none" stroke="#dff7ff" stroke-opacity=".48"/>
              <line x1="8" y1="-8" x2="8" y2="112" stroke="#dff7ff" stroke-opacity=".36"/>
              <text x="8" y="-26">准直镜</text>
            </g>

            <g class="apparatus-part" transform="translate(432 88)" filter="url(#softShadowA)">
              <rect x="-36" y="172" width="76" height="14" rx="4" fill="#0b1220" stroke="#39516b"/>
              <rect x="-12" y="142" width="28" height="34" rx="5" fill="#18263a" stroke="#4d6883"/>
              <rect x="-28" y="0" width="56" height="154" rx="8" fill="#142238" stroke="#63809c"/>
              <rect x="-15" y="12" width="30" height="130" rx="3" fill="#09131f" stroke="#9fb7ce"/>
              <g stroke="#e9f4ff" stroke-width="1.8" opacity=".92">
                <line x1="-10" y1="20" x2="-10" y2="134"/><line x1="-5" y1="20" x2="-5" y2="134"/>
                <line x1="0" y1="20" x2="0" y2="134"/><line x1="5" y1="20" x2="5" y2="134"/><line x1="10" y1="20" x2="10" y2="134"/>
              </g>
              <text x="0" y="-18">光栅架</text>
              <text x="0" y="212">光栅</text>
            </g>

            <g class="screen-model" transform="translate(650 54)" filter="url(#softShadowA)">
              <polygon points="0,0 88,18 88,268 0,244" fill="#101b2a" stroke="#48647d"/>
              <polygon points="10,18 76,30 76,236 10,224" fill="url(#screenFaceA)" stroke="#7c93aa"/>
              <g stroke="#4d6680" stroke-opacity=".48" stroke-width="1">
                <path d="M10 52L76 64"/><path d="M10 86L76 98"/><path d="M10 120L76 132"/>
                <path d="M10 154L76 166"/><path d="M10 188L76 200"/><path d="M10 222L76 234"/>
                <path d="M24 20L24 229"/><path d="M38 23L38 232"/><path d="M52 25L52 235"/><path d="M66 28L66 238"/>
              </g>
              <ellipse cx="42" cy="56" rx="30" ry="11" fill="url(#spotA)" transform="rotate(10 42 56)"/>
              <ellipse cx="42" cy="98" rx="38" ry="13" fill="url(#spotA)" transform="rotate(10 42 98)"/>
              <ellipse cx="42" cy="139" rx="48" ry="16" fill="url(#spotA)" transform="rotate(10 42 139)"/>
              <ellipse cx="42" cy="181" rx="38" ry="13" fill="url(#spotA)" transform="rotate(10 42 181)"/>
              <ellipse cx="42" cy="223" rx="30" ry="11" fill="url(#spotA)" transform="rotate(10 42 223)"/>
              <text x="44" y="-16">CCD 屏幕</text>
            </g>

            <g stroke="#ff2634" stroke-linecap="round" filter="url(#redGlowA)">
              <line x1="206" y1="160" x2="274" y2="166" stroke-width="4"/>
              <line x1="296" y1="168" x2="432" y2="166" stroke-width="4"/>
              <line x1="432" y1="166" x2="650" y2="110" stroke-width="2.2"/>
              <line x1="432" y1="166" x2="650" y2="151" stroke-width="2.2"/>
              <line x1="432" y1="166" x2="650" y2="194" stroke-width="3.2"/>
              <line x1="432" y1="166" x2="650" y2="236" stroke-width="2.2"/>
              <line x1="432" y1="166" x2="650" y2="278" stroke-width="2.2"/>
            </g>
            <g stroke="#ff8790" stroke-width="1.2" stroke-dasharray="7 6" opacity=".72">
              <line x1="432" y1="166" x2="650" y2="88"/><line x1="432" y1="166" x2="650" y2="300"/>
            </g>

            <g fill="#f2f7ff" font-size="15" font-style="italic">
              <text x="743" y="115">j = 2</text><text x="743" y="156">j = 1</text>
              <text x="743" y="199">j = 0</text><text x="743" y="241">j = -1</text><text x="743" y="283">j = -2</text>
            </g>

            <line x1="432" y1="336" x2="650" y2="336" stroke="#9fc8ff" marker-start="url(#arrowA)" marker-end="url(#arrowA)"/>
            <text x="541" y="327" class="math">L</text>
            <g class="inset" transform="translate(360 315)">
              <rect x="-88" y="-28" width="164" height="42" rx="8"/>
              <line x1="-50" y1="-8" x2="-16" y2="-8" marker-start="url(#arrowA)" marker-end="url(#arrowA)"/>
              <text x="-34" y="-15" class="math">d</text>
              <text x="-78" y="7">相邻狭缝中心间距</text>
            </g>
            <g class="inset" transform="translate(504 315)">
              <rect x="-58" y="-28" width="140" height="42" rx="8"/>
              <line x1="-16" y1="-8" x2="2" y2="-8" marker-start="url(#arrowA)" marker-end="url(#arrowA)"/>
              <text x="-8" y="-15" class="math">b</text>
              <text x="-42" y="7">单个狭缝宽度</text>
            </g>
            <text x="420" y="56" class="small-label">正入射：d sinθⱼ = jλ</text>
          </svg>
        </article>
        <article class="visual-card">
          <h3>关键参数说明</h3>
          <dl class="symbol-list">
            <div><dt>d</dt><dd>光栅常数，相邻狭缝中心间距</dd></div>
            <div><dt>b</dt><dd>单缝宽度，单个狭缝的宽度</dd></div>
            <div><dt>L</dt><dd>屏距，光栅到屏幕的距离</dd></div>
            <div><dt>λ</dt><dd>入射光波长</dd></div>
            <div><dt>j</dt><dd>衍射级次，j = 0, ±1, ±2, ...</dd></div>
            <div><dt>θⱼ</dt><dd>第 j 级明纹对应的衍射角</dd></div>
          </dl>
        </article>
        <article class="visual-card">
          <h3>学习目标</h3>
          <ul class="check-list">
            <li>理解光栅结构与工作原理</li>
            <li>区分光栅常数 d 与单缝宽度 b</li>
            <li>理解屏距 L、波长 λ 与衍射角 θ 的作用</li>
            <li>为后续公式推导和实验测量打基础</li>
          </ul>
          <p class="visual-tip">条纹位置主要由 d、λ、θ 决定；单缝宽度 b 影响整体包络。</p>
        </article>
      </div>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>02</strong><span>光栅衍射原理</span></header>
      <div class="visual-grid two">
        <article class="visual-card">
          <h3>多缝干涉决定主极大位置</h3>
          <p>相邻狭缝到同一观察方向的光程差满足整数倍波长时，各缝波相干叠加形成明纹。</p>
          <div class="formula-large">d sin θ = jλ</div>
          <dl class="compact-list">
            <div><dt>d</dt><dd>光栅常数</dd></div>
            <div><dt>θ</dt><dd>相对光栅法线的衍射角</dd></div>
            <div><dt>j</dt><dd>衍射级次，j = 0, ±1, ±2, ...</dd></div>
            <div><dt>λ</dt><dd>入射光波长</dd></div>
          </dl>
        </article>
        <article class="visual-card">
          <h3>单缝衍射决定整体包络</h3>
          <img class="matlab-theory-plot" src="./assets/theory/simulations/single_slit_envelope_multislit_cn.png" alt="MATLAB 仿真：单缝 sinc 平方包络限制有限多缝光栅主极大，并显示缺级条件" loading="lazy" />
          <p class="matlab-plot-note">MATLAB 仿真参数：λ = 650 nm，b = 2.0 μm，d = 6.0 μm，N = 12；图中采用完整强度公式 I(θ) = sinc²β · [sin(Nα)/(N sinα)]²。</p>
          <p>暗纹条件为 <span class="inline-formula">b sin θ = kλ</span>，其中 k = ±1, ±2, ...。当某一 j 级主极大落在单缝暗纹处，会出现缺级。</p>
          <p class="visual-tip">条纹位置由 d、λ、θ 决定；整体亮度包络由单缝宽度 b 决定。</p>
        </article>
      </div>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>03</strong><span>衍射公式推导</span></header>
      <div class="step-grid">
        <article class="visual-card step-card">
          <b>Step 1</b><h3>相邻狭缝的光程差</h3>
          <p>相邻两缝间距为 d，观察方向与法线夹角为 θ，光程差为 Δ。</p>
          <div class="formula-large">Δ = d sin θ</div>
        </article>
        <article class="visual-card step-card">
          <b>Step 2</b><h3>形成明纹的条件</h3>
          <p>当光程差等于波长的整数倍时，各缝出射光同相叠加，在屏幕上形成明纹。</p>
          <div class="formula-large">d sin θ = jλ</div>
          <p class="muted-line">j = 0, ±1, ±2, ...</p>
        </article>
        <article class="visual-card step-card wide">
          <b>Step 3</b><h3>屏幕上的条纹位置</h3>
          <div class="visual-grid two tight">
            <div>
              <p>屏距为 L 时，第 j 级明纹在屏幕上的位移为 yⱼ。</p>
              <p>几何关系：<span class="inline-formula">yⱼ = L tan θⱼ</span></p>
            </div>
            <div>
              <p>小角度近似：</p>
              <div class="formula-large">yⱼ ≈ jλL / d</div>
            </div>
          </div>
          <p class="visual-tip">角度较大时，应先由几何关系求 θⱼ，再计算屏幕位置。</p>
        </article>
      </div>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>04</strong><span>衍射条纹特征</span></header>
      <article class="visual-card">
        <h3>对称性特征</h3>
        <div class="stripe-row">
          <span>j = -3</span><span>j = -2</span><span>j = -1</span><strong>j = 0</strong><span>j = 1</span><span>j = 2</span><span>j = 3</span>
        </div>
        <p>正入射条件下，衍射条纹关于中央主极大对称：</p>
        <div class="formula-large">Iⱼ = I₋ⱼ， yⱼ = -y₋ⱼ</div>
      </article>
      <div class="visual-grid four">
        <article class="visual-card"><h3>改变 d</h3><p>d 增大，条纹间距减小；d 减小，条纹间距增大。</p></article>
        <article class="visual-card"><h3>改变 λ</h3><p>λ 增大，条纹间距增大；λ 减小，条纹间距减小。</p></article>
        <article class="visual-card"><h3>改变 L</h3><p>L 增大，屏幕上条纹展开得更宽。</p></article>
        <article class="visual-card"><h3>增加 N</h3><p>有效缝数 N 越大，主极大越窄、越亮，分辨更高。</p></article>
      </div>
      <article class="visual-card">
        <h3>条纹位置公式（小角度）</h3>
        <div class="formula-large">yⱼ ≈ jλL / d</div>
      </article>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>05</strong><span>中央明纹宽度</span></header>
      <div class="visual-grid two">
        <article class="visual-card">
          <h3>单缝暗纹条件</h3>
          <div class="formula-large">b sin θ = kλ</div>
          <p>靠近中心的第一对暗纹满足 <span class="inline-formula">b sin θ₁ = λ</span>。</p>
          <img class="matlab-theory-plot" src="./assets/theory/simulations/central_maximum_width_cn.png" alt="MATLAB 仿真：单缝 sinc 平方衍射强度与一阶暗纹确定中央明纹宽度" loading="lazy" />
          <p class="matlab-plot-note">MATLAB 仿真参数：λ = 650 nm，b = 100 μm，L = 1.0 m；一阶暗纹满足 b sinθ₁ = λ，中央明纹宽度 Δy = 2L tanθ₁。</p>
        </article>
        <article class="visual-card">
          <h3>中央明纹宽度</h3>
          <p>小角度近似下，sin θ ≈ tan θ ≈ θ：</p>
          <div class="formula-stack">
            <span>θ₁ ≈ λ / b</span>
            <span>y₁ ≈ Lθ₁ ≈ λL / b</span>
            <strong>Δy ≈ 2y₁ ≈ 2λL / b</strong>
          </div>
          <h3>反推缝宽 b</h3>
          <div class="formula-large">b ≈ 2λL / Δy</div>
          <p class="visual-tip">b 越大，中央主极大越窄；b 越小，中央主极大越宽。</p>
        </article>
      </div>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>06</strong><span>实验测量原理</span></header>
      <div class="workflow-row">
        <article class="visual-card"><b>1</b><h3>设置波长 λ</h3><p>采用单色光源，并记录波长。</p></article>
        <article class="visual-card"><b>2</b><h3>测量屏距 L</h3><p>测量光栅到屏幕的距离。</p></article>
        <article class="visual-card"><b>3</b><h3>记录第 j 级明纹位置 yⱼ</h3><p>读取中央明纹到第 j 级明纹的横向位移。</p></article>
        <article class="visual-card"><b>4</b><h3>计算 θⱼ</h3><p>θⱼ = arctan(yⱼ / L)</p></article>
        <article class="visual-card"><b>5</b><h3>反推光栅常数 d</h3><div class="formula-large">d = jλ / sin θⱼ</div></article>
      </div>
      <div class="visual-grid two">
        <article class="visual-card"><h3>推荐计算</h3><div class="formula-large">θⱼ = arctan(yⱼ / L)</div><div class="formula-large">d = jλ / sin θⱼ</div></article>
        <article class="visual-card"><h3>数据记录表</h3><table class="visual-table"><tr><th>j</th><th>yⱼ / mm</th><th>θⱼ / °</th><th>d / μm</th></tr><tr><td>1</td><td>15.2</td><td>0.87</td><td>42.8</td></tr><tr><td>2</td><td>30.4</td><td>1.74</td><td>42.8</td></tr><tr><td>3</td><td>45.6</td><td>2.61</td><td>42.8</td></tr></table></article>
      </div>
    </div>
  `,
  `
    <div class="theory-visual">
      <header class="visual-title"><strong>07</strong><span>误差分析</span></header>
      <div class="visual-grid two">
        <article class="visual-card">
          <h3>误差来源</h3>
          <ul class="check-list">
            <li>条纹位置读数误差会直接影响 yⱼ。</li>
            <li>屏距 L 测量误差会影响 θⱼ。</li>
            <li>入射角偏差应使用斜入射公式：<span class="inline-formula">d(sin θⱼ - sin θᵢ) = jλ</span>。</li>
            <li>小角度近似 <span class="inline-formula">yⱼ ≈ jλL / d</span> 只适合 θ 较小时。</li>
          </ul>
        </article>
        <article class="visual-card">
          <h3>结果评估</h3>
          <dl class="compact-list">
            <div><dt>读数误差</dt><dd>±0.5 mm</dd></div>
            <div><dt>屏距误差</dt><dd>±1 mm</dd></div>
            <div><dt>入射角偏差</dt><dd>1.0°</dd></div>
            <div><dt>是否使用小角度近似</dt><dd>按 θ 大小判断</dd></div>
          </dl>
          <div class="formula-large">δ = |d测 - d理| / d理 × 100%</div>
          <p class="muted-line">d测为实验测得值，d理为理论参考值。</p>
          <p class="visual-tip">若入射光不垂直于光栅，仍用正入射公式会产生系统误差。</p>
        </article>
      </div>
    </div>
  `,
];

function hydrateTheoryVisuals() {
  // 原始 Word 图片中的变量曾使用 m 表示级次、a 表示单缝宽度。这里改为可维护的
  // HTML/SVG 文本层，统一采用 j 表示衍射级次、b 表示单缝宽度，避免后续位图残留。
  document.querySelectorAll("[data-theory-panel]").forEach((panel) => {
    const index = Number(panel.dataset.theoryPanel);
    if (theoryVisuals[index]) {
      panel.innerHTML = theoryVisuals[index];
    }
  });
}

// 首屏不直接静态 import Three.js。否则浏览器必须先下载、解析 three.module.js
// 和三维建模代码，用户会看到长时间空白。这里先用轻量 2D canvas 占位，
// 首帧渲染完成后再异步加载真正的 3D 场景。
let scene = {
  setView() {},
  setDisplayMode() {},
  set2dZoom() {
    return state.zoom2d;
  },
  update(params) {
    drawFastScene(params);
  },
};

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function numberFormat(value, digits) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toFixed(digits);
}

function setRangeFill(range) {
  const min = Number(range.min);
  const max = Number(range.max);
  const value = Number(range.value);
  const percentage = ((value - min) / (max - min)) * 100;
  range.style.setProperty("--range-value", `${percentage}%`);
}

function syncControlToState(rangeId, numberId, key, digits, source) {
  const range = $(rangeId);
  const number = $(numberId);
  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step || 1);
  const raw = source === "number" ? Number(number.value) : Number(range.value);
  const normalized = Math.min(max, Math.max(min, Math.round(raw / step) * step));

  state.params[key] = Number(normalized.toFixed(Math.max(0, digits)));
  range.value = String(state.params[key]);
  number.value = state.params[key].toFixed(digits);
  setRangeFill(range);
}

function bindControls() {
  Object.values(controls).forEach(([rangeId, numberId, key, digits]) => {
    const range = $(rangeId);
    const number = $(numberId);

    range.addEventListener("input", () => {
      syncControlToState(rangeId, numberId, key, digits, "range");
      scheduleRenderAll();
    });

    number.addEventListener("change", () => {
      syncControlToState(rangeId, numberId, key, digits, "number");
      renderAll();
    });

    setRangeFill(range);
  });

  document.querySelectorAll("#orderButtons button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.params.order = Number(button.dataset.order);
      renderAll();
    });
  });

  $("resetParams").addEventListener("click", resetParameters);
  $("resetExperiment")?.addEventListener("click", resetExperiment);
  $("startButton")?.addEventListener("click", startExperiment);
  $("pauseButton")?.addEventListener("click", pauseExperiment);
  $("exportData")?.addEventListener("click", exportData);
  $("diffractionToggle").addEventListener("change", () => {
    state.params.diffractionEnabled = $("diffractionToggle").checked;
    renderAll();
  });

  $("view3d").addEventListener("click", () => setView("3d"));
  $("view2d").addEventListener("click", () => setView("2d"));
  bind2dZoomControls();

  document.querySelectorAll(".mode-buttons button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll(".mode-buttons button").forEach((item) => item.classList.toggle("active", item === button));
      scene.setDisplayMode(state.mode);
      updateTip();
    });
  });

  document.querySelectorAll(".module-tabs .tab").forEach((button) => {
    button.addEventListener("click", () => setModule(button.dataset.module));
  });

  document.querySelectorAll("[data-theory-slide]").forEach((button) => {
    button.addEventListener("click", () => setTheorySlide(Number(button.dataset.theorySlide)));
  });

  $("theoryPrev").addEventListener("click", () => setTheorySlide(state.theorySlide - 1));
  $("theoryNext").addEventListener("click", () => setTheorySlide(state.theorySlide + 1));

  $("themeToggle")?.addEventListener("click", () => {
    document.body.classList.toggle("light-mode");
    const light = document.body.classList.contains("light-mode");
    $("themeToggle").setAttribute("aria-pressed", String(!light));
    $("themeToggle").innerHTML = light ? '<span class="icon">◑</span>浅色模式' : '<span class="icon">◐</span>深色模式';
    drawDiffractionPattern();
    drawCcdView();
    drawIntensityChart();
  });

  $("helpButton")?.addEventListener("click", () => {
    setText("currentTip", "拖动 3D 视图可旋转观察，滚轮可缩放；切换 2D 视图可查看俯视光路。所有角度和屏上位置均由光栅方程实时计算。");
  });

  bindStudentLab();
}

function setModule(module) {
  if (!["operation", "theory"].includes(module)) {
    module = "operation";
  }

  state.module = module;
  document.querySelectorAll(".module-tabs .tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.module === module);
  });

  const showTheory = module === "theory";
  $("operationModule").hidden = showTheory;
  $("theoryModule").hidden = !showTheory;
  document.body.classList.toggle("theory-mode", showTheory);

  if (showTheory) {
    setTheorySlide(state.theorySlide);
    setText("currentTip", "原理讲解已接入 Word 文件中的 7 页图片内容，公式说明默认正入射条件；斜入射请使用含入射角的光栅方程。");
    return;
  }

  if (module === "operation") {
    renderAll();
  }
}

function setTheorySlide(index) {
  const maxIndex = theoryPages.length - 1;
  const nextIndex = Math.max(0, Math.min(maxIndex, Number(index) || 0));
  state.theorySlide = nextIndex;

  document.querySelectorAll("[data-theory-slide]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.theorySlide) === nextIndex);
  });
  document.querySelectorAll("[data-theory-panel]").forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.theoryPanel) === nextIndex);
  });

  const page = theoryPages[nextIndex];
  $("theoryTitle").textContent = page.title;
  $("theorySummaryText").textContent = page.summary;
  $("theoryProgressText").textContent = `${nextIndex + 1} / ${theoryPages.length}`;
  $("theoryProgressBar").style.width = `${((nextIndex + 1) / theoryPages.length) * 100}%`;
  $("theoryPrev").disabled = nextIndex === 0;
  $("theoryNext").disabled = nextIndex === maxIndex;
}

function resetParameters() {
  state.params = { ...DEFAULT_PARAMS };
  Object.values(controls).forEach(([rangeId, numberId, key, digits]) => {
    $(rangeId).value = state.params[key];
    $(numberId).value = state.params[key].toFixed(digits);
    setRangeFill($(rangeId));
  });
  $("diffractionToggle").checked = state.params.diffractionEnabled !== false;
  renderAll();
}

function resetExperiment() {
  state.running = false;
  state.elapsedSeconds = 0;
  state.lastTick = null;
  setText("experimentStatus", "就绪");
  setText("statusSaved", "已保存");
  renderAll();
}

function startExperiment() {
  if (!state.running) {
    state.running = true;
    state.lastTick = performance.now();
    setText("experimentStatus", "运行中");
    setText("statusSaved", "记录中");
    updateTip();
  }
}

function pauseExperiment() {
  if (state.running) {
    state.running = false;
    state.lastTick = null;
    setText("experimentStatus", "已暂停");
    setText("statusSaved", "已保存");
  }
}

function tick(now) {
  if (state.running) {
    if (state.lastTick !== null) {
      state.elapsedSeconds += (now - state.lastTick) / 1000;
    }
    state.lastTick = now;
  }
  requestAnimationFrame(tick);
}

function clamp2dZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(MIN_2D_ZOOM, Math.min(MAX_2D_ZOOM, numeric));
}

function sync2dZoomControls() {
  const range = $("zoom2dRange");
  if (!range) return;

  const percent = Math.round(state.zoom2d * 100);
  range.value = String(percent);
  range.style.setProperty("--range-value", `${((percent - 60) / (300 - 60)) * 100}%`);
  $("zoom2dReset").textContent = `${percent}%`;
  $("zoom2dOut").disabled = state.zoom2d <= MIN_2D_ZOOM + 0.001;
  $("zoom2dIn").disabled = state.zoom2d >= MAX_2D_ZOOM - 0.001;
}

function update2dZoomVisibility() {
  const controlsPanel = $("zoom2dControls");
  if (!controlsPanel) return;
  controlsPanel.hidden = state.view !== "2d";
  sync2dZoomControls();
}

function set2dZoom(value, options = {}) {
  state.zoom2d = clamp2dZoom(value);
  scene.set2dZoom?.(state.zoom2d);
  sync2dZoomControls();

  if (!options.silent && state.view === "2d") {
    setText("currentTip", `2D 视图缩放为 ${Math.round(state.zoom2d * 100)}%。可用滚轮、按钮或滑块查看光栅到 CCD 屏幕的俯视光路细节。`);
  }
}

function adjust2dZoom(delta) {
  set2dZoom(state.zoom2d + delta);
}

function bind2dZoomControls() {
  const range = $("zoom2dRange");
  if (!range) return;

  $("zoom2dOut").addEventListener("click", () => adjust2dZoom(-STEP_2D_ZOOM));
  $("zoom2dIn").addEventListener("click", () => adjust2dZoom(STEP_2D_ZOOM));
  $("zoom2dReset").addEventListener("click", () => set2dZoom(1));
  range.addEventListener("input", () => set2dZoom(Number(range.value) / 100));

  // 鼠标滚轮直接作用在 Three.js 的正交相机上；这里监听场景派发的事件，
  // 只负责同步按钮和滑块文字，避免 UI 控件与真实相机缩放状态脱节。
  sceneRoot.addEventListener("scene2dzoomchange", (event) => {
    state.zoom2d = clamp2dZoom(event.detail?.zoom);
    sync2dZoomControls();
    if (state.view === "2d") {
      setText("currentTip", `2D 视图缩放为 ${Math.round(state.zoom2d * 100)}%。`);
    }
  });

  update2dZoomVisibility();
}

function setView(view) {
  state.view = view;
  $("view3d").classList.toggle("active", view === "3d");
  $("view2d").classList.toggle("active", view === "2d");
  scene.setView(view);
  scene.set2dZoom?.(state.zoom2d);
  update2dZoomVisibility();
  setText("currentTip",
    view === "3d"
      ? "3D 视图显示激光器、准直镜、光栅架、CCD 屏幕和衍射光束的空间关系。"
      : "2D 视图从上方查看光路，便于判断不同级次在 CCD 屏幕上的横向位置；可用滚轮、按钮或滑块放大缩小。");
}

function drawFastScene(params) {
  if (state.sceneReady) return;

  const canvas = sceneOverlay;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  const laserColor = wavelengthToColor(params.lambdaNm);
  const domain = stableVisibleDomainCm(params);
  const left = width * 0.22;
  const collimatorX = width * 0.34;
  const gratingX = width * 0.45;
  const screenX = width * 0.72;
  const centerY = height * 0.56;
  const screenHalf = Math.min(height * 0.28, 92);
  const scaleY = screenHalf / domain;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(120, 151, 180, 0.22)";
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

  ctx.fillStyle = "rgba(12, 20, 29, 0.78)";
  ctx.strokeStyle = "rgba(169, 191, 212, 0.42)";
  ctx.lineWidth = 1.2;
  ctx.roundRect(left - 50, centerY - 18, 62, 36, 5);
  ctx.fill();
  ctx.stroke();

  const laserExitX = left + 12;
  const beam = `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0.86)`;
  ctx.fillStyle = laserColor.css;
  ctx.beginPath();
  ctx.arc(laserExitX, centerY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = beam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(laserExitX, centerY);
  ctx.lineTo(collimatorX, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(213, 230, 248, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(collimatorX, centerY, 8, 34, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = beam;
  ctx.beginPath();
  ctx.moveTo(collimatorX, centerY);
  ctx.lineTo(gratingX, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(213, 230, 248, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gratingX, centerY - screenHalf * 0.82);
  ctx.lineTo(gratingX, centerY + screenHalf * 0.82);
  ctx.stroke();
  for (let y = centerY - screenHalf * 0.76; y <= centerY + screenHalf * 0.76; y += 7) {
    ctx.beginPath();
    ctx.moveTo(gratingX - 4, y);
    ctx.lineTo(gratingX + 4, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(213, 230, 248, 0.76)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(screenX, centerY - screenHalf);
  ctx.lineTo(screenX, centerY + screenHalf);
  ctx.stroke();

  orderRows(params).forEach((row) => {
    if (!row.valid) return;
    const visibleScreenCm = Math.max(-domain, Math.min(domain, row.screenCm));
    const y = centerY - visibleScreenCm * scaleY;
    const onScreen = Math.abs(row.screenCm) <= domain;
    ctx.strokeStyle = onScreen ? beam : `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0.28)`;
    ctx.lineWidth = row.order === params.order ? 2 : 1.2;
    ctx.setLineDash(onScreen ? [] : [7, 5]);
    ctx.beginPath();
    ctx.moveTo(gratingX, centerY);
    ctx.lineTo(screenX, y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (onScreen) {
      const alpha = row.order === params.order ? 0.82 : 0.42;
      const strip = ctx.createLinearGradient(screenX - 18, 0, screenX + 18, 0);
      strip.addColorStop(0, `rgba(${laserColor.r},${laserColor.g},${laserColor.b},0)`);
      strip.addColorStop(0.42, `rgba(${laserColor.r},${laserColor.g},${laserColor.b},${alpha * 0.55})`);
      strip.addColorStop(0.5, "rgba(255,255,255,0.82)");
      strip.addColorStop(0.58, `rgba(${laserColor.r},${laserColor.g},${laserColor.b},${alpha * 0.55})`);
      strip.addColorStop(1, `rgba(${laserColor.r},${laserColor.g},${laserColor.b},0)`);
      ctx.fillStyle = strip;
      ctx.fillRect(screenX - 18, y - 18, 36, 36);
    }
  });

  ctx.fillStyle = "#9ed2ff";
  ctx.font = `600 14px ${UI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText("激光器 → 准直镜 → 光栅架 → CCD屏幕", (left + screenX) / 2, height - 20);
}

async function initDeferredScene() {
  if (state.sceneLoading || state.sceneReady) return;
  state.sceneLoading = true;

  try {
    const { DiffractionScene } = await import("./scene3d.js");
    const loadedScene = new DiffractionScene(sceneRoot);
    loadedScene.setView(state.view);
    loadedScene.setDisplayMode(state.mode);
    loadedScene.set2dZoom(state.zoom2d);
    loadedScene.update(state.params);
    scene = loadedScene;
    state.sceneReady = true;
    sceneOverlay.classList.add("hidden");
  } catch (error) {
    state.sceneLoading = false;
    setText("currentTip", `3D 场景加载失败：${error.message}`);
  }
}

function updateOrderButtons() {
  const buttons = document.querySelectorAll("#orderButtons button");
  buttons.forEach((button) => {
    const order = Number(button.dataset.order);
    const exists = diffractionAngle(state.params, order).valid;
    button.disabled = !exists;
    button.classList.toggle("active", order === state.params.order);
  });

  if (!diffractionAngle(state.params, state.params.order).valid) {
    const fallback = ORDER_VALUES.find((order) => diffractionAngle(state.params, order).valid) ?? 0;
    state.params.order = fallback;
    buttons.forEach((button) => button.classList.toggle("active", Number(button.dataset.order) === fallback));
  }
}

function updateReadouts() {
  const laserColor = wavelengthToColor(state.params.lambdaNm);
  const bandName = wavelengthBandName(state.params.lambdaNm);
  document.documentElement.style.setProperty("--laser-color", laserColor.hex);
  document.documentElement.style.setProperty("--laser-soft", `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0.20)`);
  const wavelengthChip = $("wavelengthChip");
  wavelengthChip.querySelector("b").textContent = bandName;

  $("sceneD").textContent = `d = ${state.params.gratingUm.toFixed(3)} μm`;
  $("sceneL").textContent = `L = ${state.params.distanceCm.toFixed(1)} cm`;
  $("sceneN").textContent = `N = ${state.params.slitCount.toFixed(0)}`;
  $("statusLambda").textContent = `${state.params.lambdaNm.toFixed(0)} nm`;
  $("statusD").textContent = `${state.params.gratingUm.toFixed(3)} μm`;
  $("statusL").textContent = `${state.params.distanceCm.toFixed(1)} cm`;
  $("statusM").textContent = `j = ${state.params.order}`;
  $("statusN").textContent = `${state.params.slitCount.toFixed(0)} 缝`;
  $("envelopeLegendText").textContent = state.params.diffractionEnabled === false ? "包络关闭" : "单缝包络";

  const measurement = simulatedMeasurement(state.params);
  $("centralWidth").textContent = measurement.measuredWidthMm === null ? "未启用" : numberFormat(measurement.measuredWidthMm, 2);
  $("calculatedA").textContent = measurement.calculatedSlitUm === null ? "未启用" : numberFormat(measurement.calculatedSlitUm, 1);
  $("theoryA").textContent = `${state.params.slitUm.toFixed(1)}`;
  $("relativeError").textContent = measurement.relativeError === null ? "--" : `${(measurement.relativeError * 100).toFixed(2)}%`;

  const warnings = geometryWarnings(state.params);
  const diffractionOff = state.params.diffractionEnabled === false;
  $("conclusionText").textContent = warnings.length ? "参数需校验" : diffractionOff ? "仅干涉项" : "符合理论值";
  $("conclusionIcon").textContent = warnings.length ? "!" : diffractionOff ? "i" : "✓";
  $("conclusionText").classList.toggle("physics-warning", warnings.length > 0);
  $("conclusionIcon").classList.toggle("physics-warning", warnings.length > 0);
}

function updateTip() {
  const warnings = geometryWarnings(state.params);
  if (warnings.length) {
    setText("currentTip", warnings[0]);
    return;
  }

  if (state.params.diffractionEnabled === false) {
    setText("currentTip", "当前关闭单缝衍射包络，仅显示 N 缝干涉项；主极大位置仍由光栅方程确定。");
    return;
  }

  if (state.mode === "intensity") {
    setText("currentTip", "光强曲线采用单缝包络与 N 缝干涉项相乘；N 增大时主极大变窄，但主极大位置不变。");
  } else if (state.mode === "info") {
    const selected = diffractionAngle(state.params, state.params.order);
    setText("currentTip", selected.valid
      ? `当前 j=${state.params.order} 的衍射角 θ_j=${selected.thetaDeg.toFixed(2)}°，屏上位置 x=${selected.screenCm.toFixed(2)} cm。`
      : `当前 j=${state.params.order} 不存在实衍射角。`);
  } else {
    setText("currentTip", "调整左侧参数，观察中央衍射图样和右侧数据的变化。");
  }
}

function bindStudentLab() {
  if (!$("studentLabTabs")) return;

  document.querySelectorAll("#studentLabTabs button").forEach((button) => {
    button.addEventListener("click", () => setStudentLab(button.dataset.lab));
  });

  document.querySelectorAll("#studentLabPanel input").forEach((input) => {
    input.addEventListener("input", updateStudentLabCalculators);
    input.addEventListener("change", updateStudentLabCalculators);
  });

  $("labDbFromCurrent").addEventListener("click", fillStudentDbFromCurrent);
  $("labLambdaFromCurrent").addEventListener("click", fillStudentLambdaFromCurrent);
  updateStudentLabCalculators();
}

function setStudentLab(lab) {
  document.querySelectorAll("#studentLabTabs button").forEach((button) => {
    const active = button.dataset.lab === lab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-lab-panel]").forEach((panel) => {
    const active = panel.dataset.labPanel === lab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function readLabNumber(id) {
  return Number($(id).value);
}

function setLabNumber(id, value, digits) {
  if (!Number.isFinite(value)) return;
  $(id).value = Number(value).toFixed(digits);
}

function setLabWarning(id, warnings) {
  const element = $(id);
  if (warnings.length) {
    element.textContent = warnings.join("；");
    element.classList.add("active");
  } else {
    element.textContent = "计算条件自洽，可写入实验记录。";
    element.classList.remove("active");
  }
}

function studentLabOrder() {
  const normalParams = { ...state.params, incidenceDeg: 0 };
  const requested = Math.abs(Math.round(state.params.order));
  const candidates = [requested, ...maximumOrder(normalParams).filter((order) => order > 0)];
  return [...new Set(candidates)].find((order) => order >= 1 && diffractionAngle(normalParams, order).valid) ?? 1;
}

function fillStudentDbFromCurrent() {
  // 学生小程序的反演公式按正入射推导。若主场景设置了斜入射，
  // 这里重新生成 θ_i=0 的练习读数，避免学生把斜入射项漏掉后得到错误结论。
  const normalParams = { ...state.params, incidenceDeg: 0, diffractionEnabled: true };
  const order = studentLabOrder();
  const row = diffractionAngle(normalParams, order);
  const measurement = simulatedMeasurement(normalParams);
  const centralWidth = measurement.measuredWidthMm ?? centralFringeWidthMm(normalParams);

  setLabNumber("labDbLambda", normalParams.lambdaNm, 0);
  setLabNumber("labDbDistance", normalParams.distanceCm, 1);
  setLabNumber("labDbOrder", order, 0);
  if (row.valid) {
    setLabNumber("labDbXMinus", -row.screenCm, 2);
    setLabNumber("labDbXPlus", row.screenCm, 2);
  }
  if (centralWidth !== null) setLabNumber("labDbWidth", centralWidth, 2);

  updateStudentLabCalculators();
  if (Math.abs(state.params.incidenceDeg) > 0.01) {
    setText("currentTip", "学生动手实验按正入射设计；当前填入数据已按 θ_i=0 重新生成，避免把斜入射误差混进反演结果。");
  }
}

function fillStudentLambdaFromCurrent() {
  // 波长反演同样要求正入射和左右 ±j 级对称读数；左右偏差会在结果区单独提示。
  const normalParams = { ...state.params, incidenceDeg: 0 };
  const order = studentLabOrder();
  const row = diffractionAngle(normalParams, order);

  setLabNumber("labLambdaD", normalParams.gratingUm, 3);
  setLabNumber("labLambdaDistance", normalParams.distanceCm, 1);
  setLabNumber("labLambdaOrder", order, 0);
  if (row.valid) {
    setLabNumber("labLambdaXMinus", -row.screenCm, 2);
    setLabNumber("labLambdaXPlus", row.screenCm, 2);
  }

  updateStudentLabCalculators();
  if (Math.abs(state.params.incidenceDeg) > 0.01) {
    setText("currentTip", "学生动手实验按正入射设计；当前填入数据已按 θ_i=0 重新生成，避免把斜入射误差混进反演结果。");
  }
}

function updateStudentLabCalculators() {
  const dbResult = solveStudentGratingAndSlitExperiment({
    lambdaNm: readLabNumber("labDbLambda"),
    distanceCm: readLabNumber("labDbDistance"),
    order: readLabNumber("labDbOrder"),
    xMinusCm: readLabNumber("labDbXMinus"),
    xPlusCm: readLabNumber("labDbXPlus"),
    envelopeWidthMm: readLabNumber("labDbWidth"),
  });
  $("labDbDResult").textContent = dbResult.dUm === null ? "--" : `${dbResult.dUm.toFixed(3)} μm`;
  $("labDbBResult").textContent = dbResult.bUm === null ? "--" : `${dbResult.bUm.toFixed(2)} μm`;
  $("labDbSymmetry").textContent = dbResult.asymmetry === null ? "--" : `${(dbResult.asymmetry * 100).toFixed(2)}%`;
  setLabWarning("labDbWarning", dbResult.warnings);

  const lambdaResult = solveStudentWavelengthExperiment({
    gratingUm: readLabNumber("labLambdaD"),
    distanceCm: readLabNumber("labLambdaDistance"),
    order: readLabNumber("labLambdaOrder"),
    xMinusCm: readLabNumber("labLambdaXMinus"),
    xPlusCm: readLabNumber("labLambdaXPlus"),
  });
  $("labLambdaResult").textContent = lambdaResult.lambdaNm === null ? "--" : `${lambdaResult.lambdaNm.toFixed(1)} nm`;
  $("labLambdaBand").textContent = lambdaResult.lambdaNm === null ? "--" : wavelengthBandName(lambdaResult.lambdaNm);
  $("labLambdaSymmetry").textContent =
    lambdaResult.asymmetry === null ? "--" : `${(lambdaResult.asymmetry * 100).toFixed(2)}%`;
  setLabWarning("labLambdaWarning", lambdaResult.warnings);
}

function configureCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function xToScreenCm(x, plot, domain) {
  return -domain + (2 * domain * (x - plot.left)) / plot.width;
}

function screenCmToX(screenCm, plot, domain) {
  return plot.left + ((screenCm + domain) / (2 * domain)) * plot.width;
}

function buildAdaptiveIntensityPoints(params, domain, baseSamples = 1500) {
  const points = [];
  for (let i = 0; i < baseSamples; i += 1) {
    const t = i / (baseSamples - 1);
    points.push(-domain + 2 * domain * t);
  }

  // 多缝主极大很窄。均匀采样容易错过峰顶，因此在每个可见主极大附近补充采样点。
  maximumOrder(params).forEach((order) => {
    const row = diffractionAngle(params, order);
    if (!row.valid || Math.abs(row.screenCm) > domain) return;
    const halfWidth = principalMaximumHalfWidthCm(params, order) ?? domain / baseSamples;
    [-1, -0.75, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 0.75, 1].forEach((factor) => {
      const x = row.screenCm + factor * halfWidth;
      if (Math.abs(x) <= domain) points.push(x);
    });
  });

  return [...new Set(points.map((item) => item.toFixed(5)))]
    .map(Number)
    .sort((a, b) => a - b);
}

function drawDiffractionPattern() {
  const canvas = patternCanvas;
  const { ctx, width, height } = configureCanvas(canvas);
  const text = cssVar("--text") || "#eef6ff";
  const grid = "rgba(152, 172, 194, 0.12)";
  const laserColor = wavelengthToColor(state.params.lambdaNm);
  const domain = stableVisibleDomainCm(state.params);
  const plot = { left: 46, top: 24, width: width - 70, height: height - 58 };
  const centerY = plot.top + plot.height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(4, 8, 12, 0.88)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i += 1) {
    const x = plot.left + (plot.width * i) / 8;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
    ctx.stroke();
  }

  for (let px = 0; px < plot.width; px += 1) {
    // 每个像素列取 3 个子采样点的最大值，避免窄主极大在屏幕采样中消失。
    // 这里只做屏幕显示增强；定量判断仍以右侧线性光强曲线为准。
    let intensity = 0;
    for (let sub = 0; sub < 3; sub += 1) {
      const x = plot.left + px + (sub + 0.5) / 3;
      const screenCm = xToScreenCm(x, plot, domain);
      intensity = Math.max(intensity, intensityAt(state.params, screenCm));
    }
    if (intensity < 0.003) continue;

    const alpha = Math.min(0.82, 0.05 + intensity ** 0.55 * 0.72);
    const strip = ctx.createLinearGradient(0, plot.top, 0, plot.top + plot.height);
    strip.addColorStop(0, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0)`);
    strip.addColorStop(0.41, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, ${alpha * 0.42})`);
    strip.addColorStop(0.5, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, ${alpha})`);
    strip.addColorStop(0.59, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, ${alpha * 0.42})`);
    strip.addColorStop(1, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0)`);
    ctx.fillStyle = strip;
    const stripWidth = intensity > 0.55 ? 1.6 : 1;
    ctx.fillRect(plot.left + px, plot.top, stripWidth, plot.height);
  }

  maximumOrder(state.params).forEach((order) => {
    const row = diffractionAngle(state.params, order);
    if (!row.valid || Math.abs(row.screenCm) > domain) return;
    const x = screenCmToX(row.screenCm, plot, domain);
    const peak = intensityAt(state.params, row.screenCm);
    if (peak < 0.01) return;

    const halfWidth = principalMaximumHalfWidthCm(state.params, order) ?? 0.16;
    const visualHalfWidth = Math.max(1.1, Math.min(4.5, (halfWidth / (2 * domain)) * plot.width * 2.4));
    const line = ctx.createLinearGradient(x, plot.top, x, plot.top + plot.height);
    line.addColorStop(0, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0)`);
    line.addColorStop(0.42, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, ${0.54 * peak})`);
    line.addColorStop(0.5, `rgba(255, 255, 255, ${0.48 * peak})`);
    line.addColorStop(0.58, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, ${0.54 * peak})`);
    line.addColorStop(1, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0)`);
    ctx.fillStyle = line;
    ctx.fillRect(x - visualHalfWidth / 2, plot.top + 8, visualHalfWidth, plot.height - 16);
  });

  ctx.strokeStyle = "rgba(207, 222, 238, 0.38)";
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);
  ctx.strokeStyle = "rgba(207, 222, 238, 0.22)";
  ctx.beginPath();
  ctx.moveTo(plot.left, centerY);
  ctx.lineTo(plot.left + plot.width, centerY);
  ctx.stroke();

  ctx.fillStyle = text;
  ctx.font = `13px ${UI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText("屏幕位置 x (cm)", plot.left + plot.width / 2, height - 9);
}

function deterministicNoise(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawCcdView() {
  const canvas = ccdCanvas;
  const { ctx, width, height } = configureCanvas(canvas);
  const domain = stableVisibleDomainCm(state.params);
  const sensor = { left: 18, top: 18, width: width - 36, height: height - 44 };
  const columns = 128;
  const rows = 34;
  const pixelW = sensor.width / columns;
  const pixelH = sensor.height / rows;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(2, 5, 8, 0.96)";
  ctx.fillRect(0, 0, width, height);

  for (let row = 0; row < rows; row += 1) {
    const verticalOffset = (row - rows / 2) / (rows * 0.18);
    const vertical = Math.exp(-(verticalOffset ** 2));
    for (let col = 0; col < columns; col += 1) {
      let signal = 0;
      for (let sub = 0; sub < 5; sub += 1) {
        const screenCm = -domain + (2 * domain * (col + (sub + 0.5) / 5)) / columns;
        signal = Math.max(signal, intensityAt(state.params, screenCm) * vertical);
      }
      const readNoise = (deterministicNoise(col, row) - 0.5) * 0.022;
      const darkNoise = deterministicNoise(col + 21, row + 17) * 0.012;
      // CCD 显示为灰度采样；这里模拟有限像素、读出噪声和 8-bit 量化。
      const normalized = Math.max(0, Math.min(1, signal ** 0.38 + readNoise + darkNoise));
      const gray = Math.round(normalized * 255);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.fillRect(sensor.left + col * pixelW, sensor.top + row * pixelH, Math.ceil(pixelW), Math.ceil(pixelH));
    }
  }

  ctx.strokeStyle = "rgba(210, 229, 245, 0.34)";
  ctx.strokeRect(sensor.left, sensor.top, sensor.width, sensor.height);
  ctx.strokeStyle = "rgba(210, 229, 245, 0.08)";
  ctx.lineWidth = 1;
  for (let col = 0; col <= columns; col += 8) {
    const x = sensor.left + col * pixelW;
    ctx.beginPath();
    ctx.moveTo(x, sensor.top);
    ctx.lineTo(x, sensor.top + sensor.height);
    ctx.stroke();
  }

  ctx.fillStyle = "#c9d8e8";
  ctx.font = `12px ${UI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText("CCD 灰度值：有限像素 + 读出噪声 + 8-bit 量化", width / 2, height - 10);
}

function drawIntensityChart() {
  const canvas = chartCanvas;
  const { ctx, width, height } = configureCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const text = cssVar("--text") || "#eef6ff";
  const muted = cssVar("--muted") || "#98a8bb";
  const laserColor = wavelengthToColor(state.params.lambdaNm);
  const grid = "rgba(151, 177, 205, 0.16)";
  const plot = { left: 52, top: 18, right: 16, bottom: 40 };
  const plotW = width - plot.left - plot.right;
  const plotH = height - plot.top - plot.bottom;
  const domain = stableVisibleDomainCm(state.params);

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.font = `12px ${NUMBER_FONT_STACK}`;
  ctx.fillStyle = muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const yValue = i / 5;
    const y = plot.top + plotH - yValue * plotH;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plotW, y);
    ctx.stroke();
    ctx.fillText(yValue.toFixed(1), plot.left - 9, y);
  }

  const xStep = domain <= 20 ? 5 : domain <= 60 ? 20 : domain <= 160 ? 40 : domain <= 300 ? 80 : 100;
  const firstX = Math.ceil(-domain / xStep) * xStep;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let xValue = firstX; xValue <= domain + 1e-6; xValue += xStep) {
    const x = plot.left + ((xValue + domain) / (2 * domain)) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plotH);
    ctx.stroke();
    ctx.fillText(String(Math.round(xValue)), x, plot.top + plotH + 8);
  }

  ctx.strokeStyle = "rgba(198, 214, 232, 0.34)";
  ctx.strokeRect(plot.left, plot.top, plotW, plotH);

  if (state.params.diffractionEnabled !== false) {
    ctx.strokeStyle = "rgba(126, 214, 255, 0.78)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    const envelopeSamples = 650;
    for (let i = 0; i < envelopeSamples; i += 1) {
      const t = i / (envelopeSamples - 1);
      const cm = -domain + 2 * domain * t;
      const intensity = intensityEnvelopeAt(state.params, cm);
      const x = plot.left + t * plotW;
      const y = plot.top + plotH - intensity * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const gradient = ctx.createLinearGradient(0, plot.top, 0, plot.top + plotH);
  gradient.addColorStop(0, laserColor.css);
  gradient.addColorStop(1, `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0.66)`);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const samples = buildAdaptiveIntensityPoints(state.params, domain);
  samples.forEach((cm, index) => {
    const t = (cm + domain) / (2 * domain);
    const intensity = intensityAt(state.params, cm);
    const x = plot.left + t * plotW;
    const y = plot.top + plotH - intensity * plotH;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = text;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `14px ${UI_FONT_STACK}`;
  ctx.fillText("位置 (cm)", plot.left + plotW / 2, height - 3);
}

function drawRayDiagram() {
  const rows = orderRows(state.params).filter((row) => row.valid);
  const laserColor = wavelengthToColor(state.params.lambdaNm);
  const raySoft = `rgba(${laserColor.r}, ${laserColor.g}, ${laserColor.b}, 0.66)`;
  const rayStrong = laserColor.hex;
  const domain = stableVisibleDomainCm(state.params);
  const laserX = 48;
  const collimatorX = 124;
  const gratingX = 210;
  const screenX = 360;
  const centerY = 98;
  const scaleY = 72 / domain;
  const slope = Math.tan((state.params.incidenceDeg * Math.PI) / 180);
  const laserY = centerY - slope * (gratingX - laserX);
  const collimatorY = centerY - slope * (gratingX - collimatorX);
  const visibleYValues = rows
    .filter((row) => Math.abs(row.screenCm) <= domain)
    .map((row) => centerY - row.screenCm * scaleY)
    .sort((a, b) => a - b);
  const minLabelGap =
    visibleYValues.length > 1
      ? Math.min(...visibleYValues.slice(1).map((value, index) => Math.abs(value - visibleYValues[index])))
      : Infinity;
  const crowdedLabels = minLabelGap < 14;

  const lines = [];
  lines.push(`<rect x="20" y="${(laserY - 17).toFixed(1)}" width="56" height="34" rx="5" fill="#182333" stroke="#526174"/>`);
  lines.push(`<text x="48" y="${(laserY - 26).toFixed(1)}" fill="#cfd8e5" text-anchor="middle" font-size="13">激光器</text>`);
  lines.push(`<circle cx="${laserX}" cy="${laserY.toFixed(1)}" r="4" fill="${rayStrong}" filter="url(#dotGlow)"/>`);
  lines.push(`<line x1="${laserX}" y1="${laserY.toFixed(1)}" x2="${collimatorX}" y2="${collimatorY.toFixed(1)}" stroke="${rayStrong}" stroke-width="2"/>`);
  lines.push(`<ellipse cx="${collimatorX}" cy="${collimatorY.toFixed(1)}" rx="6" ry="28" fill="rgba(126,214,255,0.10)" stroke="#d7e8ff" stroke-width="1.4"/>`);
  lines.push(`<text x="${collimatorX}" y="${(collimatorY - 36).toFixed(1)}" fill="#d6e6fa" text-anchor="middle" font-size="13">准直镜</text>`);
  lines.push(`<line x1="${collimatorX}" y1="${collimatorY.toFixed(1)}" x2="${gratingX}" y2="${centerY}" stroke="${rayStrong}" stroke-width="2"/>`);
  lines.push(`<rect x="${gratingX - 4}" y="55" width="8" height="86" fill="#151d28" stroke="#d7e8ff"/>`);

  for (let y = 59; y < 140; y += 8) {
    lines.push(`<line x1="${gratingX - 3}" y1="${y}" x2="${gratingX + 3}" y2="${y}" stroke="#d7e8ff" stroke-width="1"/>`);
  }

  lines.push(`<text x="${gratingX}" y="45" fill="#d6e6fa" text-anchor="middle" font-size="13">光栅架</text>`);
  lines.push(`<rect x="${screenX - 4}" y="24" width="8" height="148" fill="url(#screenGlow)" stroke="#e0ebff" stroke-width="1.5"/>`);
  for (let y = 30; y <= 166; y += 8) {
    lines.push(`<line x1="${screenX - 4}" y1="${y}" x2="${screenX + 4}" y2="${y}" stroke="rgba(224,235,255,0.28)" stroke-width="0.8"/>`);
  }
  lines.push(`<text x="${screenX + 14}" y="28" fill="#d6e6fa" font-size="13">CCD屏幕</text>`);

  rows.forEach((row) => {
    const visibleScreenCm = Math.max(-domain, Math.min(domain, row.screenCm));
    const y = centerY - visibleScreenCm * scaleY;
    const onScreen = Math.abs(row.screenCm) <= domain;
    const selected = row.order === state.params.order;
    const stroke = selected ? rayStrong : raySoft;
    const dash = selected && onScreen ? "" : 'stroke-dasharray="7 5"';
    lines.push(`<line x1="${gratingX}" y1="${centerY}" x2="${screenX}" y2="${y.toFixed(1)}" stroke="${stroke}" stroke-width="${selected ? 2 : 1.4}" ${dash}/>`);
    if (onScreen) {
      lines.push(`<line x1="${screenX - 6}" y1="${y.toFixed(1)}" x2="${screenX + 6}" y2="${y.toFixed(1)}" stroke="${rayStrong}" stroke-width="${selected ? 3 : 1.8}" filter="url(#dotGlow)"/>`);
      if (!crowdedLabels || selected) {
        lines.push(`<text x="${screenX + 20}" y="${(y + 4).toFixed(1)}" fill="#dfe9f6" font-size="15">j = ${row.order}</text>`);
      }
    }
  });

  diagramLayer.innerHTML = lines.join("");
}

function exportData() {
  const rows = buildExportRows(state.params);
  const measurement = simulatedMeasurement(state.params);
  const metadata = [
    ["光栅衍射交互实验导出数据"],
    ["导出时间", new Date().toLocaleString("zh-CN", { hour12: false })],
    [],
    ["左侧实验参数", "数值", "单位", "说明"],
    ["激光波长 λ", state.params.lambdaNm.toFixed(0), "nm", "可见光范围 400-700 nm"],
    ["光栅常数 d", state.params.gratingUm.toFixed(3), "μm", "相邻狭缝中心间距"],
    ["屏距 L", state.params.distanceCm.toFixed(1), "cm", "光栅到 CCD 屏幕距离"],
    ["衍射级次 j", state.params.order, "", "当前选中的主极大级次"],
    ["缝宽 b", state.params.slitUm.toFixed(1), "μm", "单个狭缝宽度"],
    ["有效缝数 N", Math.round(state.params.slitCount), "缝", "参与干涉的狭缝数量"],
    ["是否考虑衍射", state.params.diffractionEnabled !== false ? "是" : "否", "", "是：光强包含单缝 sinc² 包络"],
    ["入射角 θ_i", state.params.incidenceDeg.toFixed(1), "°", "正入射为 0°"],
    [],
    ["实验结果", "数值", "单位", "说明"],
    ["测得包络中央宽度", measurement.measuredWidthMm === null ? "" : measurement.measuredWidthMm.toFixed(2), "mm", "由单缝包络一阶暗纹间距得到"],
    ["反算缝宽 b", measurement.calculatedSlitUm === null ? "" : measurement.calculatedSlitUm.toFixed(2), "μm", "由中央包络宽度反演"],
    ["理论缝宽 b", state.params.slitUm.toFixed(1), "μm", "左侧参数设定值"],
    ["相对误差", measurement.relativeError === null ? "" : (measurement.relativeError * 100).toFixed(2), "%", "|b_实验-b_理论|/b_理论×100%"],
    [],
    ["光强分布采样数据"],
  ];
  // Windows Excel 直接打开 CSV 时可能按本地 ANSI 编码解析；BOM 能明确标识 UTF-8，避免中文乱码。
  const csv = `\uFEFF${[...metadata, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `光栅衍射实验数据-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  setText("statusSaved", "已保存");
  setText("currentTip", "已导出 UTF-8 编码数据，文件包含左侧参数、实验结果和光强分布采样。");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // CSV 单元格含逗号、双引号或换行时必须用双引号包裹，并把内部双引号写成两个双引号。
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderAll() {
  state.renderPending = false;
  updateOrderButtons();
  updateReadouts();
  updateTip();
  drawDiffractionPattern();
  drawCcdView();
  drawIntensityChart();
  drawRayDiagram();
  scene.update(state.params);
}

function scheduleRenderAll() {
  // range input 在拖动时可能一秒触发上百次。这里把多次输入合并到
  // 浏览器下一帧，避免 3D 模型被高频销毁和重建造成画面抖动。
  if (state.renderPending) return;
  state.renderPending = true;
  requestAnimationFrame(renderAll);
}

function applyInitialRouteState() {
  const query = new URLSearchParams(window.location.search);
  Object.values(controls).forEach(([rangeId, numberId, key, digits]) => {
    const value = query.get(rangeId) ?? query.get(key);
    if (value === null) return;
    $(numberId).value = value;
    syncControlToState(rangeId, numberId, key, digits, "number");
  });

  const diffraction = query.get("diffraction") ?? query.get("diffractionEnabled");
  if (diffraction !== null) {
    state.params.diffractionEnabled = !["0", "false", "off", "no"].includes(diffraction.toLowerCase());
    $("diffractionToggle").checked = state.params.diffractionEnabled;
  }

  const order = Number(query.get("order"));
  if (query.has("order") && Number.isFinite(order) && ORDER_VALUES.includes(order)) {
    state.params.order = order;
  }

  const view = query.get("view");
  const mode = query.get("mode");
  const module = query.get("module");
  const theorySlide = Number(query.get("theorySlide"));
  const zoom2d = Number(query.get("zoom2d"));

  if (query.has("zoom2d") && Number.isFinite(zoom2d)) {
    set2dZoom(zoom2d, { silent: true });
  }

  if (view === "2d") {
    setView("2d");
  }

  if (mode && ["rays", "intensity", "info"].includes(mode)) {
    state.mode = mode;
    document.querySelectorAll(".mode-buttons button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    scene.setDisplayMode(mode);
  }

  if (query.has("theorySlide") && Number.isFinite(theorySlide)) {
    setTheorySlide(theorySlide);
  }

  if (module && ["operation", "theory"].includes(module)) {
    setModule(module);
  } else {
    setTheorySlide(state.theorySlide);
  }
}

hydrateTheoryVisuals();
bindControls();
applyInitialRouteState();
renderAll();
requestAnimationFrame(tick);

const deferredSceneStart = () => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(initDeferredScene, { timeout: 900 });
  } else {
    window.setTimeout(initDeferredScene, 180);
  }
};
requestAnimationFrame(() => window.setTimeout(deferredSceneStart, 0));

// 浏览器字体或容器尺寸变更后，重绘 canvas 可避免坐标轴文字发虚。
window.addEventListener("resize", () => {
  drawDiffractionPattern();
  drawCcdView();
  drawIntensityChart();
});
