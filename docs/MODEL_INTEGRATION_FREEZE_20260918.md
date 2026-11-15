# 模型接入需求冻结 v1（2026-09-18）

依据：[模型选型调研](MODEL_LANDSCAPE_20260917.md)。本文件冻结“本次模型优化迭代”要接入什么、怎么接、怎么验收、什么不做。冻结后每一轮只改动本文件列出的范围；新增需求进入下一版冻结，不夹带。

状态：**v1 已生效（2026-09-18）。** D1–D3 已由用户拍板（见第 8 节）；D4 固定验收曲库的三首曲目仍待指定。进度：**R1 完成**——Transkun V2 接入（`0.5.0-dev.piano.1`）并在用户 BCNR 听评后成为钢琴默认（`0.5.0-dev.piano.2`，见 `work/piano-default-20260918/HANDOFF.md`）；**R2 完成**——ChordMini · BTC-CL 与 consonance-ACE 在 `0.5.0-dev.chords.1`（XLD core.29）作为备选接入、和弦 runner 迁入 source；用户看过对照页 `artifacts/chords-20260918/compare/index.html` 后拍板 ChordMini 为主引擎，`0.5.0-dev.chords.2`（XLD core.30 / XML stems.12）落实到专辑批量、和弦页默认与 XML 共识先验（见 `work/chords-default-20260918/HANDOFF.md`；`candidates` 字段未实现；ChordFormer 许可 issue 用户选择暂不发，草稿在 chords.1 交接）；**R3 接入完成**——可行性门通过（MDX23C DrumSep 6 stem，CC BY-NC-ND，原仓库已删、Wayback 快照可证；toe 分离 11.1 s ≤ 58.3 s），`0.5.0-dev.drums.1`（XLD core.31）新增备选引擎 `drums-adtof-stems`，ADTOF 仍默认，试听页 `artifacts/drums-stems-20260918/listening` 待用户听评；偏离：鼓组 stem 不存入 refinement/（每曲约 0.9 GB、无消费者），仅 CLI `--keep-kit`（见 `work/drums-stems-20260918/HANDOFF.md`）；**R4 已试验、不纳入**——Beat This! 完整接入并发布过 `0.5.0-dev.beats.1`，用户听评判定除 MEGURI 外不可用（倍频错误与强拍漂移，独立核对见 `work/beats-20260918/HANDOFF.md`），2026-09-18 全部回滚，发布与权重删除。**冻结 v1 最终交付 R1 / R2 / R3 三轮；R4 记为已试验不纳入。**

## 0. 基线与并行工作

- 源码基线：`source/xld-runtime-baseline` 当前为 0.5.0-dev.core.26、`source/fusion-runtime-baseline` 为 0.5.0-dev.stems.11，含尚未提交的 portable-paths 改动（`shared-analysis/user-paths.cjs`、`runtime-config.cjs`、两端 `desktop/main.cjs`、release-tools；见 `work/portable-paths-20260918`）。本迭代以该工作提交后的 HEAD 为起点；在此之前不改 `runtime-config.cjs` 白名单与 release-tools。
- 已发布参考：`releases/0.5.0-dev.history.1`（P0 轮次 A）。P0 轮次 B（版本切换 / 回退 / 保留策略）与本迭代并行、互不阻塞：新引擎只在 `models.json` 新增条目，不改既有条目，历史结果与 `runs/` 记录机制直接复用。
- 运行环境：`runtime/0.5.0/envs/{msaf,ai,basic,highres,roformer}` 与 `runtime/addons/{muscriptor-v1,yourmt3-v1,refine-roformer-v1,audiosep-v1}`。新引擎优先复用已有解释器；不兼容时按 addon 惯例新建 `runtime/addons/<name>-v1`（含 `addon-manifest.json`、README、权重 sha256）。

## 1. 冻结原则

1. 不改任何现有默认（分轨 SW、细分 Mega 53、钢琴 HiRes、贝斯 FiloBass、吉他 MuScriptor Medium、弦乐 MuScriptor Large、鼓 ADTOF、和弦 BTC、段落 SongFormer）。新引擎一律以“备选”卡片接入；是否切默认由用户在固定曲库上人工试听 / 可视对照后另行决定，论文分数不作为切换依据。
2. 每个新引擎独立缓存、独立结果目录、独立 `runs/` 记录；不覆盖、不删除任何旧结果；失败 / 取消不改变活跃结果。
3. 每一轮一个可验收问题、一个独立开发版目录，可单独回退；先隔离夹具与真实只读样本验证，再发布。
4. 许可证逐项记录：个人本机使用为准；再分发条款单列。无许可证的权重不进发布包，除非用户明确拍板。
5. 不在本迭代做 UI 大改：新引擎复用既有模型卡片 / 和弦模型选择 / 概览摘要；节拍网格等新展示留待 P4。
6. 音符数、和弦数不作为质量指标；每轮记录耗时、显存峰值、失败情况。

