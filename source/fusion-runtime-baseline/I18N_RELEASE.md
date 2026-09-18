# Xin's Music Lab 主界面双语发布契约 — i18n.6

## 支持语言

- `zh-CN`：默认界面。
- `en-US`：完整英文界面。
- 生效优先级：宿主覆盖 > 本地偏好 > `zh-CN` 默认值。

## 翻译边界

翻译主导航、面板标题、控件、提示、已知运行状态、原生对话框，以及
PRODUCT / Generator 产品控制界面。以下内容保持原文：曲目与专辑元数据、
和弦符号、Provider 与引擎 ID、文件路径、Schema、原始 JSON、错误码、
Shader/调试输出和未知错误详情。

语言切换只改变展示层，不得重载页面，也不得重置播放、曲库、XLD 时间线、
Mapping、FX Rack、Generator preset/seed、Canvas/WebGL 或引擎时钟。

## 发布前必须通过

1. 中英文主目录与 Electron 原生目录键集合完全一致。
2. 每个 `data-i18n*`、动态面板清单和语义调用都能在两种语言中解析。
3. 页面不得出现 `[message.key]` 回退标记。
4. 原始曲目信息、和弦、路径和技术 ID 不得被展示层绑定覆盖。
5. i18n 模块不得引入 DOM Observer、第二套 RAF、音频上下文、WebGL、随机数或独立时钟。
6. `960×640`、`1280×760`、`1600×900` 下，中英文入口、PRODUCT 控制和 FX Rack 都必须留在视口内。
7. 切换语言前后必须保持同一个 Stage、Canvas、产品 API、当前视觉和 FX 电源状态。
8. XLD 与 Glitch Generator 接收宿主语言时，不得改变各自的分析/映射状态。

发布前执行 Node 全量测试、专用 Electron 语言测试、Generator 宿主接管测试、
多尺寸布局测试与正式运行时烟雾测试。
