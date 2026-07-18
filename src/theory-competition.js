/*
 * 物理实验竞赛版“原理讲解”内容。
 *
 * 设计依据：用户提供的六张白色实验讲义式参考图。两张“基本概念”参考图
 * 分别描述透射光栅和反射光栅，因此合并为同一章节内的可切换视图。其余页面
 * 依次对应衍射原理、明纹宽度、实验测量和误差分析。
 *
 * 符号约定：
 *   j：衍射级次；b：单缝宽度；d：光栅常数；N：有效缝数；L：屏距。
 * 这套约定与主实验一致，不能直接照搬参考图中混用的 m、a。
 */

export const competitionTheoryPages = [
  {
    title: "01 基本概念",
    condition: "光栅常数 d 是相邻等效狭缝或刻线的中心间距；本网页统一用 b 表示透射狭缝宽度，用 j 表示衍射级次。",
    summary: "光栅是具有大量等间距、平行狭缝或刻线的周期性分光元件。d 决定各级主极大的角位置，N 决定主极大的锐度，b 决定单缝衍射包络。",
  },
  {
    title: "02 衍射原理",
    condition: "正入射时 Δ = d sinθ；斜入射统一采用带符号角约定 d(sinθⱼ − sinθᵢ) = jλ。",
    summary: "每个狭缝可视为相干次波源。相邻狭缝在观察方向上的光程差达到 jλ 时同相叠加，形成第 j 级主极大。",
  },
  {
    title: "03 明纹宽度",
    condition: "页面同时给出精确关系和近轴近似。式中的近似号不能省略；离轴级次还必须保留 cosθⱼ 修正。",
    summary: "有限缝数 N 决定光栅主极大的精细宽度，单缝宽度 b 决定宽得多的衍射包络；实验图样是二者乘积。",
  },
  {
    title: "04 实验测量",
    condition: "屏幕位置法优先使用 θⱼ = arctan(xⱼ/L) 的完整几何关系；只有验证角度足够小时才使用 xⱼ ≈ jλL/d。",
    summary: "可由屏幕对称位置或分光计角度测得 θⱼ，再由 d = jλ/sinθⱼ 求光栅常数；多级数据应做线性拟合以降低随机误差。",
  },
  {
    title: "05 误差分析",
    condition: "不满足小角度条件时，不能直接使用 sinθ ≈ tanθ ≈ θ。实验报告必须注明采用精确关系还是近似关系。",
    summary: "误差来自读数、屏距、调平与正入射偏差、仪器分辨率和模型近似。应优先控制对结果灵敏度最高的角度与中心定位误差。",
  },
];

