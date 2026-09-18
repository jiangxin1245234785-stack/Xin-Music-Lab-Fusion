# Xin’s Music Lab Fusion — 开发日志

最后更新：2026-09-18  
记录范围：2026-06-20 至 2026-09-18  
主工作目录：`D:\Projects\Xin-Music-Lab-Fusion`

> 本文件按已有源码、测试报告、截图、哈希和阶段报告回溯整理。2026-09-13 只补齐文档，没有修改运行代码，也没有部署产品。

## 当前状态

最新本机预览：releases/0.5.0-preview.paths.1；XLD core.26 / XML stems.11。完成相对路径、独立预览偏好、系统目录默认和随包帮助；本机搬迁通过，独立机器验收待做。详见日志末尾及 work/portable-paths-20260918/HANDOFF.md。上一开发包 history.1 的状态如下。P0 轮次 A 完成：历史 MIDI 结果可读与当前版本缓存匹配解耦（ok / matches），每次运行独立记录 midi/<stem>/runs/，融合记录 provenance；不换模型、不改默认。吉他默认 MuScriptor Medium、复杂曲可选 Large；弦乐默认 Large；钢琴 / 贝斯保持 HiRes；鼓保留 ADTOF 默认及 MuScriptor 双档。toe 鼓试听已完成，整体相近、ADTOF 镲片尾音略逊，未决定切换默认。下一步为 P0 轮次 B（同 engine 多版本切换 / 回退 / 按 runId 删除 / 保留策略）。完整交接见 [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) 和 [进度与计划](docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md)。本机开发验证通过，不代表干净机器正式发行验收。下表保留原视觉项目阶段状态。

| 范围 | 状态 | 说明 |
|---|---|---|
| 前期 Glitch 调研与机制原型 | 完成 | 从通用撕裂/闪烁转向时间、扫描、位平面和量化记忆语法 |
| Phase 0：基线与准入 | 完成 | 冻结部署、完成 30 分钟 soak、固定输入和恢复测试 |
| D 盘迁移 | 完成 | 工作区迁到 `D:\Projects\Xin-Music-Lab-Fusion`，文件校验无差异 |
| Phase 1：源码统一与 Material 接缝 | 完成 | Generator 源码回填；Material Registry、Runtime、生命周期和同帧顺序成立 |
| Phase 2：两种原生材料 | 工程完成 | `spectral-fabric` 与 `temporal-strata`、共享映射和 MaterialField 消费链通过 |
| Phase 2：艺术验收 | 等待 Xin | 50 个效果格和 10 个基线格已生成，尚未由艺术判断正式签收 |
| 产品部署 | 未执行 | `D:\Program Files\xins-music-lab-fusion` 继续作为只读产品参考 |

## 阶段命名说明

项目历史上有两套阶段编号，含义不同：

1. 2026-07-03 至 2026-07-10 的 `Integration Phase I–V`，负责把 XLD、统一音乐帧、Generator Runtime 与正式 WebGL 输出接入产品；
2. 2026-07-29 起的 `Material Roadmap Phase 0–2`，负责冻结基线、统一源码并建立“底层材料先成立，Glitch 再破坏”的新架构。

本日志保留原报告中的名称，不把两轮工作混成同一条 Phase 时间线。

## 2026-06-20 — Glitch 生成方案初步调研

目标：确认软件当前的 Glitch 为什么更像通用后期滤镜，以及成熟方案通常如何组织时间、空间与错误状态。

完成：

- 梳理 feedback、datamosh、codec corruption、scan/raster、bitplane、tile permutation、reaction-diffusion 等生成逻辑；
- 将问题从“增加更多撕裂参数”改写为“建立可持续演化的错误介质”；
- 确认音乐信号不应逐帧直接控制所有视觉参数，需要状态、时间尺度和事件节流。

证据：`docs\GLITCH_GENERATION_RESEARCH.md`

## 2026-06-25 — Glitch 升级设计

目标：把研究结论翻译到现有 Fusion 架构。

完成：

- 盘点现有音乐信号、Mapping、Glitch Engine、WebGL 和 Canvas 路径；
- 提出连续层、噪声层、事件层与长期张力分离；
- 明确需要把“底层视觉材料”与“破坏它的 Glitch”拆开；
- 识别旧频谱、环形频谱、脉冲星等完成度很高的画面不一定适合作为 Glitch 材料。

证据：`docs\GLITCH_UPGRADE_DESIGN.md`

## 2026-07-03 至 2026-07-04 — Integration Phase I：统一音乐帧契约

目标：先建立稳定、可校验、与渲染器解耦的音乐事实边界。

完成：

- 定义 `xin.music-frame/1`、Provider、continuous / state / event / label 注册表与不可变默认值；
- 建立 partial / resolved 两级运行时校验和纯函数 `buildUnifiedMusicFrame()`；
- 建立无副作用浏览器 ESM 入口、版本化 manifest、依赖闭包与 Electron `file://` 冒烟；
- 用固定合法/非法 fixture 锁定 Contract version、错误 code/path 与 preset schema；
- 完成 Phase I Contract Gate 和三项目审计。

边界：这一阶段只建立契约和分发入口，没有接入音频设备、XLD 进程、Mapping、Renderer 或正式画面。

证据：`archive\codex-20260617-new-chat\outputs\integration-progress\phase1-step5\PHASE_I_ACCEPTANCE_REPORT.md`

## 2026-07-04 — Integration Phase II：Realtime、XLD 与 Resolver Shadow

目标：把实时分析和 XLD 离线时间线统一成可追踪来源、置信度与 fallback 的音乐事实，同时不冒险改动正式视觉。

完成：

- 建立 Realtime Provider Adapter 与 XLD Timeline Provider Adapter；
- 验证 `xld.music-lab/2`、稳定曲目身份、段落/和弦索引和播放时间；
- 以 MusicFeatureResolver 按特征域选择 Provider，处理 TTL、hold-last、neutral fallback、transport epoch 与事件去重；
- 增加只读 Source Inspector；
- 建立 Resolver / Legacy 五场景 Shadow 对照门。

边界：正式视觉继续使用 Legacy；`UnifiedMusicFrame` 不写入 `currentGlitchSignals`、Glitch Feature Bus、Mapping 或 Renderer。

证据：`archive\codex-20260617-new-chat\outputs\integration-progress\phase2-step5\STEP_II-5_REPORT.md`

## 2026-07-05 至 2026-07-09 — Integration Phase III：Generator CPU Runtime Shadow

目标：先让新的音乐映射在 CPU Shadow 中可运行、可观察、可回放，再接管 GPU 输出。

完成：

- 将 Generator Runtime 拆为 `evaluate(frame, clock)` 与 `render(source, evaluation)` 两阶段 API；
- 把统一音乐帧转换为连续、状态、事件、置信度和和声等 27 个稳定数值 source；
- 建立 Harmony Adapter，字符串标签不直接进入数值 Mapping；
- 增加 Target Inspector，以 luminance / motion / texture / rupture / color 五类视觉意图对照 Generator 与 Legacy；
- 增加 30 秒 Shadow Stability Gate，检查有限 target、事件 voice budget、renderer 隔离和系统遥测。

边界：Generator 仍为零 GPU Shadow，不创建 Canvas、WebGL context、第二 RAF 或 wall-clock timing。

证据：`archive\codex-20260617-new-chat\outputs\integration-progress\phase3-step5\STEP_III-5_REPORT.md`

## 2026-07-09 至 2026-07-10 — Integration Phase IV：正式 WebGL2 输出

目标：在可回退、可审计和单时钟条件下，让 Generator 从 Shadow 变为正式可见后处理输出。

完成：

- 建立 Canvas / Butterchurn 到 Generator 的 source-aware `TexImageSource` 输入；
- 把 21 个正式 target 从 TargetMixer 最终值完整绑定到 shader uniform，缺失或非有限值显式失败；
- 接入 Auto / Eco / High 资源预算与确定性降级；
- 接入 WebGL context loss 暂停、restore 后 shader / texture / framebuffer 重建；
- 验证 `legacy.animate` 是唯一连续 RAF owner，Generator 只在同一 Engine Clock 回调中同步 evaluate / render；
- 正式输出控制器支持 FX bypass、source / binding / context / ownership 故障回退和快照一致性，避免黑屏。

