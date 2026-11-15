# Claude 接手入口：XML / XLD

最新本地入口（2026-11-12，优先于下方历史）：**releases/0.5.0-dev.score.25（XLD core.76 / XML score.25）**，上一稳定score.21。XML已接入“按录音强弱显示”，默认关闭；显式生成独立力度副本，缓存、进度、取消、强制复跑、原值回退、中英与重开记忆齐全。原音频/MIDI/分析只读，每次完成留新run，失败/取消不替换旧副本；已有动态、人工修订和人声曲线保持。完整默认/最小窗口验收、40组/240状态、启用副本64次换歌、22→25缓存复用、播放连续与169原文件SHA通过；6后端、147谱面、38适配器改坏、48渲染和两个exe通过。新包2803/旧包2800文件完整；XLD包内固定为21已验证基线，工作区额外XLD改动保留未混入。阶段22–25与源码SHA均留存，未提交。见 [当前交接](work/score-dynamics-20261112/HANDOFF.md)、[验收报告](work/score-dynamics-20261112/REPORT.md)、[后续清单](work/score-dynamics-20261112/NEXT_WORK.md)。

节拍候选更新（2026-10-26，优先于下文历史）：当前本机入口为 `releases/0.5.0-dev.tempo.1/XLD.exe`，XLD core.73 / XML stems.13。MuScriptor v0.4.0（8a1ef886）已作为弦乐的“v0.4 · 节拍试验”独立卡片；默认仍是用户确认的4c03caf/50ms。新拍点分析在CPU处理原曲，正常MIDI/编辑/混合仍按秒且不量化，另行导出带速度图的谱面MIDI；谱面可能增加弱起留白。Large权重不变，无新的音符精度结论。真实MEGURI/toe拍点与导出、既有回归和对照页逻辑通过，拍号未确定、听评待用户验收；MEGURI音符复用已验收事件，本轮未重新运行Large GPU。旧strings.1及原数据保留。详见[本轮报告](work/muscriptor-v04-20261026/REPORT.md)和[试听对照](work/muscriptor-v04-20261026/listening/index.html)。未发布GitHub。


弦乐更新（2026-10-18，优先于下文历史）：当前本机开发版 `releases/0.5.0-dev.strings.1/XLD.exe`，XLD core.72，XML stems.13。项目根目录“启动XLD.cmd”为新入口。用户确认MuScriptor Large“新版＋填空50ms”有明显提升，已设为默认，并提供原时序Large备选。固定上游4c03caf单独目录，其他用途保留原上游/配置，权重复用。旧MIDI/人工修订可切回，不批量重算；原storage.1保留。回归与30秒真实GPU输出/预览一致性已通过，个人听评不作普适精度声明。详见[本轮交接](work/muscriptor-update-20261018/HANDOFF.md)。未发布GitHub。


管理补验（2026-09-24）：workbench.8/core.69 源码与包未变；标注增改删、版本保留/切换/指定删除回退、自动结果清理取消/确认、WAV保留保护通过。见[本轮交接](work/workbench-management-20260924/HANDOFF.md)。剩余模型任务实跑、部分管理分支与正式发行验收继续按清单推进。

工作台界面整合进度（2026-09-23，优先于下文历史版本）：workbench.8/core.69 完成第四轮核心编辑/监听/导出综合验收，XML stems.13。新增空结果引导并调整属性/日志顺序；真实导出、融合、草稿跨版本恢复和新进程重启通过。见[第四轮交接](work/workbench-review-20260923/HANDOFF.md)及[53项验收记录](work/workbench-review-20260923/FEATURE_ACCEPTANCE.md)。部分模型/管理分支与正式发行验收仍待补。

## 最新接续计划（2026-09-23，优先于下文历史“下一步”）

先读[R17交接](work/track-layout-20260923/HANDOFF.md)、[统一试听与MIDI修正企划书](docs/XLD_PLAYBACK_EDITING_PROJECT_PLAN_20260922.md)。当前tracklayout.3/core.65；R12–R16及追加轨组整理已完成本机工程验收。下一步收集折叠编辑、轨头控制与真实听感反馈，FL Studio继续暂缓。

