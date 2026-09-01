/*!
 * voice-agent.js — 光栅衍射交互实验 · 语音控制智能体
 * ---------------------------------------------------------------------------
 * 设计原则：零侵入。不修改 app.js / physics.js，只驱动页面上已有的控件并派发
 * 原生 input / change 事件，由 app.js 原有的 bindControls() 完成全部重绘。
 *
 * 引入方式：在 index.html 的 </body> 前加一行
 *   <script type="module" src="./src/voice-agent.js?v=voice-1"></script>
 *
 * 调试：控制台可直接用 GSVoice.set({ lambdaNm: 532 })、GSVoice.exec("缝数调到120")
 * ---------------------------------------------------------------------------
 */

const CONFIG = {
  wakeWord: "小光",        // 唤醒词
  requireWakeWord: false,  // true = 必须先说唤醒词；演示时建议 false
  lang: "zh-CN",
  rate: 1.02,              // 语速
  pitch: 1.0,
  keepAwake: true,         // 平板演示时阻止息屏
  llmEndpoint: "",         // 可选：你自己的后端代理地址，留空则纯本地规则解析
};

/* ==========================================================================
   1. 参数表 —— 智能体的“动作空间”
   ========================================================================== */

const PARAMS = {
  lambdaNm: {
    label: "波长", symbol: "λ", range: "lambda", number: "lambdaNumber",
    unit: "nm", digits: 0, nudge: 20,
    names: ["波长", "激光波长", "光波长", "光的波长", "lambda", "拉姆达", "兰姆达"],
    // 语音里可能说“微米”，统一折算到 nm
    units: { 纳米: 1, nm: 1, 微米: 1000, um: 1000, μm: 1000 },
  },
  gratingUm: {
    label: "光栅常数", symbol: "d", range: "grating", number: "gratingNumber",
    unit: "μm", digits: 3, nudge: 0.5,
    names: ["光栅常数", "栅距", "光栅间距", "光栅周期", "缝间距"],
    units: { 微米: 1, um: 1, μm: 1, 纳米: 0.001, nm: 0.001, 毫米: 1000, mm: 1000 },
  },
  distanceCm: {
    label: "屏距", symbol: "L", range: "distance", number: "distanceNumber",
    unit: "cm", digits: 1, nudge: 10,
    names: ["屏距", "屏幕距离", "光屏距离", "屏的距离", "接收屏距离", "距离"],
    units: { 厘米: 1, cm: 1, 米: 100, m: 100, 毫米: 0.1, mm: 0.1 },
  },
  slitUm: {
    label: "缝宽", symbol: "b", range: "slit", number: "slitNumber",
    unit: "μm", digits: 1, nudge: 1,
    names: ["缝宽", "狭缝宽度", "单缝宽度", "缝的宽度", "透光宽度"],
    units: { 微米: 1, um: 1, μm: 1, 纳米: 0.001, nm: 0.001, 毫米: 1000, mm: 1000 },
  },
  slitCount: {
    label: "缝数", symbol: "N", range: "slits", number: "slitsNumber",
    unit: "条", digits: 0, nudge: 20,
    names: ["缝数", "缝的数量", "狭缝数", "狭缝数量", "有效缝数", "刻线数"],
    units: {},
  },
  incidenceDeg: {
    label: "入射角", symbol: "θi", range: "incidence", number: "incidenceNumber",
    unit: "°", digits: 1, nudge: 5,
    names: ["入射角", "入射角度", "倾角", "斜入射角度"],
    units: { 度: 1 },
  },
};

/* ==========================================================================
   2. 控制层 —— 驱动 DOM，让 app.js 自己重绘
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function limitsOf(key) {
  const el = $(PARAMS[key].range);
  return el ? { min: Number(el.min), max: Number(el.max) } : { min: -Infinity, max: Infinity };
}

function readParam(key) {
  const el = $(PARAMS[key].range);
  return el ? Number(el.value) : NaN;
}

/** 精确赋值：走 number 输入框的 change 事件，app.js 会立即 renderAll()。 */
function writeParam(key, value) {
  const meta = PARAMS[key];
  const num = $(meta.number);
  if (!num) return null;
  const { min, max } = limitsOf(key);
  const v = clamp(Number(value), min, max);
  num.value = v.toFixed(meta.digits);
  num.dispatchEvent(new Event("change", { bubbles: true }));
  return readParam(key);
}

