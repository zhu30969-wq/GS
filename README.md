# 光栅衍射交互网页公网部署说明

本项目是纯静态网页，公网稳定访问不需要后端数据库。推荐部署到静态 CDN：

1. Cloudflare Pages：稳定性最高，适合正式展示。
2. GitHub Pages：免费，适合比赛资料展示。
3. Netlify / Vercel：部署简单，适合快速生成公开网址。

## 必须理解的一点

`http://127.0.0.1:5173/` 只能在本机访问。想“随时随地在浏览器进入”，必须获得公网域名，例如：

```text
https://你的项目名.pages.dev/
https://你的用户名.github.io/你的仓库名/
https://你的项目名.netlify.app/
https://你的项目名.vercel.app/
```

## 推荐方案：Cloudflare Pages

1. 新建 GitHub 仓库，把本目录上传到仓库。
2. 登录 Cloudflare Pages，选择该仓库。
3. Build command 留空。
4. Build output directory 填 `.`。
5. 部署完成后打开 Cloudflare 给出的 `pages.dev` 网址。

## 备选方案：GitHub Pages

1. 新建 GitHub 仓库。
2. 上传本目录所有网页运行文件。
3. 在仓库 Settings -> Pages 中选择部署分支。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/root`。
6. 等待 GitHub 生成 `https://用户名.github.io/仓库名/`。

项目已包含 `.nojekyll`，避免 GitHub Pages 误处理静态资源路径。

## 让搜索引擎能搜到

搜索引擎不能保证立即收录。拿到公网网址后：

1. 用公开网址替换 `sitemap.xml.template` 里的 `https://example.com/`。
2. 文件改名为 `sitemap.xml` 并上传。
3. 到 Google Search Console 或 Bing Webmaster Tools 提交站点。
4. 页面标题建议保持“光栅衍射交互实验”。

## 稳定性设置

当前项目已经加入：

- `sw.js`：缓存主页面、学生实验页、核心 JS/CSS、Three.js 和原理图片。
- `site.webmanifest`：支持浏览器安装为应用。
- `robots.txt`：允许搜索引擎抓取。
- `netlify.toml` / `vercel.json`：给常见静态平台设置合理缓存头。
- `.nojekyll`：兼容 GitHub Pages。

## 本地备用入口

如果暂时没有公网账号，仍可双击 `start-web.bat`，它会启动本机服务并打开：

```text
http://127.0.0.1:5173/
```

但这个地址不能给其他电脑或手机直接访问。