更新：2026-09-23。主项目：`D:/Projects/Xin-Music-Lab-Fusion`。

最新进度：同声部多乐器默认折叠，合看时按所选音符原instrument编辑；展开与拖动显示排序按曲目记忆。WAV/MIDI、M/S与音量收进轨头。混选不隐式改归属，播放始终消费原乐器轨以免重复。真实MEGURI修改指定乐器/其他乐器保护、布局恢复、完整保存/导出/融合/重启已验证；原件保持。详见[本轮交接](work/track-layout-20260923/HANDOFF.md)。

## 先读这些

1. 本文件：立即接手所需的状态和边界。
2. [完整进度、决策、已知问题与分阶段计划](docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md)。这是本次交接的主要文档。
3. [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)：当前版本和历史职责变更；顶部当前状态优先于后面的历史快照。
4. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)：2026-06 至今的完整时间线，按需查相应阶段。
4a. [模型选型调研（2026-09-18）](docs/MODEL_LANDSCAPE_20260917.md)：当前基线维护状态、可替代候选的论文 / 日期 / 许可证 / 同比数值与试验顺序建议；做模型优化迭代前先读。
4b. [模型接入需求冻结 v1（2026-09-18，已生效）](docs/MODEL_INTEGRATION_FREEZE_20260918.md)：本次模型优化迭代的范围、四轮顺序（R1 Transkun 钢琴 → R2 ChordMini / consonance-ACE 和弦 → R3 鼓 7 类 + 力度 → R4 Beat This）、通用接入要求、验收与不纳入项；实现时以此为准，不夹带新需求。
4c. [**音符级 MIDI 修正：交接与后续开发计划（2026-09-22）**](docs/XLD_MIDI_EDITING_HANDOFF_20260922.md)：**接手这个方案先读这一份**。十一轮开发已交付（R1–R11），里面有：已锁定的约定（不要重新讨论）、**实测推翻企划书的三处**、R11 的具体入口与已交付轮次的历史接缝、仍未决的问题、明确欠着的债、硬约束与测试链清单。
5. [最新 R17 交接](work/track-layout-20260923/HANDOFF.md)（tracklayout.3，折叠、排序、轨头控件）；[R16 交接](work/note-shape-20260923/HANDOFF.md)（noteshape.2，音符合并/拆分）；[R15 交接](work/hybrid-20260923/HANDOFF.md)（hybrid.1，WAV/MIDI混播）；[R14 交接](work/multimidi-20260923/HANDOFF.md)（multimidi.1，多轨MIDI与M/S）；[R13 交接](work/consistency-20260923/HANDOFF.md)（consistency.1，草稿融合与和声计算）；[R12 交接](work/transport-20260922/HANDOFF.md)（transport.1，统一试听）；[R11 交接](work/midi-export-20260922/HANDOFF.md)（export.1，导出、草稿回找与完整工程验证）；[R10 交接](work/midi-editor-20260922/HANDOFF.md)（edit.1，音符编辑、草稿与保存）；[R9 交接](work/pitch-zoom-20260922/HANDOFF.md)（pitch.1，固定行高、纵向滚动、128× 缩放）；[R8 交接](work/viewport-render-20260922/HANDOFF.md)（viewport.1，视口绘制与画布复用）；[R7 交接](work/note-selection-20260922/HANDOFF.md)（selection.1，音符选择与只读属性）；[R6 对照与循环](work/compare-loop-20260922/HANDOFF.md)（compare.1）；[R4 写入器交接](work/revision-writer-20260921/HANDOFF.md)（**MIDI 编辑方案 R4**：修订写入器——**实测推翻了企划书的校验形状**：未编辑乐器用 **MTrk 块 SHA-256**（字段遍历结构上不可能失败），被编辑乐器对照**请求的音符**（企划书把它排除在外，而那是唯一会出错的地方）；六类会被序列化器吃掉的音符写前即拒；激活失败会把父记录放回去；writer.1）；[MIDI 编辑方案 R3](work/revision-record-20260920/HANDOFF.md)（**人工修订成为一等版本**：人工修订成为一等版本——engine id 是 **`manual-revision`**（不是企划书写的 `manual`，那个 id 已被人工标注占用），**永远 superseded** 是已接受的后果；回收守卫已用行为证明承重；XML 转谱按钮曾会直接覆盖修订，已堵；revision.1）；[MIDI 编辑方案 R5](work/audition-20260920/HANDOFF.md)（**单轨试听**：单轨 MIDI 试听——这个应用第一次自己发声，手写合成，够判断音高 / 起音 / 时长，**判断不了鼓类别与音色**；audition.1）；[MIDI 编辑方案 R2](work/instrument-lanes-20260920/HANDOFF.md)（**乐器维度**：时间轴不再把一个声部当成一件乐器——弦乐拆成 cello / string ensemble / contrabass / violin / viola，吉他拆成失真 / 清音 / 木吉他，数据一直在 `.mid` 里，只是没人读过；instrument.1）；[MIDI 编辑方案 R1](work/merge-skip-20260920/HANDOFF.md)（换过弦乐来源不再让整个融合失败，被落下的声部连同原因一起说出来，merge.1）；[删繁就简](work/retirement-20260919/HANDOFF.md)（退役 MSAF 四变体 / 两个 MuScriptor 鼓 / Bowed Strings / AudioSep，段落引擎合成一份 registry，新增全库结果清理，retire.2）；[分析结果删除改为可撤销且不谎报](work/result-delete-20260919/HANDOFF.md)（原按钮用 `fs.rm` 永久删除、吞掉失败、无条件报成功，results.1）；[修 history.2 的数据丢失回归](work/midi-keep-fix-20260919/HANDOFF.md)（被标记保留的版本会被同版本清理硬删，history.3）；[P0 轮次 B](work/midi-versions-20260919/HANDOFF.md)（同引擎多版本切换 / 回退 / 按 runId 删除 / 有限保留，history.2；保留策略与磁盘增量都在里面）；[单轨和声协调](work/timeline-harmony-20260919/HANDOFF.md)（轨下条带可切换「演奏方式 / 和声关系」，timeline.7）；[鼓默认切换](work/drums-default-20260919/HANDOFF.md)（切到 ADTOF · DrumSep 7 类，drums.2；附旧结果清理工具）；[弦乐分件撤回](work/strings-revert-20260919/HANDOFF.md)（**弦乐分件三轮已全部撤回**，revert.1；撤回理由、证明与保留的知识都在里面）；[可行性门](work/strings-gate-20260918/HANDOFF.md)（弓弦乐可分性实测，结论仍然有效）；[弦乐分件第 1 轮](work/strings-split-20260918/HANDOFF.md)（violin / cello 成为正式声部，strings.1；可行性门见 work/strings-gate-20260918）；[角色层第 1 轮](work/timeline-roles-20260918/HANDOFF.md)（柱式 / 分解和弦 / 线性的判读与上色，timeline.6）；[时间轴第 5 轮](work/timeline-locate-20260918/HANDOFF.md)（定位光标取代跟随、Shift 取代 Alt，timeline.5）；[时间轴第 4 轮](work/timeline-nav-20260918/HANDOFF.md)（导航：平移、缩放保持中心、轨头钉住，timeline.4）；[时间轴第 3 轮](work/timeline-annotate-20260918/HANDOFF.md)（图上标注和弦与段落，模型结果不被改写，timeline.3）；[时间轴第 2 轮](work/timeline-focus-20260918/HANDOFF.md)（单轨查看 + 修好播放光标，timeline.2）；[时间轴第 1 轮](work/timeline-20260918/HANDOFF.md)（段落 / 和弦 / MIDI 音符共轴只读视图，原 MIDI 页签改名转谱，timeline.1）；[R3 鼓](work/drums-stems-20260918/HANDOFF.md)（鼓：ADTOF · DrumSep 7 类 + 相对力度备选，drums.1，试听页 `artifacts/drums-stems-20260918/listening`）；[ChordMini 成为和弦主引擎](work/chords-default-20260918/HANDOFF.md)（chords.2）；[R2 引擎接入](work/chords-20260918/HANDOFF.md)（chords.1，含对照页 `artifacts/chords-20260918/compare`）；[R4 节拍试验并放弃](work/beats-20260918/HANDOFF.md)（Beat This! 在本曲库上不可用，代码已回滚，仅留证据）；

