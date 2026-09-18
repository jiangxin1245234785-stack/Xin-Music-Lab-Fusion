# Claude 接手入口：XML / XLD

更新：2026-09-17。主项目：`D:/Projects/Xin-Music-Lab-Fusion`。

## 先读这些

1. 本文件：立即接手所需的状态和边界。
2. [完整进度、决策、已知问题与分阶段计划](docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md)。这是本次交接的主要文档。
3. [SOURCE_OF_TRUTH.md](SOURCE_OF_TRUTH.md)：当前版本和历史职责变更；顶部当前状态优先于后面的历史快照。
4. [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)：2026-06 至今的完整时间线，按需查相应阶段。
5. [最近一版交接](work/midi-history-20260917/HANDOFF.md)及其证据目录 `artifacts/midi-history-20260917`（P0 轮次 A）；上一版 toe 鼓对照见 [work/toe-drums-20260917/HANDOFF.md](work/toe-drums-20260917/HANDOFF.md)。

不必一次读完全部历史、模型权重或生成音频。先完成一个小迭代。

## 当前可用版本

- 最新开发版：`releases/0.5.0-dev.history.1/XLD.exe`，同目录 `XML.exe`（P0 轮次 A；上一版 `releases/0.5.0-dev.muscriptor.4` 保留）。
- 源码：XLD `0.5.0-dev.core.25`；XML `0.5.0-dev.stems.10`。
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
| piano / bass MIDI | HiRes Piano / HiRes Bass | 用户满意，暂不主动替换 |
| drums MIDI | ADTOF | MuScriptor Medium / Large 已接入，toe 试听整体接近，ADTOF 镲片尾音略逊；尚未决定切默认 |

GAPS、Guitar-FL、YourMT3+ 吉他方案在本项目听评中已被淘汰。不要重新推荐为默认。保留旧结果读取，不因为下线推理模型就删除用户 MIDI。不要把 strings 的 YourMT3+ 备选一起删掉。

## 产品边界

XLD 负责曲库、分析任务、模型、分轨、转谱、融合、结果和存储。XML 负责可视化与消费分析结果，便利入口调用 XLD core。两者可分别启动；分析能力不再归 XML。保持共用结果，不复制另一套后端。

用户偏好：小型个人项目、快速可迭代、工作台默认、曲库侧栏、紧凑单屏、默认 + 备选模型、用适用场景解释模型。不要建立大型插件平台或把所有参数铺在主页面。

## 建议下一步

P0 轮次 A 已于 2026-09-17 完成（history.1）：`readMidi` 的 `ok` 表示结果完整并绑定当前来源，`matches` 表示由当前模型版本生成且可作缓存命中；每次运行独立记录 `midi/<stem>/runs/<runId>.json`；同版本重算替换、不同版本保留；融合记录 provenance。下一步做 **P0 轮次 B：同 engine 多版本切换 / 回退 / 按 runId 删除 / 有限保留策略**，然后再做轻量“模型”页及 ChordFormer / BeatThis 的独立试验。后续计划是交接建议，不等于已经实装，也不要求一次全部完成。

轮次 B 的具体入口：

- `source/xld-runtime-baseline/core/derived-assets.cjs`：`listRuns(track, stem, engine?)` 已只读列出全部运行与状态；`activate` 可激活任意 ok 的运行（含旧版本）；缺的是按 runId 读取 / 激活的服务入口与保留策略。
- `source/xld-runtime-baseline/core/analysis-service.cjs`：缓存分支只复用 `matches` 的结果；轮次 B 需支持 `runOptions.runId` 固定激活（不重跑），并在不同版本成功后做“当前 + 一份对照 + 用户保留”的回收站清理。
- `source/xld-runtime-baseline/core/midi-delete.cjs`：删除仍按 `readMidi(track, stem, engine)` 找当前指针，需改为按 runId 与同 engine 回退。
- `source/xld-runtime-baseline/analysis-midi/models.json`：升级模型时就地改同一 id 的 model 串 / checkpoint / options，不删 stems，用 retiredFor；每条 model 串与身份必须唯一（tests/midi-history.cjs）。

轮次 B 以“A / B 双版本并存时可切换、回退、删除且不误命中，落盘格式不再迁移”为验收标准。保留默认、推理精度和缓存行为。

## 不可混淆的限制

- MIDI 的 120 BPM 是导出时间换算基准，不是检测出的歌曲速度；原始秒级时间保留，没有自动量化。
- MuScriptor 鼓目前是 onset 事件转换为约 100 ms 音符，固定力度；试听镲片尾音不等于识别了原录音真实衰减。
- Mega53 的组与子类有交叉，53 个目标不是互斥音轨，不可全量相加。
- 弦乐一次显式选择一个 Mega 整曲来源，避免总组与子声部同时加入融合。
- Large 的吉他路径与弦乐/鼓路径精度配置不同，不要为“统一”偷偷改动。详情见完整文档。
- 现有结果存储管理不等于已经具备模型版本安装、升级、回滚管理。
- 旧模型版本的 MIDI 结果是 `ok:true, matches:false`：可查看、开目录、按活跃选择参与融合，但界面只能对它“生成”（用当前版本重算），不能“使用”；切回旧版本不重跑属于轮次 B。
- `midi/<stem>/runs/<runId>.json` 是每次运行的事实来源，engine / 活跃 / by-source 指针可被重写；读取错误码仍取最后一个候选清单。
- MIDI 可视化编辑、节拍网格、动机识别和歌曲结构比较尚未完成。

## 执行与交付习惯

只修改 `source/`，生成新的 `releases/` 开发版；`D:/Program Files/xins-music-lab-fusion` 是只读已安装产品。运行环境和权重在项目 `runtime/`，不要复制到每个版本中。

已有工作脚本常依赖 `D:/Caches/codex/...` 的暂存目录，而且发布脚本有“目的目录不存在”与旧哈希断言。先读再改，不能把归档 `publish.cjs` 当成通用命令直接重跑。

每次记录：改动、保持的默认、验证、实际入口、限制、下一步。普通代码变更运行相应测试；涉及单声部/一键/融合/删除时验证整条路径；涉及页面时实际看宽窄窗口。无需每轮重跑全部整曲或重新下载权重。

## 可直接交给 Claude 的开场要求

请先阅读本文件、docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md 与 work/midi-history-20260917/HANDOFF.md，核对当前源码与最近测试证据。项目是个人音乐分析平台，保持 XLD 管分析、XML 管可视化，保持已验收的模型默认和现有结果。P0 轮次 A 已完成；先推进轮次 B：同一 engine 的多版本并存时可切换、回退、按 runId 删除，加有限保留策略，沿用 runs/ 记录格式不迁移；小步交付，不顺手更换模型或大改界面。完成后更新日志、列出验证和下一步。若我另外指定任务，以我的最新要求为准。