结果：Generator 正式接管后处理画面；Legacy 保留基础 Canvas / Butterchurn 源、唯一时钟和安全回退职责。

证据：`archive\codex-20260617-new-chat\outputs\integration-progress\phase4-step5\STEP_IV-5_REPORT.md`

## 2026-07-10 — Integration Phase V：预设产品化闭环

目标：把 Generator 从工程接口变成用户能够选择、交换和保存视觉配方的产品功能。

完成：

- 建立内置 preset 摘要和 `RuntimeFacade.setPreset()` 原子热切换；
- FX Rack 增加 Generator 视觉配方选择器，并与旧 FX 权重 preset 明确区分；
- 建立 preset JSON 导入/导出、migration、validation、compatibility 与运行时安全门；
- 后续 runtime evidence 证明用户 preset repository 与 product control dock 已接通；
- preset 切换继续复用同一 Engine Clock、RAF owner 与 WebGL context。

当时的内置集合为 `balanced`、`fracture`、`impact`。后两者随后因艺术质量不足删除，不能把这一历史集合误写成当前产品集合。

证据：

- `archive\codex-20260617-new-chat\outputs\integration-progress\phase5-step1\PHASE_V_STEP_1_REPORT.md`
- `archive\codex-20260617-new-chat\outputs\integration-progress\phase5-step2\PHASE_V_STEP_2_REPORT.md`
- `archive\codex-20260617-new-chat\outputs\integration-progress\phase5-step3\PHASE_V_STEP_3_REPORT.md`
- `archive\codex-20260617-new-chat\outputs\integration-progress\phase5-step5\runtime-report.json`

## 2026-07-11 至 2026-07-14 — 中英文界面与工程交接

- 完成 XLD 与 Fusion 的中英文资源清单、切换、界面收口和发布验收；
- 整理声音特征、Provider、Mapping、Generator、渲染与诊断层之间的职责；
- 形成后续音乐到视觉映射工作的交接文档。

结果：产品界面与工程上下文可交付，但不把本地化或工程验收等同于艺术完成。

证据：

- `archive\codex-20260617-new-chat\outputs\xld-localization\step6\I18N_RELEASE.md`
- `archive\codex-20260617-new-chat\outputs\xml-localization\step6\I18N_RELEASE.md`
- `archive\codex-20260617-new-chat\outputs\Xin_Music_Lab_Audio_Visual_Mapping_Handoff_v1.md`

## 2026-07-14 — Tack Tile 逻辑分析与接入设计

目标：理解 Tack Tile 类作品的时间逻辑，而不是只模仿表面方块。

结论：

- 核心不是随机 tile，而是历史采样、稳定分区、有限状态提交和节拍之外的时间保持；
- 音乐输入应决定“何时提交、保持多久、读哪一层历史”，而不是直接把瞬态变成一次大撕裂；
- 项目需要 VisualClock、历史 reservoir、稳定 seed 和可重复预设。

产出：

- Tack Tile 研究文档；
- Tack grammar 接入设计；
- 第一版量化时间逻辑预设方向。

证据：

- `docs\Xin_Music_Lab_Glitch_Model_Research_Tack_Tile_v1.md`
- `docs\Xin_Music_Lab_Tack_Grammar_Integration_Design_v1.md`

## 2026-07-16 至 2026-07-17 — 新机制试水与预设取舍

建立并验证五个当前预设：

1. `balanced`：克制的运行基线；
2. `temporal-excavation`：从真实八帧历史池中读取稳定时间单元；
3. `raster-deflection`：以亮度与低频同步漂移改变扫描轨迹；
4. `bitplane-drift`：通过位深、调色板分箱和稳定抖动重建图像；
5. `quantized-memory`：以 2/4/8/16 层视觉时钟保持和提交状态。

艺术决定：删除 `fracture`（受控撕裂）与 `impact`（事件冲击）。删除原因不是工程故障，而是两者仍依赖通用撕裂和瞬时爆发，不能形成可信的介质逻辑。

产出包括三种新机制截图、运行报告和 Glitch 生成图谱。

证据：

- `docs\Xin_Music_Lab_Glitch_Generation_Atlas_v1.md`
- `docs\glitch-mechanisms-runtime-report.json`
- `docs\glitch-temporal-excavation.png`
- `docs\glitch-raster-deflection.png`
- `docs\glitch-bitplane-drift.png`

## 2026-07-29 — 路线图校正

目标：停止继续堆效果，先解决视觉材料、Glitch、Mapping 和 Composer 的职责混合。

完成：

- 将系统重新定义为 `UnifiedMusicFrame → Material Mapping → Visual Material → Glitch Network → Composer`；
- 把现有视觉分为分析视图、Legacy Works 和 Glitch Materials；
- 确定第一批只做 `spectral-fabric` 与 `temporal-strata`；
- 将 motion field、FieldBus、TemporalReservoir v2、PassGraph 和 Composer 延后到后续阶段；
- 明确自动测试不能代替艺术验收。

证据：`docs\Xin_Music_Lab_Development_Status_Problems_Roadmap_v2.1.md`

## 2026-07-29 — Phase 0 基线与准入

目标：在改架构前冻结真实产品状态并建立可重复证据。

完成：

- 冻结已安装产品和 Generator 文件哈希；
- 发现旧 TypeScript 源码与已部署 JavaScript 存在九条关键运行路径差异，禁止直接从旧源码覆盖产品；
- Contract 基线 77/77 通过；
- 主动 WebGL context loss / restore：52/52 断言通过；
- 固定音频、无人工注入的 30 分钟 soak：53/53 断言通过，自发 context loss 为 0；
- 建立持续高密度、瞬态密集、长弧释放三类 fixture；
- 保存 FX OFF 与五个 preset 的固定输入视觉证据。

阶段结论：Phase 0 PASS，允许开始源码回填；不允许产品部署。

证据：`artifacts\phase0-20260729\Xin_Music_Lab_Phase0_Baseline_Readiness_Report_v1.md`

## 2026-07-29 — 开发工作区迁移到 D 盘

目标：释放 C 盘空间，并让开发源、证据和归档拥有固定根目录。

结果：

- Fusion runtime baseline：2,593/2,593 文件一致；
- Generator TypeScript baseline：685/685 文件一致；
- Phase 0 与研究资料：82/82 文件一致；
- Phase 0 控制与快照：1,267/1,267 文件一致；
- Generator 编译、86 文件浏览器构建和 315/315 测试通过；
- Fusion 73/73 声明命令通过；
- C 盘释放约 254.7 MiB；
- 安装产品未被迁移操作修改。

证据：`MIGRATION_VALIDATION.md`

## 2026-07-30 — Phase 1A：Generator 源码回填

目标：让可编辑 TypeScript 源码重新成为真实来源，消除“产品能跑、源码不能重建”的风险。

完成：

- 把当前五个产品预设回填至 TypeScript；
- 从源码、测试和 demo 中删除 `fracture` 与 `impact`；
- 回填八帧历史 reservoir、preset GLSL pipeline、source-aware render port、runtime facade 和 uniform registry；
- 为 21 个正式 target 增加所有权元数据；
- 干净构建与 Fusion 内嵌 Generator 包完成等价校验。

验证：

- TypeScript typecheck、clean compile、browser build 通过；
- Generator 322/322 测试通过；
- Fusion 80/80 声明测试通过；
- Electron runtime 54/54 断言通过；
- 冻结安装版 Generator 430/430 文件保持不变。

证据：`work\phase1-20260730\PHASE1_SOURCE_RECONCILIATION_REPORT.md`

## 2026-07-30 — Phase 1B：Material 架构接缝

目标：在基本不改变旧视觉外观的条件下，把视觉生命周期从 `app.js` 的分支中抽离。

完成：