不必一次读完全部历史、模型权重或生成音频。先完成一个小迭代。

## 当前可用版本

- 最新开发版：releases/0.5.0-dev.tracklayout.3/XLD.exe（同目录XML.exe）。轨组可折叠、排序，监听控件位于轨头；折叠只影响视图，不合并原MIDI文件。
- 源码：XLD `0.5.0-dev.core.65`；XML `0.5.0-dev.stems.13`。
- 旧发布候选版：`releases/0.5.0-rc.6`，不是包含所有最新功能的版本。
- 本机开发版已跑真实整曲、实际窗口和回归；没有干净机器通用发行验收。
- 当前曲库：`D:/Download/bandcamp`。
- 当前分析结果：`artifacts/refinement-three-20260915/analysis`。虽是历史命名，却是正在使用的数据目录，不要当成可丢弃测试产物。

## 用户已经敲定的选择

| 工作 | 默认 | 可选 / 说明 |
|---|---|---|
| 基础六轨 WAV | BS-RoFormer SW | Demucs 6s |
| 细分 | Mega53 | 用户在 WEG 多段试听中明显偏好 Mega；另外两模型仅保留预览用途 |
| guitar MIDI | MuScriptor Medium | 复杂曲用 Large；两档都已接受 |
| strings MIDI | MuScriptor Large | Medium、YourMT3+、Basic Pitch 备选；用户接受 Large 优先 |
| 弦乐分件 | **不做**（2026-09-19 撤回） | 曾把 violin / cello / double-bass 做成独立声部（strings.1–.3），用户指出层级不对——`strings` 是容器不是乐器，摘一件出来不等于拆分，且会静默丢掉中提琴。已全部撤回。Mega53 的六个弦乐目标**仍可作为「弦乐」这一条声部的音源**，这条路没有丢 |
| piano MIDI | Transkun V2（piano.2 起） | 用户在 BCNR Nancy 上听评：HiRes 有共鸣音造成的杂糅根音；HiRes 保留为备选 |
| bass MIDI | HiRes Bass | 用户满意，暂不主动替换 |
| drums MIDI | **ADTOF · DrumSep 7 类**（drums.2 起） | 用户听评后拍板切换。同一鼓点，crash / ride 由 MDX23C DrumSep stem 判定，力度为曲内相对能量 32–127；权重 CC BY-NC-ND 不随包。纯 ADTOF 与 MuScriptor Medium / Large 保留为备选，旧结果继续可读可用 |
| 和弦 | ChordMini · BTC-CL（chords.2 起：专辑批量、和弦页默认选中、XML 共识先验 1.5） | BTC（先验 1.35，回退与对照基准）、consonance-ACE（转位 / Harte 原标签，先验 1）、CQT / CENS / Hybrid；用户看过四首整曲对照页后拍板；ChordFormer 许可 issue 暂不发 |

