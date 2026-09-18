# XML / XLD 完整开发进度与后续计划

交接快照：2026-09-17。项目根目录：`D:/Projects/Xin-Music-Lab-Fusion`。

本文面向后续 Claude 开发，汇总源码、既有阶段报告、测试证据与用户试听决策。标为“计划”的内容未实装；历史测试不是本次重新执行的测试；听评结论只针对用户实际试听样本，不是通用准确率排名。本次只整理文档，不改变程序版本和用户结果。

## 1. 产品目标与范围

XML 是音乐可视化产品，XLD 是本地音乐分析与工作台。XLD 已从段落识别扩展为分轨、细分、MIDI、融合和结果存储的一站式入口。当前目标是把已经好用的能力整理成可持续更新模型的小型平台。

长期分析链仍为：音频 → 声部 → 事件 → 动机 / loop / 节奏 → 声部功能 → 段落 → 发展路径 → 整体结构。

当前主要落实了音频、声部、转谱事件、段落与和弦分析。不要把已存在的 WAV / MIDI 文件管理误称为已经完成 Motif / Loop / Role / Structure 语义层或歌曲比较系统。

用户倾向：先让实际音乐可用，再小步完善架构；核心模型可替换，不重复训练成熟开源模型；优先服务器乐、后摇、失真吉他、弦乐叠奏和 WEG 复杂编配。人工试听是模型默认选择的重要依据。

## 2. 当前版本与目录

| 项目 | 当前状态 / 位置 |
|---|---|
| 最新可运行开发包 | `releases/0.5.0-dev.history.1`，含 XLD.exe、XML.exe（P0 轮次 A，2026-09-17）；`releases/0.5.0-dev.muscriptor.4` 保留 |
| XLD 源码版本 | `source/xld-runtime-baseline`，0.5.0-dev.core.25 |
| XML 源码版本 | `source/fusion-runtime-baseline`，0.5.0-dev.stems.10 |
| 兼容与运行时配置 | `source/shared-analysis` |
| 可视化 Generator 源码 | `source/glitch-generator-typescript`，保留原有材料 / Glitch 工作，不纳入本轮模型改造 |
| 旧发布候选 | `releases/0.5.0-rc.6`，不能代表最新 MuScriptor 功能 |
| 基础隔离环境 | `runtime/0.5.0/envs/{msaf,ai,basic,highres,roformer}` |
| 基础模型和脚本 | `runtime/0.5.0/models`、`runtime/0.5.0/scripts` |
| 附加环境 | `runtime/addons/{muscriptor-v1,yourmt3-v1,refine-roformer-v1,audiosep-v1}` |
| 本机曲库 | `D:/Download/bandcamp` |
| 正在使用的结果 | `artifacts/refinement-three-20260915/analysis` |
| 最新工作与证据 | `work/midi-history-20260917`、`artifacts/midi-history-20260917`（P0 轮次 A）；toe 鼓对照见 `work/toe-drums-20260917`、`artifacts/toe-drums-20260917` |
| 本机 GPU | RTX 5070 Ti Laptop，12 GB 显存 |
| Node | `C:/Program Files/nodejs/node.exe` |
| 开发 Electron | `D:/Program Files/smoke-resonance/node_modules/electron/dist/electron.exe` |
| 只读已安装产品 | `D:/Program Files/xins-music-lab-fusion` |

最新包的 `development-settings.json` 指向上述曲库和分析目录。不要因目录位于 artifacts 下而清理这些真实成果。HF 授权已由用户完成；不在交接文档复制 token。

最新发布证据记录 2,722 个包文件且哈希校验通过。发布到项目 releases 与修改已安装产品是不同动作；目前仍是本机开发版，未完成干净 VM 通用发行验收。

## 3. 开发时间线与重要决策

完整原始记录在 [DEVELOPMENT_LOG.md](../DEVELOPMENT_LOG.md)。以下保留对后续开发有用的阶段与转折。

