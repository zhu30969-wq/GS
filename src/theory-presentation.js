import { renderCompetitionTheoryVisuals } from "./theory-competition.js?v=theory-screen-20261019";

const chapters = [];
let activeChapter = -1;
let activeSection = 0;
let changeChapter;
let sectionNav;
let status;
let condition;
let summary;
let frameRequest = 0;

function makeScreen(title, kind, nodes) {
  const screen = document.createElement("section");
  screen.className = `theory-screen screen-${kind}`;
  screen.dataset.screenTitle = title;
  screen.setAttribute("role", "tabpanel");
  screen.hidden = true;
  screen.append(...nodes.filter(Boolean));
  return screen;
}

function splitSymbols(section) {
  const second = section.cloneNode(true);
  const firstRows = [...section.querySelectorAll("tbody tr")];
  section.querySelector("tbody").replaceChildren(...firstRows.slice(0, 4));
  second.querySelector("tbody").replaceChildren(...firstRows.slice(4));
  return [section, second];
}

export function initializeTheoryPresentation(onChapterChange) {
  changeChapter = onChapterChange;
  condition = document.querySelector("#theoryModule .theory-note");
  summary = document.querySelector("#theoryModule .theory-summary");

  document.querySelectorAll("#theoryModule .competition-page").forEach((page, index) => {
    const find = (selector) => page.querySelector(selector);
    let screens;
    if (index === 0) {
      const symbols = splitSymbols(find(".symbol-section"));
      screens = [
        makeScreen("光栅结构", "structure", [find(".concept-mode-bar"), find(".diagram-section")]),
        makeScreen("结构参数", "symbols", [symbols[0]]),
        makeScreen("缝数与级次", "symbols", [symbols[1]]),
        makeScreen("定义与结论", "reading", [find(".chapter-lead"), find(".teaching-callout")]),
      ];
    } else if (index === 1) {
      const steps = find(".principle-steps");
      const secondSteps = steps.cloneNode(false);
      secondSteps.append(...[...steps.children].slice(2));
      screens = [
        makeScreen("光程差模型", "path", [find(".path-section")]),
        makeScreen("次波与光程差", "principles", [steps]),
        makeScreen("主极大条件", "principles", [secondSteps]),
        makeScreen("相位对比", "phase", [find(".phase-section"), find(".core-conclusion")]),
      ];
    } else if (index === 2) {
      const model = document.createElement("section");
      model.className = "paper-section intensity-model";
      const heading = document.createElement("h3");
      heading.textContent = "有限多缝光栅的光强模型";
      model.append(heading, find(".figure-caption"));
      screens = [
        makeScreen("光强分布", "intensity", [find(".width-mode-bar"), find(".intensity-figure-section")]),
        makeScreen("光强公式", "model", [model]),
        makeScreen("主极大宽度", "formulas", [find(".formula-card-blue")]),
        makeScreen("单缝包络", "formulas", [find(".formula-card-red")]),
      ];
    } else if (index === 3) {
      const methods = [...page.querySelectorAll(".measurement-method")];
      const fitSteps = find(".fit-steps");
      screens = [
        makeScreen("屏幕位置法", "measurement", [methods[0]]),
        makeScreen("分光计测角", "measurement", [methods[1]]),
        makeScreen("多级拟合", "fit", [find(".fitting-section")]),
        makeScreen("拟合步骤", "fit-steps", [fitSteps]),
      ];
    } else {
      const geometry = find(".exact-geometry-note");
      const assumptions = document.createElement("section");
      assumptions.className = "paper-section uncertainty-assumptions";
      const heading = document.createElement("h3");
      heading.textContent = "不确定度传播的前提";
      assumptions.append(heading, find(".uncertainty-layout > ul"));
      const priorityNote = find(".priority-note");
      const warning = find(".critical-warning");
      const origin = find(".error-origin");
      const secondOrigin = origin.cloneNode(false);
      const flow = origin.querySelector(".error-flow");
      const secondFlow = flow.cloneNode(false);
      const sources = [...flow.querySelectorAll("article")];
      flow.replaceChildren(...sources.slice(0, 3));
      secondFlow.append(...sources.slice(3));
      secondOrigin.append(origin.querySelector(".section-title").cloneNode(true), secondFlow, origin.querySelector(".error-origin-summary"));
      screens = [
        makeScreen("测量与装调", "origin", [origin]),
        makeScreen("模型与环境", "origin", [secondOrigin]),
        makeScreen("不确定度", "uncertainty", [find(".uncertainty-section")]),
        makeScreen("传播前提", "assumptions", [assumptions]),
        makeScreen("屏幕法传播", "geometry", [geometry]),
        makeScreen("控制优先级", "priority", [find(".priority-section")]),
        makeScreen("改进方法", "reduction", [find(".reduction-section")]),
        makeScreen("评估与报告", "reading", [priorityNote, warning]),
      ];
    }
    screens.push(makeScreen("条件与要点", "conditions", [find(".chapter-lead")]));
    screens.forEach((screen, section) => {
      screen.id = `theory-screen-${index}-${section}`;
      screen.querySelectorAll("canvas").forEach((canvas) => {
        const frame = document.createElement("div");
        frame.className = "theory-canvas-frame";
        frame.dataset.ratio = String(canvas.width / canvas.height);
        canvas.before(frame);
        frame.append(canvas);
      });
    });
    page.replaceChildren(...screens);
    chapters.push(screens);
  });

  sectionNav = document.createElement("nav");
  sectionNav.className = "theory-sections";
  sectionNav.setAttribute("role", "tablist");
  sectionNav.setAttribute("aria-label", "本章内容");
  document.querySelector("#theoryModule .theory-heading").after(sectionNav);
  status = document.createElement("span");
  status.className = "theory-section-status";
  status.setAttribute("aria-live", "polite");
  document.getElementById("theoryPrev").before(status);
  document.body.classList.add("theory-presenting");

  sectionNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theory-section]");
    if (button) showTheoryPresentation(activeChapter, Number(button.dataset.theorySection));
  });
  sectionNav.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = Math.max(0, Math.min(chapters[activeChapter].length - 1, activeSection + delta));
    showTheoryPresentation(activeChapter, next);
    sectionNav.children[next].focus();
  });
  window.addEventListener("resize", scheduleCanvasFit);
  new ResizeObserver(scheduleCanvasFit).observe(document.querySelector("#theoryModule .theory-main"));
  document.fonts.ready.then(scheduleCanvasFit);
}