/** 平滑赋值：走 range 的 input 事件（app.js 用 rAF 节流），演示时观感更好。 */
function rampParam(key, target, ms = 1400) {
  const meta = PARAMS[key];
  const rangeEl = $(meta.range);
  if (!rangeEl) return Promise.resolve();
  const { min, max } = limitsOf(key);
  const from = Number(rangeEl.value);
  const to = clamp(Number(target), min, max);
  if (ms <= 0 || Math.abs(to - from) < 1e-9) { writeParam(key, to); return Promise.resolve(); }

  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      // easeInOutCubic：起步和收尾都慢，参数变化看得清
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      rangeEl.value = String(from + (to - from) * e);
      rangeEl.dispatchEvent(new Event("input", { bubbles: true }));
      if (p < 1) requestAnimationFrame(tick);
      else { writeParam(key, to); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}

const actions = {
  setOrder(j) {
    const btn = document.querySelector(`#orderButtons button[data-order="${j}"]`);
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  },
  setEnvelope(on) {
    const box = $("diffractionToggle");
    if (!box) return false;
    if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event("change", { bubbles: true })); }
    return true;
  },
  setView(v) { $(v === "2d" ? "view2d" : "view3d")?.click(); },
  setModule(m) { document.querySelector(`.module-tabs .tab[data-module="${m}"]`)?.click(); },
  setSlide(i) { document.querySelector(`[data-theory-slide="${i}"]`)?.click(); },
  nextSlide() { $("theoryNext")?.click(); },
  prevSlide() { $("theoryPrev")?.click(); },
  resetParams() { $("resetParams")?.click(); },
  toggleTheme() { $("themeToggle")?.click(); },
  snapshot() {
    const o = {};
    for (const k of Object.keys(PARAMS)) o[k] = readParam(k);
    o.order = Number(document.querySelector("#orderButtons button.active")?.dataset.order ?? 1);
    o.envelope = $("diffractionToggle")?.checked ?? true;
    return o;
  },
};

/* ==========================================================================
   3. 语音输出（TTS）
   ========================================================================== */

const tts = {
  voice: null,
  speaking: false,
  pickVoice() {
    const list = speechSynthesis.getVoices() || [];
    this.voice =
      list.find((v) => /zh[-_]CN/i.test(v.lang) && /Xiaoxiao|Yunxi|Huihui|Tingting/i.test(v.name)) ||
      list.find((v) => /zh[-_]CN/i.test(v.lang)) ||
      list.find((v) => /^zh/i.test(v.lang)) || null;
  },
  say(text) {
    if (!("speechSynthesis" in window) || !text) return Promise.resolve();
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = CONFIG.lang;
      u.rate = CONFIG.rate;
      u.pitch = CONFIG.pitch;
      if (this.voice) u.voice = this.voice;
      const done = () => { this.speaking = false; asr.resume(); resolve(); };
      u.onend = done;
      u.onerror = done;
      this.speaking = true;
      asr.suspend();            // 防止把自己的声音听回去
      speechSynthesis.speak(u);
    });
  },
  stop() { speechSynthesis.cancel(); this.speaking = false; },
};
if ("speechSynthesis" in window) {
  speechSynthesis.addEventListener?.("voiceschanged", () => tts.pickVoice());
  tts.pickVoice();
}

/* ==========================================================================
   4. 中文数字 → 阿拉伯数字
   ========================================================================== */

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 幺: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

function cnSectionToNumber(s) {
  let total = 0, section = 0, digit = 0, seen = false;
  for (const ch of s) {
    if (ch in CN_DIGIT) { digit = CN_DIGIT[ch]; seen = true; continue; }
    if (ch in CN_UNIT) {
      const u = CN_UNIT[ch];
      seen = true;
      if (u === 10000) { total = (total + section + digit) * u; section = 0; }
      else { section += (digit === 0 ? 1 : digit) * u; }
      digit = 0;
      continue;
    }
    return null;
  }
  return seen ? total + section + digit : null;
}

function cnToNumber(s) {
  const neg = /^[负−-]/.test(s);
  s = s.replace(/^[负−-]/, "");
  const [intPart, decPart] = s.split(/[点\.]/);
  const head = intPart ? cnSectionToNumber(intPart) : 0;
  if (head === null) return null;
  let value = head;
  if (decPart) {
    let frac = "";
    for (const ch of decPart) {
      if (!(ch in CN_DIGIT)) return null;
      frac += CN_DIGIT[ch];
    }
    value += Number("0." + frac);
  }
  return neg ? -value : value;
}

/** 口语里的模糊量词，不能当成数字 1 */
const VAGUE = /(一点点|一点|一些|一下|一丢丢|一些些)/g;