GAPS、Guitar-FL、YourMT3+ 吉他方案在本项目听评中已被淘汰。不要重新推荐为默认。保留旧结果读取，不因为下线推理模型就删除用户 MIDI。不要把 strings 的 YourMT3+ 备选一起删掉。

## 产品边界

XLD 负责曲库、分析任务、模型、分轨、转谱、融合、结果和存储。XML 负责可视化与消费分析结果，便利入口调用 XLD core。两者可分别启动；分析能力不再归 XML。保持共用结果，不复制另一套后端。

用户偏好：小型个人项目、快速可迭代、工作台默认、曲库侧栏、紧凑单屏、默认 + 备选模型、用适用场景解释模型。不要建立大型插件平台或把所有参数铺在主页面。

## 建议下一步

模型迭代冻结 v1 已交付（R1 钢琴 / R2 和弦 / R3 鼓；R4 节拍被听评否决并回滚）。之后做了时间轴视图第 1 轮（timeline.1，只读共轴）。timeline.3 交付了用户要的核心——**在图上直接标和弦、标段落变化**（标注层增加 `kind`，模型结果不被改写）；timeline.4 / timeline.5 补上了放大后的导航（定位光标、拖刻度条 / Shift / 中键平移、缩放保持中心、轨头钉住）。**G 弦乐分件已于 strings.1 交付**：violin / cello 成为正式 stem（不是 stem 子键），`strings` 整组原样保留、旧结果不需迁移；viola 因可行性门判定与小提琴分不开而不做。**F 角色层已于 timeline.6 交付**：按 onset 间距分柱式 / 分解和弦 / 线性三类（用户在实现前指出分解和弦会被两分法误判成主音线条），全部在渲染端从已有音符算出，每段都带依据。下一步在两项里选：路线图 §P4.5 的 **G 弦乐子键**（cello / violin 并存，stem 加子键的存储契约变更，单独一轮），以及用户已明确**后置**的**单轨和声协调**（每轨与全局和弦的一致 / 补充 / 冲突 / 未发声，bass 轨给转位，复用角色条渲染）。音符编辑仍是路线图 P4 第 4 轮，明确押后；人工和弦如何进入 XML 共识尚未设计。