- 新建 `VisualMaterialRegistry` 与 `MaterialRuntime`；
- 用 adapter 注册并保留 27 个既有视觉入口；
- 统一 `reset / update / render / outputs / status`；
- 建立抽象 `MaterialSurface` 和可选 MaterialFields 边界；
- 新建 `MaterialTargetRegistry`，首批注册四个 `material.*` target；
- 建立同帧 orchestrator 与生命周期 reset reason；
- 扩展 `xin.xml-visual-source/1`，同时保留 color-only legacy 降级；
- 上线跨层重复语义诊断与显式豁免。

阶段结论：架构接缝通过；安装产品未修改。

证据：`work\phase1-20260730\PHASE1_MATERIAL_RUNTIME_REPORT.md`

## 2026-07-30 — Phase 2A：两种原生视觉材料

目标：证明底层视觉无需使用传统频谱仪表，也能被音乐驱动并承受 Glitch 破坏。

完成：

- `spectral-fabric`：连续频谱密度山脊，输出 `density`；
- `temporal-strata`：横向历史地层与断面，输出 `density` 和 `age`；
- `audio.loudness → material.coverage`；
- `audio.flatness → material.continuity`；
- `audio.flux → material.refreshRate`；
- `audio.spectralDensity → material.density`；
- Mapping、Material、Generator 使用同一个 engine frame，顺序固定为 Mapping → Material → Generator；
- Generator WebGL 消费可选 `density` / `age`，旧 Canvas 与 Butterchurn 缺字段时使用中性值。

验证：

- Fusion 88/88；
- Generator 327/327；
- Electron runtime 57/57；
- 两材料 × 三预设的 6/6 初始矩阵通过；
- 观察 515 个 Material 帧，frame mismatch 与单 RAF 所有权违规均为 0。

证据：

- `work\phase2-20260730\PHASE2_MATERIALS_CORE_REPORT.md`
- `work\phase2-20260730\PHASE2_SHARED_MAPPING_FIELD_CONSUMER_REPORT.md`

## 2026-07-30 至 2026-07-31 — Phase 2B：真实音频艺术矩阵

目标：用真实音乐比较“材料身份”和“Glitch 身份”，而不是只证明程序能渲染。

关键修正：

- 初始矩阵把冷启动、状态污染和媒体跳转问题误判为画面失败；测试改为真实 `continuous` 音乐帧、逐格材质 reset 和增量证据；
- `temporal-strata` 增加确定性的全画幅潜在历史，并在真实音频到达后重新播种，解决启动时只有底线的问题；
- 加强相对频谱结构，使历史层在高密度段仍保留音色差异；
- 文件末尾绝对静音会触发 FLAC/Electron 反复 seek 不稳定，自动样本改用曲中约 −58.07 dB 的近静音地板；尾部绝对静音保留给人工听感检查；
- 捕获流程改为一个稳定媒体会话、每格重置材质，并加入渲染就绪、空截图重试和分级状态探针；
- 近静音采用“平静但存在”的画面门槛，允许低运动、低对比，同时继续拒绝纯黑、空图与完全无纹理输出。

最终固定语料：world’s end girlfriend — *Radioactive Spell Wave*。

五个状态：近静音、稀疏、build、drop、高密度。

最终矩阵：

- 2 种材料 × 5 种 Glitch × 5 个音乐状态；
- 50/50 效果单元通过；
- 10/10 FX OFF 基线通过；
- 共 60 张截图；
- 工程失败 0，运行时失败 0，控制台错误 0；
- 25 对同预设材质比较中，身份塌缩 0；
- 最小材质分离度 0.018275，最大 0.186622；
- Fusion 最终声明测试 90/90 通过。

艺术观察：

- `spectral-fabric` 保留连续、纵向起伏的频谱织物身份；
- `temporal-strata` 保留横向堆积、断层和历史切片身份；
- 稀疏、build、drop、dense 之间已有可见叙事梯度；
- Temporal Excavation 与 Raster Deflection 在低能量段最接近，是艺术复核的重点；
- 自动指标只证明链路、活动度和身份分离，不宣布画面已经“美”。

证据：

- `work\phase2-20260730\PHASE2_ARTISTIC_MATRIX_REPORT.md`
- `artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-report.json`
- `artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-gallery.html`

阶段结论：Phase 2 工程完成，等待 Xin 的艺术接受、条件接受或退回决定。

## 2026-09-13 — 日志补录与文档同步

本次只处理文档：

- 新建本总开发日志；
- 把 README 中过期的 Phase 2 “语料和矩阵待完成”状态更新为“工程完成、等待艺术验收”；
- 在 Source of Truth 中加入本日志入口；
- 未修改 Fusion、Generator、测试逻辑或安装产品。

## Material 路线阶段编号说明

路线图原本把“2 材料 × 3 Glitch 比较矩阵”放在 Phase 3。本轮 Phase 2 为了完成材料工程验收，已经运行了更大的 2 × 5 × 5 静态截图矩阵，因此覆盖并超过了原 Phase 3 的静态图片范围。

尚未完成的仍是路线图 Phase 3 中更严格的艺术程序：固定输入视频、盲序观看、预登记评分和隔日复看。不能因为 60 张截图通过工程门槛，就把这部分艺术评审自动记为完成。

## 当前未决事项

1. Xin 查看最终图库，决定接受、条件接受或退回 Phase 2 视觉结果；
2. 若条件接受，只修正被点名的 material × preset × segment 组合，不扩大效果数量；
3. 若接受，再决定先做盲序视频艺术评审，还是进入 FieldBus / TemporalReservoir v2 / PassGraph / Composer；
4. 任何写入 `D:\Program Files\xins-music-lab-fusion` 的部署仍需单独明确授权。

## 文档权威顺序

发生冲突时按以下顺序判断：

1. `SOURCE_OF_TRUTH.md`：当前有效状态与安全边界；
2. `DEVELOPMENT_LOG.md`：时间线、决策原因和阶段结果；
3. `work\phase*\*_REPORT.md`：阶段级详细证据；
4. `artifacts\phase*`：机器报告、截图、哈希与可重复运行结果；
5. `docs\Xin_Music_Lab_Development_Status_Problems_Roadmap_v2.1.md`：规划与设计原则，不代表已实现状态。


## 2026-09-13 — 分轨 v1 开发闭环

按个人项目快速迭代范围推进，开发构建为 `0.5.0-dev.stems.1`。

- 修复分析入口重复提交竞争、准备期取消和启动失败后的任务释放；SongFormer 局部重分析复制已有结果供 runner 合并。
- 增加简单的追加运行日志；失败或取消保留已有成功结果和人工标签。
- 接入独立 htdemucs_6s runner，生成六条对齐 float32 WAV；独立 stems.json，不改变 xld.music-lab/2。
- XML 分析面板增加分轨/重新分轨、音轨选择和打开输出目录；继续使用母曲身份与时间线。
- npm test 与新增任务回归通过；真实 LAST WALTZ 211.515 秒，输出六条 44.1 kHz 双声道、9327818 帧 WAV；缓存命中验证通过。
- Electron 实际音频回放、35 秒定位保持、切回原曲和重载测试通过；界面测试的时间线采用 fixture。
- 本机推理/写出约 9–10 秒，含加载的完整任务约 12 秒；这是单曲实测，不是全曲库速度承诺。
- 待用户试听确认 piano / guitar 的可用程度，尚未完成跨素材分离质量评审。
- 仅更新开发目录；安装产品未部署。开发入口：source/fusion-runtime-baseline/start-dev.cmd。

规格与交接见 work/stems-20260913/SPEC.md、HANDOFF.md。


## 2026-09-13 — 分轨入口状态提示修正

用户反馈输出目录按钮不可点击。核对 Radioactive Spell Wave 的运行日志，本次仅完成 SongFormer 段落分析，尚无 stems.json 或分轨任务记录。

- 已选歌曲但没有分轨结果时，明确提示点击「分轨」生成 WAV，完成后才能打开输出目录。
- 分轨运行中显示对应提示；公共进度的完成文字区分「SongFormer · AI 分析完成」与「分轨完成」。
- 保持目录按钮仅在有效分轨结果存在时可用。此轮只调整开发版界面提示。
验证：三个修改后的 JS 文件语法检查通过；现有 Electron 分轨界面检查通过（复用已有 WAV，不重新运行模型），覆盖六轨选择、播放定位、目录动作、重载及无渲染错误。
补充记录：i18n-step4 与 fusion-contract 的独立检查均因旧版号断言失败：测试仍要求 .i18n.N / 0.5.0-productization.i18n.6，而开发版号已为 0.5.0-dev.stems.1；这不是本轮提示改动引入的功能错误。本轮未修改这些版本断言，也不宣称完整测试套件通过。