| 时间 / 阶段 | 已完成内容与结果 |
|---|---|
| 2026-06 至 07 | Glitch 调研、统一音乐帧、XLD 与 Resolver 接入、CPU shadow、WebGL2、预设与双语 |
| 07-29 至 07-31 | D 盘迁移；Generator 源码回填；Material registry / lifecycle / shared Mapping；spectral-fabric、temporal-strata；真实音频工程矩阵通过。原 Material Phase 2 艺术验收仍无正式关闭记录 |
| 09-13 分轨与 MIDI v1 | Demucs 六轨、试听、目录；Basic Pitch 单声部 MIDI；任务取消、重试、保存结果；XML / XLD 共享读取 |
| 09-14 core.1–2 | 纠正职责：分析归 XLD core；XML 仅便利入口和消费。加入两应用往返、焦点刷新、曲目定位与保持播放位置 |
| 09-14 core.3–4 | 钢琴 / 吉他 / 贝斯专用转谱与独立缓存；修复和弦同时音落在同一 MIDI tick 导致错误判定未完成的回读问题 |
| 09-14 后续 | BS-RoFormer SW 默认与 Demucs 备选；工作台默认、曲库侧栏；MIDI 融合；一键 MIDI |
| 09-15 RC.1–6 | 本地打包、隔离环境、离线权重、环境检查、ADTOF 鼓、修复一键输出目录；other 弦乐试验 |
| 09-15 至 09-16 refine3 | AudioSep / Bowed / Mega 三模型与多段试听。用户否定 AudioSep 电子串音，复验 Mega 明显优于 Bowed 的人声 / 失真泄漏 |
| 09-16 mega1 / core.12 | Mega53 整曲，保持采样对齐与目标 / 残差；WEG Flowers of Romance 实曲通过，用户认可可用 |
| 09-16 mega2 / core.13 | 全部 53 目标、六类筛选，输入可用原曲或六轨；默认 other / 弓弦乐 / full / auto |
| 09-16 storage1 / core.14 | 文件体积、筛选、保留、定位、批选、回收站 / 明确确认永久删除、结果依赖保护 |
| 09-16 flow1 / core.15 | 试听与转谱声部独立；明确分轨来源；一键计划；完成等待读回；缓存 / 重算 / 失败状态整理 |
| 09-16 strings1 / core.16 | Mega 整曲弦乐接入 Basic Pitch、单轨 / 一键 / 融合，按细分来源隔离，避免组与子轨重复 |
| 09-16 compact1 / core.17 | 缩小曲目头、按钮、播放器与模型卡片，改善稀疏与多次翻页 |
| 09-16 yourmt3.1–2 / core.18–19 | YourMT3+ 弦乐对比；单屏工作台；用户认可比 Basic Pitch 更连贯，曾改为弦乐默认；增加单模型 MIDI 删除与回退 |
| 09-16 guitar.1 / core.20 | YourMT3+ 吉他试验被用户否定；后续 Guitar-FL 延音不如 GAPS，同样未采用 |
| 09-16 muscriptor.1 / core.21 | MuScriptor Medium 吉他实测明显优于 GAPS，用户接受为默认 |
| 09-17 muscriptor.2 / core.22 | Large 对比有可感知提升；吉他 Medium / Large 双档。退出旧吉他菜单，清理 50 项旧权重 / 重复实验资产约 1.69 GiB，不删用户 WAV / MIDI |
| 09-17 muscriptor.3 / core.23 | MuScriptor 双档接入 strings / drums；与旧模型保持独立结果；修复嵌套 options 的缓存等价判断 |
| 09-17 muscriptor.4 / core.24 | 用户接受 Large 弦乐默认，保留其他弦乐备选；toe Goodbye 三模型整曲鼓对照、试听页与实际曲库缓存 |
| 09-17 最新人工反馈 | toe 三模型整体接近，ADTOF 镲片延音略逊。鼓未获明确切默认指令，保留 ADTOF；建议下一阶段完善模型迭代框架 |

历史 Phase 0–2 属于视觉材料路线；Integration I–V 属于早期整合；RC 与 dev.core 版本属于应用迭代。不要混成一个尚未结束的开发阶段。

## 4. 当前功能完成度