export function showTheoryPresentation(chapter, section = 0) {
  const screens = chapters[chapter];
  if (!screens) return;
  const changed = chapter !== activeChapter;
  activeChapter = chapter;
  activeSection = Math.max(0, Math.min(screens.length - 1, section));
  if (changed) {
    sectionNav.replaceChildren(...screens.map((screen, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `${screen.id}-tab`;
      button.dataset.theorySection = String(index);
      button.textContent = screen.dataset.screenTitle;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", screen.id);
      screen.setAttribute("aria-labelledby", button.id);
      return button;
    }));
  }
  const conditionsScreen = screens.at(-1);
  conditionsScreen.append(condition, summary);
  screens.forEach((screen, index) => { screen.hidden = index !== activeSection; });
  [...sectionNav.children].forEach((button, index) => {
    button.setAttribute("aria-selected", String(index === activeSection));
    button.tabIndex = index === activeSection ? 0 : -1;
  });
  const selectedTab = sectionNav.children[activeSection];
  sectionNav.scrollLeft = selectedTab.offsetLeft - sectionNav.offsetLeft - (sectionNav.clientWidth - selectedTab.offsetWidth) / 2;
  status.textContent = `${activeSection + 1} / ${screens.length}`;
  status.setAttribute("aria-label", `本章第 ${activeSection + 1} 屏，共 ${screens.length} 屏`);
  const prev = document.getElementById("theoryPrev");
  const next = document.getElementById("theoryNext");
  prev.textContent = "‹ 上一屏";
  next.textContent = "下一屏 ›";
  prev.disabled = chapter === 0 && activeSection === 0;
  next.disabled = chapter === chapters.length - 1 && activeSection === screens.length - 1;
  document.body.dataset.activeTheorySection = String(activeSection);
  scheduleCanvasFit();
}

export function stepTheoryPresentation(direction) {
  const next = activeSection + direction;
  if (next >= 0 && next < chapters[activeChapter].length) {
    showTheoryPresentation(activeChapter, next);
  } else {
    const chapter = activeChapter + direction;
    if (!chapters[chapter]) return;
    changeChapter(chapter, direction < 0 ? chapters[chapter].length - 1 : 0);
  }
}

function scheduleCanvasFit() {
  cancelAnimationFrame(frameRequest);
  frameRequest = requestAnimationFrame(() => {
    const fixed = window.innerWidth >= 1024 && window.innerHeight >= 720;
    document.body.classList.toggle("theory-screen-mode", fixed);
    if (!document.body.classList.contains("theory-mode")) return;
    chapters[activeChapter]?.[activeSection].querySelectorAll(".theory-canvas-frame").forEach((frame) => {
      const canvas = frame.querySelector("canvas");
      const ratio = Number(frame.dataset.ratio);
      const responsivePlot = fixed && canvas.id === "fringeWidthCanvas";
      const width = fixed && !responsivePlot ? Math.min(frame.clientWidth, frame.clientHeight * ratio) : frame.clientWidth;
      canvas.style.width = `${Math.max(1, width)}px`;
      canvas.style.height = `${Math.max(1, responsivePlot ? frame.clientHeight : width / ratio)}px`;
    });
    renderCompetitionTheoryVisuals(activeChapter);
  });
}