export const competitionTheoryVisuals = [
  `
    <div class="theory-visual competition-page concept-page">
      <div class="chapter-lead">
        <p>光栅利用周期结构使不同位置出射的光波相干叠加，从而把不同波长按角度分开。</p>
      </div>

      <div class="concept-mode-bar" role="tablist" aria-label="光栅类型">
        <button class="active" type="button" role="tab" aria-selected="true" data-grating-mode="transmission">透射光栅</button>
        <button type="button" role="tab" aria-selected="false" data-grating-mode="reflection">反射光栅</button>
      </div>

      <div class="reference-grid concept-reference-grid">
        <section class="paper-section diagram-section">
          <header class="section-title"><span>A</span><div><strong id="gratingDiagramTitle">透射光栅结构示意图</strong><small>结构与关键尺寸</small></div></header>
          <canvas id="gratingConceptCanvas" class="theory-canvas concept-canvas" width="1100" height="620" aria-label="透射或反射光栅结构与光路示意图"></canvas>
          <div class="equation-pair">
            <div><strong>d = 1 / ρ</strong><span>光栅常数</span></div>
            <div><strong>N ≈ W / d</strong><span>有效缝数</span></div>
          </div>
        </section>

        <section class="paper-section symbol-section">
          <header class="section-title"><span>B</span><div><strong>符号说明</strong><small>与主实验保持一致</small></div></header>
          <table class="theory-symbol-table">
            <thead><tr><th>符号</th><th>含义与说明</th></tr></thead>
            <tbody>
              <tr><td>d</td><td>光栅常数，相邻狭缝中心或相邻等效刻线间距</td></tr>
              <tr><td>b</td><td>单个透射狭缝的宽度，决定单缝衍射包络</td></tr>
              <tr><td>ρ</td><td>刻线密度，ρ = 1/d；使用线/mm 时须统一单位</td></tr>
              <tr><td>W</td><td>入射光在光栅上的有效照明宽度</td></tr>
              <tr><td>N</td><td>有效受照缝数或刻线数，近似 N ≈ W/d</td></tr>
              <tr><td>θⱼ</td><td>第 j 级主极大相对光栅法线的衍射角</td></tr>
              <tr><td>j</td><td>衍射级次，j = 0, ±1, ±2, ...</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <aside class="teaching-callout">
        <span class="callout-mark">!</span>
        <div><strong>教学重点</strong><p id="gratingModeText">透射光栅由大量等间距平行狭缝构成；d 决定主极大位置，b 决定单缝包络，N 影响主极大宽度与分辨能力。</p></div>
      </aside>
    </div>
  `,
  `
    <div class="theory-visual competition-page principle-page">
      <div class="chapter-lead">
        <p>由惠更斯-菲涅尔原理，每个狭缝都可视为相干次波源；光程差决定观察方向上的相位关系。</p>
      </div>

      <div class="principle-layout">
        <section class="paper-section path-section">
          <header class="section-title"><span>A</span><div><strong>相邻狭缝的光程差</strong><small>正入射几何模型</small></div></header>
          <canvas id="pathDifferenceCanvas" class="theory-canvas path-canvas" width="900" height="700" aria-label="相邻两狭缝在衍射方向上的光程差几何关系"></canvas>
          <div class="formula-box compact"><strong>Δ = d sinθ</strong><span>相邻狭缝到同一远场方向的光程差</span></div>
        </section>

        <section class="principle-steps" aria-label="衍射原理推导步骤">
          <article class="numbered-principle"><b>1</b><div><h3>次波发射</h3><p>单色平面波照射光栅后，各狭缝向外发射频率相同、相位关系稳定的次波。</p></div></article>
          <article class="numbered-principle"><b>2</b><div><h3>光程差形成</h3><p>相邻狭缝中心距为 d，在与法线夹角 θ 的方向上，光程差为：</p><div class="inline-equation">Δ = d sinθ</div></div></article>
          <article class="numbered-principle"><b>3</b><div><h3>同相叠加</h3><p>当光程差为波长整数倍时，各缝出射光同相叠加，形成第 j 级主极大：</p><div class="inline-equation emphasis">d sinθⱼ = jλ</div><small>j = 0, ±1, ±2, ...</small></div></article>
          <article class="signed-angle-note"><strong>斜入射修正</strong><span>d(sinθⱼ − sinθᵢ) = jλ</span><p>θᵢ 与 θⱼ 均按相对法线的带符号角定义。</p></article>
        </section>
      </div>

      <section class="paper-section phase-section">
        <header class="section-title"><span>B</span><div><strong>相位状态对比</strong><small>光程差决定叠加强弱</small></div></header>
        <canvas id="phaseComparisonCanvas" class="theory-canvas phase-canvas" width="1400" height="300" aria-label="非同相与同相波叠加的相位状态对比"></canvas>
      </section>

      <aside class="core-conclusion"><strong>核心结论</strong><p>主极大的角位置由 d sinθⱼ = jλ 决定；不同波长对应不同衍射角，因此光栅能够实现空间分光。</p></aside>
    </div>
  `,
  `
    <div class="theory-visual competition-page width-page">
      <div class="chapter-lead">
        <p>实际光栅图样既包含有限多缝干涉形成的窄主极大，也受到单缝衍射宽包络调制。两种“宽度”来源不同。</p>
      </div>

      <div class="width-mode-bar" role="tablist" aria-label="明纹宽度图层">
        <button type="button" role="tab" aria-selected="false" data-fringe-mode="grating">主极大精细结构</button>
        <button type="button" role="tab" aria-selected="false" data-fringe-mode="envelope">单缝衍射包络</button>
        <button class="active" type="button" role="tab" aria-selected="true" data-fringe-mode="combined">二者叠加</button>
      </div>

      <div class="width-layout">
        <section class="paper-section intensity-figure-section">
          <header class="section-title"><span>A</span><div><strong>有限多缝光栅强度分布</strong><small>λ = 650 nm，d = 6.0 μm，b = 2.0 μm，N = 12</small></div></header>
          <canvas id="fringeWidthCanvas" class="theory-canvas fringe-canvas" width="1500" height="720" aria-label="有限多缝干涉与单缝衍射包络叠加的归一化光强图"></canvas>
          <p class="figure-caption">数值曲线采用 I(θ)/I₀ = sinc²β · [sin(Nα)/(N sinα)]²，其中 sincβ = sinβ/β，β = πb sinθ/λ，α = πd sinθ/λ；与项目 MATLAB 验证脚本使用同一物理模型。</p>
        </section>

        <aside class="width-formulas">
          <article class="formula-card-blue">
            <h3>光栅主极大全宽</h3>
            <div class="formula-lines"><strong>θⱼ,± = arcsin[(j ± 1/N)λ/d]</strong><strong>Δθⱼ = θⱼ,+ − θⱼ,−</strong><span>精确角宽度</span></div>
            <div class="formula-lines soft"><strong>Δθⱼ ≈ 2λ/(Nd cosθⱼ)</strong><span>局部近似</span></div>
            <p>中央级近轴时：w₀ ≈ 2Lλ/(Nd)。</p>
          </article>
          <article class="formula-card-red">
            <h3>单缝中央包络全宽</h3>
            <div class="formula-lines"><strong>Δθ<sub>env</sub> = 2arcsin(λ/b)</strong><strong>w<sub>env</sub> = 2L tan[arcsin(λ/b)]</strong><span>精确关系</span></div>
            <div class="formula-lines soft"><strong>w<sub>env</sub> ≈ 2Lλ/b</strong><span>近轴近似</span></div>
            <p>b 越小，包络越宽；N 越大，包络内各主极大越窄。</p>
          </article>
        </aside>
      </div>
    </div>
  `,
  `
    <div class="theory-visual competition-page measurement-page">
      <div class="chapter-lead">
        <p>测量不同级次的衍射角或屏幕位置，结合光栅方程反演 d。左右对称读数可消除零点偏移，多级拟合可减小随机误差。</p>
      </div>

      <div class="measurement-methods">
        <section class="paper-section measurement-method">
          <header class="section-title"><span>A</span><div><strong>屏幕位置法</strong><small>激光器 → 准直镜 → 光栅 → CCD</small></div></header>
          <canvas id="screenMethodCanvas" class="theory-canvas measurement-canvas" width="1200" height="500" aria-label="屏幕位置法实验光路与对称衍射级次"></canvas>
          <div class="measurement-equations">
            <div><span>对称位移</span><strong>xⱼ = (x<sub>+j</sub> − x<sub>−j</sub>)/2</strong></div>
            <div><span>衍射角</span><strong>θⱼ = arctan(xⱼ/L)</strong></div>
            <div><span>光栅常数</span><strong><span class="screen-distance-formula" role="math" aria-label="d 等于 j lambda 乘以根号 L 平方加 x j 平方，再除以 x j"><var class="physics-variable">d</var><span>=</span><var class="physics-variable">j</var><var class="physics-variable">λ</var><span class="stacked-fraction"><span class="fraction-numerator"><span class="radical-expression"><span class="radical-symbol">√</span><span class="radicand"><var class="physics-variable">L</var><sup>2</sup> + <var class="physics-variable">x</var><sub><var class="physics-variable">j</var></sub><sup>2</sup></span></span></span><span class="fraction-denominator"><var class="physics-variable">x</var><sub><var class="physics-variable">j</var></sub></span></span></span></strong></div>
          </div>
        </section>

        <section class="paper-section measurement-method">
          <header class="section-title"><span>B</span><div><strong>分光计测角法</strong><small>读取左右对称的同级谱线</small></div></header>
          <canvas id="angleMethodCanvas" class="theory-canvas measurement-canvas" width="1200" height="500" aria-label="分光计左右对称衍射角测量示意图"></canvas>
          <div class="measurement-equations two">
            <div><span>对称角</span><strong>θⱼ = |φ<sub>+j</sub> − φ<sub>−j</sub>|/2</strong></div>
            <div><span>光栅常数</span><strong>d = jλ/sinθⱼ</strong></div>
          </div>
          <p class="method-note">该式要求零级方向位于左右同级读数的角平分线上；若光栅未正入射，应先校正光栅方位。</p>
        </section>
      </div>

      <section class="paper-section fitting-section">
        <header class="section-title"><span>C</span><div><strong>多级线性拟合</strong><small>以 sinθⱼ 对 j 作图</small></div></header>
        <div class="fitting-grid">
          <canvas id="fitPlotCanvas" class="theory-canvas fit-plot-canvas" width="900" height="480" aria-label="sinθⱼ 对衍射级次 j 的线性拟合示意图"></canvas>
          <div class="fit-formulas"><strong>sinθⱼ = (λ/d)j = kj</strong><p>正入射条件下，拟合斜率 k = λ/d，因此 d = λ/k。</p><small>拟合时应保留测量不确定度，并报告决定系数 R²；R² 高不等于不存在系统误差。</small></div>
          <ol class="fit-steps"><li>读取多个 ±j 级对称位置</li><li>按精确几何计算 sinθⱼ</li><li>最小二乘拟合斜率 k</li><li>由 d = λ/k 反演光栅常数</li></ol>
        </div>
      </section>
    </div>
  `,
  `
    <div class="theory-visual competition-page error-page">
      <div class="error-origin paper-section">
        <header class="section-title"><span>A</span><div><strong>误差从哪里来？</strong><small>测量、装调、仪器、模型与环境</small></div></header>
        <div class="error-flow">
          <article><b>01</b><strong>读数</strong><p>条纹中心与角度<br>读取不够精确</p></article><i>→</i>
          <article><b>02</b><strong>对准</strong><p>光栅未正入射<br>或零级中心偏移</p></article><i>→</i>
          <article><b>03</b><strong>仪器</strong><p>刻度分度有限<br>CCD 像元有限</p></article><i>→</i>
          <article><b>04</b><strong>模型</strong><p>较大角度误用<br>小角近似</p></article><i>→</i>
          <article><b>05</b><strong>环境</strong><p>振动与杂散光<br>空气扰动</p></article>
        </div>
        <p class="error-origin-summary">误差本质上来自：测量不准、装调不正、仪器有限，以及公式近似超出适用范围。</p>
      </div>

      <div class="error-analysis-grid">
        <section class="paper-section uncertainty-section">
          <header class="section-title"><span>B</span><div><strong>核心公式怎么理解？</strong><small>独立输入量的一阶不确定度传播</small></div></header>
          <div class="uncertainty-layout">
            <div class="uncertainty-formulas"><strong>d = jλ/sinθⱼ</strong><strong class="uncertainty-equation" aria-label="d 的相对标准不确定度平方等于 lambda 的相对标准不确定度平方，加 cot theta j 乘 theta j 标准不确定度的平方"><math display="block"><mrow><msup><mrow><mo>[</mo><mfrac><mrow><mi mathvariant="normal">u</mi><mo>(</mo><mi>d</mi><mo>)</mo></mrow><mi>d</mi></mfrac><mo>]</mo></mrow><mn>2</mn></msup><mo>=</mo><msup><mrow><mo>[</mo><mfrac><mrow><mi mathvariant="normal">u</mi><mo>(</mo><mi>λ</mi><mo>)</mo></mrow><mi>λ</mi></mfrac><mo>]</mo></mrow><mn>2</mn></msup><mo>+</mo><msup><mrow><mo>[</mo><mi mathvariant="normal">cot</mi><msub><mi>θ</mi><mi>j</mi></msub><mo>·</mo><mi mathvariant="normal">u</mi><mo>(</mo><msub><mi>θ</mi><mi>j</mi></msub><mo>)</mo><mo>]</mo></mrow><mn>2</mn></msup></mrow></math></strong></div>
            <ul><li>j 为精确整数，不计读数不确定度。</li><li>θⱼ 越小，cotθⱼ 越大，角度误差影响越明显。</li><li>u(θⱼ) 必须以弧度代入该传播公式。</li><li>该合成式假设 λ 与 θⱼ 的不确定度相互独立。</li></ul>
          </div>
          <div class="exact-geometry-note"><strong>屏幕位置法</strong><span><span class="screen-distance-formula" role="math" aria-label="d 等于 j lambda 乘以根号 L 平方加 x j 平方，再除以 x j"><var class="physics-variable">d</var><span>=</span><var class="physics-variable">j</var><var class="physics-variable">λ</var><span class="stacked-fraction"><span class="fraction-numerator"><span class="radical-expression"><span class="radical-symbol">√</span><span class="radicand"><var class="physics-variable">L</var><sup>2</sup> + <var class="physics-variable">x</var><sub><var class="physics-variable">j</var></sub><sup>2</sup></span></span></span><span class="fraction-denominator"><var class="physics-variable">x</var><sub><var class="physics-variable">j</var></sub></span></span></span></span><p>应直接对 xⱼ、L 和 λ 传播不确定度，避免先做小角度近似。</p></div>
        </section>

        <section class="paper-section priority-section">
          <header class="section-title"><span>C</span><div><strong>哪些误差最重要？</strong><small>按实验条件判断优先级</small></div></header>
          <div class="priority-cards">
            <article class="priority-high"><strong>一级优先控制</strong><p>衍射角/条纹位置读数</p><p>零级中心定位</p><p>左右 ±j 级对称读取</p></article>
            <article class="priority-medium"><strong>二级重点关注</strong><p>光栅正入射与调平</p><p>屏距 L 的测量</p><p>刻度或 CCD 像元标定</p></article>
            <article class="priority-conditional"><strong>条件性关注</strong><p>小角近似模型误差</p><p>波长标称值不确定度</p><p>振动、杂散光与空气扰动</p></article>
          </div>
          <p class="priority-note">误差重要性取决于实验几何与仪器精度，应根据灵敏度系数和不确定度预算排序，而不是固定套用同一顺序。</p>
        </section>
      </div>

      <section class="paper-section reduction-section">
        <header class="section-title"><span>D</span><div><strong>减小误差的方法</strong><small>随机误差与系统误差分别处理</small></div></header>
        <div class="reduction-grid">
          <div><h3>随机误差控制</h3><ul><li>多次测量并取平均值</li><li>同时读取左右对称 ±j 级</li><li>用多个级次进行线性拟合</li><li>剔除异常值时说明判据</li></ul></div>
          <div><h3>系统误差控制</h3><ul><li>调平光路并校正正入射</li><li>用图像拟合确定明纹中心</li><li>较大角度使用精确三角关系</li><li>校准屏距、刻度与波长</li></ul></div>
        </div>
      </section>

      <aside class="critical-warning"><strong>重要提示</strong><p>当不满足小角度条件时，不应直接使用 sinθ ≈ tanθ ≈ θ；实验报告必须明确写出采用的精确关系或近似关系。</p></aside>
    </div>
  `,
];