| 功能 | 状态 | 使用与边界 |
|---|---|---|
| 工作台 / 曲库 | 已实现 | 工作台默认，曲库侧栏；概览、段落、和弦、分轨、MIDI；双语、紧凑布局 |
| 段落识别 | 已实现 | SongFormer 与 MSAF；保留机器结果与人工标注边界 |
| 和弦识别 | 已实现 | BTC、CQT、CENS、Hybrid 与已有展示 / 共识逻辑 |
| 六轨分离 | 已实现 | BS-RoFormer SW / Demucs；缓存、取消、试听、目录 |
| Mega53 细分 | 已实现 | 原曲 / 六轨输入，全目标、整曲 / 预览；目标与残差独立保存 |
| MIDI 单轨 | 已实现 | piano、bass、guitar、drums、strings；按模型 / 来源保存与选择 |
| 一键 MIDI | 已实现 | 跟随各声部模型选择，复用可用结果；可加入选定弦乐；与单轨保持同一默认 |
| MIDI 融合 | 已实现 | 按当前有效结果合并，保存整曲秒级时间；鼓标准通道；空音符结果不融合 |
| 输出与清理 | 已实现 | 单轨 / 批量 / 融合目录；单模型 MIDI 回收站删除、回退；WAV 存储管理与依赖保护 |
| XML 往返 | 已实现 | 打开 XLD、返回刷新、结果与试听消费，不复制后端 |
| 模型版本管理 | 部分基础 | 有 models / profiles / 哈希 / 隔离环境；尚无完整更新、版本并存和回滚页面 |
| MIDI 钢琴卷帘与微调 | 未实装 | 已讨论，待节拍和事件契约整理后分步做 |
| 动机 / loop / role / 跨歌比较 | 未实装 | 保持独立长期目标，不能从现有音符数直接宣称完成 |

## 5. 当前模型清单与用户验收

| 任务 | 当前默认 | 备选及结论 |
|---|---|---|
| 基础分轨 | BS-RoFormer SW 六轨 | Demucs htdemucs_6s 备用；不是所有 BS-RoFormer 权重都输出六轨 |
| 细分 | Mega53 | Bowed Strings v2、AudioSep 只做 30 秒预览备选；用户偏好 Mega |
| 钢琴 MIDI | HiRes Piano | Basic Pitch；当前够用，不优先更换 |
| 贝斯 MIDI | HiRes Bass / FiloBass checkpoint | Basic Pitch；当前够用 |
| 吉他 MIDI | MuScriptor Medium | Large 用于复杂失真 / 后摇，用户已接受；不自动根据曲名判难度 |
| 弦乐 MIDI | MuScriptor Large | Medium 快速；YourMT3+ 和 Basic Pitch 备选；YourMT3+ 比 Basic Pitch 连贯，但 Large 又有改善 |
| 鼓 MIDI | ADTOF | MuScriptor Medium、Large。toe 整体相近，ADTOF 镲片尾音略逊；WEG 变音鼓仍困难 |
| 段落 | SongFormer / MSAF 可选 | SongFormer 提供结构标签；MSAF 同字母主要表示算法内相似，不等于人工段落名 |
| 和弦 | BTC + 现有特征方案 | CQT / CENS / Hybrid 是信号特征与模板 / 时序处理方案，不是三个同规模大模型 |

### 5.1 配置入口与不可随意变化的参数

精确 ID、选项、checkpoint revision、sha256 以 `source/xld-runtime-baseline/analysis-midi/models.json` 为准。不要在新页面再维护一份冲突的默认表。

- `piano-highres`：Note_pedal；`note_F1=0.9677_pedal_F1=0.9186.pth`。
- `bass-highres`：`filobass_20000_iterations.pth`。
- `muscriptor-medium`：吉他默认，batch 4；原 FP32 权重与上游 autocast 行为。
- `muscriptor-large`：吉他复杂曲备选，batch 1；既有 FP32 权重路径。不要为省显存静默改成其他精度。
- `strings-muscriptor-large`、`drums-muscriptor-large`：batch 1，CUDA 路径 FP16 权重，CPU 路径 FP32；对应模型身份包含精度标记。Medium 为 batch 4。
- MuScriptor 使用 greedy、CFG 1、sampling false、preludeForcing false；未额外加量化或“修顺”后处理。固定力度不等于模型还原了演奏力度。
- `yourmt3-plus`：弦乐备选，MoE / noPS checkpoint，batch 2 / FP32。吉他已退出。
- `basic-pitch`：0.4.0 ONNX，保留其他适用声部；已退出吉他菜单。
- `drums-adtof`：5 类鼓映射，固定力度；MuScriptor 鼓使用更细 GM 键，但键数更多不是更准。
- `guitar-gaps` 保留历史结果元信息，推理权重已清理，不能直接当作可用模型。
- `analysis-separation/models.json` 中 SW 默认 chunk 588800、overlap 2、normalize false；备用 Demucs。
- `analysis-refine/profiles.json` 的 `strings` 对应 bowed_strings；`strings-all` 对应含更多弦类的 strings。总组与子类输出有重叠。

