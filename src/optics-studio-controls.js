export function connectOpticsStudio(scene) {
  const get = id => document.getElementById(id);
  const controls = get("apparatusControls");
  const assembled = get("apparatusAssembled");
  const exploded = get("apparatusExploded");
  const slider = get("apparatusExpansion");
  const focus = get("apparatusFocus");
  const rotate = get("apparatusRotate");
  const fullscreen = get("apparatusFullscreen");
  const stage = document.querySelector("#operationModule .center-stage");
  let structureMode = false;

  const synchronize = () => {
    const plan = scene.view === "2d";
    stage.classList.toggle("front-elevation", plan);
    if (plan) structureMode = false;
    assembled.classList.toggle("active", !structureMode);
    exploded.classList.toggle("active", structureMode);
    assembled.setAttribute("aria-pressed", String(!structureMode));
    exploded.setAttribute("aria-pressed", String(structureMode));
    exploded.disabled = plan;
    focus.disabled = plan;
    rotate.disabled = plan;
    focus.value = scene.focusName;
    rotate.classList.toggle("active", scene.autoRotate);
    rotate.setAttribute("aria-pressed", String(scene.autoRotate));
    rotate.title = scene.autoRotate ? "暂停旋转" : "自动旋转";
    rotate.setAttribute("aria-label", rotate.title);
    get("apparatusExpansionRow").hidden = !structureMode;
    slider.value = Math.round(scene.explodeTarget * 100);
    slider.style.setProperty("--range-value", `${slider.value}%`);
    get("apparatusExpansionValue").value = `${slider.value}%`;
    get("apparatusState").textContent = structureMode ? "结构示意 · 光路暂停" : "光路实验";
    stage.classList.toggle("structure-mode", structureMode);
  };

  assembled.addEventListener("click", () => { structureMode = false; scene.setExplode(0); });
  exploded.addEventListener("click", () => { structureMode = true; scene.setExplode(1); });
  slider.addEventListener("input", () => {
    scene.setExplode(Number(slider.value) / 100);
    get("apparatusState").textContent = Number(slider.value) === 0 ? "结构示意 · 已装配" : "结构示意 · 光路暂停";
  });
  focus.addEventListener("change", () => scene.setFocus(focus.value));
  rotate.addEventListener("click", () => scene.setAutoRotate(!scene.autoRotate));
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else stage.classList.toggle("apparatus-expanded");
    } catch {
      stage.classList.toggle("apparatus-expanded");
    }
    updateFullscreen();
  });
  function updateFullscreen() {
    const expanded = document.fullscreenElement === stage || stage.classList.contains("apparatus-expanded");
    fullscreen.setAttribute("aria-pressed", String(expanded));
    fullscreen.setAttribute("aria-label", expanded ? "退出全屏" : "全屏查看模型");
    fullscreen.title = expanded ? "退出全屏" : "全屏查看模型";
    scene.resize();
  }
  document.addEventListener("fullscreenchange", updateFullscreen);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && stage.classList.contains("apparatus-expanded")) {
      stage.classList.remove("apparatus-expanded"); updateFullscreen();
    }
  });
  scene.container.addEventListener("studiostatechange", synchronize);
  controls.disabled = false;
  synchronize();
}