/*
 * 物理量排版遵循科技论文常用规范：变量使用斜体，数学函数、单位、数字和
 * 中文说明保持正体。只匹配本实验实际使用的变量，避免把 CCD、MATLAB、
 * nm、mm 等缩写或单位误判为物理量。
 */
const PHYSICS_SYMBOL_PATTERN = /(θ(?:[ⱼᵢ₀₁₂])?|φ|λ|Δ|δ|ρ|α|β|(?<![A-Za-z])(?:d|b|j|N|W|L|I|R|x|y|w|k|u|n)(?:[ⱼᵢ₀₁₂])?(?![A-Za-z]))/gu;

/**
 * 将原理模块文本节点中的物理变量替换为语义化 <var> 元素。
 * 该函数可重复调用；已排版的 <var> 节点会被跳过，因此章节切换和动态文案
 * 更新后也不会产生嵌套标签。
 */
export function typesetCompetitionTheorySymbols(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      // MathML 已提供正确的变量斜体、分式和上下标，不再做二次文本替换。
      if (node.parentElement?.closest("var, script, style, canvas, math")) return NodeFilter.FILTER_REJECT;
      PHYSICS_SYMBOL_PATTERN.lastIndex = 0;
      return PHYSICS_SYMBOL_PATTERN.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    PHYSICS_SYMBOL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(PHYSICS_SYMBOL_PATTERN)) {
      if (match.index > cursor) fragment.append(text.slice(cursor, match.index));
      const variable = document.createElement("var");
      variable.className = "physics-variable";
      variable.textContent = match[0];
      fragment.append(variable);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    textNode.replaceWith(fragment);
  });
}