MuScriptor Medium 权重约 1.23 GB，Large 约 5.47 GB。Large 在已执行弦乐 / 鼓路径上测到约 10,523 MiB 显存峰值，包含加载临时状态；不保证所有配置均能在 12 GB 同时运行。当前优先串行 GPU 任务。显存不足时不能假设操作系统内存会自动且高效地替代显存；CPU / offload 需要后端实际支持与测量。

### 5.2 已知音乐表现限制

失真、揉弦、混响尾音、重叠声部和分轨串音均可能导致音符碎裂或错误。用户对 Basic Pitch 弦乐碎音的推测合理，但不能仅凭听感确认唯一原因就是揉弦。

MuScriptor 与 YourMT3+ 当前输出离散事件，不等于恢复连续 pitch bend、真实弓法、失真或音色。听 MIDI 时，合成器 / soundfont 也影响尾音与连贯性。

MuScriptor 鼓后端输出以 onset 为主；适配器使用约 100 ms 音符，并在下次同键敲击前截止。toe 镲片尾音听感不能直接用来证明哪个模型更准确识别原录音 sustain，应结合鼓键映射、敲击密度和试听音源判断。

## 6. 实曲与验证证据

### 6.1 MEGURI

trackId：`185c26ddfa52bc04f027409331b9b912b43458dd`，约 568.75 秒。

实际目录：`artifacts/refinement-three-20260915/analysis/world's end girlfriend - Resistance & The Blessing/04 MEGURI__185c26ddfa`。

| 声部 | 模型 | 音符数 | 当次记录耗时 |
|---|---|---:|---:|
| strings | YourMT3+ 对照 | 4624 | 见阶段记录 |
| strings | MuScriptor Medium | 3718 | 142.468 s |
| strings | MuScriptor Large | 4698 | 393.453 s |
| drums | ADTOF 对照 | 1596 | 见阶段记录 |
| drums | MuScriptor Medium | 2280 | 最终推理 14.813 s |
| drums | MuScriptor Large | 2147 | 最终推理 108.875 s |

各次 GPU 占用和统计口径不同，不能作严格速度榜；音符数量不是准确率。试听：`artifacts/muscriptor-parts-20260917/listening/弦乐与鼓MIDI对比.html`。用户已接受 MuScriptor Large 弦乐。

### 6.2 toe Goodbye

采用本地《For Long Tomorrow》专辑版，425.533 秒；trackId `5bcc39d9a9bed55ddb658793497951e73a42a71e`。先生成 SW 六轨，三模型统一读取同一 drums.wav。

| 模型 | 音符数 | 整体任务时间 | 不同鼓键数 |
|---|---:|---:|---:|
| ADTOF | 2391 | 18.516 s | 5 |
| MuScriptor Medium | 2741 | 21.031 s | 19 |
| MuScriptor Large | 2779 | 98.031 s | 20 |

试听：`artifacts/toe-drums-20260917/listening/toe-Goodbye-鼓MIDI对比.html`；60、210、360 秒起各 30 秒，原鼓轨 + 三模型，共 12 段；提供 3 份整曲 MIDI，实际曲库缓存已读回。

最新用户反馈：整体差异不大，ADTOF 镲片尾音略逊。保留三选项和 ADTOF 默认，后续按更多曲目与用户决定，不需要再重跑本轮。

### 6.3 最近一次工程验证

证据根目录：`artifacts/toe-drums-20260917`。

- `published.json`：6 个源文件发布，2,722 包文件。
- `verification.json`：模型参数未改变、默认、实际缓存、发布哈希。
- `regression.json`：XLD 完整 npm test 通过；XML 完整 npm test 退出 0。
- `defaults-ui.json`：新默认、首次迁移、保留显式 Medium、手选 YourMT3+ 后重启仍保持、五声部一键缓存、融合、三个目录、双语与 1180×780 / 1580×960。
- `listening-ui.json`：12 段实际播放、宽窄屏。
- `real-parts.json` 与 `listening/comparison.json`：真实推理、导出、通道、时长与试听数据。
- `work/toe-drums-20260917/xld-tests.log`：完整 XLD 测试输出。

前一版 `work/muscriptor-parts-20260917` 还记录 Python 导出、目标隔离、缓存深比较、取消和结果回退等验证。历史性能日志可能含显卡被其他程序占用时的中止尝试，不纳入正常耗时。

未完成：干净机器安装验证、全音乐类型质量评测、完整模型更新框架、MIDI 编辑器。当前无需为文档交接重新执行昂贵推理。

## 7. 核心代码地图

以下均相对项目根目录。