/** 在文本中找第一个数字（阿拉伯或中文），返回 { value, unit } */
function extractNumber(text) {
  const arabic = text.match(/[负−-]?\d+(?:\.\d+)?/);
  const chinese = text.match(/[负−-]?[零〇一幺二两三四五六七八九十百千万]+(?:[点][零〇一二两三四五六七八九]+)?/);
  let value = null, at = Infinity, end = 0;
  if (arabic && arabic.index < at) {
    value = Number(arabic[0].replace(/[−]/, "-"));
    at = arabic.index; end = at + arabic[0].length;
  }
  if (chinese && chinese.index < at) {
    const v = cnToNumber(chinese[0]);
    if (v !== null) { value = v; at = chinese.index; end = at + chinese[0].length; }
  }
  if (value === null) return null;

  const tail = text.slice(end);
  const unitHit = tail.match(/^(纳米|微米|毫米|厘米|米|度|条|nm|um|μm|mm|cm|m)/i);
  const unit = unitHit ? unitHit[1] : null;

  // “一米八”“两米五”这类口语：单位后面还跟着一位数，按十分位处理
  if (unit === "米" || unit === "厘米") {
    const sub = tail.slice(unitHit[0].length).match(/^([零〇一二两三四五六七八九]|\d)(?![\d零〇一二两三四五六七八九十百千万])/);
    if (sub) {
      const d = /\d/.test(sub[1]) ? Number(sub[1]) : CN_DIGIT[sub[1]];
      if (Number.isFinite(d)) value += (value < 0 ? -d : d) / 10;
    }
  }
  return { value, unit };
}

/* ==========================================================================
   5. 意图解析（本地规则优先，可选 LLM 兜底）
   ========================================================================== */

const PRESETS = {
  红光: 650, 红色: 650, 红: 650,
  橙光: 610, 黄光: 580, 黄色: 580,
  绿光: 532, 绿色: 532, 绿: 532,
  青光: 490, 蓝光: 450, 蓝色: 450, 蓝: 450,
  紫光: 410, 紫色: 410, 紫: 410,
};

const UP = /(调大|增大|加大|放大|提高|增加|变大|大一点|大一些|往上|升高|再大)/;
const DOWN = /(调小|减小|缩小|降低|减少|变小|小一点|小一些|往下|降下|再小)/;

function normalize(text) {
  return String(text)
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，。！？、；：""''\s]/g, "")
    .toLowerCase();
}

function matchParam(text) {
  let best = null;
  for (const [key, meta] of Object.entries(PARAMS)) {
    for (const name of meta.names) {
      const i = text.indexOf(name.toLowerCase());
      if (i >= 0 && (!best || name.length > best.name.length)) best = { key, name, index: i };
    }
  }
  return best;
}

/** 把口语转成一条结构化指令 */
function parse(raw) {
  const t = normalize(raw);
  if (!t) return null;

  // —— 全局动作 ——
  if (/(停止|停下|别说了|安静|闭嘴)/.test(t)) return { type: "stop" };
  if (/(自动演示|开始演示|自动讲解|演示一遍|自动播放|完整演示)/.test(t)) return { type: "demo" };
  if (/(重置|复位|恢复默认|初始状态|回到默认)/.test(t)) return { type: "reset" };
  if (/(2d|二维|俯视)/.test(t) && /(视图|切换|看|显示)/.test(t)) return { type: "view", value: "2d" };
  if (/(3d|三维|立体)/.test(t) && /(视图|切换|看|显示)/.test(t)) return { type: "view", value: "3d" };
  if (/(原理|讲解|理论)/.test(t) && !/关闭/.test(t)) {
    const p = extractNumber(t);
    return { type: "theory", slide: p && p.value >= 1 && p.value <= 5 ? p.value - 1 : null };
  }
  if (/(实验|操作)(界面|模块|页面|部分)|回到实验/.test(t)) return { type: "module", value: "operation" };
  if (/下一页|下一张/.test(t)) return { type: "slide", dir: 1 };
  if (/上一页|上一张/.test(t)) return { type: "slide", dir: -1 };
  if (/(关闭|取消|不要|去掉).{0,4}(包络|衍射)/.test(t)) return { type: "envelope", value: false };
  if (/(打开|开启|加上|考虑).{0,4}(包络|衍射)/.test(t)) return { type: "envelope", value: true };
  if (/(现在|当前|报一下|读一下|什么状态|参数是多少)/.test(t)) return { type: "report" };
  if (/(帮助|能做什么|怎么用|支持哪些|说什么)/.test(t)) return { type: "help" };
  if (/(浅色|深色|换个主题|切换主题)/.test(t)) return { type: "theme" };

  // —— 级次 ——
  const orderHit = t.match(/([负−-]?[零〇一二两三四五六七八九\d]+)\s*级/);
  if (orderHit && /(级次|级|切到|选择|看|切换|观察)/.test(t)) {
    const v = extractNumber(orderHit[1]);
    if (v) return { type: "order", value: Math.round(v.value) };
  }

  // —— 颜色预设 ——
  for (const [word, nm] of Object.entries(PRESETS)) {
    if (t.includes(word.toLowerCase()) && /(换|改|切|调|用|变成|设为|设置)/.test(t)) {
      return { type: "set", key: "lambdaNm", value: nm, preset: word };
    }
  }

  // —— 参数设定 / 微调 ——
  const hit = matchParam(t);
  if (hit) {
    const meta = PARAMS[hit.key];
    const clean = t.replace(VAGUE, "");           // “调大一点”里的“一”不是数值
    const pos = clean.indexOf(hit.name.toLowerCase());
    const after = pos >= 0 ? clean.slice(pos + hit.name.length) : clean;
    const num = extractNumber(after) || extractNumber(clean);
    if (UP.test(clean) && !num) return { type: "nudge", key: hit.key, delta: meta.nudge };
    if (DOWN.test(clean) && !num) return { type: "nudge", key: hit.key, delta: -meta.nudge };
    if (num) {
      if (UP.test(clean) || DOWN.test(clean)) {
        const sign = DOWN.test(clean) ? -1 : 1;
        // “波长增加50纳米” → 相对；“波长调到650” → 绝对
        if (/(增加|减少|加|减)(?!到)/.test(clean) && !/(到|为|设|成)/.test(clean)) {
          return { type: "nudge", key: hit.key, delta: sign * convert(meta, num) };
        }
      }
      return { type: "set", key: hit.key, value: convert(meta, num) };
    }
    return { type: "query", key: hit.key };
  }

  return null;
}