## 2. 纳入项总览

| 轮 | 项目 | 模型 / 方法 | 收益依据（调研） | 许可证 | 环境 | 开发版 |
|---|---|---|---|---|---|---|
| R1 ✓ | 钢琴 MIDI 备选引擎 | Transkun V2（pip 检查点；V2 Aug 未接） | MAESTRO with-offset F1 93.5 vs HiRes 82.5；带力度与踏板 | MIT | 已装入 `envs/highres`（--no-deps） | `0.5.0-dev.piano.1` 已发布 2026-09-18 |
| R1 备选 | 钢琴第二备选（条件触发） | Aria-AMT `piano-medium-double-1.0` | 面向多样录音条件，MAPS 90.6 vs Kong 83.1 | 代码 Apache-2.0 / 权重 CC BY-NC-SA 4.0 | Python 3.11 + BF16，需 addon | 仅当 Transkun 在固定曲库上未通过听评时启动 |
| R2 | 和弦对照引擎 | ChordMini BTC-CL（同 BTC 架构、170 词表）；consonance-ACE（Conformer，root / bass / 音级分解输出） | ChordMini 各项高于 BTC teacher 1–3 点；consonance-ACE 提供转位与多候选 | 均 MIT | ChordMini 复用 BTC 所在 `envs/ai`（待验证）；consonance-ACE Python 3.11 → `addons/chords-v1` | `0.5.0-dev.chords.1` |
| R2 待拍板 | ChordFormer | 6 头结构化词表 + HMM，5 折集成 | 1217 曲 majmin 84.09 vs Jiang 2019 82.62 | **无 LICENSE** | 独立 addon | 见第 8 节 |
| R3 | 鼓 7 类 + 力度 | 鼓组分离 → ADTOF onset / 类别 → 按分离 stem 判定 crash / ride、估计力度（Riley & Dixon 2025 路线，自行实现） | 8 类 F 提升 10–12 点；补齐“5 类、固定力度”两大限制 | ADTOF 移植权重沿用；分离权重许可需明确 | 复用 `envs/highres`（ADTOF）+ roformer 推理 | `0.5.0-dev.drums.1`，有可行性门 |
| R4 待拍板 | 节拍 / 强拍 | Beat This! v1.1.0（PyPI `beat-this`） | 无 DBN 的稳定追踪器，MIT，活跃维护 | MIT | pip 装入 `envs/ai` 或 `addons/beats-v1` | `0.5.0-dev.beats.1` |

顺序按确定性收益与接入成本：R1 → R2 → R3 → R4。任一轮受阻不阻塞后续轮。

## 3. 每个新引擎的通用要求

接入点（以现有代码为准，不新建第二套后端）：