| 文件 / 目录 | 职责 |
|---|---|
| `source/xld-runtime-baseline/core/analysis-service.cjs` | 任务生命周期、后端 / Python 选择、运行、保存、取消、替换清理 |
| `source/xld-runtime-baseline/core/derived-assets.cjs` | stem / MIDI manifests、来源身份、参数 / 权重校验、缓存读取与激活 |
| `source/xld-runtime-baseline/core/refinement.cjs` | Mega 等细分结果与流程 |
| `source/xld-runtime-baseline/core/midi-merge.cjs` | 融合调度；与 Python merge 配合 |
| `source/xld-runtime-baseline/analysis-midi/runner.py` | 统一 MIDI 后端入口和导出 |
| `source/xld-runtime-baseline/analysis-midi/{muscriptor_backend,highres,yourmt3,drums,merge}.py` | 各后端与融合实现 |
| `source/xld-runtime-baseline/analysis-midi/models.json` | 模型配置、能力适用范围、默认与退休信息 |
| `source/xld-runtime-baseline/analysis-separation/models.json` | 基础分轨配置 |
| `source/xld-runtime-baseline/analysis-refine/profiles.json` | 细分模型 / 目标配置 |
| `source/xld-runtime-baseline/derived-controls.js` | 单声部模型、缓存、输出、偏好、删除和弦乐来源 UI |
| `source/xld-runtime-baseline/midi-batch.js` | 一键计划、复用、生成与融合流程 |
| `source/xld-runtime-baseline/{workspace-controls,refinement-controls,storage-controls}.js` | 工作台、细分、存储交互 |
| `source/xld-runtime-baseline/i18n` | 双语文案；新增页面不能只改中文 DOM |
| `source/shared-analysis/runtime-config.cjs` | 环境与路径配置，已有固定白名单 |
| `source/release-tools` | 本机包、运行环境、诊断、哈希和打包验证 |

## 8. 当前技术债与风险边界

### 8.1 最优先：读取历史结果与验证当前缓存耦合

`derived-assets.cjs` 的 profileForResult 依赖当前 models 列表，校验还比较当前 profile.options 与 checkpoint sha256。未来直接替换同一 profile 的权重 / 选项，可能把过去合法生成的 MIDI 判成无效。

必须区分两个问题：历史结果是否完整可信且可展示；它是否满足这一次任务要求、可免推理复用。第二个为 false 不应导致第一个为 false。

兼容迁移需保留来源失配判断：可把旧结果作为“历史 / 来源已变化”查看，但不能误当当前 WAV 对应结果参与一键或融合。保留文件路径约束、MIDI 结构与完整性验证。

状态（2026-09-17，history.1 / core.25）：已拆分。`readMidi` 的 `ok` 只表示完整并绑定当前来源，新增 `matches` 表示与当前模型版本一致，缓存分支只复用 `matches` 的结果；严格 `validate` 与原错误码保留给 runner 输出提升。旧模型版本结果可读、可开目录、按活跃选择参与融合，界面标“旧模型版本”；来源失配仍 `ok:false`。每次运行独立记录 `midi/<stem>/runs/<runId>.json`，指针被覆盖前补写旧记录，不再产生无清单孤儿；同版本重算替换、不同版本保留。真实 MEGURI / toe 只读差分与旧读取器零差异。

### 8.2 同引擎版本还不是独立管理维度

模型菜单已有独立 engine 结果，但 manifest 路径和激活逻辑尚非通用 engine + revision。成功重算还会调用 removeRun / removeStemRun 清理前次结果。不能仅加一个版本字段就宣称支持回滚。

需要明确保留策略：当前使用 + 一份待比较结果 + 用户标记保留；默认不要永久积累全部重算结果。保护被 MIDI / 融合依赖的 WAV，删除由用户显式触发。

### 8.3 有注册表，但新后端仍需多处改代码

任务服务、Python runner、运行时白名单、UI 和部分 XML 适配仍有具体引擎分支。逐步集中“支持什么、怎么启动、结果格式是什么”；无需一次重写所有分析器。

### 8.4 默认选择、当前结果、历史缓存是不同状态

选中模型卡片不代表已生成，也不能误把其他模型缓存显示为本模型完成。一键与单轨必须共用同一决策；不能为了更新模型重置用户每次手选的偏好。

`.4` 弦乐迁移标记为 `xld.midi.strings-default = muscriptor-large-v2`：首次迁移旧 YourMT3+ / Basic Pitch 默认，保留明确 Medium / Large；之后手动选择 YourMT3+ 跨重启保持。未来迁移不要反复覆盖偏好。

