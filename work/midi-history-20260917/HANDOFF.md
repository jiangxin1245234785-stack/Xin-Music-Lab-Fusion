# MIDI 历史结果可读与模型版本记录（P0 轮次 A）
## 当前阶段
2026-09-17 本机开发版 0.5.0-dev.history.1；XLD core.25，XML stems.10 不变。实现、单元回归、真实曲库只读差分、隔离副本真实推理、发布包窗口检查与发布完成；发布以 artifacts/midi-history-20260917/published.json 为准（2722 个包文件）。上一开发版 muscriptor.4 与更早版本保留，用户数据未改。
## 决策
- 不换模型、不改默认 / 选项 / 精度；三份模型清单与 muscriptor.4 包内副本逐字节相同（verify.cjs 断言）。
- readMidi 拆成两层：ok = 清单完整、文件齐全并绑定当前分轨 / 弦乐来源（可查看、开目录、按活跃选择参与融合，XML 同样可见）；matches = 由该 engine 当前模型版本生成，只有它为 true 才作缓存命中免推理复用。旧模型版本结果 ok:true / matches:false；来源失配仍 ok:false，不进入一键或融合。
- 版本身份由清单已有字段推导（engine、model 串、backend.checkpointSha256、逐字 options），不落盘、不建注册表；profileForResult 改为按 engine 解析，无 engine 的旧 basic-pitch 清单按 model 串回退。严格 validate 保留全部旧错误码（options 漂移 midi-invalid、sha 漂移 midi-model-invalid、来源 midi-stale）。
- 每次运行独立记录 midi/<stem>/runs/<runId>.json：promoteResult 直接落此；engine / 活跃 / by-source 指针为派生写入；覆盖前 preserveDisplaced 补写旧运行的记录。同版本重算删除上一次运行（含 runs/ 记录），不同版本保留。失败 / 取消路径不变。
- 融合 parts 元组与指纹不变（既有 7 份 MEGURI 融合继续命中），新增 provenance。runner.py 新增可选 digests（.mid / notes.json sha256）与 notes.json 的 runId / engine / model；Node 仅在字段存在时校验。
- UI：新增 3 个中英文案键；卡片与状态行标注“旧模型版本”；一键计划显示“待生成”，按钮显示“生成 MIDI”而非“使用此 MIDI”；模型未就绪且结果为旧版本时按钮禁用。不改布局，XML 零改动。
## 实曲与验证
- 只读差分 verify-readonly.cjs：真实 MEGURI + toe，旧读取器（muscriptor.4 包内 core）与新读取器对 readMidi（活跃与每个 engine）、readMidiDirectory、融合读取零差异；19 条运行 18 current + 1 files-missing（MEGURI strings basic-pitch 8cbcb1ed，运行目录已由用户移入回收站，设计如此）；168 个文件快照前后一致；MEGURI 融合仍命中 c16c7fb0…。
- 期间用户用 muscriptor.4 新生成了 toe 的 bass-highres / piano-highres（无 runs/ 记录、无 digests 的旧形态清单），新读取器判为 current，是额外的真实兼容样本；验证脚本因此改为不变量断言，不硬编码计数。
- 隔离硬链接副本真实 ADTOF（run-real.cjs）：2391 鼓点（与上一轮相同）、任务 8.15 s；清单含 digests，notes.json 含 runId / engine / model；提升到 runs/<id>.json；同版本上一次运行被清理；MuScriptor 两档结果未动；真实目录快照未变。
- 两端完整 npm test 退出 0（xld-tests.log 25 PASS、xml-tests.log 15 PASS；改动前基线 xld-tests-before.log）。新增 tests/midi-history.cjs：旧形态清单、旧版本 ok/matches 与旧错误码、activate 后 runs/ 并存、删除后旧运行与 WAV 完好且存储依赖计数含旧运行、digests、listRuns 状态、融合 provenance 与指纹、profile 身份唯一。扩展 midi-models（服务层 A→B：不误命中、B 成功保留 A、取消 B 保留 B/A、同版本重跑替换）、midi-delete、storage、derived-flow、shared-analysis/test.cjs。
- 发布包 Electron 窗口 defaults-ui.json（隔离 MEGURI 夹具、独立偏好）：现有缓存显示不变（吉他 Large 当前用于融合、Medium 已缓存，一键全部复用）；夹具中把 Medium 两份清单改为外来 sha → 卡片 / 状态“旧模型版本”、按钮“生成 MIDI”、一键“待生成”、目录可开、Large 不受影响；英文 “Earlier model version”；恢复后“已缓存”；五声部一键 / 融合 / 三个目录；1580×960 与 1180×780 无溢出。截图 history-wide / history-narrow / history-superseded.png。
## 文件地图
source/xld-runtime-baseline：core/derived-assets.cjs（checkRecord / profileMismatch / sourceMismatch / checkFiles / verify / validate、宽松 read、runRecordPath、preserveDisplaced、listRuns、identityOf / engineOf 导出）、core/analysis-service.cjs（output 指向 runs/ 记录、缓存分支 matches 门、promote 校验 runId、同版本清理、listMidiRuns）、core/midi-merge.cjs（provenance）、analysis-midi/runner.py（digests、notes 来源字段）、derived-controls.js（5 处 matches 判断）、i18n/runtime-messages.js（3 键 × 2）、package.json（core.25、测试链）、tests/midi-history.cjs 与 4 个测试扩展、analysis-midi/README.md（默认表由用户同期更新，新增版本记录章节）、core/README.md。source/shared-analysis/test.cjs。source/release-tools/BUNDLE-README.md 与 USER-GUIDE.html：回填此前只存在于暂存副本的 弦乐 MIDI / 紧凑工作台 / 弦乐与鼓 三节（去掉发布版里的重复节）并新增“模型版本与历史结果”，今后从项目 source 直接暂存发布工具。
work 脚本：baseline-source.json（改动前哈希）、verify-readonly.cjs、run-real.cjs、prepare-fixture.cjs、stage.cjs（从项目 source 复制含 release-tools）、build.cjs、verify.cjs（含 regression.json）、defaults-ui.cjs / run-ui.cjs、publish.cjs（源码在暂存前已就地编辑，只校验暂存后无并发改动）。暂存与夹具：D:/Caches/codex/xld-history-20260917（candidate、test-analysis 的 toe 与 MEGURI 硬链接副本、fixture-profile）。
## 不变量与已知限制
不改原曲、WAV、用户结果、人工标注、默认与模型参数；旧发布与已安装产品保留；未做干净 VM 验收。runs/ 记录在运行目录被移入回收站后与指针一样保留（listRuns 判 files-missing，恢复后继续可用）。read() 返回的错误码取最后一个候选清单，与原行为一致。listRuns 只读、未接 UI / IPC（服务 façade 已暴露 listMidiRuns）。非活跃的旧版本结果在界面上只能“生成”，不能直接“使用”；“切回旧版本无需重跑”、按 runId 激活 / 删除、有限保留策略属于轮次 B。回退到 core.24 时多出的 runs/*.json 被旧代码忽略。
## 下一步
轮次 B：assets:read 增加 versions（listRuns）；assets:run 支持 runId 固定激活（缓存分支 readRun / findCurrent），切回旧版本不重跑；保留策略“当前 + 一份对照 + 用户保留（.xld-keep.json）”，多余版本移回收站而非硬删；midi-delete 按 runId、同 engine 回退；卡片下版本行 UI 与中英文案。落盘格式沿用本轮，不再迁移。之后再做 P1 轻量模型页与 P2 ChordFormer / BeatThis。