P0 轮次 A 已于 2026-09-17 完成（history.1）：`readMidi` 的 `ok` 表示结果完整并绑定当前来源，`matches` 表示由当前模型版本生成且可作缓存命中；每次运行独立记录 `midi/<stem>/runs/<runId>.json`；同版本重算替换、不同版本保留；融合记录 provenance。下一步做 **P0 轮次 B：同 engine 多版本切换 / 回退 / 按 runId 删除 / 有限保留策略**，然后再做轻量“模型”页及 ChordFormer / BeatThis 的独立试验。后续计划是交接建议，不等于已经实装，也不要求一次全部完成。

轮次 B 的具体入口：

- `source/xld-runtime-baseline/core/derived-assets.cjs`：`listRuns(track, stem, engine?)` 已只读列出全部运行与状态；`activate` 可激活任意 ok 的运行（含旧版本）；缺的是按 runId 读取 / 激活的服务入口与保留策略。
- `source/xld-runtime-baseline/core/analysis-service.cjs`：缓存分支只复用 `matches` 的结果；轮次 B 需支持 `runOptions.runId` 固定激活（不重跑），并在不同版本成功后做“当前 + 一份对照 + 用户保留”的回收站清理。
- `source/xld-runtime-baseline/core/midi-delete.cjs`：删除仍按 `readMidi(track, stem, engine)` 找当前指针，需改为按 runId 与同 engine 回退。
- `source/xld-runtime-baseline/analysis-midi/models.json`：升级模型时就地改同一 id 的 model 串 / checkpoint / options，不删 stems，用 retiredFor；每条 model 串与身份必须唯一（tests/midi-history.cjs）。

轮次 B 以“A / B 双版本并存时可切换、回退、删除且不误命中，落盘格式不再迁移”为验收标准。保留默认、推理精度和缓存行为。

## 不可混淆的限制