### 8.5 时间与音符表达

当前 MIDI 按秒级时序导出，120 BPM 仅为换算常量；未建立真实 tempo map。速度变化分析和节拍对齐不能直接读取该常量。真实力度 / pitch bend / pedal 等应按实际后端输出声明能力，不能把固定默认值当预测。

### 8.6 并发与打包

现有单服务任务控制并不等于已证明多进程共享 GPU 调度。两应用 / 多窗口启动和模型更新不能同时改一个在用权重。新版本任务开始后应固定版本，更新等任务结束。

已有独立本机运行环境不等于通用离线安装器。补齐环境缺失提示和一台干净环境验证后，再决定正式版本标签。

## 9. 下一阶段计划：小步交付

优先级与顺序是建议。用户本轮要求日志与交接，不要求本轮实施以下全部功能。

### P0：版本记录与历史结果兼容（第一项）

目的：升级模型仍能看旧 MIDI，不误命中旧缓存，也不无意丢掉比较结果。

任务：

1. 在既有 manifest 增加兼容字段：schemaVersion、engineId、modelRevision、checkpointSha256、adapterVersion、关键推理参数 / 精度、source 身份及输出文件摘要。尽量复用已有字段，避免双重事实来源。
2. 拆分历史读取校验和新任务 cache-key 匹配。旧 manifest 无新字段时按已知旧配置恢复为 legacy 记录，不伪造新版本来源。
3. 支持同引擎两个版本独立结果和当前激活指针；保留旧 XML 读取接口。新任务失败 / 取消不改变激活结果。
4. 调整成功替换清理：比较模式保留旧版；日常重算保持可理解的有限保留；依赖保护沿用现有存储系统。
5. 一键、单轨、融合都读取同一选中版本；记录融合实际使用的各个 run。

验收：一份现有 MEGURI MIDI 可继续读；模拟 revision A→B 后 A 仍可预览，B 不误命中 A；切回 A 无需重跑；取消 B 保留 A；删除 B 不损坏 A 或其共享 WAV；XML 能读取选定结果。

范围控制：先对 MIDI 链实施，不同时迁移 SongFormer、全部和弦、所有细分历史文件。先用隔离夹具与真实只读样本验证，再发布兼容开发版。

轮次 A 完成情况（2026-09-17，`releases/0.5.0-dev.history.1`，core.25）：任务 1（复用既有字段推导身份，新增可选 `digests` 与 notes.json 来源字段）、任务 2（`ok` / `matches` 拆分，旧清单按原样读取）完成；任务 3 的并存落盘（`runs/` 记录）完成，按 runId 激活与切换未做；任务 4 的“不同版本保留、同版本替换”完成，有限保留策略未做；任务 5 的融合 provenance 完成，单轨 / 一键 / 融合按活跃指针读同一结果。验收项：现有 MEGURI MIDI 可读 ✓；A 可预览 ✓；B 不误命中 A ✓；取消 B 保留 A ✓；删除 B 不损坏 A / WAV ✓；XML 读取活跃结果 ✓；切回 A 无需重跑 ✗（轮次 B）。证据：`work/midi-history-20260917`、`artifacts/midi-history-20260917`。

### P1：轻量模型管理页

目的：用户知道哪个版本在用、适合什么、占多少空间，并能可控地更新。

任务：

1. 命名“模型”，只展示任务类别、用途、当前 / 可选版本、已安装、大小、可用状态。
2. 操作先做设为默认、切换版本、查看结果、移除闲置权重。把模型权重删除和用户 WAV / MIDI 删除分开。
3. 本地审核过的模型清单支持手动检查更新、下载与哈希校验、失败清理、并存安装；尚不做任意 GitHub URL 自动安装 / 插件市场。
4. 同架构兼容权重允许清单更新；新架构 / 新输出需适配器及应用更新，UI 清楚区分。
5. 显示已验证设备条件、是否需要授权、精度；自动降级仅在明确策略下发生并显示，不能悄悄把 Large 换 Medium。
6. GPU 作业串行、固定所选版本；不卸载在用权重和共享环境。按 backend 共享权重，避免每声部复制 Large。

验收：用户不用知道引擎 ID 就能选择常规 / 复杂曲；移除一个版本不删除 MIDI 与其他声部共用权重；离线仍可用已安装版本；现有任务不受检查更新影响。

### P2：两个有实际价值的新适配器

