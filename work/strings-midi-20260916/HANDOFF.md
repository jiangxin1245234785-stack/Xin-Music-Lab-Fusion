# 弦乐 MIDI 第一版 — 2026-09-16

阶段：实现及本机验收完成，发布目标 releases/0.5.0-dev.strings1；XLD core.16，XML stems.8。

范围与决定：复用 Basic Pitch，未新增模型或依赖。每曲增加一个可选 strings 槽，来源为 Mega53 整曲 strings/strings-all/violin/viola/cello/double-bass 目标原始 WAV；试听使用安全增益版本。片段与其他目标不列入。

交互：MIDI 页弦乐音源默认不加入，选择后可单轨转谱、一键生成、融合和打开目录。仅选择一份弦乐来源，避免组与子声部重复叠加。选择音源后切换到 strings 声部；取消加入不删除历史输出。原曲整曲细分可以独立转谱，不要求先有基础六轨。

数据：midi/strings-source.json 保存明确选中的 refinement runId/cacheKey。core/string-source.cjs 通过原 refinement 校验器检查当前来源/模型/范围/文件，拒绝预览、非弦乐、过期父来源和越界/链接输入。复用 midi/strings/by-source 缓存；源或模型改变不混用，返回旧源可恢复。

时间/音色：只接 timeOrigin=0 的整曲，原秒时间不量化。GM program 为弦乐组48、小提琴40、中提琴41、大提琴42、低音提琴43；manifest记录目标和program并校验。融合保留音符/控制变化/弯音，跳过空结果。

任务：一键依据可用输入构建计划，将基础与弦乐 runId 组成来源标识；任务中来源改变停止。音源选择 IPC 与分析/清理互斥；失败/取消保留成功结果。存储管理新增 refinement→MIDI 依赖保护，包括未再启用的历史弦乐来源。

文件：core/string-source.cjs；core/derived-assets.cjs、analysis-service.cjs、midi-merge.cjs、storage.cjs；analysis-midi/models.json、runner.py；desktop/main.cjs/preload.cjs；derived-controls.js、workspace-controls.js、app.js、index.html、i18n/runtime-messages.js。

验证：
- XLD/XML 回归通过；新增 string-midi.cjs 覆盖整曲筛选、明确选择、缓存隔离恢复、音色、融合来源、依赖保护、缺失 WAV；控制器覆盖五声部计划和仅弦乐计划。
- Flowers of Romance 823.942 秒整曲真实 Basic Pitch 转谱：52.032 秒，3623 个音符，program48；回读与再次缓存调用通过。数量不作为准确率或听感结论。
- 真实 MIDI 音色/音符时间范围验证通过；真实弦乐加人工鼓点夹具的融合回读通过，保留3623个弦乐音符。
- 隐藏 Electron 实际窗口通过来源取消/重选、缓存生成、单声部目录、刷新/重载、双语、仅弦乐一键及无需融合状态，零console error。仅弦乐测试通过IPC夹具去除基础输入，未假称原曲mix端到端实测。
- 9组运行环境检查和发布壳测试通过。查看了来源选择界面截图。未做干净 Windows VM 或弦乐音质听评。
- 回归中既有 open-request 并发测试出现过一次偶发双消费（2而非1），单项重试及完整回归通过；该模块未改，列为后续问题，不能视为跨进程可靠性证明。

隔离测试：D:/Caches/codex/xld-strings-20260916/test-analysis。WAV 只读硬链接，元数据/输出独立；重建隔离目录的细分cacheKey，未修改原 WAV。run-real.cjs、verify-real.py、run-ui.cjs可复现。pytest未作为新依赖引入。

不变量：原六轨和人工标注不变，既有XML读接口兼容（XML界面未增加弦乐生成入口）。旧 flow1/storage1/RC.6 和现有runtime保留。开发版沿用 artifacts/refinement-three-20260915/analysis。

下一步：用户试听 Basic Pitch 弦乐表现；专用模型、片段偏移、多弦乐槽在 backlog。


## 发布后实际资料库结果
已通过 strings1 发布包在原开发资料库选择已验收的 Flowers of Romance 整曲弓弦乐 run 6cc1ded2-1187-40b1-82f4-c18aac8ef871，并生成3623音符的 Basic Pitch MIDI。结果路径见 artifacts/strings-midi-20260916/user-result.json。实际目录回读通过，存储扫描确认原弦乐 WAV 受到 MIDI 依赖保护；原 WAV/六轨/人工标注未改。