1. 注册：MIDI 引擎在 `analysis-midi/models.json` 新增条目（`id`、`name`、`stems`、`model` 唯一字符串、`backend`、`checkpoint{file,sha256,size,repository,revision}`、`options` 含 `adapterVersion`），不改既有条目；和弦引擎在 harmony runner 的 `ENGINES` 与 `HARMONY_ENGINE_IDS` 注册（见 R2）；节拍为新结果类型（见 R4）。
2. 运行：Python 侧在对应 runner 增加 `backend` 分发与 `--engines` 就绪探针（包 + 权重 sha256 / 大小）；Node 侧 `pythonFor` 映射到解释器；新增环境变量必须同时进入 `shared-analysis/runtime-config.cjs` 白名单、`release-tools/test-diagnostics.cjs`、`runtime.local.json` 与工作目录的 `runtime.build.json`。
3. 探针与列表：`analysisService.midiEngines()` 的代表引擎探针数组、`app.js` 与 `workspace-controls.js` 的引擎 id 列表、i18n 中英文名与用途说明（`i18n/runtime-messages.js` 两套目录同时加，`tests/i18n-step6.cjs` 校验对齐）。
4. 结果契约：MIDI 保持 `midi/<stem>/<runId>/{<stem>.mid,notes.json}`、`timeOrigin 0`、120 BPM 换算基准、不量化；notes.json 的 `velocity` 字段写真实预测值（有力度的引擎）或固定值并在 `backend.velocityMode` 声明；踏板写 CC64；不伪造未预测的字段。和弦保持 `schemaVersion 2` 的 `segments[{start,end,label,confidence}]` 与 summary，新增 `rawLabel`（原词表标签）与 `vocabulary` 字段为可选附加。
5. 缓存与版本：新引擎自动获得 P0 的 `identity / matches` 与 `runs/` 记录；`model` 字符串含权重 sha 前缀与适配器版本；`tests/midi-history.cjs` 的唯一性检查必须通过。
6. XML：只读活跃结果，零改动；如新增结果类型（节拍），music-lab.json 只做可选字段追加，`xld-timeline-provider-adapter` 的校验必须继续接受旧清单。
7. 测试：每个引擎至少一份假 runner 的服务层回归（`tests/midi-models.cjs` 模式）与一次真实短推理（隔离硬链接夹具，不写真实曲库）；两端 `npm test` 通过；发布包窗口检查复用 `work/midi-history-20260917/defaults-ui.cjs` 模式。
8. 记录：每轮 `work/<round>/SPEC.md`、`HANDOFF.md`，证据入 `artifacts/<round>`；DEVELOPMENT_LOG、SOURCE_OF_TRUTH、CLAUDE_HANDOFF、路线图同步；试听页与上一轮同规格（固定 30 s 片段、同一合成音源与力度处理、原 WAV 对照）。

## 4. R1 钢琴：Transkun V2

需求：
- 引擎 id `piano-transkun`，声部仅 piano，`backend: transkun`，作为 HiRes 的备选卡片；用途说明“高精度钢琴（含力度与踏板）”。
- 权重：先用 pip 包 `transkun==2.0.1` 自带的默认检查点（V2 No Pedal Ext），记录包版本与检查点文件 sha256；`options` 记录 `checkpointVariant`。可选第二条目 `piano-transkun-aug`（Drive 上的 V2 Aug 检查点，手动下载后校验 sha256），二者独立缓存。
- 输出：音符起止、真实力度、CC64 踏板；由现有 runner 重建 120 BPM 时间基的 MIDI 与 notes.json；`backend.velocityMode = "predicted"`。默认检查点的音符长度不含踏板延音，需在用途说明与 HANDOFF 写明。
- 性能预算：整曲（约 10 分钟）在 CPU 或 GPU 上 ≤ HiRes 的 3 倍时间；显存不设硬上限（模型 12.9M 参数）。
- 环境：先尝试在 `envs/highres`（Python 3.12，torch 2.11 cu128）安装 `transkun` 及依赖（ncls、pretty-midi、mir-eval、pydub、sox）；任一依赖无法安装则新建 `addons/transkun-v1`，不改动 highres 环境。
- 验收：MEGURI、清晰钢琴曲、常规流行曲三曲整曲成功并回读；同一片段 HiRes / Transkun / 原 WAV 试听页；踏板事件存在且时间在曲长内；一键计划在“未选 Transkun”时不受影响；缓存、取消、失败保留、删除回退通过；用户听评后决定是否改钢琴默认（不在本轮）。
- Aria-AMT 条件触发：仅当用户听评认为 Transkun 在固定曲库上不优于 HiRes；接入方式同上（引擎 `piano-aria`，addon Python 3.11，权重 CC BY-NC-SA 4.0 标注）。

## 5. R2 和弦：ChordMini 与 consonance-ACE（ChordFormer 待拍板）

现状与结构变更：
- 和弦 runner 目前在 `runtime/0.5.0/scripts/analysis-harmony/harmony_runner.py`（含 BTC 代码目录 `btc/`），不在 `source/`。本轮把 `analysis-harmony`（runner 与 BTC 适配代码）纳入 `source/xld-runtime-baseline/analysis-harmony`，runtime 目录只保留环境与权重，与 MIDI / 分轨 / 细分一致；`runnerFor` 指向源码内脚本。这是本轮唯一的结构性改动，单独一次提交并验证四个现有和弦引擎结果逐字节不变。
- `HARMONY_ENGINE_IDS` 同时出现在 `desktop/main.cjs`、`core/analysis-service.cjs` 与 `tests/repair-static.cjs` 的字面量断言中，三处同步更新。

