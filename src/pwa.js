// 公网部署后用于提升稳定性的轻量 PWA 注册脚本。
// 只在 HTTPS 或 localhost 这类安全上下文中启用，避免普通 file:// 打开时报错。
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      // Service Worker 失败不影响主实验运行；这里只记录，避免打断课堂演示。
      console.warn("Service worker registration failed:", error);
    });
  });
}