function convert(meta, num) {
  if (!num.unit) return num.value;
  const factor = meta.units[num.unit] ?? meta.units[num.unit.toLowerCase()] ?? 1;
  return num.value * factor;
}

/* ==========================================================================
   6. 指令执行
   ========================================================================== */

const HELP_TEXT =
  "你可以对我说：把波长调到五百三十二纳米、光栅常数改成二点五微米、缝数调到一百二十、" +
  "屏距调大一点、看二级衍射、关闭衍射包络、切到二维视图、打开原理讲解第三页、重置参数，" +
  "或者直接说“开始自动演示”。";

async function execute(cmd) {
  if (!cmd) { await tts.say("这句我没听懂，可以说“帮助”看看支持哪些指令。"); return; }

  switch (cmd.type) {
    case "stop":
      demo.abort(); tts.stop();
      return;

    case "demo":
      await demo.run();
      return;

    case "reset":
      actions.resetParams();
      await tts.say("参数已经回到初始状态。");
      return;

    case "help":
      await tts.say(HELP_TEXT);
      return;

    case "theme":
      actions.toggleTheme();
      return;

    case "view":
      actions.setView(cmd.value);
      await tts.say(cmd.value === "2d" ? "已切换到二维俯视光路。" : "已切换到三维视图。");
      return;

    case "module":
      actions.setModule("operation");
      await tts.say("回到实验操作界面。");
      return;

    case "theory":
      actions.setModule("theory");
      if (cmd.slide !== null && cmd.slide !== undefined) actions.setSlide(cmd.slide);
      await tts.say("打开原理讲解。");
      return;

    case "slide":
      cmd.dir > 0 ? actions.nextSlide() : actions.prevSlide();
      return;

    case "envelope":
      actions.setEnvelope(cmd.value);
      await tts.say(cmd.value
        ? "已打开单缝衍射包络，光强里包含 sinc 平方因子。"
        : "已关闭单缝包络，现在只看多缝干涉的结果。");
      return;

    case "order": {
      const ok = actions.setOrder(cmd.value);
      await tts.say(ok
        ? `已选中第 ${cmd.value} 级主极大。`
        : `当前参数下第 ${cmd.value} 级没有实衍射角，可以增大光栅常数或者减小波长。`);
      return;
    }

    case "query": {
      const meta = PARAMS[cmd.key];
      await tts.say(`当前${meta.label}是 ${readParam(cmd.key).toFixed(meta.digits)} ${meta.unit}。`);
      return;
    }

    case "report": {
      const s = actions.snapshot();
      await tts.say(
        `当前波长 ${s.lambdaNm.toFixed(0)} 纳米，光栅常数 ${s.gratingUm.toFixed(3)} 微米，` +
        `屏距 ${s.distanceCm.toFixed(0)} 厘米，缝宽 ${s.slitUm.toFixed(1)} 微米，` +
        `缝数 ${s.slitCount.toFixed(0)}，观察第 ${s.order} 级。`);
      return;
    }

    case "nudge": {
      const meta = PARAMS[cmd.key];
      const target = readParam(cmd.key) + cmd.delta;
      await rampParam(cmd.key, target, 700);
      const now = readParam(cmd.key);
      await tts.say(`${meta.label}调到 ${now.toFixed(meta.digits)} ${meta.unit}。`);
      return;
    }

    case "set": {
      const meta = PARAMS[cmd.key];
      const { min, max } = limitsOf(cmd.key);
      const wanted = cmd.value;
      await rampParam(cmd.key, wanted, 900);
      const now = readParam(cmd.key);
      if (wanted < min || wanted > max) {
        await tts.say(`${meta.label}的可调范围是 ${min} 到 ${max} ${meta.unit}，已经设到最接近的 ${now.toFixed(meta.digits)}。`);
      } else {
        await tts.say(`${meta.label}设为 ${now.toFixed(meta.digits)} ${meta.unit}。`);
      }
      return;
    }

    default:
      await tts.say("这句我没听懂。");
  }
}

