# Xin’s Music Lab（XML）

当前开发版以本目录 `package.json` 和仓库根目录的共用启动入口为准。

一个 Electron 桌面应用：播放本地曲库，给正在播放的歌配画面，并提供跟着音乐滚动的“谱面”。
段落、和弦、分轨、MIDI 全部来自 XLD 的离线分析结果；XML 自己只做播放、实时频谱特征和渲染，不做音乐识别，也不采集系统声音。
曲库目录和分析结果目录与 XLD 共用同一份设置（`%APPDATA%\Xin's Local Deck Beta\settings.json`）。没分析过的歌也能播放、看频谱；分析过的歌在谱面里信息最全。

## 界面

- **顶栏**：当前曲目（封面、标题、艺术家、专辑），点它打开曲库；右侧是“曲库”和“外观与设置”两个按钮。
- **画面条**：一行：谱面、LED 频谱、霓虹丝带、脉冲星；“更多画面 · 15”里是 Butterchurn（MilkDrop）与 Glitch 的 Beta 预设。频谱的读法固定（对数横轴 20 Hz–20 kHz、响度 −92 到 −18 dB、高频补偿 +2 dB/oct、平滑 68%），没有校准面板。
- **播放条**：上一首 / 播放 / 下一首、进度、“听”（原曲或某一条分轨）、沉浸模式。
- **曲库抽屉**：搜索、只看已分析、按专辑展开的曲目列表；底部是 XLD 结果卡片（在 XLD 中分析、更新结果；“更多操作”里有分析选项、打开输出目录、导入 JSON 等）。
- **设置抽屉**：外观（配色、调色、跟和弦变色、字号、语言、响应）；画面效果（FX 开关、导演、特效强度、画质、打开 XLD 评测台 / 生成器）；用哪个分析结果（段落引擎、和弦引擎）；更多（FX Rack 设置、猫指挥及动作、快照、置顶、脉冲星样式）。

谱面里：点一条音轨只听那条分轨，再点回到整首；点段落跳到段落开头；双击（或 Shift+点）段落循环播放。

快捷键：`Space` 播放 / 暂停 · `H` 隐藏界面 · `D` 导演（自动换画面） · `G` 特效开关 · `S` 保存画面 · `F10` 置顶 · `Esc` 关闭抽屉。

界面有中文与英文两种语言，契约见 `I18N_RELEASE.md`。

手写字幕在“外观与设置 → 谱面阅读”里；可设置起止秒与文字，修改/删除会保留本机历史。开发版字幕跨版本保存在 `%APPDATA%/XinMusicDevelopment/Listening Notes`，不写分析原件。

## 运行与测试

- 日常运行：仓库根目录的 `启动XML.cmd`；与 `启动XLD.cmd` 读取同一个当前开发包指针。源码测试必须使用隔离档案。
- 测试：`npm test`（`pretest` 跑 i18n 六步检查，随后是语法检查与各模块契约测试，全部是 Node 脚本）。
- 需要 Electron 的测试不在 `npm test` 里：`tests/runtime-smoke.cjs`、`tests/i18n-step6-layout-electron.cjs`、`tests/stems-electron-smoke.cjs`、`tests/roundtrip-electron.cjs`、`tests/asar-contract.js`（打包后检查）等。
- 打包：使用 `../release-tools/build-dev.cjs`，详见 [统一开发包流程](../release-tools/DEVELOPMENT-BUILDS.md)；会连同谱面核心构建并实际启动两个 exe 后再切入口。旧的单应用 dist 不是当前开发包交付入口。
- 综合渲染 `tests/runtime-smoke.cjs` 默认创建可见窗口以验证动画；`SMOKE_VISIBLE=0` 仅供隐藏诊断。

## 主要文件

| 文件 | 作用 |
|---|---|
| `index.html`、`style.css`、`shell.css`、`shell.js` | 页面结构；`shell.css` / `shell.js` 是顶栏、播放条和两个抽屉的样式与行为 |
| `app.js` | 视觉引擎：唯一的 RAF 时钟、音频特征、各画面、配色、导演、猫指挥、FX Rack、快照 |
| `fusion.js` | 曲库、播放、读取 XLD 结果并把段落 / 和弦送进画面，装配 Generator 与各控制件 |
| `score-scene.js` | 谱面场景，渲染核心在 `../scoreview` |
| `stem-controls.js` | 分轨试听与 MIDI 状态 |
| `xld-timeline-provider-adapter.js`、`realtime-provider-adapter.js`、`music-feature-resolver.js` | 把 XLD 时间线与实时特征合成统一的音乐帧 |
| `material-target-registry.js`、`visual-material-runtime.js` | 画面运行时：每个画面都在这里注册，按帧更新与渲染，并把当前画面交给 Generator |
| `generator-*.js`、`frame-ownership-monitor.js`、`product-control-dock.js` | Glitch Generator 的接入、预设（选择 / JSON 文件 / 仓库）、输出切换，以及设置抽屉里的特效强度与画质 |
| `glitch-engine.js`、`glitch-feature-bus.js`、`glitch-webgl.js` | FX Rack 的事件引擎、特征总线与 WebGL2 反馈渲染 |
| `conductor-poses.js` | 猫指挥的姿势骨架 |
| `i18n/` | 词条目录、翻译器、静态 / 动态绑定 |
| `desktop/` | Electron 主进程与 preload：曲库扫描、读取 XLD 分析、MIDI 资源、预设仓库、启动 XLD |
| `vendor/` | Butterchurn 2.6.7、Butterchurn Presets 2.4.7（MIT）与 Glitch Generator 构建产物 |
| `tools/glitch-generator/` | 打包的 Generator 编辑器 |

第三方许可见 `THIRD_PARTY_NOTICES.md`。`GLITCH_UPGRADE_DESIGN.md`、`GLITCH_GENERATION_RESEARCH.md`、`OPEN_SOURCE_RESEARCH.md` 是历史设计记录。

Designed by Xin · 1245234785@qq.com