先做 ChordFormer 独立对照，再做 BeatThis。它们用于检验接口，同时补现有能力；不先更换已满意的钢琴、贝斯、吉他或 Mega。

ChordFormer：保留 BTC 和特征方案；适配单 GPU / CPU 配置与统一 chord event；原始标签与归一化标签并存，支持无和弦及不同词表；一小段与整曲分别检查时间对齐；WEG / toe / BCNR / 清晰和声曲试听与可视对照后决定是否进入默认。复杂词表更大不自动代表更准。

BeatThis：独立输出 beats / downbeats 秒级事件与来源版本；先为 MIDI 展示提供可开关网格。不要一开始覆盖 MIDI 原始时间或自动量化；不稳定段允许隐藏网格。固定速度与变速曲均验证。

验收：新后端不影响旧模型缓存，独立卸载不会损坏其他任务；XML 消费统一结果；默认不凭论文分数自动切换。

### P3：固定小型验收曲库

先选 5–8 首或片段：WEG MEGURI / Flowers of Romance、toe Goodbye、BCNR、清晰钢琴、常规流行；另保留同艺人但不同编配的对照。无需立即建立几千首数据集。

每个候选版本记录固定源 WAV、片段起止、分轨模型、转谱版本 / 参数、设备 / 精度、耗时 / 显存、音符文件和同一合成音源试听。用简短人工评价记录串音、漏音、错音、碎音、延音、鼓类别与可编辑性；有人工标注片段再计算音符 / 边界指标，不伪造全曲 ground truth。

默认晋升条件：原来满意的曲目不明显退步，新痛点确实改善，运行成本可接受；始终可回退。音乐听感结论与自动工程检查分开。

### P4：MIDI 可视化与轻量微调

第一轮只读钢琴卷帘、声部开关、原 WAV / 合成 MIDI 对照、缩放与定位，显示真实秒时间；可选拍点网格另层叠加。第二轮加入音符起止 / 音高 / 力度、删除、合并碎音、拆分、撤销和导出。

机器原始音符不覆盖；人工修改作为 edit layer，绑定 sourceRunId。新模型结果另建版本，人工修改不能无提示套到另一套事件上。鼓用鼓键行和 onset 展示，不把人为 100 ms 当真实延音。

节奏分析逐步加入 onset density、IOI 分布、拍内位置、反复模式与局部速度；和声视图区分音频和弦预测与 MIDI 音高集合推断。不要因 MIDI 漏音把唯一推断标签当真值。

验收：编辑后重开仍在、撤销有效、重新转谱不抹去手工稿、原始与编辑导出可区分。暂不做 FL Studio 完整替代、混音器或复杂 DAW 插件。

### P5：结构化 corpus 与比较（长期）

沿既定层级补对象关系：Track 含 sources；Stem 引用 separation run；Event 引用源与时轴；Motif / Loop 引用事件及出现位置；Role 随区间变化；Section 可以跨声部；Structure 连接段落与发展关系。

单曲解析写缓存；比较系统只消费结构化产物，不直接重跑音频。相似性保留旋律动机、节奏、loop、角色、编配轨迹、段落、发展、音色向量，不提前输出唯一总分。人工修订另存，不覆盖模型原始判断。

《Kiji》与《Kora》只作一个样本；补同艺人但不相似、明显相似、明显不相似等对照，避免把系统调成验证预设结论。

### 正式版收尾（穿插进行）

把已接受功能汇入一个明确入口；校验迁移、缓存、删除恢复、取消、磁盘不足提示、环境诊断、离线权重与授权说明。完成一次新用户数据目录启动和一台干净环境验收，再标正式版本。无需等待 P4 / P5 全部实现，也不要求做企业级自动更新服务器。

## 10. 上游候选与来源

以下是截至交接时讨论 / 查证过的研究入口。除“当前模型”列出的已接入模型外，下列更新候选均不代表已安装或已跑本机；接入前复核当时仓库、权重许可与硬件要求。