## 2026-09-13 — 分轨试听接受与单轨 MIDI v1

用户确认分轨质量可以接受，授权继续开发。先修正开发检查仍锁定旧 i18n 版本号的问题：保留语言绑定和功能断言，移除过期版号门槛；完整 npm test 恢复通过。

按原始“分轨后可进一步编辑”的方向，完成单轨 MIDI 小迭代。当前构建 0.5.0-dev.stems.2：选择 bass / piano / guitar 后可「转 MIDI」「打开 MIDI 目录」，有结果时可重新转谱。保留母曲时间原点，输出未量化 MIDI 与音符 JSON；固定 120 BPM 用于 MIDI 时间编码，不表示识别了歌曲 BPM。

运行环境独立放在 D:\Caches\codex\runtimes\xld-midi，Python 3.10 + Basic Pitch 0.4.0 + ONNX。运行时发现依赖缺少 pkg_resources，通过锁定 setuptools 80.9.0 补齐；numpy 标量写 JSON 时显式转为原生整数。现有分轨与 SongFormer 环境保持原样。

每条 MIDI 记录母曲、声部及分轨 runId；重分轨后旧转谱不再视为当前结果。缓存、取消与失败保留沿用现有任务接口。六轨 WAV 和主时间线不因转谱改变。

实测：20 秒 guitar → 74 音符；完整 LAST WALTZ（211.515 秒）bass 337、piano 406、guitar 844 音符，约 4 秒/轨；实际 MIDI 回读时间校验、缓存和取消保留通过。完整 npm test、新增 MIDI 任务回归、Electron 转谱/试听/目录动作/重载通过；分轨首版质量已获用户接受，MIDI 音符质量待人工验收。独立安装版未部署。

交接：work/midi-20260913/SPEC.md、HANDOFF.md。界面验证复用测试分轨，未处理用户正在播放的当前歌曲。


## 2026-09-13 — XML / XLD 共用分轨和 MIDI 结果

完成个人项目的一轮结果互通：XML 生成、XLD 读取和试听。新增 source/xld-runtime-baseline 开发副本与 source/shared-analysis/derived-assets.cjs 共用模块；安装产品保持原样，现有分析 Python/模型仅复用。

修正两端目录规则差异：XML 补齐磁盘路径元数据，共用读取优先按路径身份，兼容旧显示名称目录。已有六轨清单和 MIDI 清单格式不变。XLD 新增音轨选择、试听、刷新与两个目录入口；切轨保留母曲身份/位置/播放状态，更新或失效的缓存回原曲。XML 高级评测台优先打开新开发副本。

构建：XML 0.5.0-dev.stems.3；XLD 0.5.0-dev.shared.1。双端完整检查、共用读取单测及真实音频界面检查通过。XLD 与 XML 确认读取相同文件；覆盖选曲不自动播放、35 秒定位/暂停保持、目录动作、结果失效、切歌、重载、语言及人工标签。测试不重新运行模型，时间线使用隔离 fixture。详情见 work/interop-20260913/HANDOFF.md。


## 2026-09-14 · 分析职责归回 XLD

用户纠正产品边界：XML 面向可视化，XLD 面向音乐分析。上一轮“XML 生成、XLD 读取”描述已失效。

- 分轨、MIDI、结果读取及执行服务归入 XLD，XML 旧位置保留兼容调用。
- XLD 分轨、转谱、段落、和弦共用任务执行器、进度和取消；新增分轨、生成 MIDI 与重新生成控件，分轨及任务区位于段落/和弦工作台之外。
- 原分析结果格式、目录、试听定位、人工标签不变。XML 主工作仍为可视化。
- 自动检查及真实 30 秒音频测试通过：六轨 WAV、62 音符 bass MIDI、SongFormer、CENS+HPSS；缓存、取消、重试、双端读取和试听通过。
- 新版本：XML 0.5.0-dev.stems.4，XLD 0.5.0-dev.core.1。未改安装产品；未加入跨宿主队列。

详见 work/ownership-20260914/HANDOFF.md。


## 2026-09-14 · XML / XLD 往返使用

延续 XLD 负责分析、XML 负责可视化的边界，完成日常使用衔接。XML 0.5.0-dev.stems.5；XLD 0.5.0-dev.core.2。

- XML 默认显示声部试听、WAV/MIDI 目录、结果更新；直接调用核心的旧控件折叠到「分析选项」，主入口和曲库行按钮前往 XLD。
- 选曲时从磁盘读取最新清单；返回焦点或手动更新只刷新当前曲目的时间线与派生结果，并更新曲库分析标记。有效声部、播放位置和状态保留；试听文件失效时回原曲并保持位置。无效清单保留当前显示，过期异步响应不能覆盖新选曲。
- XML 只向当前分析目录原子写入一次选曲请求。XLD 按用户配置目录复用窗口，二次启动通知原窗口领取新选择，选曲不自动播放、不取消分析。
- 两边完整 npm test 通过；隔离真实 Electron 验证实际请求写入、默认折叠、35 秒位置保持、播放中刷新、MIDI 状态、结果损坏/失效、快速换曲，以及真实第二进程退出并复用原 XLD 窗口、语言传递和一次性消费。
- 本轮复用既有真实 WAV/MIDI，时间线变化为隔离测试清单；无新模型推理、依赖、跨程序任务锁或 EXE 打包。安装产品不变。

交接见 work/roundtrip-20260914/HANDOFF.md；原两个 start-dev.cmd 入口继续有效，关闭旧开发窗口后重开即可加载本轮代码。


## 2026-09-14 · MIDI 多模型与面板排版

用户反馈 MIDI 质量差，并要求增加模型、沿用默认/备选卡片，整理分轨面板。已接入 HiRes Piano、GAPS Guitar、HiRes Bass 三个预训练专用模型，Basic Pitch 保留为备选；新默认按所选声部决定，选择可记忆。

分轨面板按 WAV / MIDI 分组，按钮对齐，复用原分析器选项样式，显示默认/备选与缓存状态；重新生成和全局进度/取消沿用现有逻辑。模型各自缓存，生成或使用已有 MIDI 后更新 XML 当前结果；旧 Basic Pitch 文件保留。当前版本 XML 0.5.0-dev.stems.6，XLD 0.5.0-dev.core.3。

真实验证使用 Radioactive Spell Wave 的 90–120 秒及已有分轨的隔离副本：三份专用模型和 Basic Pitch 均成功写出并回读 MIDI；验证模型切换、缓存独立、错误模型拒绝、准备期与运行中取消、人工标签保留。XLD 实际窗口中英文/大字号排版及 XML 新模型读取/更新/试听位置保持均通过。完整 npm test 两端通过。工程验证不表示音乐准确率验收；音符数量不作为质量指标。

新环境和权重位于 D:/Caches/codex，只读复用已装 CUDA 环境；原安装产品、分轨模型、段落和和弦流程保持原样。详细排查与测试记录见 work/midi-models-20260914/HANDOFF.md。


## 2026-09-14: MIDI save/readback correction

XLD 0.5.0-dev.core.4; XML remains 0.5.0-dev.stems.6. Nancy Tries to Take the Night exposed a MIDI validator bug: almost simultaneous chord notes share a saved MIDI tick and can change list order. A positional comparison rejected valid full-song results. Validation now compares note multisets by pitch, velocity and MIDI start/end ticks, without changing transcription or note JSON timing. Real corruption and missing notes still fail. XLD retains scoped failure details across refreshes and clears them after retry/success; existing cached results remain available.

Both runtime regression suites and both app test suites pass. The complete 396.581-second guitar and piano stems were transcribed and validated (2915/3086 notes). Actual Electron checks cover persistent failures, model/stem isolation, cached-result preservation, successful retry and folder access. Installed products, source audio and model parameters are unchanged. See work/midi-save-fix-20260914/HANDOFF.md.