const interactionState = {
  gratingMode: "transmission",
  fringeMode: "combined",
};

let interactionsBound = false;
let resizeTimer = 0;

/**
 * 绑定章节内部的两个交互控件。使用事件委托是因为章节 HTML 在启动时才注入，
 * 直接在模块加载阶段查找按钮会得到空节点。
 */
export function initializeCompetitionTheoryInteractions() {
  if (interactionsBound) return;
  const root = document.getElementById("theoryModule");
  if (!root) return;
  typesetCompetitionTheorySymbols(root);
  interactionsBound = true;

  root.addEventListener("click", (event) => {
    const gratingButton = event.target.closest("[data-grating-mode]");
    if (gratingButton) {
      interactionState.gratingMode = gratingButton.dataset.gratingMode;
      updateTabState(root, "[data-grating-mode]", gratingButton);
      updateGratingModeCopy(root);
      renderCompetitionTheoryVisuals(0);
      return;
    }

    const fringeButton = event.target.closest("[data-fringe-mode]");
    if (fringeButton) {
      interactionState.fringeMode = fringeButton.dataset.fringeMode;
      updateTabState(root, "[data-fringe-mode]", fringeButton);
      renderCompetitionTheoryVisuals(2);
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const active = root.querySelector("[data-theory-panel].active");
      renderCompetitionTheoryVisuals(Number(active?.dataset.theoryPanel || 0));
    }, 120);
  });
}

export function renderCompetitionTheoryVisuals(index) {
  // 下一帧执行，确保 display:block 已生效，canvas 能读取真实 CSS 宽度。
  window.requestAnimationFrame(() => {
    if (index === 0) drawGratingConcept();
    if (index === 1) {
      drawPathDifference();
      drawPhaseComparison();
    }
    if (index === 2) drawFringeWidth();
    if (index === 3) {
      drawScreenMethod();
      drawAngleMethod();
      drawFitPlot();
    }
  });
}