- MIDI 的 120 BPM 是导出时间换算基准，不是检测出的歌曲速度；原始秒级时间保留，没有自动量化。项目当前**没有**节拍 / 速度检测：R4 试过 Beat This!，用户听评判定除 MEGURI 外全不可用，已回滚（见下）。
- MuScriptor 鼓目前是 onset 事件转换为约 100 ms 音符，固定力度；试听镲片尾音不等于识别了原录音真实衰减。ADTOF · DrumSep 7 类的力度是本曲内按键归一化的相对 stem 能量（每键最响 ≈127、最轻 ≈32），不是录音真实力度，跨键不可比；其 kick 用 GM 36，ADTOF 基线为 35。
- Mega53 的组与子类有交叉，53 个目标不是互斥音轨，不可全量相加。
- 弦乐一次显式选择一个 Mega 整曲来源，避免总组与子声部同时加入融合。
- Large 的吉他路径与弦乐/鼓路径精度配置不同，不要为“统一”偷偷改动。详情见完整文档。
- 现有结果存储管理不等于已经具备模型版本安装、升级、回滚管理。
- 节拍追踪的验收不能用"拍间隔变异 / 拍号占比"这类自洽指标：R4 中七里香倍频错误（71 vs 143 BPM）在这些指标上反而最漂亮。要么人工数拍，要么与独立估计器交叉验证。
- **删除任何 `releases/` 目录前必须先查进程**（`Get-CimInstance Win32_Process -Filter "Name='XLD.exe'"`）。2026-09-18 我在重建时 `rm -rf` 了用户正在运行的 `0.5.0-dev.strings.1`，该目录只剩两个被锁文件；证据已从 `work/` 还原，包由 strings.2 取代。
- **viola 与小提琴分不开，不要再尝试把它做成声部。** 可行性门实测（work/strings-gate-20260918）：BCNR《Nancy》编制里没有中提琴，Mega53 的 viola 输出仍占弦乐组 24.6% 能量、与 violin 相关 0.429——那条轨大部分是漏过去的小提琴。violin↔cello 则是 0.016 / 0.194，真的分得开。同属分离能力的边界：**高把位 bass 与 guitar 也难分**，那是基础六轨分离的固有限制。
- **节奏吉他与主音吉他不是分离问题。** 两把电吉他在 BS-RoFormer 下是同一条 guitar stem；Mega53 的吉他细分是 electric / acoustic / banjo / dobro / mandolin，属于音色身份，不存在也不会有“节奏 / 主音”目标。要区分只能从 MIDI 推断角色（和弦性 vs 线性），且角色随时间变化、会在同一轨内重叠，不要为此新增 stem。详见路线图 §P4.5。
- **`strings` 是容器，不是与 bass / piano / guitar / drums 并列的乐器。** 想让 violin 与其它乐器同层级出现在 MIDI 里，正确做法是**链式残差拆分**（other → violin + 剩余 → cello + 剩余 → …「其余弦乐」）：细分每次都产出 `residual.wav`，各部分在构造上加起来等于原组，既不重复也不丢中提琴。代价是 `core/refinement.cjs` 的 `context()` 要能接受上一次细分的残差作为输入（现在只收六条基础分轨 + mix），且链的顺序有意义、既有结果要重跑。2026-09-19 用户选择先不做。**不要再用「摘出一件、组轨让位」的方式重做一遍，那正是被撤回的东西。**
- ~~**总组与分件不会同时进融合。**~~（随弦乐分件一并撤回） 弓弦乐组（`strings` / `strings-all`）本身包含小提琴等分件，两者同时合并会把同一段演奏算两遍。`core/midi-merge.cjs` 的 `plan()` 按 `core/string-source.cjs` 的 `overlaps()` 裁剪：`strings` 与任一启用的分件重叠时被跳过并记入 `plan.skipped`，界面在融合状态行说明。磁盘不动，清掉分件音源组轨即回。组来源是中提琴、分件是小提琴这类不相交的情况两者都保留。
- **string stem 的音源是每 stem 一个指针**（`midi/strings-source.json` / `violin-source.json` / `cello-source.json`），由 `core/string-source.cjs` 的 `STEM_TARGETS` 规定谁接受什么 Mega53 目标：组轨接受全部六个（向后兼容旧结果），分件只接受自己那个。声部只要磁盘上存在对应分离就会出现在列表里，但**未选音源不能转谱、也不进一键批量**。
- **轨下条带一次只读一种东西**（页签头「轨下条带」切换）：演奏方式（柱式 / 分解 / 线性）或和声关系（一致 / 补充 / 冲突）。两者同时画会占掉紧凑轨高的三分之一。和声关系以**全局和弦轨为参照系**，只说关系、**不给单轨和弦名**——音级集合不等于和弦；每段附最低音相对根音的度数（转位）。判据时值加权，所以经过音不会被当成冲突。
- **融合会说出它落下了谁**：某个声部有结果但用不上（音源变了、或转出来是空的）时，融合照常进行，状态行补一句「已跳过 <声部>（原因）」。从没转过谱的声部不算被落下，不报。融合 fingerprint 的哈希输入没变，盘上既有的 `merged/<fingerprint>` 目录照常解析；但换过来源之后声部组合变了，fingerprint 随之变化，`read()` 会如实说「这个组合还没融合过」而不是拿旧文件充数。
- **音符级 MIDI 修正**：R1–R11 工程功能已交付；用户实际修正一段并听评后再进入 E09 合并/拆分。原稿保护、独立修订 identity 与草稿来源绑定继续保持。
- **退役是标记，不是删除 id**：被退役的引擎停止提供新建入口，但**仍然解析得出、结果仍然读得出、尤其仍然删得掉**。若把 id 从注册表里删掉，既有结果会同时变成读不了且删不掉（`isResultEngine` 返回 false）。测试直接钉住这条，并反向断言删除与清理模块**不得**查询退役状态。
- **全库结果清理**（MIDI 页「结果管理」→「全库结果清理」）：跨曲目列出全部段落 / 和弦结果，每行画出切分本身，按**碎片数**（段落 < 2 秒、和弦 < 0.25 秒）排序，勾选后批量移入回收站。实测 MSAF 碎片中位 3 / 最多 12、最短段 0.00 秒，SongFormer 中位 0 / 最多 2、最短 1.00 秒；碎片 ≥3 的 20 条全部是 MSAF 系。覆盖率与段数都不具区分度。
- **卸载细分权重时只删 `.ckpt`**，`runtime/addons/refine-roformer-v1/manifest.json` 一个字节都不能碰——`refinement.cjs:43` 把整份 manifest 的 sha256 算进 cacheKey，它同时描述 bowed 与 mega，改它会让 mega-53 的 22 个 run（11.86 GiB，10 首的活跃 strings 来源）全部失配。
- **MIDI 版本有限保留**（MIDI 页「模型版本」，默认折叠）：同一引擎的多个版本可以**切换 / 回退**（按「切换」，不起推理）、按 runId 删除、标记**保留**。生成新版本后会自动回收盈余——只回收**没有任何指针指向**的版本，所以结构上不可能删掉正在用的那一版；与当前版本完全相同的重复版直接删除，其余进**回收站**；`音源已变` / `文件已删除` / `记录损坏` 三类永不自动回收。被标记保留的版本永久豁免，但也会**永久钉住它的 stems WAV**。磁盘上只多一类文件 `midi/<声部>/kept/<runId>.json`。
- **回退之后点「生成 MIDI」确实会重跑模型**：缓存分支按引擎取指针且要求"当前版本"，本轮刻意没动它。想不重新推理就回到当前版本，在「模型版本」里按「切换」——状态栏那句话里也这么写。
- **角色层判读继承转谱误差**，所以每个角色段的 tooltip 必须摊开依据（同时几声部、和弦音占比、级进占比、音符数）。判据是 onset 间距而非复音度：扫弦本身也不同时发声，分解和弦也不是旋律。**没有和弦参照就不判分解和弦**；鼓轨不给判读。贝斯走根音五音会被判成「分解和弦」——判据上没错，若要单独一类（如「根音支撑」）是另一轮。
- 时间轴页签默认**只读**：不量化、不画网格、不能编辑音符。打开页签头的「标注」后才可在图上做标记——拖动划区间、点某一块把它的区间与标签抄进标记；**模型结果永不被改写**，标记一律写进 `manual-tags.json`（`kind` 为 `section` 或 `chord`），与段落实验室共用一套对象。`music-lab.json` 的 `manualTags` 只导出 section 标记，人工和弦进入 XML 共识尚未设计。标注开启时拖动不再跳转播放。放大后用「定位光标」跳到播放位置（单次动作，**播放本身不会自动滚动画面**），拖刻度条（或按住 Shift 拖轨、中键拖轨）左右平移。点音符轨的轨头进入单轨查看（Esc 或「返回全部轨」退出），段落轨与和弦轨在单轨模式下保留作参照。横向缩放上限仍是 8×：整条轨是一张与缩放同宽的画布，超过 16384 就会降 dpr 变糊，要更深的缩放得改成只渲染可视区。它读的是每个声部当前生效的 MIDI（`assets:midi-notes`，只读 IPC），取数时机是载入分析与点击该页签——在转谱页换用另一个 MIDI 后要切回时间轴才会更新。
- 构建会改写两个文件：`index.html`（注入发布 UI 样式 / 脚本）与 `desktop/preload.cjs`（追加 `XinRelease` contextBridge）。verify 脚本对这两个文件必须按「源文件 + 恰好那一处注入」比对，不能逐字节。
- **Alt 是 Windows 窗口菜单栏的保留键**：XLD 的窗口用 `autoHideMenuBar: true`，按 Alt 会拉出 Electron 默认菜单（File / Edit / View / Window / Help）。不要把 Alt 用作应用内修饰键。菜单栏本身没有改成常驻——那是原生控件，配色字体无法与这套深色界面统一，而帮助 / 版本 / 语言 / 字号在应用头部已经有了；若要彻底让 Alt 失效可用 `Menu.setApplicationMenu(null)` 或 `before-input-event` 拦截，代价是失去默认快捷键（Ctrl+R、F12 等），需单独评估。
- **`setPointerCapture` / `releasePointerCapture` 对合成指针事件会抛 `NotFoundError`，把事件处理器后半截整个打断。** 指针捕获只是让指针移出元素后事件仍能送达，绝不能当成手势的前提：自己记 `active = pointerId`，捕获包 try/catch，`pointermove` 不要依赖 `hasPointerCapture`。时间轴的测试替身现在也照浏览器的行为抛异常，钉住这个回归。
- 旧模型版本的 MIDI 结果是 `ok:true, matches:false`：可查看、开目录、按活跃选择参与融合，但界面只能对它“生成”（用当前版本重算），不能“使用”；切回旧版本不重跑属于轮次 B。
- `midi/<stem>/runs/<runId>.json` 是每次运行的事实来源，engine / 活跃 / by-source 指针可被重写；读取错误码仍取最后一个候选清单。
- MIDI 可视化编辑、节拍网格、动机识别和歌曲结构比较尚未完成。