## 2026-09-14: WEG 多模型分轨

当前开发版 XLD 0.5.0-dev.core.5、XML 0.5.0-dev.stems.7。XLD 分轨新增 BS-RoFormer SW 六轨（可用时默认），Demucs 6s 保留为备选；默认/备选卡片沿用既有布局。每模型单独保存 WAV，生成/使用成功才激活 stems.json，卡片预选不修改音源。XML 继续读取 XLD 的当前结果，便捷操作沿用当前模型或首次可用默认，分析所有权没有改变。

MIDI 缓存按分轨 sourceRunId 再分模型，切换新 WAV 不误用旧 MIDI，切回旧 WAV 可恢复该来源全部模型结果。失败/取消保留成功结果。新 RoFormer 环境、固定公开代码与校验权重仅放入缓存；安装产品、原音频、SongFormer/和弦及人工标注未改。整曲结果在 CPU 累加，按块使用 GPU。

两首完整 WEG、真实取消、新分轨的三声部全曲 MIDI、短音频/静音/重采样、上游数值一致性、实际 XLD/XML 窗口、两产品完整测试及本地 A/B 试听页均列入验证。默认不表示已证明 WEG 音质最优。交接与详细证据见 work/weg-separation-20260914/HANDOFF.md。

## 2026-09-14：XLD 工作台整合与交互第一轮

用户暂停进一步声部细分，选择“工作台默认，曲库作为侧栏”。已将概览、段落、和弦、分轨和 MIDI 接入统一工作台，复用原有模型、执行器、缓存及 XML 接口。侧栏浏览与工作选曲独立；任务、播放器常驻；模型选择、结果管理、日志和路径设置按使用频率组织。补齐重开选曲恢复、键盘导航、部分覆盖提示，修正和弦四模型文案和人工标签计数。

XLD/XML npm test、真实缓存工作台 Electron 验收、原分轨切换/缓存恢复/失败重试验收均通过。截图见 artifacts/xld-workspace-20260914；实现与边界见 work/xld-workspace-20260914/HANDOFF.md。本轮交付开发源，未替换安装产品。

## 2026-09-14：MIDI 融合实验

MIDI 工作区新增融合当前启用声部、打开多轨 MIDI 和打开目录。复用已安装的 MIDI Python 环境，保留乐器、绝对时间、力度、延音和弯音。沿用 XLD 单任务互斥、进度与取消；来源指纹缓存，不覆盖原始 MIDI。Radioactive Spell Wave 三轨融合得到 4,165 个音符，核心、Python 时间映射与 Electron 交互测试通过；XLD/XML 回归通过。详情见 work/midi-merge-20260914/HANDOFF.md。


## 2026-09-14：单曲一键 MIDI

MIDI 页新增“一键生成 MIDI”，固定当前歌曲、WAV 来源和各声部模型，依次执行 bass、piano、guitar 后融合。默认复用有效缓存；重新生成仅重算三个 MIDI。复用既有批处理互斥、任务进度与取消，失败/取消/来源变化停止后续步骤，已完成输出保留。原单声部与独立融合入口保留。

XLD 全套回归和隔离 Electron 通过：真实 WEG 三轨缓存与 4165 音符融合、失败中断、取消、中英文及无 WAV 禁用均已验证。本轮没有新模型推理、依赖或安装产品更新。入口与实现详见 work/midi-batch-20260914/HANDOFF.md。


## 2026-09-15：本机发布候选版

新增统一发布工具、运行环境清单和缺失路径提示。XML/XLD 独立 EXE 共用 Electron 与原共享模块，XML 可直接启动同包 XLD。保留原用户档案、曲库、缓存和安装产品。功能源码版本未改变；发布壳 0.5.0-rc.1。

两应用回归、运行环境探测及真实发布窗口/缓存/选曲交接已验证。现有 Python 仍引用外部基础环境和共享库，本轮为本机候选版，不标为跨机器离线包；短片段推理结果及后续门槛见 work/release-prep-20260915/HANDOFF.md。


## 2026-09-15：独立模型环境与 RC.2

组装约 9.5 GiB 独立 Python/库/脚本/权重，五套环境使用相对 ._pth，Hugging Face 快照实体化并离线加载。保留原包版本、模型参数及数据格式。发布 RC.2 与 runtime/0.5.0，原安装与 RC.1 保留。

真实模块路径审计、七组引擎探测、RoFormer/三声部 MIDI、MSAF/SongFormer/CQT/BTC/Demucs/Basic Pitch 短片段实际推理和两应用回归通过。最终目录验收报告和干净系统剩余门槛见 work/runtime-pack-20260915/HANDOFF.md。


## 2026-09-15：鼓 MIDI 与一键输出目录修复

XLD core.9 / XML stems.8，发布候选 RC.3。XLD 新增 ADTOF 五类鼓点 MIDI（固定力度）；一键生成覆盖 bass、piano、guitar、drums，再融合非空声部。快速同类鼓点保存时截断重叠时长，敲击起点不变。

本曲 MIDI 目录入口独立于试听声部和模型预选，原曲选择、部分完成、取消及重开后可访问有效输出；少于两个非空声部明确提示无需融合。XML 同步支持读取鼓 MIDI。

完整 WEG 隔离副本生成 2853 个鼓点，四轨融合 7018 音符；两应用回归、鼓通道/滚奏回读、实际窗口/目录状态及 EXE 往返通过。音符数不代表质量，鼓听感待用户确认。沿用 runtime/0.5.0，保留 RC.2/安装产品；仍为个人本地 RC，干净 Windows 验收和上游再分发许可确认未完成。见 work/drums-midi-20260915/HANDOFF.md。


## 2026-09-15：RC.4 发布体验收尾

发布壳 RC.4；分析源码保持 XLD core.9 / XML stems.8。发布包统一窗口/页面版本，新增版本帮助按钮、F1 离线帮助和只读环境路径检查。使用说明包含四声部一键 MIDI、输出定位、缓存、升级回退与另一台 Windows 验收清单。构建从单一版本字段生成说明书及元数据，修复旧文档 RC.2 与页面 FUSION 0.3 标识不一致。

两应用回归、发布配置/壳测试、实际 EXE 双端帮助复用、双语标签、小视口与一键缓存流程/同包跳转通过。没有改算法、模型、运行环境、用户档案或结果。保留 RC.3 与安装版；未发现 Windows Sandbox，干净机器验收未完成，继续保留 RC 标识。见 work/release-polish-20260915/HANDOFF.md。


## 2026-09-15：RC.5 文件标识与环境检查

XLD/XML Windows 文件属性写入产品名、版本及图标，窗口图标同步；XLD 复用页面字标配色，XML 沿用原图标。新增随包“检查环境.cmd”，无需系统 Node/Python，逐项探测所有环境与模型（含鼓），输出独立 JSON/中文报告。缺 Python、模型、超时和损坏配置都有失败反馈。真实推理验收已补齐鼓轨，按六步动态判断完成。

发布配置/壳/诊断测试、两个实际 EXE 窗口、帮助复用、缓存一键 MIDI 目录、同包交接通过；WEG 30 秒分轨、四声部 MIDI 与融合重新推理通过。保留既有版本、分析算法、运行环境与用户数据。未完成无 Python 的干净 Windows 全流程验收，仍为个人候选版。详见 work/release-branding-20260915/HANDOFF.md。


## 2026-09-15：RC.6 other 弦乐细分试用

XLD 分轨页加入 AudioSep 30 秒细分：默认弦乐组、备选小提琴倾向，明确为同模型两种提取预设。支持起点、取消、原始/目标/剩余三路试听、缓存、单独保留和目录入口；原分轨及 MIDI 不变。新增独立约 156 MB 模型附件，复用现有 Python 环境。BCNR 三段共 12 次 GPU 推理、数值检查、实际界面与两个 EXE 旧流程回归通过。试听质量待用户评估，不能以残差重建正确代替语义分离成功。详见 work/refinement-bcnr-20260915/HANDOFF.md；试听页 artifacts/refinement-bcnr-20260915/listening/BCNR-弦乐试听.html。