function updateTabState(root, selector, selected) {
  root.querySelectorAll(selector).forEach((button) => {
    const active = button === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function updateGratingModeCopy(root) {
  const reflection = interactionState.gratingMode === "reflection";
  const title = root.querySelector("#gratingDiagramTitle");
  const copy = root.querySelector("#gratingModeText");
  if (title) title.textContent = reflection ? "反射光栅结构示意图" : "透射光栅结构示意图";
  if (copy) {
    copy.textContent = reflection
      ? "反射光栅依靠周期刻槽改变反射波的相位并产生分光；入射角不为零时必须使用带符号角的完整光栅方程。"
      : "透射光栅由大量等间距平行狭缝构成；d 决定主极大位置，b 决定单缝包络，N 影响主极大宽度与分辨能力。";
    typesetCompetitionTheorySymbols(copy);
  }
}

function prepareCanvas(id, logicalWidth, logicalHeight) {
  const canvas = document.getElementById(id);
  if (!canvas || canvas.offsetParent === null) return null;
  const cssWidth = Math.max(280, canvas.clientWidth || logicalWidth);
  const cssHeight = cssWidth * logicalHeight / logicalWidth;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return { canvas, ctx, width: cssWidth, height: cssHeight, sx: cssWidth / logicalWidth, sy: cssHeight / logicalHeight };
}

function withLogicalScale(prepared, draw) {
  if (!prepared) return;
  const { ctx, sx, sy } = prepared;
  ctx.save();
  ctx.scale(sx, sy);
  draw(ctx);
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, color = "#171717", width = 3) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 12;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function label(ctx, text, x, y, options = {}) {
  const labelText = String(text);
  const size = (options.size || 24) * 1.22;
  const weight = options.weight || 600;
  const textFont = options.font || '"Microsoft YaHei UI", sans-serif';
  const mathFont = options.mathFont || '"Cambria Math", "Times New Roman", serif';
  const segments = [];
  let cursor = 0;

  PHYSICS_SYMBOL_PATTERN.lastIndex = 0;
  for (const match of labelText.matchAll(PHYSICS_SYMBOL_PATTERN)) {
    if (match.index > cursor) segments.push({ text: labelText.slice(cursor, match.index), variable: false });
    segments.push({ text: match[0], variable: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < labelText.length) segments.push({ text: labelText.slice(cursor), variable: false });
  if (!segments.length) segments.push({ text: labelText, variable: false });

  ctx.save();
  ctx.fillStyle = options.color || "#202020";
  ctx.textBaseline = options.baseline || "middle";
  const setSegmentFont = (variable) => {
    ctx.font = `${variable ? "italic " : ""}${variable ? 500 : weight} ${size}px ${variable ? mathFont : textFont}`;
  };
  const totalWidth = segments.reduce((sum, segment) => {
    setSegmentFont(segment.variable);
    return sum + ctx.measureText(segment.text).width;
  }, 0);
  const align = options.align || "center";
  let drawX = align === "left" ? x : align === "right" ? x - totalWidth : x - totalWidth / 2;
  ctx.textAlign = "left";
  segments.forEach((segment) => {
    setSegmentFont(segment.variable);
    ctx.fillText(segment.text, drawX, y);
    drawX += ctx.measureText(segment.text).width;
  });
  ctx.restore();
}

function drawDimension(ctx, x1, x2, y, text, color = "#c87600") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y - 10); ctx.lineTo(x1, y + 10);
  ctx.moveTo(x2, y - 10); ctx.lineTo(x2, y + 10);
  ctx.moveTo(x1, y); ctx.lineTo(x2, y);
  ctx.stroke();
  drawArrow(ctx, (x1 + x2) / 2, y, x1 + 2, y, color, 2);
  drawArrow(ctx, (x1 + x2) / 2, y, x2 - 2, y, color, 2);
  label(ctx, text, (x1 + x2) / 2, y - 24, { color, size: 23, font: '"Cambria Math", serif' });
}

function drawGratingConcept() {
  const prepared = prepareCanvas("gratingConceptCanvas", 1100, 620);
  withLogicalScale(prepared, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1100, 620);
    if (interactionState.gratingMode === "reflection") {
      drawReflectionGrating(ctx);
    } else {
      drawTransmissionGrating(ctx);
    }
  });
}

function drawTransmissionGrating(ctx) {
  const startX = 185;
  const period = 135;
  const slitWidth = 46;
  ctx.fillStyle = "#59606a";
  for (let index = 0; index < 6; index += 1) {
    const x = startX + index * period;
    ctx.fillRect(x, 165, period - slitWidth, 285);
  }
  ctx.setLineDash([8, 7]);
  ctx.strokeStyle = "#9097a0";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(120, 165); ctx.lineTo(955, 165); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(120, 450); ctx.lineTo(955, 450); ctx.stroke();
  ctx.setLineDash([]);
  drawDimension(ctx, startX + period - slitWidth, startX + period, 122, "b  单缝宽度");
  drawDimension(ctx, startX + period, startX + period * 2, 76, "d  光栅常数");
  drawDimension(ctx, startX, startX + period * 5, 520, "W  有效照明宽度", "#2f6fc2");
  label(ctx, "N 个等间距狭缝", 535, 582, { size: 23, color: "#3d4650" });
  label(ctx, "不透光区域", 226, 308, { size: 20, color: "#ffffff" });
}

function drawReflectionGrating(ctx) {
  ctx.fillStyle = "#d9dde2";
  ctx.strokeStyle = "#373d44";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(160, 430);
  for (let index = 0; index < 12; index += 1) {
    const x = 160 + index * 65;
    ctx.lineTo(x + 42, 380);
    ctx.lineTo(x + 65, 430);
  }
  ctx.lineTo(940, 500); ctx.lineTo(160, 500); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([9, 8]);
  ctx.strokeStyle = "#8f969e";
  ctx.beginPath(); ctx.moveTo(550, 95); ctx.lineTo(550, 420); ctx.stroke();
  ctx.setLineDash([]);
  drawArrow(ctx, 245, 105, 530, 405, "#1e2024", 4);
  drawArrow(ctx, 552, 405, 815, 112, "#1e2024", 4);
  drawArrow(ctx, 552, 405, 880, 205, "#d67b00", 3);
  label(ctx, "入射光", 250, 76, { size: 24 });
  label(ctx, "第 j 级衍射光", 835, 82, { size: 24 });
  label(ctx, "光栅法线", 550, 66, { size: 22, color: "#565e67" });
  // d 标注相邻两个等效齿顶的水平周期；放到右侧无光线区域，避免尺寸线与衍射光相交。
  drawDimension(ctx, 722, 787, 348, "d");
  label(ctx, "周期刻槽表面", 550, 560, { size: 24, color: "#3d4650" });
}

function drawPathDifference() {
  const prepared = prepareCanvas("pathDifferenceCanvas", 900, 700);
  withLogicalScale(prepared, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 900, 700);
    ctx.strokeStyle = "#2c3035"; ctx.lineWidth = 4;
    ctx.fillStyle = "#5f6670";
    ctx.fillRect(265, 165, 30, 150); ctx.fillRect(265, 400, 30, 150);
    label(ctx, "第 n 个狭缝", 278, 344, { size: 25 });
    label(ctx, "第 (n+1) 个狭缝", 280, 592, { size: 25 });
    drawArrow(ctx, 45, 240, 245, 240, "#24272b", 4);
    drawArrow(ctx, 45, 475, 245, 475, "#24272b", 4);
    // 中文说明与波长符号分开定位，保证 λ 与正文基线清楚且不粘连。
    label(ctx, "入射平面波", 132, 190, { size: 25 });
    label(ctx, "λ", 230, 190, { size: 32, color: "#34383d", font: '"Cambria Math", serif' });
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = "#727981"; ctx.lineWidth = 2;
    // 以上狭缝中心为角度顶点；从上狭缝向下方平行光线作垂线。
    // 垂足到下狭缝的投影段长度即 |Δ| = d sinθ。
    ctx.beginPath(); ctx.moveTo(295, 240); ctx.lineTo(760, 240); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(295, 240); ctx.lineTo(362, 454); ctx.stroke();
    ctx.setLineDash([]);
    drawArrow(ctx, 295, 240, 770, 92, "#17191c", 4);
    drawArrow(ctx, 295, 475, 775, 326, "#17191c", 4);
    label(ctx, "衍射方向", 756, 58, { size: 25 });
    // 角度扇形由实际出射光线方向计算，避免固定圆弧被文字底块截断后产生“竖线”失真。
    const diffractionAngle = Math.atan2(92 - 240, 770 - 295);
    ctx.fillStyle = "rgba(224, 128, 0, 0.10)";
    ctx.beginPath();
    ctx.moveTo(295, 240);
    ctx.arc(295, 240, 98, diffractionAngle, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c87600"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(295, 240, 98, diffractionAngle, 0); ctx.stroke();
    // θ 放在两条边界线之间，不覆盖圆弧，也不遮挡衍射光线。
    label(ctx, "θ", 458, 215, { size: 34, color: "#c87600", font: '"Cambria Math", serif' });
    ctx.strokeStyle = "#2f6fc2"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(205, 315); ctx.lineTo(205, 400); ctx.stroke();
    drawArrow(ctx, 205, 357, 205, 318, "#2f6fc2", 2);
    drawArrow(ctx, 205, 357, 205, 397, "#2f6fc2", 2);
    label(ctx, "d", 142, 357, { size: 35, color: "#2f6fc2", font: '"Cambria Math", serif' });
    ctx.strokeStyle = "#d9473f"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(295, 475); ctx.lineTo(362, 454); ctx.stroke();
    // Δ 放在红色投影段下方，避开从上狭缝作出的灰色辅助垂线。
    label(ctx, "Δ", 365, 505, { size: 35, color: "#d9473f", font: '"Cambria Math", serif' });
  });
}