需求：
- 新增引擎 `chord-chordmini`（BTC-CL 检查点，170 词表）与 `chord-consonance`（Conformer 分解模型）。二者输出统一 `segments[{start,end,label,confidence,rawLabel}]`：`label` 为现有 XLD 风格归一化标签（沿用 `mirex_to_label`），`rawLabel` 保留原词表；无和弦记 `N`；consonance-ACE 额外输出 `bass`（转位）与 `candidates`（top-3 及分数）为可选字段，供现有“共识展示”后续使用。
- 词表与时间对齐：短片段（30 s）与整曲分别检查段落边界的时间一致性（误差 ≤ 一帧）；不同引擎的帧率差异在 runner 内换算为秒。
- 环境：ChordMini 先尝试在 BTC 所在 `envs/ai` 加载（同架构，需其仓库代码）；consonance-ACE 建 `addons/chords-v1`（Python 3.11 + torch）。权重 sha256 与来源 URL 记入 addon-manifest。
- UI：和弦工作台现有模型选择加入两项，文案说明“同架构蒸馏版 / 分解式多候选版”，共识逻辑不改；XML 通过 music-lab.json 的 harmony 车道读取，新增引擎为追加项。
- 验收：四个旧引擎结果与迁移前逐字节一致；新引擎在 WEG、toe、BCNR、清晰和声曲各一段整曲成功；与 BTC 的和弦序列对照页（时间轴并排 + 差异段落列表）；`N` 与转位样例检查；缓存、取消、失败保留通过。
- ChordFormer：**已拍板不纳入本迭代**（D1）。R2 结束时向作者仓库提 issue 询问许可；获得明确许可后进入下一版冻结，接入方式预留为引擎 `chord-chordformer`、独立 addon、5 折集成 + HMM 按官方 `chord_recognition.py`（需修正硬编码 GPU 索引与数据路径，权重目录约 368 MB）。

## 6. R3 鼓：7 类与力度（分离 + ADTOF）

可行性门（进入实现前必须满足，任一不满足则本轮延后并记录）：
- 找到可公开下载、许可证明确、且能用现有 roformer 推理代码（BS-RoFormer / Mel-RoFormer yaml + ckpt）运行的鼓组分离权重，输出至少 kick / snare / toms / hi-hat / cymbals（crash 与 ride 分开更佳）；候选为 MSST 模型库中的鼓分离条目与 gilliaan Drums v1（许可未声明，需确认）。
- 在 toe Goodbye 鼓轨上一次试跑，分离耗时 ≤ 基础六轨分离耗时。

需求：
- 引擎 id `drums-adtof-stems`，`backend: adtof-stems`，作为 ADTOF 的备选卡片；`drums-adtof` 原条目与结果不动。
- 流程：现有 drums stem → 鼓组分离（结果作为细分 WAV 存入 `refinement/`，走现有存储管理与依赖保护）→ ADTOF 在原鼓轨上给 onset 与 5 类 → 对 cymbals 类按 crash / ride stem 在 onset 附近的能量比判定；hi-hat 是否区分开合按分离模型能力决定，不能区分则保持一类 → 力度：以对应 stem 在 onset 窗口内的峰值 / RMS 做曲内归一化映射到 1–127，`backend.velocityMode = "stem-energy-relative"`，说明书写明“相对力度，不是录音真实力度”。
- 输出：GM 鼓键（kick 36、snare 38、hi-hat 42/46、toms 45/47/48/50、crash 49、ride 51，具体映射写入 `options.drumMap`）；每次敲击仍为约 100 ms 音符并在下次同键敲击前截止（沿用现有规则）；notes.json 同时保留 ADTOF 原 5 类标签于 `backend.classMap` 供回溯。
- 验收：toe Goodbye 与 MEGURI 整曲；总敲击数与 ADTOF 基线相差 ≤ 2%（只是重新分类，不是重新检测）；crash / ride 分配的抽样试听；安静段力度低于高潮段（统计对照）；三方试听页（ADTOF / 新引擎 / 原鼓轨）；融合使用新引擎时力度写入合并 MIDI。
- 明确不做：不重训 ADTOF；不接 Separate-and-Detect（环境重、无公开数值）；不声称恢复真实演奏力度。

## 7. R4 节拍：Beat This!（待拍板）