/* ==========================================================================
   7. 自动演示脚本
   ========================================================================== */

const DEMO_SCRIPT = [
  {
    say: "下面演示光栅衍射实验。先把装置恢复到初始状态：波长 650 纳米的红光，光栅常数 5 微米，缝宽 2 微米，40 条缝，屏距 1 米。",
    set: { lambdaNm: 650, gratingUm: 5, slitUm: 2, slitCount: 40, distanceCm: 100, incidenceDeg: 0 },
    order: 1, envelope: true, view: "3d", ramp: 900, hold: 600,
  },
  {
    say: "第一组对照，只改变波长。红光换成 450 纳米的蓝光，注意屏上各级主极大向中央靠拢。",
    set: { lambdaNm: 450 }, ramp: 2600, hold: 1200,
  },
  {
    say: "这验证了光栅方程：d 乘以 sin θ 等于 j 乘以 λ。波长变小，衍射角就变小。",
    hold: 400,
  },
  {
    say: "波长回到红光，改变光栅常数。把 d 从 5 微米减小到 3 微米，屏上相邻主极大向外展开。",
    set: { lambdaNm: 650 }, ramp: 1400, hold: 300,
    then: { set: { gratingUm: 3 }, ramp: 2600, hold: 1200 },
  },
  {
    say: "接下来看缝数 N 的作用。先减到 4 条缝，主极大又宽又糊。",
    set: { gratingUm: 5, slitCount: 4 }, ramp: 2000, hold: 1200,
  },
  {
    say: "把缝数加到 150 条，主极大明显变窄，能量更集中。理想光栅的分辨本领满足 R 等于 j 乘以 N，因此 N 越大，分辨本领越高。",
    set: { slitCount: 150 }, ramp: 2800, hold: 1400,
  },
  {
    say: "再看缝宽 b 的作用。把缝宽从 2 微米加大到 2.5 微米，此时 b 比 d 等于二分之一，单缝包络收窄，偶数级主极大与单缝暗纹重合而缺级。",
    set: { slitUm: 2.5 }, ramp: 2600, hold: 1400,
  },
  {
    say: "关闭单缝包络做个对照，此时只剩多缝干涉，各级主极大亮度就变得均匀了。",
    envelope: false, hold: 1600,
  },
  {
    say: "重新打开包络。最后改变屏距，把光屏从 1 米推到 1 米 8，条纹整体在屏上展宽，但衍射角本身没有变。",
    envelope: true, set: { distanceCm: 180 }, ramp: 2600, hold: 1400,
  },
  {
    say: "切换到二维俯视视图，可以更清楚地看到各级衍射光的空间分布。",
    view: "2d", hold: 2200,
  },
  {
    say: "演示结束，参数恢复初始值。归纳一下：d 决定主极大的角位置，N 决定主极大的锐度，b 决定单缝包络和缺级。",
    view: "3d",
    set: { lambdaNm: 650, gratingUm: 5, slitUm: 2, slitCount: 40, distanceCm: 100 },
    order: 1, ramp: 1600,
  },
];