function drawPhaseComparison() {
  const prepared = prepareCanvas("phaseComparisonCanvas", 1400, 300);
  withLogicalScale(prepared, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1400, 300);
    ctx.strokeStyle = "#d7d9dc"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(700, 22); ctx.lineTo(700, 278); ctx.stroke();
    drawWavePair(ctx, 55, 720, 84, false);
    drawWavePair(ctx, 755, 1370, 84, true);
    label(ctx, "非同相：Δ ≠ jλ", 360, 42, { size: 24, color: "#d9473f" });
    label(ctx, "同相：Δ = jλ", 1060, 42, { size: 24, color: "#2f6fc2" });
    label(ctx, "部分相消，合成强度减弱", 360, 253, { size: 22, color: "#4e545b" });
    label(ctx, "相长干涉，形成主极大", 1060, 253, { size: 22, color: "#4e545b" });
  });
}

function drawWavePair(ctx, x1, x2, y, aligned) {
  const colors = ["#e34840", "#2f6fc2"];
  const phases = aligned ? [0, 0] : [0, Math.PI * 0.7];
  for (let row = 0; row < 2; row += 1) {
    ctx.strokeStyle = colors[row]; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = x1; x <= x2; x += 3) {
      const t = (x - x1) / 34;
      const py = y + row * 82 + Math.sin(t + phases[row]) * 18;
      if (x === x1) ctx.moveTo(x, py); else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "#888f97"; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo((x1 + x2) / 2, y - 30); ctx.lineTo((x1 + x2) / 2, y + 112); ctx.stroke();
  ctx.setLineDash([]);
}

function sinc(value) {
  return Math.abs(value) < 1e-12 ? 1 : Math.sin(value) / value;
}

function gratingFactor(alpha, count) {
  const denominator = Math.sin(alpha);
  if (Math.abs(denominator) < 1e-9) return 1;
  const ratio = Math.sin(count * alpha) / (count * denominator);
  return ratio * ratio;
}

function drawFringeWidth() {
  const prepared = prepareCanvas("fringeWidthCanvas", 1500, 720);
  withLogicalScale(prepared, (ctx) => {
    const width = 1500;
    const height = 720;
    const plot = { left: 128, right: 1445, top: 66, bottom: 602 };
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#e1e3e6"; ctx.lineWidth = 1.5;
    for (let index = 0; index <= 5; index += 1) {
      const y = plot.top + (plot.bottom - plot.top) * index / 5;
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      label(ctx, (1 - index / 5).toFixed(1), plot.left - 26, y, { size: 24, color: "#5c6269", align: "right" });
    }
    for (let degree = -40; degree <= 40; degree += 10) {
      const x = plot.left + (degree + 40) / 80 * (plot.right - plot.left);
      ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.bottom); ctx.stroke();
      label(ctx, String(degree), x, plot.bottom + 31, { size: 24, color: "#5c6269" });
    }
    ctx.strokeStyle = "#202327"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(plot.left, plot.top); ctx.lineTo(plot.left, plot.bottom); ctx.lineTo(plot.right, plot.bottom); ctx.stroke();
    // 纵轴标题旋转后与刻度区分离，避免 I/I₀ 挤压到画布左边缘。
    ctx.save();
    ctx.translate(40, (plot.top + plot.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    label(ctx, "归一化光强 I / I₀", 0, 0, { size: 29, color: "#24282d" });
    ctx.restore();
    label(ctx, "衍射角 θ (°)", (plot.left + plot.right) / 2, 681, { size: 29, color: "#24282d" });

    const lambda = 0.65;
    const slit = 2.0;
    const period = 6.0;
    const count = 12;
    const points = 3000;
    const envelopePath = [];
    const gratingPath = [];
    const combinedPath = [];
    for (let index = 0; index <= points; index += 1) {
      const degree = -40 + 80 * index / points;
      const theta = degree * Math.PI / 180;
      const beta = Math.PI * slit * Math.sin(theta) / lambda;
      const alpha = Math.PI * period * Math.sin(theta) / lambda;
      const envelope = sinc(beta) ** 2;
      const grating = gratingFactor(alpha, count);
      const combined = envelope * grating;
      const x = plot.left + index / points * (plot.right - plot.left);
      envelopePath.push([x, plot.bottom - envelope * (plot.bottom - plot.top)]);
      gratingPath.push([x, plot.bottom - grating * (plot.bottom - plot.top)]);
      combinedPath.push([x, plot.bottom - combined * (plot.bottom - plot.top)]);
    }

    if (interactionState.fringeMode !== "grating") {
      drawCurve(ctx, envelopePath, "#e34840", 4, [13, 10]);
    }
    if (interactionState.fringeMode === "grating") {
      drawCurve(ctx, gratingPath, "#1d2227", 2.4);
    } else if (interactionState.fringeMode === "combined") {
      drawCurve(ctx, combinedPath, "#1d2227", 2.6);
    }

    if (interactionState.fringeMode !== "envelope") {
      const halfZero = Math.asin(lambda / (count * period)) * 180 / Math.PI;
      const x1 = plot.left + (40 - halfZero) / 80 * (plot.right - plot.left);
      const x2 = plot.left + (40 + halfZero) / 80 * (plot.right - plot.left);
      drawDoubleArrow(ctx, x1, x2, 438, { base: "Δθ", subscript: "0" }, "#2f62d0");
    }
    const envZero = Math.asin(lambda / slit) * 180 / Math.PI;
    const envX1 = plot.left + (40 - envZero) / 80 * (plot.right - plot.left);
    const envX2 = plot.left + (40 + envZero) / 80 * (plot.right - plot.left);
    if (interactionState.fringeMode !== "grating") {
      ctx.setLineDash([7, 7]); ctx.strokeStyle = "#e34840"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(envX1, plot.bottom); ctx.lineTo(envX1, plot.top + 120); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(envX2, plot.bottom); ctx.lineTo(envX2, plot.top + 120); ctx.stroke();
      ctx.setLineDash([]);
      drawDoubleArrow(ctx, envX1, envX2, 566, { base: "Δθ", subscript: "env" }, "#e34840");
    }
    drawLegend(ctx, interactionState.fringeMode);
  });
}

function drawCurve(ctx, points, color, width, dash = []) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke(); ctx.setLineDash([]);
}

function drawDoubleArrow(ctx, x1, x2, y, annotation, color) {
  drawArrow(ctx, (x1 + x2) / 2, y, x1, y, color, 2);
  drawArrow(ctx, (x1 + x2) / 2, y, x2, y, color, 2);
  drawSubscriptAnnotation(ctx, annotation.base, annotation.subscript, (x1 + x2) / 2, y - 32, color);
}

function drawSubscriptAnnotation(ctx, base, subscript, x, y, color) {
  // 描述性下标 env 使用正体，物理量 Δθ 使用数学斜体，符合科技排版规范。
  const baseSize = 35;
  const subscriptSize = 21;
  const mathFont = '"Cambria Math", "Times New Roman", serif';
  ctx.save();
  ctx.font = `italic 500 ${baseSize}px ${mathFont}`;
  const baseWidth = ctx.measureText(base).width;
  ctx.font = `500 ${subscriptSize}px ${mathFont}`;
  const subscriptWidth = ctx.measureText(subscript).width;
  const totalWidth = baseWidth + subscriptWidth + 2;
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(x - totalWidth / 2 - 8, y - baseSize / 2 - 5, totalWidth + 16, baseSize + 14);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = `italic 500 ${baseSize}px ${mathFont}`;
  const startX = x - totalWidth / 2;
  ctx.fillText(base, startX, y);
  ctx.font = `500 ${subscriptSize}px ${mathFont}`;
  ctx.fillText(subscript, startX + baseWidth + 2, y + 10);
  ctx.restore();
}

function drawLegend(ctx, mode) {
  const x = 1010;
  const y = 86;
  ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.strokeStyle = "#d5d8dc"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, 390, 126, 8); ctx.fill(); ctx.stroke();
  if (mode !== "grating") {
    ctx.strokeStyle = "#e34840"; ctx.lineWidth = 4; ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(x + 26, y + 42); ctx.lineTo(x + 104, y + 42); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, "单缝衍射包络", x + 126, y + 42, { size: 25, align: "left" });
  }
  if (mode !== "envelope") {
    ctx.strokeStyle = "#1d2227"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 26, y + 88); ctx.lineTo(x + 104, y + 88); ctx.stroke();
    label(ctx, mode === "grating" ? "有限多缝干涉" : "光栅总强度", x + 126, y + 88, { size: 25, align: "left" });
  }
}