需求（若纳入）：
- 新结果类型 `rhythm`：`rhythm/beat-this.json`，`schemaVersion 1`、`kind: beats`、`engine: beat-this`、`version`（pip 版本 + 检查点名与 sha256）、`source`（原曲文件身份）、`beats[]`、`downbeats[]`（秒）、`tempo`（全局中位 BPM）、`localTempo[]`（按拍间隔的局部 BPM 曲线）、`stability`（拍间隔变异系数）。
- 输入为原曲（不是分轨）；GPU 或 CPU 均可；整曲耗时目标 ≤ 30 s。
- UI：概览显示估计速度、拍号稳定性与“慢段 / 自由速度段可能不可靠”的提示；不在 MIDI 页画网格（P4）；不做任何量化。
- XML：music-lab.json 追加可选 `rhythm` 字段；旧清单不受影响。
- 验收：固定速度曲（常规流行）与变速 / 自由速度曲（WEG、toe 慢段）各一首；与人工数拍的 30 s 片段对照；SMC 报告指出的低速失效在慢段出现时，只需正确标注不稳定，不算失败。
- 环境：`pip install beat-this` 到 `envs/ai`；失败则 `addons/beats-v1`。

## 8. 待拍板决策

| # | 决策 | 选项 | 建议 | 拍板结果（2026-09-18） |
|---|---|---|---|---|
| D1 | ChordFormer 无 LICENSE，是否纳入 R2 | A 不纳入，先向作者询问许可，下一版冻结再定；B 纳入为“仅本机试验”引擎 | A | **A：不纳入。** R2 只接 ChordMini 与 consonance-ACE；R2 结束时向 ChordFormer 作者仓库提 issue 询问许可 |
| D2 | R3 鼓管线（论文无公开代码，需自行实现） | A 设可行性门，找到许可明确的鼓组分离权重即做；B 本迭代不做，等作者开源 | A | **A：设可行性门后做** |
| D3 | Beat This! 是否进入本迭代 | A 作为 R4 纳入（仅计算、存储与概览摘要）；B 延后到 P4 钢琴卷帘一起做 | A | **A：纳入 R4** |
| D4 | 固定验收曲库的具体曲目 | 需用户填写：WEG MEGURI、WEG Flowers of Romance、toe Goodbye 已定；BCNR 一首、清晰钢琴一首、常规流行一首待指定 | — | 待补充；R1 试听页制作前提供即可 |

## 9. 明确不纳入本迭代

- 分轨与细分不换模型：只做调研建议的核对（MVSEP 排行榜、SW 权重出处）与 Mega 53 吉他 / 钢琴目标 vs SW 的同源 A/B 试听，不接新权重。
- 吉他、弦乐叠奏、贝斯不换模型（无可下载的更好权重）；不用 GOAT 数据自行微调（属独立训练项目）。
- 不接 AudioSep 后继（用户已否定该路线）、BeatFM（草稿无代码）、Separate-and-Detect、Kim & Park、TA、Harmonica（闭源）。
- 力度 / 弯音补全（Diff-SFProxy、PESTO v2 + RMS 近似）不在本迭代；等 Diff-SFProxy 发布后单独评估。
- 不做 P0 轮次 B、P1 模型页、P4 卷帘与编辑、P5 语料比较；不改已安装产品；不做干净 VM 验收。

## 10. 风险与缓解

- 环境冲突：新依赖装进共享环境可能破坏现有引擎 → 先在环境副本验证，或直接建 addon；每轮结束运行现有环境检查（`检查环境.cmd` / `check-runtime.cjs`）确认旧引擎仍就绪。
- 和弦 runner 迁入 source 的回归 → 迁移单独提交，四引擎结果逐字节对照后再加新引擎。
- 显存：R1、R2、R4 模型小；R3 分离与 ADTOF 串行执行，沿用单任务互斥。
- 并行工作：portable-paths 正在改 `runtime-config.cjs` 与 release-tools；本迭代在其提交后开始，每轮开始前重新记录基线哈希。
- 版本身份：新引擎的 `model` 字符串与身份必须唯一，`tests/midi-history.cjs` 会拦截重复。

## 11. 交付顺序

1. 用户拍板 D1–D4 → 冻结生效（本文件状态改为“已生效”，记录拍板结果）。
2. R1 钢琴（预计一轮）→ 试听页交付 → 用户听评。
3. R2 和弦（含 runner 迁入 source，两次提交）→ 对照页交付。
4. R3 鼓（先过可行性门）。
5. R4 节拍（若纳入）。
6. 每轮独立开发版、独立 HANDOFF；迭代结束更新路线图 P2 / P3 状态。