## 执行与交付习惯

只修改 `source/`，生成新的 `releases/` 开发版；`D:/Program Files/xins-music-lab-fusion` 是只读已安装产品。运行环境和权重在项目 `runtime/`，不要复制到每个版本中。

已有工作脚本常依赖 `D:/Caches/codex/...` 的暂存目录，而且发布脚本有“目的目录不存在”与旧哈希断言。先读再改，不能把归档 `publish.cjs` 当成通用命令直接重跑。

每次记录：改动、保持的默认、验证、实际入口、限制、下一步。普通代码变更运行相应测试；涉及单声部/一键/融合/删除时验证整条路径；涉及页面时实际看宽窄窗口。无需每轮重跑全部整曲或重新下载权重。

## 可直接交给 Claude 的开场要求

请先阅读本文件、docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md 与 work/midi-history-20260917/HANDOFF.md，核对当前源码与最近测试证据。项目是个人音乐分析平台，保持 XLD 管分析、XML 管可视化，保持已验收的模型默认和现有结果。P0 轮次 A 已完成；先推进轮次 B：同一 engine 的多版本并存时可切换、回退、按 runId 删除，加有限保留策略，沿用 runs/ 记录格式不迁移；小步交付，不顺手更换模型或大改界面。完成后更新日志、列出验证和下一步。若我另外指定任务，以我的最新要求为准。