function drawScreenMethod() {
  const prepared = prepareCanvas("screenMethodCanvas", 1200, 500);
  withLogicalScale(prepared, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1200, 500);
    drawLaser(ctx, 55, 195);
    drawLens(ctx, 300, 245);
    drawGratingStand(ctx, 510, 245);
    ctx.strokeStyle = "#30353a"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(1030, 65); ctx.lineTo(1030, 425); ctx.stroke();
    label(ctx, "CCD 屏幕", 1030, 32, { size: 28 });
    ctx.strokeStyle = "#e53935"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(175, 245); ctx.lineTo(510, 245); ctx.stroke();
    [-2, -1, 0, 1, 2].forEach((order) => {
      const y = 245 - order * 70;
      ctx.strokeStyle = order === 0 ? "#44484d" : "#e53935";
      ctx.lineWidth = order === 0 ? 2 : 2.5;
      ctx.setLineDash(order === 0 ? [8, 7] : []);
      ctx.beginPath(); ctx.moveTo(510, 245); ctx.lineTo(1030, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = order === 0 ? "#222" : "#e53935";
      ctx.beginPath(); ctx.arc(1030, y, order === 0 ? 7 : 8, 0, Math.PI * 2); ctx.fill();
      label(ctx, `j = ${order > 0 ? "+" : ""}${order}`, 1076, y, { size: 24, align: "left", color: order === 0 ? "#222" : "#b62b28" });
    });
    drawDimension(ctx, 510, 1030, 462, "L", "#2f6fc2");
  });
}