## 2026-09-15：WEG 三模型独立开发版

发布 releases/0.5.0-dev.refine3，默认 Bowed Strings v2，备选 AudioSep / Mega 53；目标与模型分开选择，保留 30 秒试用范围。GPU 独立输出层推理，CPU 累计音频；自动模式显存不足缩短分块再回退 CPU，手动 CPU 已实测。未将 RAM 当作显存。Bowed/Mega 与完整模型对应输出 FP32 对照误差为零。WEG Flowers of Romance 整曲基础分轨及 90–120 秒三模型/小提琴预览已准备；真实 GUI、取消/缓存/保留、原一键 MIDI 目录与 XML 衔接回归通过。开发档案和分析目录独立，RC.6 保留。质量待用户试听，详见 work/refinement-three-20260915/HANDOFF.md。


## 2026-09-15：WEG 多段复验

用户通过 Bowed Strings v2 / Mega 53 的 90–120 秒结果，AudioSep 电子混入明显。本轮新增 0、270、540、750 秒起两模型各 30 秒，八次 GPU 推理成功并载入开发版缓存。10 份数值检查通过，4:30 与 12:30 输出差异明显，待听评判断串音/漏提取。12:30 源 other 与部分输出有 FLOAT 超满刻度峰值，试听副本统一衰减到 0.8，原模型文件保留。试听页 artifacts/refinement-three-20260915/multi-check/listening/WEG-多段复验.html。浏览器自动检查受本地文件 URL 策略限制，未绕过；离线验证 30 个音频引用与时长/幅度。

## 2026-09-16：用户多段试听结论
用户原话：“Mega完胜，bowed把部分人声以及失真的声音剪进去了”。本轮 Flowers of Romance 多段对比以 Mega 53 为优选；Bowed 提取量较大包含人声/失真声音误入，不据提取量判为更完整。90 秒初轮两模型通过的历史记录保留；用户未提供逐段评分，不自动填写全部片段通过或推及其他曲目。
后续版本默认选择 Mega 53，Bowed 保留备选，AudioSep 保留实验选项。此轮仅更新验收与交接记录；当前 0.5.0-dev.refine3 包及其默认卡片未修改、未重打包。后续先落实模型排序，再考虑整曲细分。


## 2026-09-16：Mega 53 整曲开发版

XLD 默认 Mega 53，细分支持整曲 / 30 秒切换；其他两模型保留预览。整曲与旧预览缓存隔离，目标/残差不覆盖基础六轨或进入 MIDI。原始 FLOAT 输出保留，另按三路共用增益保存安全试听文件。Flowers of Romance 整曲 823.9423 秒已完成，模型推理 200.51 秒 / 1410.9 MiB PyTorch 显存分配峰值。逐样本对齐与重建、164 个边界数值检查、恒等拼接、真实取消/缓存/旧结果保留及 XLD 单元与控制器测试通过；声音与实际窗口视觉待用户验收，不声称自动听评通过。开发入口 releases/0.5.0-dev.mega1，沿用独立开发分析目录，新版偏好隔离，RC.6 与 refine3 保留。详见 work/mega-full-20260916/HANDOFF.md。


## 2026-09-16：Mega53 全部目标开发版

XLD 0.5.0-dev.core.13，releases/0.5.0-dev.mega2：开放 53 个原始目标与六类筛选，输入支持原曲或当前六轨；默认保持 other / 弓弦乐 / full / auto。独立来源缓存与旧缓存兼容，原曲无须先分轨。原 strings 与 bowed_strings 区分；53 个输出不是互斥声部，不能直接相加。所有 53 头实际等价性、XLD 全套测试、五项 MEGURI 原曲 497–527 秒真实 GPU 推理/音频检查、旧整曲/预览读取与真实取消测试通过。9组环境检查通过；UI 为控制器契约测试，实际窗口和新目标听感待用户验收。旧 mega1/RC.6 保留；开发版共用原开发分析目录，不改原 MIDI。详见 work/mega-all-20260916/HANDOFF.md。


## 2026-09-16：音频存储管理开发版

XLD core.14 / releases/0.5.0-dev.storage1，在资料库中新增存储管理：按歌曲/模型/目标查看完整输出体积、搜索筛选、保留与取消保留、批选、定位、回收站或明确确认的永久删除。已有细分/MIDI依赖保护基础分轨，保留原曲/MIDI/段落/人工标注，音频缺失后可重新生成。当前开发目录只读统计约9.22GiB/23组，未自动清理用户数据。XLD全套、临时删除夹具、真实Windows回收站、控制器、9组环境检查通过；无实际窗口视觉或干净VM验收声明。沿用开发分析目录，mega2和RC.6保留。详见 work/storage-20260916/HANDOFF.md。


## 2026-09-16：分轨与 MIDI 流程整理

XLD core.15 / releases/0.5.0-dev.flow1。MIDI 转谱声部与试听选择独立，明确当前基础分轨来源，模型卡片区分已保存与当前用于融合。一键计划显示缓存复用/生成/重算；失败与完成消息绑定 WAV 来源；空音符可访问但不融合。分轨/MIDI 重算选项分开，切歌重置。完成后等待读回结果再恢复操作，修复状态/按钮提前更新的时序。Mega53 细分保留独立 WAV 流程，暂未接入 MIDI。

XLD/XML 回归、真实隐藏 Electron 四声部缓存/融合/失败/取消/目录/重载/双语/小窗口检查，以及9组环境探测通过；零 UI console error。没有新增模型或修改算法、用户音频/结果与人工标注；沿用开发分析目录，旧开发版保留。详见 work/flow-20260916/HANDOFF.md。


## 2026-09-16：弦乐 MIDI 第一版

XLD core.16 / releases/0.5.0-dev.strings1。复用 Basic Pitch，将 Mega53 已有整曲弦乐组/小提琴/中提琴/大提琴/低音提琴结果接入单轨 MIDI、一键生成与融合。每曲显式选择一个弦乐来源，按细分 runId 隔离缓存，整曲时间保持，GM音色匹配目标。原曲细分可独立转谱；片段不纳入。存储管理保护存在 MIDI 依赖的细分 WAV。

WEG Flowers of Romance 823.942 秒真实转谱耗时52.032秒，3623音符，回读/缓存/音色/范围和与人工鼓夹具的融合验证通过，音质待听评。两应用回归、隐藏Electron来源选择/目录/重载/双语以及9组运行环境检查通过。沿用开发资料库，旧版本保留。详见 work/strings-midi-20260916/HANDOFF.md。


## 2026-09-16：紧凑工作台 compact1

XLD core.17 / releases/0.5.0-dev.compact1：缩小曲目栏、按钮、模型卡片和播放器；MIDI 单声部与整曲操作宽屏双栏，音源与试听集中；说明和融合声部详情默认折叠。分轨页统一密度，窄窗自动重排。后端/模型/缓存不变。两应用回归及真实 Electron 窗口、目录、双语、大字体和发布资源检查通过。沿用现有开发分析目录，旧版本保留。详见 work/compact-workspace-20260916/HANDOFF.md。


## 2026-09-16：YourMT3+ 与单屏工作台

XLD core.18 / releases/0.5.0-dev.yourmt3.1：strings 新增 YourMT3+ 备选，Basic Pitch 保持默认；整曲跨段解码，重叠同音高分通道输出保留时长。Flowers of Romance 同源结果 1163 音符，实际歌曲目录已缓存，先前启用结果恢复。默认工作台在 1180×780 普通字号一屏，分轨与 MIDI 左右分区，说明/标注/明细折叠。真实转谱/缓存/切换/一键/目录/融合、双应用回归、窗口及发布资源验证通过。试听见 artifacts/yourmt3-workspace-20260916/listening/弦乐MIDI对比.html；细节与限制见 work/yourmt3-workspace-20260916/HANDOFF.md。新附加环境依赖 runtime/0.5.0。旧版本保留，仍为本机开发版。


## 2026-09-16：弦乐默认 YourMT3+ 与 MIDI 清理