| 候选 | 用途与优先级 | 原始来源 |
|---|---|---|
| ChordFormer | 和弦候选，P2；研究代码需本地设备与统一结果适配 | [GitHub](https://github.com/mwaseemrandhawa/ChordFormer)、[论文](https://arxiv.org/abs/2502.11840) |
| BeatThis | beat / downbeat，P2；可先不启用额外 DBN 依赖 | [GitHub](https://github.com/CPJKU/beat_this) |
| Transkun V2 系列 | 钢琴候选，低优先；注意踏板延音定义影响比较 | [GitHub](https://github.com/Yujia-Yan/Transkun) |
| Separate-and-Detect | 鼓分离辅助检测研究候选；环境和耗时需要实测，不能宣称胜出现有模型 | [GitHub](https://github.com/ddman1101/Separate-and-detect)、[权重](https://huggingface.co/ddman1101/Separate-and-Detect) |
| SCNet | 四轨分离候选，不是六轨 / 53 目标等价替代 | [GitHub](https://github.com/starrytong/SCNet) |
| BS-Roformer HyperACE | 所讨论权重为人声 / 伴奏，不作为当前全套分轨替代 | [模型卡](https://huggingface.co/pcunwa/BS-Roformer-HyperACE) |

现用模型研究入口：[MuScriptor 仓库](https://github.com/muscriptor/muscriptor)、[MuScriptor 论文](https://arxiv.org/abs/2607.08168)、[Large 模型卡](https://huggingface.co/MuScriptor/muscriptor-large)、[SongFormer](https://github.com/ASLP-lab/SongFormer)。本地确切权重哈希和修订以现有配置与阶段报告为准，不盲目追 latest。

## 11. 建议执行顺序与每轮交付

| 轮次 | 范围 | 明确完成条件 |
|---|---|---|
| A | P0 历史读取 / 缓存拆分，兼容元信息 | 已完成 2026-09-17（`0.5.0-dev.history.1`）：不换任何模型；旧结果继续显示，新版本不误命中缓存 |
| B | P0 同引擎双版本与激活 / 回退 / 删除 | 新旧可比较，单轨 / 一键 / 融合一致 |
| C | P1 模型页最小版本 | 看版本、选默认、看体积、移除闲置模型；共享依赖不损坏 |
| D | P2 ChordFormer + P3 小样本 | BTC 保留；真实同源对照，人工决定是否晋升 |
| E | P2 BeatThis + P4 只读卷帘 | 正确秒时轴、可开关网格，不自动量化 |
| F | 正式版整理 / P4 微调按用户选择 | 清晰入口、升级兼容、诊断；编辑另层存储 |

每轮只解决一个可验收问题，避免同时换环境、换模型、改时轴、重写 UI。新模型依赖 / 下载 / GPU 实测的不确定性大，不承诺固定几天交付。优先让 A、B 成为可独立回退的小版本。

## 12. 接手后的操作与验证

1. 检查实际 package.json、最新发布目录和 development-settings；读取近期证据，不把旧 Source of Truth 历史段落当最新状态。
2. 在 `source/` 编辑；修改前记录相关文件状态。若用暂存目录，先核对与主源码哈希，避免覆盖另一任务改动。
3. XLD 目录执行 `npm test`；XML 目录执行 `npm test`。这是各自 package.json 中已有命令，不等于所有真实 UI / 推理测试都包含其中。
4. 按改动范围补实际路径验证：旧缓存、取消、失败不替换、单轨 / 一键 / 融合、删除与目录；UI 改动实际看宽窄窗口与双语；模型变化只跑必要固定片段和一首整曲。
5. 打包参考 `source/release-tools/README.md`、`RUNTIME-BUILD.md` 与最近工作脚本。归档 build / publish 脚本依赖原暂存结构，不能在 work 目录直接无脑运行。
6. 新包先放独立 releases 目录，沿用正确结果根目录；保留至少一个已验收版本。不要改已安装产品或清理原曲。
7. 更新本次新 HANDOFF、DEVELOPMENT_LOG 顶部与尾部、SOURCE_OF_TRUTH 当前摘要，写清版本、入口、证据、用户待听评项。

### 接手验收清单

- [ ] 找到 `.4` 正确入口和真实分析目录，未启动旧 RC 误报缺功能。
- [ ] guitar Medium / Large、strings Large、drums ADTOF 默认保持。
- [ ] 现有 MEGURI / toe 缓存可读，原 WAV / MIDI 与人工标注未改。
- [ ] 先完成 P0 的小范围变更；未把路线图误写成已实现能力。
- [ ] 改动测试与实际交互证据分别记录；不拿音符数当质量指标。
- [ ] 给用户明确的新版本入口和一条下一步建议。

## 13. 本次文档整理记录

补齐最新状态、模型选择与历史转折；纠正总日志顶部旧版本和 toe“待试听”；新增 Claude 接手入口及本计划。没有运行新的模型、改动应用源码、删除文件或改变默认。上一轮测试证据保留原日期与范围。