function drawLaser(ctx, x, y) {
  ctx.fillStyle = "#262b31";
  ctx.beginPath(); ctx.roundRect(x, y, 120, 68, 12); ctx.fill();
  ctx.fillStyle = "#474e56"; ctx.fillRect(x + 95, y + 17, 42, 34);
  label(ctx, "激光器", x + 60, y - 25, { size: 25 });
}

function drawLens(ctx, x, y) {
  ctx.fillStyle = "rgba(81,169,219,.18)"; ctx.strokeStyle = "#338dbd"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(x, y, 23, 92, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  label(ctx, "准直镜", x, y - 122, { size: 25 });
}

function drawGratingStand(ctx, x, y) {
  ctx.fillStyle = "#d7dadd"; ctx.strokeStyle = "#515860"; ctx.lineWidth = 3;
  ctx.fillRect(x - 14, y - 105, 28, 210); ctx.strokeRect(x - 14, y - 105, 28, 210);
  label(ctx, "光栅", x, y - 134, { size: 25 });
}

function drawAngleMethod() {
  const prepared = prepareCanvas("angleMethodCanvas", 1200, 500);
  withLogicalScale(prepared, (ctx) => {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1200, 500);
    const cx = 570;
    const cy = 258;
    const radius = 190;
    ctx.strokeStyle = "#34393f"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    for (let degree = 0; degree < 360; degree += 5) {
      const angle = degree * Math.PI / 180;
      const inner = degree % 30 === 0 ? radius - 20 : radius - 10;
      ctx.beginPath();
      ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.stroke();
    }
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = "#8c9299"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - radius - 40, cy); ctx.lineTo(cx + radius + 40, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - radius - 35); ctx.lineTo(cx, cy + radius + 35); ctx.stroke();
    ctx.setLineDash([]);
    const left = -140 * Math.PI / 180;
    const right = -40 * Math.PI / 180;
    drawArrow(ctx, cx, cy, cx + 235 * Math.cos(left), cy + 235 * Math.sin(left), "#e53935", 4);
    drawArrow(ctx, cx, cy, cx + 235 * Math.cos(right), cy + 235 * Math.sin(right), "#e53935", 4);
    drawArrow(ctx, cx, cy, cx, cy - 235, "#2f6fc2", 4);
    label(ctx, "φ−j", 360, 78, { size: 31, color: "#b62b28", font: '"Cambria Math", serif' });
    label(ctx, "φ+j", 780, 78, { size: 31, color: "#b62b28", font: '"Cambria Math", serif' });
    label(ctx, "零级方向", cx, 18, { size: 27, color: "#2f6fc2" });
    ctx.fillStyle = "#7a8087"; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
    label(ctx, "左右同级谱线关于零级方向对称", 970, 246, { size: 27, color: "#4d545c" });
    label(ctx, "取两读数角差的一半得到 θⱼ", 970, 298, { size: 27, color: "#4d545c" });
  });
}

function drawFitPlot() {
  const prepared = prepareCanvas("fitPlotCanvas", 900, 480);
  withLogicalScale(prepared, (ctx) => {
    // 为刻度数字和横轴标题保留独立的垂直区域，避免 2、3 等刻度看似标题上标。
    const plot = { left: 120, right: 850, top: 42, bottom: 382 };
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 900, 480);
    ctx.strokeStyle = "#e3e5e7"; ctx.lineWidth = 1.5;
    for (let index = 0; index <= 5; index += 1) {
      const x = plot.left + (plot.right - plot.left) * index / 5;
      const y = plot.bottom - (plot.bottom - plot.top) * index / 5;
      ctx.beginPath(); ctx.moveTo(x, plot.top); ctx.lineTo(x, plot.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      label(ctx, String(index), x, plot.bottom + 27, { size: 22, color: "#5d6268" });
      label(ctx, (index * 0.2).toFixed(1), plot.left - 22, y, { size: 22, color: "#5d6268", align: "right" });
    }
    ctx.strokeStyle = "#2f3338"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(plot.left, plot.top); ctx.lineTo(plot.left, plot.bottom); ctx.lineTo(plot.right, plot.bottom); ctx.stroke();
    ctx.save();
    ctx.translate(34, (plot.top + plot.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    label(ctx, "sinθⱼ", 0, 0, { size: 27, color: "#30343a" });
    ctx.restore();
    // alphabetic 基线让中文标题与斜体物理量 j 共用同一排版基线。
    label(ctx, "衍射级次 j", 470, 466, { size: 29, color: "#30343a", baseline: "alphabetic" });

    ctx.strokeStyle = "#e0443e"; ctx.lineWidth = 3; ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.moveTo(plot.left, plot.bottom); ctx.lineTo(plot.right, plot.top); ctx.stroke();
    ctx.setLineDash([]);
    for (let order = 1; order <= 5; order += 1) {
      const x = plot.left + (plot.right - plot.left) * order / 5;
      const nominal = order / 5;
      const offset = [0, 0.015, -0.01, 0.008, -0.006, 0.004][order];
      const y = plot.bottom - (nominal + offset) * (plot.bottom - plot.top);
      ctx.fillStyle = "#245fc7";
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    label(ctx, "测量点", 674, 92, { size: 23, color: "#245fc7", align: "left" });
    label(ctx, "线性拟合", 674, 132, { size: 23, color: "#d43832", align: "left" });
  });
}