const demo = {
  running: false,
  cancelled: false,
  abort() { this.cancelled = true; },
  async run(script = DEMO_SCRIPT) {
    if (this.running) { this.abort(); return; }
    this.running = true;
    this.cancelled = false;
    ui.setStatus("自动演示中");
    for (const scene of script) {
      if (this.cancelled) break;
      await this.play(scene);
    }
    this.running = false;
    ui.setStatus(asr.listening ? "聆听中" : "待命");
    if (!this.cancelled) await tts.say("演示完成。需要单独调整某个参数，直接说出来就可以。");
    this.cancelled = false;
  },
  async play(scene) {
    if (!scene) return;
    if (scene.view) actions.setView(scene.view);
    if (scene.envelope !== undefined) actions.setEnvelope(scene.envelope);
    if (scene.order !== undefined) actions.setOrder(scene.order);

    const narrate = scene.say ? tts.say(scene.say) : Promise.resolve();
    const moves = Object.entries(scene.set || {}).map(([k, v]) => rampParam(k, v, scene.ramp ?? 1400));
    await Promise.all([narrate, ...moves]);
    if (this.cancelled) return;
    if (scene.hold) await sleep(scene.hold);
    if (scene.then) await this.play(scene.then);
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==========================================================================
   8. 语音识别（ASR）
   ========================================================================== */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const asr = {
  rec: null,
  listening: false,
  suspended: false,
  supported: Boolean(SR),

  async requestMicrophone() {
    if (!window.isSecureContext) {
      ui.setStatus("需要安全连接");
      ui.setHeard("麦克风只能在 HTTPS 或 127.0.0.1 本地地址中使用。", false);
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      ui.setStatus("请求麦克风权限");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 权限确认后立即释放测试音轨，正式采集由 SpeechRecognition 接管。
      stream.getTracks().forEach((track) => track.stop());
      ui.setHeard("麦克风已接入，请开始说话。", false);
      return true;
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      ui.setStatus(denied ? "麦克风被拒绝" : "麦克风不可用");
      ui.setHeard(denied
        ? "请允许此网页使用麦克风，然后再次点击语音控制。"
        : "没有检测到可用麦克风，或麦克风正被其他程序占用。", false);
      ui.setActive(false);
      return false;
    }
  },

  init() {
    if (!this.supported) return;
    const rec = new SR();
    rec.lang = CONFIG.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => ui.setStatus("聆听中");
    rec.onaudiostart = () => ui.setStatus("麦克风已接入");
    rec.onspeechstart = () => ui.setStatus("正在识别");
    rec.onspeechend = () => ui.setStatus("处理中");

    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) ui.setHeard(interim, true);
      if (final) this.handle(final.trim());
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.listening = false;
        ui.setStatus("麦克风被拒绝");
        ui.setHeard("请在浏览器地址栏允许麦克风权限，并确认页面是 https 访问。");
      } else if (e.error === "network") {
        this.listening = false;
        ui.setStatus("识别服务未连接");
        ui.setHeard("在线语音识别连接失败，请检查网络；仍可使用下方快捷按钮。", false);
      } else if (e.error === "audio-capture") {
        this.listening = false;
        ui.setStatus("麦克风不可用");
        ui.setHeard("没有检测到可用麦克风，或麦克风正被其他程序占用。", false);
      } else if (e.error === "no-speech") {
        ui.setStatus("未检测到语音");
        ui.setHeard("没有听到清晰语音，请靠近麦克风后再说一次。", false);
      } else if (e.error !== "aborted") {
        this.listening = false;
        ui.setStatus("识别失败");
        ui.setHeard(`语音识别发生错误：${e.error || "未知错误"}。`, false);
      }
      if (!this.listening) {
        ui.setActive(false);
        wakeLock.release();
      }
    };

    rec.onend = () => {
      // 连续模式下浏览器会自动断开，这里自动续上
      if (this.listening && !this.suspended) {
        try { rec.start(); } catch (_) { /* 已在运行 */ }
      }
    };

    this.rec = rec;
  },

  handle(text) {
    ui.setHeard(text, false);
    if (tts.speaking) return;

    let payload = text;
    if (CONFIG.requireWakeWord) {
      const idx = text.indexOf(CONFIG.wakeWord);
      if (idx < 0) return;
      payload = text.slice(idx + CONFIG.wakeWord.length);
    }

    const cmd = parse(payload);
    if (!cmd && CONFIG.llmEndpoint) { this.viaLLM(payload); return; }
    ui.setParsed(cmd);
    execute(cmd);
  },

  /**
   * 可选的大模型兜底。注意：静态站点里绝对不要写 API Key，
   * 必须由你自己的后端（Cloudflare Worker / Vercel Function）转发。
   * 后端应当只返回形如 {"type":"set","key":"lambdaNm","value":532} 的 JSON。
   */
  async viaLLM(text) {
    try {
      ui.setStatus("理解中");
      const res = await fetch(CONFIG.llmEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterance: text, state: actions.snapshot(), schema: Object.keys(PARAMS) }),
      });
      const cmd = await res.json();
      ui.setParsed(cmd);
      await execute(cmd);
    } catch (err) {
      await execute(null);
    } finally {
      ui.setStatus(this.listening ? "聆听中" : "待命");
    }
  },

  async start() {
    if (!this.supported) { ui.setHeard("当前浏览器不支持语音识别，请用 Chrome 或 Edge 打开。"); return; }
    if (!this.rec) this.init();
    if (!(await this.requestMicrophone())) return;
    this.listening = true;
    this.suspended = false;
    try { this.rec.start(); } catch (_) { /* 已在运行 */ }
    ui.setStatus("聆听中");
    ui.setActive(true);
    wakeLock.acquire();
  },

  stop() {
    this.listening = false;
    try { this.rec?.stop(); } catch (_) {}
    ui.setStatus("待命");
    ui.setActive(false);
    wakeLock.release();
  },

  suspend() {
    if (!this.listening) return;
    this.suspended = true;
    try { this.rec?.stop(); } catch (_) {}
  },

  resume() {
    if (!this.listening) return;
    this.suspended = false;
    try { this.rec?.start(); } catch (_) {}
  },

  toggle() { this.listening ? this.stop() : void this.start(); },
};