XLD core.19 / releases/0.5.0-dev.yourmt3.2：用户试听 MEGURI 后确认 YourMT3+，现为 strings 单声部及一键 MIDI 默认引擎，Basic Pitch 保留备选。一次性迁移旧默认选择，之后尊重手动偏好。MIDI 页新增删除当前音源/模型结果的入口，确认后移入 Windows 回收站；删除启用中的 Basic Pitch 时自动启用已有同源 YourMT3+ 缓存。同步刷新模型、目录、一键及融合状态；保留原始音乐、WAV、其他模型和已有融合文件。未清理用户真实曲目结果。核心删除/缓存/恢复/边界测试、双应用回归、隔离真实回收站交互、发布窗口宽窄与大字体验证通过。细节见 work/midi-manage-20260916/HANDOFF.md，证据见 artifacts/midi-manage-20260916。未调整模型参数，揉弦造成碎音仍是待验证解释；旧版本保留，本机开发版。


## 2026-09-16：电吉他 YourMT3+ 试听版

XLD core.20 / releases/0.5.0-dev.guitar.1：guitar 新增 YourMT3+ 备选，GAPS 仍默认；模型菜单按原声／清晰拨弦、电吉他试听、通用／弯音检测说明用途。复用原模型环境，支持独立缓存、一键 MIDI、融合、删除与目录。MEGURI 同源整曲完成 YourMT3+ 1912 音符（GAPS 883），新模型缓存可直接使用，原启用选择保留。统计不代表质量提升，待用户试听。吉他与弦乐联合验证发现融合通道不足，现对同声部同音色无表情轨进行无损通道整理；五声部 9260 音符 / 10 轨，回读验证时值与音符完整。融合缓存指纹升级，旧文件保留。双应用回归、真实推理、单屏双语、一键/删除/目录、发布窗口和九段音频通过。试听 artifacts/guitar-yourmt3-20260916/listening/吉他MIDI对比.html；细节 work/guitar-yourmt3-20260916/HANDOFF.md。本机开发版，尚未改电吉他默认，不重建连续揉弦曲线。


## 2026-09-16：Guitar-FL 独立试听实验

用户否决 YourMT3+ 在 MEGURI 吉他上的听感。GAPS 保持默认。新增 Guitar-FL 同源整曲 CUDA 试听实验：68.656 秒、3486 音符，GAPS 883 音符；不据统计判优。三段固定 30 秒试听统一音色与力度，提供原 WAV 对照和完整 MIDI。权重官方 SHA256、MIDI 回读、原文件不变、九段播放/宽窄布局通过。未改产品、默认或用户结果索引。Ti-hFT 未发现可用官方权重，未运行。试听：artifacts/guitar-fl-20260916/listening/吉他FL对比.html；交接：work/guitar-fl-20260916/HANDOFF.md。


## 2026-09-16：MuScriptor Medium 吉他独立试听

用户完成官方权重授权。MEGURI 同源吉他整曲 CUDA 完成：2916 音符，42.1 秒，显存峰值未留存。关闭强制跨段延音提示，使用官方独立分块解码，限定三类吉他，无额外碎音修补/节奏量化。MIDI 回读、原文件哈希、九段实际播放与布局检查通过。听感待验收，GAPS 仍默认，未改产品与曲库。试听 artifacts/muscriptor-guitar-20260916/listening/吉他MuScriptor对比.html；交接 work/muscriptor-trial-20260916/HANDOFF.md。

## 2026-09-16：MuScriptor Medium 成为吉他默认

用户明确验收 MEGURI Medium 明显优于 GAPS，并授权替换。发布 0.5.0-dev.muscriptor.1（XLD core.21）：Medium 默认，GAPS/Basic Pitch/YourMT3 保留；单声部、一键、融合、删除、目录统一走既有接口。首次迁移旧吉他偏好，之后保留手动选择。模型本地附件约1.23GB，复用已装Python，无新增依赖。已验收 MEGURI 输出加入实际开发曲库并启用，旧 GAPS 文件和索引保留。

真实接口40.203秒推理/45.875秒全程、峰值PyTorch分配3172MiB、2916音符；音符时间/音高/力度/program与已验收独立试听完全一致。双应用回归、缓存/取消保护、真实界面一键四声部融合、模型删除回退、目录、默认迁移、手选重启、双语/大字/单屏和发布文件校验通过。本机开发版，旧发布保留。

Large 下载403，需单独接受官方模型页条件；已告知用户并准备测试脚本，尚无 Large 听感/性能结论。见 work/muscriptor-integration-20260916/HANDOFF.md。


## 2026-09-17：MuScriptor Large 独立对照

用户完成官方授权，Large 5.47GB权重校验通过。MEGURI整曲CUDA成功，batch1 / no-prelude，转谱248.44秒，峰值已分配10521MiB，3156音符；同批量Medium 113.47秒/2343MiB，单次配置对比。无量化或额外修音。完整事件/MIDI回读、源文件哈希、九段播放与布局验证通过；Large听感待验收，Medium保持默认。试听 artifacts/muscriptor-large-20260917/listening/MuScriptor档位对比.html；详见 work/muscriptor-large-20260917/HANDOFF.md。

## 2026-09-17：吉他双档上线及旧方案清理

用户验收 Large 适合复杂曲目，发布 releases/0.5.0-dev.muscriptor.2（XLD core.22 / XML stems.9）。吉他只显示日常Medium/复杂Large；Medium默认，Large batch1。一键、缓存、融合、删除回退与目录统一；GAPS、Basic Pitch guitar、YourMT3 guitar退出菜单和新生成入口，历史结果可读取。XML旧活跃模型生成请求回落到当前默认。MEGURI Large 3156音符已缓存并启用，原Medium和旧MIDI保留。

应用接口3156音符与已验收试听逐音符一致；本轮推理452.172秒、峰值10521MiB，较独立试验耗时波动，不承诺固定速度。双应用回归、7项XML路由、真实缓存/一键/删除回退/目录/手选迁移及双语/单屏/发布窗口通过。共享弦乐/钢琴/贝斯/鼓模型可用。

按明确路径/hash清理50个旧权重、重复模型和废弃试听文件，合计1815463113 bytes（约1.69GiB），磁盘可用空间观测增加约同量。实际曲库旧MIDI、原始音频、分轨WAV、共享模型均保留；历史试听页标注归档。Large权重移动到持久runtime附件。详见 work/guitar-tiers-20260917/HANDOFF.md 和 cleanup-plan/result.json。

## 2026-09-17：弦乐与鼓 MuScriptor 双档试听版

发布 releases/0.5.0-dev.muscriptor.3（XLD core.23 / XML stems.10）。strings、drums 各增加 Medium/Large 备选，保留 YourMT3+ / ADTOF 默认，吉他、钢琴、贝斯原配置不变。复用现有权重，无新下载。新声部 Large 使用官方 FP16 权重加载、batch1，吉他仍维持原配置。独立声部/模型/来源缓存，修复嵌套模型参数浅比较导致的生成后缓存验证失败。

MEGURI 568.75秒整曲完成：弦乐 Medium 3718 / Large 4698 音符，鼓 Medium 2280 / Large 2147。新结果已进入真实曲库缓存，原启用选择保留。鼓按 onset 模型导出100ms音符，同键下次敲击前截断；敲击时间、键位、力度逐项验证不变。固定力度100，不恢复真实力度及连续揉弦。音符数不代表听感优劣，运行负载不同，不作受控速度比较。

双应用回归、14例导出、独立缓存及取消保护、实际发布窗口五声部一键/融合/目录/重启/回收站回退、宽窄/双语/大字、2722文件发布哈希通过。回收站仅验证隔离副本。24段同音源/音色/力度试听实际播放通过，含原WAV与默认/Medium/Large，另附6份完整MIDI。试听 artifacts/muscriptor-parts-20260917/listening/弦乐与鼓MIDI对比.html；交接 work/muscriptor-parts-20260917/HANDOFF.md。用户听评待定，仍为本机开发版，旧发布和用户原始文件保留。

## 2026-09-17：弦乐默认 Large 与 toe Goodbye 鼓对照