/* 平板演示时防止息屏 */
const wakeLock = {
  sentinel: null,
  async acquire() {
    if (!CONFIG.keepAwake || !("wakeLock" in navigator)) return;
    try { this.sentinel = await navigator.wakeLock.request("screen"); } catch (_) {}
  },
  release() { try { this.sentinel?.release(); } catch (_) {} this.sentinel = null; },
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && asr.listening) wakeLock.acquire();
});

/* ==========================================================================
   9. 悬浮控制面板（沿用主站的暗色 CAD 视觉）
   ========================================================================== */

const QUICK = [
  ["换成绿光", "把波长调到532纳米"],
  ["光栅常数 2 μm", "光栅常数调到2微米"],
  ["缝数 150", "缝数调到150"],
  ["看二级", "切到二级"],
  ["关闭包络", "关闭衍射包络"],
  ["自动演示", "开始自动演示"],
  ["重置", "重置参数"],
];

const ui = {
  root: null, mic: null, statusEl: null, heardEl: null, parsedEl: null,

  mount() {
    const style = document.createElement("style");
    style.textContent = `
      .gsv { position: fixed; right: 18px; bottom: 18px; z-index: 9999;
             font-family: var(--font, "PingFang SC", sans-serif); color: var(--text, #eef6ff); }
      .gsv[data-docked="1"] { position: relative; right: auto; bottom: auto; z-index: 4;
             order: 2; width: 100%; min-width: 0; }
      .gsv-mic { display: flex; align-items: center; gap: 10px; min-height: 52px;
             padding: 0 20px; border: 1px solid var(--border, rgba(176,196,216,.22));
             border-radius: 26px; background: var(--panel-strong, rgba(18,29,39,.88));
             backdrop-filter: blur(14px); box-shadow: var(--shadow, 0 22px 70px rgba(0,0,0,.38));
             font-size: 15px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .gsv[data-docked="1"] .gsv-mic { width: 100%; min-height: 56px; justify-content: center;
             border-radius: var(--radius, 8px); box-shadow: none; font-size: 17px; font-weight: 700; }
      .gsv-mic:focus-visible { outline: 2px solid var(--accent, #6fa8ff); outline-offset: 3px; }
      .gsv-label { color: var(--text, #eef6ff); }
      .gsv-separator { color: var(--subtle, #708294); }
      .gsv-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--subtle, #708294); }
      .gsv[data-active="1"] .gsv-dot { background: var(--laser, #ff334c); animation: gsv-pulse 1.5s infinite; }
      @keyframes gsv-pulse { 0%,100% { opacity: 1 } 50% { opacity: .28 } }
      @media (prefers-reduced-motion: reduce) { .gsv[data-active="1"] .gsv-dot { animation: none } }
      .gsv-panel { width: min(360px, calc(100vw - 36px)); margin-bottom: 10px; padding: 14px 16px;
             border: 1px solid var(--border, rgba(176,196,216,.22)); border-radius: 14px;
             background: var(--panel-strong, rgba(18,29,39,.88)); backdrop-filter: blur(14px);
             box-shadow: var(--shadow, 0 22px 70px rgba(0,0,0,.38)); }
      .gsv[data-docked="1"] .gsv-panel { box-sizing: border-box; width: 100%; border-radius: var(--radius, 8px);
             box-shadow: none; }
      .gsv-panel[hidden] { display: none; }
      .gsv-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
             margin-bottom: 10px; font-size: 17px; font-weight: 700; }
      .gsv-close { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%;
             background: transparent; color: var(--muted, #9cadbf); font: 24px/1 inherit; cursor: pointer; }
      .gsv-close:hover, .gsv-close:focus-visible { color: var(--text, #eef6ff); background: rgba(255,255,255,.08); }
      .gsv-heard { min-height: 42px; font-size: 15px; line-height: 1.5; }
      .gsv-heard.interim { color: var(--muted, #9cadbf); }
      .gsv-parsed { margin-top: 6px; font-family: var(--font-number, monospace);
             font-size: 12px; color: var(--accent-2, #70d7ef); }
      .gsv-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px;
             padding-top: 12px; border-top: 1px solid var(--border-soft, rgba(176,196,216,.12)); }
      .gsv-chips button { min-height: 34px; padding: 0 12px; border: 1px solid var(--border-soft, rgba(176,196,216,.12));
             border-radius: 17px; background: var(--surface, rgba(255,255,255,.065));
             color: var(--muted, #9cadbf); font-size: 13px; font-family: inherit; cursor: pointer; }
      .gsv-chips button:active { background: var(--accent, #6fa8ff); color: #06121f; }
      body.theory-mode .gsv-panel, body.theory-mode .gsv-mic { background: #ffffff; color: #18191b; border-color: #d9dadd; }
      body.theory-mode .gsv-label { color: #18191b; }
      body.theory-mode .gsv-chips button { color: #4a4d52; }
      @media (max-width: 760px) {
        .gsv { right: 12px; bottom: 12px; }
        .gsv-panel { width: min(360px, calc(100vw - 24px)); }
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.className = "gsv";
    root.dataset.active = "0";
    root.innerHTML = `
      <div id="gsvPanel" class="gsv-panel" hidden>
        <div class="gsv-panel-head"><span>语音控制智能体</span><button class="gsv-close" type="button" aria-label="关闭语音控制面板">×</button></div>
        <div class="gsv-heard">点一下麦克风，然后直接说出要改的参数。</div>
        <div class="gsv-parsed"></div>
        <div class="gsv-chips">${QUICK.map(([label, cmd]) =>
          `<button type="button" data-cmd="${cmd}">${label}</button>`).join("")}</div>
      </div>
      <button class="gsv-mic" type="button" aria-live="polite" aria-controls="gsvPanel" aria-expanded="false">
        <span class="gsv-dot"></span><span class="gsv-label">语音控制</span><span class="gsv-separator">·</span><span class="gsv-status">待命</span>
      </button>`;
    document.body.appendChild(root);

    this.root = root;
    this.panel = root.querySelector(".gsv-panel");
    this.mic = root.querySelector(".gsv-mic");
    this.statusEl = root.querySelector(".gsv-status");
    this.heardEl = root.querySelector(".gsv-heard");
    this.parsedEl = root.querySelector(".gsv-parsed");

    const placePanel = () => {
      const rail = document.querySelector(".right-rail");
      const docked = window.matchMedia("(min-width: 761px)").matches && !document.body.classList.contains("theory-mode") && rail;
      document.querySelectorAll(".right-rail.voice-agent-ready").forEach((node) => node.classList.remove("voice-agent-ready"));
      if (docked) {
        root.dataset.docked = "1";
        rail.classList.add("voice-agent-ready");
        rail.insertBefore(root, rail.querySelector(".student-lab-panel"));
      } else {
        root.dataset.docked = "0";
        document.body.appendChild(root);
      }
    };
    placePanel();
    window.addEventListener("resize", placePanel, { passive: true });
    new MutationObserver(placePanel).observe(document.body, { attributes: true, attributeFilter: ["class"] });

    this.mic.addEventListener("click", () => {
      this.panel.hidden = false;
      this.mic.setAttribute("aria-expanded", "true");
      asr.toggle();
    });
    root.querySelector(".gsv-close").addEventListener("click", () => {
      asr.stop();
      this.panel.hidden = true;
      this.mic.setAttribute("aria-expanded", "false");
      this.mic.focus();
    });
    root.querySelectorAll(".gsv-chips button").forEach((b) => {
      b.addEventListener("click", () => {
        this.panel.hidden = false;
        this.setHeard(b.dataset.cmd, false);
        const cmd = parse(b.dataset.cmd);
        this.setParsed(cmd);
        execute(cmd);
      });
    });
  },

  setStatus(text) { if (this.statusEl) this.statusEl.textContent = text; },
  setActive(on) { if (this.root) this.root.dataset.active = on ? "1" : "0"; },
  setHeard(text, interim) {
    if (!this.heardEl) return;
    this.heardEl.textContent = text;
    this.heardEl.classList.toggle("interim", Boolean(interim));
    if (!interim) this.parsedEl.textContent = "";
  },
  setParsed(cmd) {
    if (!this.parsedEl) return;
    this.parsedEl.textContent = cmd ? JSON.stringify(cmd) : "未匹配到指令";
  },
};

/* ==========================================================================
   10. 启动 + 对外 API
   ========================================================================== */

function boot() {
  if (!$("lambda")) return;   // 不在主实验页则不挂载
  ui.mount();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.GSVoice = {
  config: CONFIG,
  params: PARAMS,
  start: () => asr.start(),
  stop: () => asr.stop(),
  say: (t) => tts.say(t),
  exec: (text) => execute(parse(text)),
  parse,
  set: (obj) => Object.entries(obj).forEach(([k, v]) => writeParam(k, v)),
  ramp: rampParam,
  read: () => actions.snapshot(),
  demo,
  actions,
};

export { CONFIG, PARAMS, parse, execute, demo, actions, rampParam, writeParam };