用户验收MEGURI MuScriptor Large弦乐，认为优于或可优先于YourMT3+，差距小于吉他对比；鼓的WEG样本因大量变音不适合直接决定默认，指定toe Goodbye复验。
发布0.5.0-dev.muscriptor.4（XLD core.24 / XML stems.10）。弦乐默认Large，YourMT3+、Medium、Basic Pitch保留；首次迁移旧YourMT3+/Basic Pitch默认，保留显式Medium/Large，之后尊重手选。模型参数与缓存身份不变，其余声部默认不变。

本地For Long Tomorrow专辑版Goodbye 425.533秒，经BS-RoFormer SW生成同源鼓轨，再完成ADTOF 2391音符、Medium 2741、Large 2779。任务分别18.516/21.031/98.031秒，音符/鼓键数量不代表准确率。三份整曲缓存已在真实曲库，活跃鼓保持ADTOF。三个固定片段1:00、3:30、6:00各30秒，原鼓WAV与三模型同音色/力度100对照，附完整MIDI；等待用户听评。

双应用完整回归、默认迁移/持久化/一键五声部融合/目录实际UI、删除回退单元检查、宽窄与双语、12段实际播放、2722文件发布哈希通过。试听 artifacts/toe-drums-20260917/listening/toe-Goodbye-鼓MIDI对比.html；交接 work/toe-drums-20260917/HANDOFF.md。原数据与旧发布保留，未做干净VM发行验收。


## 2026-09-17：完整交接、最新试听反馈与更新路线

本次仅文档整理，没有修改应用源码、模型默认、权重或用户生成结果，也没有重新运行模型。同步修正本日志顶部过期日期 / core.8 版本，以及 SOURCE_OF_TRUTH 的 toe 待试听状态。

用户已反馈 toe Goodbye 三模型整体相近，ADTOF 镲片尾音略逊。鼓仍默认 ADTOF；MuScriptor Medium / Large 保留可选。弦乐优先 Large、吉他 Medium / Large 双档的验收结论保持。鼓当前 onset 转约 100 ms 音符，合成尾音不能直接解释为真实 sustain 恢复。

新增 CLAUDE_HANDOFF.md 和 docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md，记录完整阶段线、模型配置、产品边界、真实结果目录、测试证据、已知限制与分阶段计划。近期建议顺序：P0 历史结果与缓存匹配解耦及版本并存；P1 轻量模型页；P2 ChordFormer / BeatThis 独立对照；P3 固定验收曲库；P4 MIDI 可视化与人工编辑层；P5 corpus / 结构比较。以上均为后续计划，未宣称本次实现。

首项技术债有源码依据：core/derived-assets.cjs 历史读取比较当前 profile options / checkpoint；core/analysis-service.cjs 成功重算会清理前次结果。后续需同时保证历史可读、当前缓存准确、有限保留和可回退。

上一轮工程证据仍为 artifacts/toe-drums-20260917 的 regression / verification / defaults-ui / listening-ui / published，发布共 2722 文件；本轮只核对文档、引用路径与源码版本，未复跑软件测试。文档备份与校验存于 work/documentation-handoff-20260917。

## 2026-09-17：MIDI 历史结果可读与模型版本记录（P0 轮次 A）

发布 releases/0.5.0-dev.history.1（XLD core.25 / XML stems.10 不变）。不换模型、不改默认与参数，三份模型清单与上一版逐字节相同。readMidi 拆成两层：ok 表示结果完整并绑定当前分轨 / 弦乐来源，matches 表示由该 engine 当前模型版本生成；只有 matches 才作缓存命中。旧模型版本结果保持可读、可开目录、按活跃选择参与融合，XML 可见；界面标“旧模型版本”，一键计划显示“待生成”，按钮显示“生成 MIDI”。版本身份由清单已有字段推导（engine、model、checkpointSha256、options），不新建注册表。每次运行独立记录 midi/<stem>/runs/<runId>.json，runner 输出直接提升到此处，指针被覆盖前补写旧运行记录；同版本重算替换上一次，不同版本保留。融合 parts 与指纹不变，另记 provenance；runner 新增可选 digests 与 notes.json 的 runId / engine / model。

验证：新增 tests/midi-history.cjs 与 5 处测试扩展，两端 npm test 退出 0；真实 MEGURI / toe 只读差分（旧读取器 vs 新读取器零差异，19 条运行 18 current + 1 已知悬空，168 个文件快照不变，MEGURI 融合仍命中）；隔离硬链接副本一次真实 ADTOF 推理 2391 鼓点，digests 与来源字段写出；发布包窗口检查（现有缓存不变，夹具中模拟旧版本的中英标签，五声部一键 / 融合 / 目录，1580×960 与 1180×780 无溢出）；2722 个包文件哈希。期间用户用 muscriptor.4 新生成的 toe bass / piano 旧形态清单被新读取器读为 current，验证脚本改为不变量断言。随包使用说明回填了此前只存在于暂存副本的三节并新增本轮一节，发布工具改为从项目 source 直接暂存。未实现：同 engine 多版本切换 / 回退、按 runId 激活与删除、保留策略（轮次 B）。详见 work/midi-history-20260917/HANDOFF.md，证据 artifacts/midi-history-20260917。


## 2026-09-17：GitHub 本地基线与仓库关联

为 jiangxin1245234785-stack/Xin-Music-Lab-Fusion 建立 main / origin，纳入当前 history.1 / core.25 源码与精简文档。新增根忽略规则、保留原字节的 Git 属性、GitHub 开发说明和 runtime.local.example.json；运行环境、模型、曲库、生成音频 / MIDI、旧安装包、凭据和本机配置保持本地。常见凭据模式和大文件扫描通过，未修改应用算法或重跑推理。首次远端上传状态以 work/github-setup-20260917/HANDOFF.md 后续验证及远端 main 提交为准。

GitHub 接入后续验证：用户完成设备授权；远端为私有仓库且可推送。初始提交 9d40d55 已上传，远端 main 与本地一致，设置 origin/main 跟踪。模型、运行环境、音乐和生成结果未上传。


## 2026-09-18：面向使用者的文档与试用发布准备

README 改为功能、获取状态、使用入口、模型选择与反馈；旧版归档。新增 docs/USER_GUIDE.md、DEVELOPMENT.md、PREVIEW_RELEASE_PLAN.md；重写两份随包 README 模板。明确源码 ZIP 不包含模型和运行环境，目前没有通用下载包。

确认 history.1 的21条 runtime 路径均为绝对路径、开发种子含个人曲库、MuScriptor共用YourMT3 Python；下一步先做可搬迁包与首次配置，再做干净系统 / GPU 验证。离线 HTML 帮助仍待统一。本轮未改应用版本、模型、现有发行包或仓库可见性，也没有创建 Release。见 work/public-preview-20260918/HANDOFF.md。

## 2026-09-18：相对路径预览

已生成本地 `0.5.0-preview.paths.1`（XLD core.26 / XML stems.11）。环境配置的 21 个路径全部相对 runtime.json 保存；打包同时换算旧绝对配置。程序与 runtime 保留层级即可一起搬迁。曲库和分析结果是用户自己选择的外部目录，继续记录绝对路径，避免因移动程序而失联。

首次使用系统音乐目录与文档/Xin Music Lab/Analysis；预览版偏好独立、不复制个人开发设置。旧版本及已有结果未迁移。MuScriptor 共用 YourMT3 Python 的关系已在配置生成中明确。

本机中文/空格目录搬迁：11 组环境检查通过、6 个 Python 的受检导入路径均在新目录；XLD/XML 启动、目录保留、共享配置与帮助通过。30 秒 toe 鼓片段在新位置用 ADTOF/CUDA 完成转谱，保存及回读 30 个音符。两套源码回归、发布路径及诊断测试通过。

仍未进行原开发目录不可见的独立机器验证。大二进制搬迁测试采用同盘硬链接，不等于新 Windows 安装；强制隐藏 GPU 时发现现有 PyTorch/cuDNN 的 min() 空集合错误，CPU 模式待处理。公开安装包、组件再分发核实和模型安装引导仍待完成。
