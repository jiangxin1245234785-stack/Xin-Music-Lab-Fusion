# Xin’s Music Lab Fusion — 开发日志

## 2026-11-23 — terrain.13 车窗地貌播放优化

本机共用入口切换到 `0.5.0-dev.terrain.13`，可回退到 `.12`。车窗复用相邻帧山脊采样，在出现雨幕前分段准备素材。宽屏沿用现有三档画质，高画质维持原生，自动和省电降低播放渲染负载。[正式包、实测和回退](work/terrain-performance-20261122/HANDOFF.md)

## 2026-11-22 — terrain.12 正式雨景

本机共用入口切换到 `0.5.0-dev.terrain.12`，上一入口保留 `0.5.0-dev.terrain.11`。XML 车窗地貌新增随曲变化的雨势和玻璃水珠开关，开始导出时读取当前选项。正式 XML/XLD 启动、三个曲目的设置与时间轴、重启记忆、WebGL 恢复、短片导出及整曲导出取消通过。包内 1433 个文件和原 .11 的 1397 个文件通过校验。[发布记录与回退](work/terrain-weather-20261122/formal-release/HANDOFF.md)

## 2026-11-12 — score.25 XML可选谱面力度

当前score.25/core.76，上一稳定score.21。默认关闭的“按录音强弱显示”接入，独立不可变缓存、SHA来源身份、进度/取消/强制复跑与关闭回原值均通过。已有动态/人工修订/专用人声曲线保持；只生成velocity数组，不改音频或原MIDI/分析。修复终态通知先于解锁和语言切换按钮被重复翻译。默认与960×620/160%完整功能、40组/240状态、64次启用副本换歌、跨版缓存、169原文件、播放/重开/退出，6后端/147谱面/38适配器/48渲染及两个exe通过。新2803/旧2800包文件通过；包内XLD逐字节固定score.21，工作区额外XLD改动保留未混入。22–25包和关键SHA快照保留，未提交。详见 work/score-dynamics-20261112/REPORT.md。

## 2026-11-12 — score.21 谱面可靠性与力度评估

当前score.21/core.76，上一稳定score.20。适配器/字幕38处改坏从29处检出补到全部检出；新增4测试共147通过，原64核心/时钟改坏通过。渲染检查等实际帧、空曲库检查等最终状态，48渲染两轮及实际包专项通过。当前有效64非空声部33恒定，三首9声部副本重算保持20899音符身份/时序，简化显示减少5.46%；结果未接入XML。新旧各2800包文件和2713应用文件校验通过。关键SHA快照及旧包保留，未写原件、未跑模型、未提交。剩余排序与证据见 work/score-quality-20261112/BACKLOG.md、REPORT.md。

## 2026-11-12 — score.20 曲库、开始页与开关收尾

当前XML score.20 / XLD core.76，上一稳定score.15。A3/A4/A5完成：曲库状态诚实文案、续听开始页、七个设置开关及键盘/读屏；修复跟和弦变色设置保存和倒回0:00的续听记录。40组/240主界面状态与40组开始页、48渲染、143谱面、64次换歌、跨版本恢复、两个exe、新2800/旧2799文件通过。阶段16–20及关键源码SHA留存，两个根入口统一；没有模型运行、真实分析写入或Git整理。详见 work/score-ui-finish-20261112/REPORT.md。

## 2026-11-12 — score.15 整专辑与长运行验收

当前 score.15 / core.76，上一入口 score.12；旧包和源码快照均保留。修复任务卡0/0、批次结束后文件夹/扫描仍锁定、翻译绑定保留旧曲库行及试听选项。真实两首完整录音的整专辑取消、补跑3/已有1、全缓存4及10轮定时复跑通过。CUDA运行后取消无残留；XLD/实际PCM接入的XML分别30分钟检查通过，64次换歌资源回归、48渲染、143谱面、实际exe和2799文件检查通过。详见 work/score-validation-20261112/REPORT.md。未改模型、未写真实分析原件、未提交。

## 2026-11-12 — score.12 稳定化与分阶段留版

当前共用入口 score.12，上一稳定 score.10，保留 score.9/10/11 及源码关键快照。40 组/240 界面状态、143 谱面测试、两个实际 exe、2799 文件、默认可见渲染专项 48/48 通过。XML 接入有效弦乐试听、MIDI 实际乐器分组与阅读开关，新增本机手写字幕、歌曲隔离和修改/删除历史。字幕刷新失败候选 score.11 未启用；修复后单独构建 score.12。真实分析只读，未改模型、未提交。详见 work/score-advance-20261112/REPORT.md。

## 2026-09-23 — R17 轨组与轨头整理（tracklayout.3 / core.65）

用户要求吉他/弦乐可合看或分开编辑、拖动排序、收纳监听菜单。实现同声部多乐器默认折叠、可展开，轨头点阵拖动声部整组/同组子轨及分析行；每曲记忆折叠与显示顺序。WAV/MIDI/关闭、M/S在对应轨头，音量放更多，全局保留重置。窄窗口保留来源标签可读宽度。

折叠为显示投影，保留 canonical 乐器 lanes 和音符身份。选音自动切换当前编辑乐器；跨乐器选择提示分开编辑，不隐式改归属。沿用单乐器草稿/修订及未保存保护；混播不因折叠重复音符或父 WAV。

XLD76、XML74、发行工具4及Python三链通过。真实MEGURI13条原轨折叠7行，组/子轨拖动、混播循环连续、轨头M/S/音量与布局重载通过；折叠编辑instrument1后读回仅该乐器改变。旧合并拆分/撤销/保存/导出/融合/恢复/独立进程重启全流程复验；原28份MIDI哈希保持。最终CSS微调后复验时间轴和完整打包窗口。2783包文件/2881源码哈希通过。

程序releases/0.5.0-dev.tracklayout.3/XLD.exe；交接work/track-layout-20260923/HANDOFF.md；证据artifacts/track-layout-20260923。后台/模型/写入器/XML不变，无GPU或Git发布；noteshape.2保留。下一步用户使用反馈，正式干净机器验收另行安排。

## 2026-09-23 — R16 音符合并 / 拆分（noteshape.2 / core.64）

新增明确选择的同音高相邻音符合并，保留最早音符力度；单音在光标或精确秒数处拆分。先橙色预览、摘要与切点，应用才写草稿；取消无修改。边界/过短、跨音高、不连续或未选同音高重叠拒绝，选择/版本变化使旧预览失效。每次应用一步撤销/重做，接入现有混播、独立修订和输出。最短拆分段兼顾5ms和文件最慢tick，原写入器继续最终校验。

XLD75、XML74、发行工具4、Python修订/融合/形状回读通过；真实cello1128音，独立合并1127、拆分1129，其他乐器与原文件保持。打包MEGURI验证预览、取消、撤销、六WAV+弦乐MIDI、保存回读、导出字节一致、融合和跨版本草稿恢复、独立进程重开；28份原MIDI哈希不变。最终图形边框调整后复验，另确认橙色实际像素和窄屏英文预览。自动化主音量零，不作听感结论。

2782包文件/2879源码哈希通过。程序releases/0.5.0-dev.noteshape.2/XLD.exe；交接work/note-shape-20260923/HANDOFF.md；证据artifacts/note-shape-20260923。未改模型/XML/修订写入器，无GPU或Git发布。R12–R16本期工程完成；接下来用户听评，正式干净机器验收另行安排。

## 2026-09-23 — R15 WAV/MIDI 混播（hybrid.1 / core.63）

时间轴收录当前来源图中的 WAV/MIDI 并集，纯 WAV 显示采样波形并支持 M/S。逐父声部 WAV/MIDI/关闭，全部 WAV、MIDI 优先、仅 MIDI 三预设，同位置原曲 A/B。strings 多乐器共用一份父 WAV；电子环境音随 residual 保留。

整曲 Mega target/residual 替换父源，整曲 mix 提取独占参考；拒绝失效、时间不符和重复组合。读取 raw 互补文件，不独立归一化。WAV 4秒 PCM 块、8秒前瞻、64MiB缓存，WAV/MIDI共享AudioContext；取消与欠载明确停止，监听选择不影响保存/融合/导出。

完整编辑回归发现并修复：matches:false误排除人工版；新音频缓存键误改草稿身份。现在sourceAudio.key保留旧约定，streamKey单独用于读取缓存。未修改用户原始结果。

XLD74、XML74、发行工具4及Python修订/融合通过；MEGURI混播60秒、短循环约12次、定位/原曲A/B及保存重开/导出融合/跨版本草稿恢复通过。首次混播441ms，缓存峰值63.25MiB；软件渲染测试进程工作集峰值约858.6MiB。漏调度/欠载均0；自动静音测试不代替听评。最终仅两条按钮文案变更，经字节差异核验与独立进程启动复验。

2782包文件/2877源码哈希核对并归档。程序releases/0.5.0-dev.hybrid.1/XLD.exe；交接work/hybrid-20260923/HANDOFF.md；证据artifacts/hybrid-20260923。旧multimidi.1保留；无新模型/GPU推理/Git发布。下一轮R16；用户听评和正式干净机器验收待做。

## 2026-09-23 — R14 多轨 MIDI（multimidi.1 / core.62）

时间轴总览默认“全部MIDI”，一个时钟同时调度全部活动乐器及草稿。父声部M/S/音量、子乐器M/S；M优先，多个S并集，父M覆盖子S，15ms增益渐变。聚焦与页面切换不改变合奏组合。单轨MIDI/WAV保留为明确直听模式，其合奏控件禁用，避免假生效。

复音提高到256；超限明确停止而非静默抢断长音，源认领先于调度保证旧音频互斥。MEGURI 11轨/10646音符、峰值18；真实AudioContext另验112音符同时发声；均未记录调度漏音。最终maxTickMs约4.3/11.6ms，属JS调度耗时，不是整机CPU或声卡掉音测量。

XLD72、XML74、发行工具4及修订/融合通过；打包窗口M/S/音量/聚焦/循环、编辑保存导出融合与双进程重启通过。2780包文件/2873源码核对通过，模型、后台及XML未改，无GPU和Git发布。下一轮R15混播；用户听评与正式版干净机器验收待做。交接work/multimidi-20260923/HANDOFF.md，证据artifacts/multimidi-20260923。

## 2026-09-23 — R13 结果一致性（consistency.1 / core.61）

普通融合及一键 MIDI 最终融合检查参与活动版本的草稿，提示先保存/撤回；历史其他版本草稿不误阻挡。界面等待草稿持久化，后台在缓存返回与提交前复核版本、来源、草稿；迟到修改不能覆盖旧输出。

和声统计按音符与和弦区间的真实重叠计算，保留独立起音统计；修复 C9/Cmaj9/Cm7b5/C7b9，未知标签不猜测。显示模型参考及人工标注暂不参与，和弦外音不等于错误。

XLD 71、XML 74、发行工具4条命令及Python修订/融合通过；真实MIDI中途草稿/换版测试、MEGURI窗口、保存后融合与进程重启通过。2780包文件和2872暂存源文件核对通过。未换模型、不运行GPU，不覆盖用户结果；下一轮R14多轨MIDI/M/S。交接 work/consistency-20260923/HANDOFF.md，证据 artifacts/consistency-20260923。用户听评及正式版干净机器验收仍待。

## 2026-09-22 — R12 统一播放与试听来源（transport.1 / core.60）

原曲、分轨 WAV、时间轴 MIDI/WAV、细分预览共用底部播放/暂停、主音量、跳转和循环；切换互斥，取消的旧加载不能复活。转谱区增加明确“试听 WAV / 试听 MIDI”，MIDI使用当前活动结果及草稿。细分片段映射歌曲时间，越界暂停；修复元数据未主动加载造成的等待。

最终包 XLD 70、XML 74、发行工具4条命令及修订/融合测试通过；真实 MEGURI 窗口、编辑保存导出和双进程恢复通过；2871源文件和2780包文件哈希核对通过。分析、模型、XML和用户结果不变。下一轮R13；M/S和混播仍待R14/R15。用户听评和干净机器正式发行验收待做；无Git发布。交接 work/transport-20260922/HANDOFF.md，证据 artifacts/transport-20260922。

## 2026-09-22 — 对标审查与下一阶段企划（文档，未发布新版本）

完成 export.1 功能审查和针对性只读复现，记录播放控制分裂、转谱页试听来源不明、草稿融合未提示及和声统计问题；证据位于 artifacts/ripx-audit-20260922。
用户确认以统一试听、多轨 M/S、WAV/MIDI 混播和应用内人工修正为主线，FL Studio/外部 DAW 往返暂缓。已整理[五轮可执行企划书](docs/XLD_PLAYBACK_EDITING_PROJECT_PLAN_20260922.md)，逐轮列出范围、依赖、验收、代码落点及保持事项。R12–R16 尚未实施；没有修改产品源码、发布包、模型或用户结果，也没有 Git 发布。下一轮 R12 统一播放与来源提示；旧“先做合并/拆分”的顺序由新计划取代。

## 2026-09-22 — R11 MIDI 导出与 P0 工程验收（export.1 / core.59）
时间轴新增“导出 MIDI”：完整复制当前已存声部文件，保留多乐器、CC、弯音及原始时间；有草稿先保存或撤回。系统另存为取消不写文件，对话框期间版本变化拒绝写出，分析源文件受保护。
加入折叠草稿清单与“回到草稿”，区别当前、其他版本、来源已变、原版缺失/不可读；切回原音源恢复，旧草稿不套用新来源。修复人工修订类型标签掩盖来源变化的显示问题。
隔离 MEGURI 验证原样导出、实际融合包含编辑音符、切回原稿、草稿跨版本/音源恢复，并在第二个独立 Electron 进程确认修订、导出与融合一致。原有 MIDI 哈希不变。
测试：XLD 68、XML 74、发行工具 4、Python 修订往返/融合通过。旧 midi-models 测试曾因运行时探测替身不响应而静默提前结束，本轮修复并加超时断言；另以真实服务+模拟后端验证普通缓存复用与显式重跑保护人工版。
十一轮开发范围完成；P0 工程通过，实际修正片段的用户听评待进行，尚非正式版/干净机器验收。下一步先收集真实修正反馈，再做音符合并/拆分。无新模型、无 GPU 推理、无 Git 推送。
交接 work/midi-export-20260922/HANDOFF.md；证据 artifacts/midi-export-20260922；程序 releases/0.5.0-dev.export.1/XLD.exe。


## 2026-09-22 — R10 MIDI 音符编辑（edit.1 / core.58）
本轮把 R4 的写入器、R6 的试听与 R7–R9 的选择/渲染接成实际编辑流程。聚焦单轨后可增删、拖动时间与音高、调整两端与力度，支持单次操作撤销重做及精确数值输入。多选按统一增量移动，数值只改单音。草稿独立持久化、重开恢复；保存创建并激活修订，不覆盖模型结果，保存失败保留草稿。正式融合仍使用已保存版本，试听和条带使用当前草稿。
修复 R4 多乐器缓存缺陷：写出的 MIDI 保留所有乐器，而 notes.json 原先只记录被修改的乐器。现在从实际读回文件导出完整缓存，总数与乐器分段一致。真实 MEGURI 窗口验证其他乐器和控制信息保留。
测试：XLD 64、XML 74、发行工具 4、Python 修订往返与融合均通过；真实开发包验证拖动/时长、增删、力度、撤销、重载恢复、试听光标/循环、多乐器修订、拒绝重叠、窄窗口和双语。原始夹具 MIDI 哈希不变。没有写入真实分析根或更改模型默认。
保留限制：同声部同时一份乐器草稿；空 MIDI 第一个乐器、删除最后音符、跨轨批改未实现；暂无独立导出。下一轮 R11 导出/换源/P0 全链验收。本机开发验证不等于干净机器正式发行验收。
交接：work/midi-editor-20260922/HANDOFF.md；证据：artifacts/midi-editor-20260922；程序：releases/0.5.0-dev.edit.1/XLD.exe。


最后更新：2026-09-22  
记录范围：2026-06-20 至 2026-09-22  
主工作目录：`D:\Projects\Xin-Music-Lab-Fusion`

> 本文件按已有源码、测试报告、截图、哈希和阶段报告回溯整理。2026-09-13 只补齐文档，没有修改运行代码，也没有部署产品。

## 当前状态

最新开发包：releases/0.5.0-dev.export.1；XLD core.59 / XML stems.13。R11 导出、草稿换源提示与 P0 工程验收完成，用户听评待进行。见 work/midi-export-20260922/HANDOFF.md。上一开发包：releases/0.5.0-dev.edit.1；XLD core.58 / XML stems.13。R10 音符编辑、撤销、持久草稿及修订保存完成；多乐器缓存修复，五链和真实窗口通过。交接 work/midi-editor-20260922/HANDOFF.md；下一轮 R11。上一开发包：releases/0.5.0-dev.pitch.1；XLD core.57 / XML stems.13。R9 固定音高行、纵向滚动与 128× 缩放完成；五链及 MEGURI 实际窗口通过。交接 work/pitch-zoom-20260922/HANDOFF.md；下一轮 R10。上一开发包：releases/0.5.0-dev.viewport.1；XLD core.56 / XML stems.13。R8 视口绘制、位图复用与选择叠加层完成；五链和 MEGURI 实际窗口通过。交接 work/viewport-render-20260922/HANDOFF.md；下一轮 R9。上一开发包：releases/0.5.0-dev.selection.1；XLD core.55 / XML stems.13。R7 音符单选、加选、框选与只读属性完成；五条测试链及真实 MEGURI 窗口通过。交接 work/note-selection-20260922/HANDOFF.md。下一轮 R8 视口渲染。上一开发包：releases/0.5.0-dev.compare.1；XLD core.54 / XML stems.13。R6 原位对照与区间循环完成，交接 work/compare-loop-20260922/HANDOFF.md。上一开发包 writer.1：音符级 MIDI 修正方案的 R4：修订写入器与提交路径，刻意不含编辑界面。**先量后做，推翻了企划书的核心校验形状**：未编辑乐器改用 **MTrk 块 SHA-256**（字段遍历在本库上结构上不可能失败），被编辑乐器改为对照**请求的音符**（企划书把它排除在外，而那是唯一会出错的地方）。交接 work/revision-writer-20260921/HANDOFF.md。上一开发包 revision.1：音符级 MIDI 修正方案的 R3：人工修订成为一等版本。**全案最贵的一条约定**——identity 每份唯一（用户拍板），后果是修订**永远 superseded**，而任何把 superseded 读成「过期废稿」的地方都会灼掉、标错、拒绝或删掉用户的手工成果。engine id 定为 `manual-revision`（不是企划书写的 `manual`，那个 id 已被人工段落 / 和弦标注占用）。交接 work/revision-record-20260920/HANDOFF.md。上一开发包 audition.1：音符级 MIDI 修正方案的 R5：单轨 MIDI 试听——这个应用第一次自己发声。手写合成（振荡器 + 包络 + 滤波，无采样库），够判断音高 / 起音 / 时长 / 粗力度，**判断不了鼓类别与音色**（中英文 tooltip 写明）。纯渲染端：`core/`、`analysis-*/`、`desktop/` 逐字节未变，包里没有任何音频或音源文件。交接 work/audition-20260920/HANDOFF.md。上一开发包 instrument.1：音符级 MIDI 修正方案的 R2：时间轴不再把一个声部当成一件乐器——MuScriptor 一直往 `.mid` 里写多条命名乐器轨（弦乐 cello / string ensemble / contrabass / violin / viola，吉他失真 / 清音 / 木吉他），`runner.py` 生成 `notes.json` 时压平了，界面从来没读过；新增只读 SMF 解析器把边界读回来，MEGURI 从 5 条轨变 11 条。不引入模型、不重新转谱、盘上结果一字节未动。对不上就不拆分：文件音符数与 `notes.json` 不符时不给任何分段，退回原来的单轨显示。交接 work/instrument-lanes-20260920/HANDOFF.md。上一开发包 merge.1：音符级 MIDI 修正方案的 R1：换过弦乐来源不再让整个融合失败，被落下的声部连同原因一起说出来；融合 fingerprint 的哈希输入未变。交接 work/merge-skip-20260920/HANDOFF.md。上一开发包 retire.2：删繁就简轮：退役 MSAF 四变体、两个 MuScriptor 鼓、Bowed Strings、AudioSep（一律作为**标记**，既有结果仍可读可删）；段落引擎三份硬编码合成一份 registry；新增全库结果清理，按碎片数排序、批量移入回收站。交接 work/retirement-20260919/HANDOFF.md。上一开发包 results.1：分析结果删除改为进回收站且失败可见：原按钮用 `fs.rm` 永久删除、吞掉错误、无条件报成功，还会删掉别的窗口正在跑的分析的 staging 文件。交接 work/result-delete-20260919/HANDOFF.md。上一开发包 history.3：同日修掉轮次 B 引入的数据丢失回归：标记保留后强制重算同一版本，会被 `analysis-service.cjs:401` 的同版本清理硬删（`fs.rm`，不进回收站），且标记成为孤儿后连取消保留都做不到。两处删除现在都查标记，读不到标记目录时默认保留。交接 work/midi-keep-fix-20260919/HANDOFF.md。上一开发包 history.2：P0 轮次 B：同一引擎的多个版本有了地址——可切换 / 回退（不起推理）、按 runId 删除、标记保留；生成新版本后有限回收盈余，只动没有任何指针指向的版本，结构上不可能删掉正在用的那一版。磁盘只多一类文件 `midi/<声部>/kept/<runId>.json`。交接 work/midi-versions-20260919/HANDOFF.md。上一开发包 timeline.7：单轨和声协调：每条音符轨下方的条带可切换读「演奏方式」或「和声关系」（一致 / 补充 / 冲突 / 难以判定），以全局和弦轨为参照系，只说关系不给单轨和弦名，每段附转位（最低音相对根音）；判据时值加权，经过音不会被当成冲突。纯渲染端，分析目录与 IPC 通道对 drums.2 逐字节相同。交接 work/timeline-harmony-20260919/HANDOFF.md。上一开发包 drums.2：鼓默认按用户听评切到 ADTOF · DrumSep 7 类（纯 ADTOF 与 MuScriptor 两档保留为备选，旧结果继续可读）；只动 defaultFor 加一次性迁移，verify 剥掉 defaultFor 深比较证明模型 / 权重 / options 一字未改。交接 work/drums-default-20260919/HANDOFF.md。上一开发包 revert.1：**弦乐分件三轮（strings.1–.3）已按用户决定全部撤回**：`strings` 是容器不是乐器，摘一件出来不等于拆分，且跳过组轨会静默丢掉中提琴；真正的做法是链式残差，另属一套机制，用户选择先不做。源码以 timeline.6 暂存快照逐文件还原，整棵 2841 文件树除版本号外零差异；五条声部回归，时间轴六轮成果全部保留，用户已有结果一个字节未删。交接 work/strings-revert-20260919/HANDOFF.md。上一开发包 strings.3：弦乐重叠修正（用户发现）：弓弦乐组本身包含小提琴，组与分件同时进融合会把同一段演奏算两遍（MEGURI 实测 strings 4698 + violin 1528 同在一个合并里）。`midi-merge.plan()` 现按 `overlaps()` 裁剪：`strings` 与任一启用分件重叠时跳过并记入 `plan.skipped`，界面说明；磁盘不动，清掉分件音源组轨即回；音区不相交（如组为中提琴、分件为小提琴）则两者都保留。交接 work/strings-overlap-20260919/HANDOFF.md。上一开发包 strings.2：弦乐分件第 2 轮：按用户重述把口径从乐器身份改为**音区**（高音弓弦 / 低音弓弦 / 最低音弓弦，文案写明中提琴会漏进小提琴那条），stem id 保留 violin / cello / double-bass（Mega53 目标名与 GM 程序号，且与分轨页一致）；double-bass 加为正式声部，STEMS 现为八个；viola 仍不单独成轨但其分离仍可作组轨音源。交接 work/strings-dbass-20260918/HANDOFF.md。上一开发包 strings.1：弦乐分件（路线图 §P4.5 的 G 行）：violin 与 cello 成为与 bass / piano / guitar 平级的正式转谱声部，各自指向自己的 Mega53 分离、各自用自己的 GM 程序号（40 / 42）转谱、各自进融合与时间轴；`strings` 整组原样保留并仍接受全部六个目标，旧结果无需迁移。先跑了可行性门（work/strings-gate-20260918）：violin↔cello 相关 0.016 / 0.194 分得开，viola 分不开故不做。交接 work/strings-split-20260918/HANDOFF.md。上一开发包 timeline.6：角色层第 1 轮（路线图 §P4.5 的 F 行）：每条音符轨底部一条角色条，判读柱式 / 扫弦、分解和弦、线性三类，单轨模式下音符按角色上色，每段 tooltip 摊开依据。判据是 onset 间距而非复音度（用户在实现前指出分解和弦会被两分法误判成主音线条）。全部在渲染端从已有音符算出，无新分析 / 无存储变更。交接 work/timeline-roles-20260918/HANDOFF.md。上一开发包 timeline.5：按用户反馈把平移修饰键从 Alt 换成 Shift（Alt 是 Windows 菜单栏保留键，autoHideMenuBar 下会拉出 Electron 默认菜单），并把「跟随光标」改成「定位光标」——原来只在光标走出视野中段时才回中，8× 下约 23 秒才动一次，名不副实；现在是单次动作，播放本身不再滚动画面。纯渲染端，app.js / desktop/main.cjs / core/ 与 XML 包对 timeline.4 逐字节相同。交接 work/timeline-locate-20260918/HANDOFF.md。上一开发包 timeline.4（导航）：新增「跟随光标」（默认开，播放时把光标保持在视野中段；关着时点它＝跳回光标并重新跟随），拖刻度条平移、Alt 或中键拖轨平移，手动平移自动关掉跟随，缩放保持画面中心（跟随时以光标为中心），轨头钉在左边缘。纯渲染端，app.js / desktop/main.cjs / core/analysis-service.cjs 逐字节未动。交接 work/timeline-nav-20260918/HANDOFF.md。上一开发包 timeline.3：时间轴视图第 3 轮：图上标注——页签头的「标注」开关打开后，在任意轨上拖动划区间、点某一块把它的区间与标签抄进标记，改完保存即成一条人工标记；模型结果永不被改写，一切写进 manual-tags.json（标注新增 kind 字段，section 默认 / chord，旧标注读回即 section，无需迁移），与段落实验室共用一套对象；music-lab.json 的 manualTags 只导出 section 标记，XML 契约未动。交接 work/timeline-annotate-20260918/HANDOFF.md。上一开发包 timeline.2：时间轴视图第 2 轮（按用户看过首版后的两点反馈）：播放光标接上 timeupdate（首版导出了 updatePlayhead 却没人调用，画一次就冻住），并改成每条轨缓存光标所在的段落块，4 Hz 的 tick 不再全量扫描约 750 个块；点音符轨的轨头可单独查看该声部，铺满视图高度、旋律轨画黑键底色与 C 参考线、鼓轨每个实际 GM 键一行并写键名，音名沿轨重复以免放大后滚出视野，段落轨与和弦轨保留作参照，Esc / 轨头 / 「返回全部轨」退出。纯渲染端：首版加的音符 IPC 与分析代码、注册表、core/、整个 XML 包对 timeline.1 逐字节相同。交接 work/timeline-focus-20260918/HANDOFF.md。上一开发包 timeline.1：时间轴视图第 1 轮：XLD 新增「时间轴」页签，把一首曲子的段落、手动标记、和弦与五个声部的 MIDI 音符画在同一根时间轴上，只读；原「MIDI」页签改名「转谱」。段落类用 DOM 方块保留 tooltip 与命中测试，音符用 canvas（单曲可超万个音符）；所有轨共用同一个时长与缩放，不会错位。缩放 1×–8×、任意轨拖动跳转、声部配色、鼓轨按 GM 键名分组。新增只读 IPC `assets:midi-notes`。不量化、不画网格、不能编辑音符，图上标注是第 2 轮。纯渲染端改动：分析代码、所有模型注册表、core/ 与整个 XML 包对 drums.1 逐字节相同，MIDI 默认未动。交接 work/timeline-20260918/HANDOFF.md。上一开发包 drums.1：模型优化迭代 R3：鼓 MIDI 备选引擎 ADTOF · DrumSep 7 类（crash / ride 拆分 + 相对力度）接入，ADTOF 仍默认，试听页 artifacts/drums-stems-20260918/listening 待听评；交接 work/drums-stems-20260918/HANDOFF.md。R4 节拍（Beat This!）已试验并放弃，代码回滚，详见日志末尾。上一开发包 piano.2：模型优化迭代 R1 完成：Transkun V2（预测力度与踏板）经用户在 BCNR《Nancy》上听评后成为钢琴默认，HiRes 保留为备选；需求冻结见 docs/MODEL_INTEGRATION_FREEZE_20260918.md，交接见 work/piano-transkun-20260918/HANDOFF.md。最新本机预览：releases/0.5.0-preview.paths.1；XLD core.26 / XML stems.11。完成相对路径、独立预览偏好、系统目录默认和随包帮助；本机搬迁通过，独立机器验收待做。详见日志末尾及 work/portable-paths-20260918/HANDOFF.md。上一开发包 history.1 的状态如下。P0 轮次 A 完成：历史 MIDI 结果可读与当前版本缓存匹配解耦（ok / matches），每次运行独立记录 midi/<stem>/runs/，融合记录 provenance；不换模型、不改默认。吉他默认 MuScriptor Medium、复杂曲可选 Large；弦乐默认 Large；钢琴 / 贝斯保持 HiRes；鼓保留 ADTOF 默认及 MuScriptor 双档。toe 鼓试听已完成，整体相近、ADTOF 镲片尾音略逊，未决定切换默认。下一步为 P0 轮次 B（同 engine 多版本切换 / 回退 / 按 runId 删除 / 保留策略）。完整交接见 [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) 和 [进度与计划](docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md)。本机开发验证通过，不代表干净机器正式发行验收。下表保留原视觉项目阶段状态。

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

## 2026-09-18：模型选型调研与接入需求冻结

只做网络调研与文档：docs/MODEL_LANDSCAPE_20260917.md 记录当前基线维护状态与各任务候选（论文、日期、许可证、同比数值、试验顺序）；docs/MODEL_INTEGRATION_FREEZE_20260918.md 冻结本次模型优化迭代：R1 Transkun V2 钢琴 → R2 ChordMini / consonance-ACE 和弦 → R3 鼓 7 类 + 力度（设可行性门）→ R4 Beat This!；用户拍板 ChordFormer 因无许可证不纳入。不改默认、新引擎一律备选、人工听评决定切换。

## 2026-09-18：R1 钢琴备选引擎 Transkun V2

发布 releases/0.5.0-dev.piano.1（XLD core.27 / XML stems.11）。新增 `piano-transkun`（Transkun V2，ISMIR 2024，pip transkun 2.0.1，MIT）为钢琴备选卡片，HiRes 仍为默认，其余 12 个模型条目逐字节不变。权重用 pip 包自带检查点（增广、不做踏板延音，sha256 50a80010…）；以 `--no-deps` 装入 highres 环境（transkun、moduleconf），soxr 退回原版本，runtime-manifest 重算。适配器保留预测力度与 CC64 踏板，走现有 runner 契约与 P0 的 runs/ 记录。

隔离 MEGURI 副本整曲：Transkun 540 音符、任务 37.6 s、峰值 1282 MiB、力度 20–98 共 65 档、60 个踏板事件；HiRes 缓存 232 音符、力度 7–60、14 个踏板事件。音符数不代表准确率。试听页 artifacts/piano-transkun-20260918/listening/MEGURI-钢琴MIDI对比.html：1:20、2:20、6:05 三段，原分轨 / HiRes / Transkun 各自预测力度、同一音源。用户认为 MEGURI 钢琴量少难以判断，补跑真实曲库 BCNR《Nancy Tries to Take the Night》：Transkun 2175 音符、27.9 s、峰值 1166 MiB、力度 8–101，HiRes 1711 音符；运行后 HiRes 恢复为活跃结果，Transkun 留作备选缓存；试听页 listening-nancy/Nancy-钢琴MIDI对比.html（3:30、4:40、6:00）。两端 npm test 退出 0；发布包窗口检查（两张钢琴卡片、默认 / 备选、中英提示、一键复用、融合与目录、宽窄布局）通过；2724 个包文件哈希；runtime.json 全相对可解析；真实曲库未写入。待用户听评后决定是否切换钢琴默认；下一步 R2。详见 work/piano-transkun-20260918/HANDOFF.md。


## 2026-09-17：GitHub 本地基线与仓库关联

为 jiangxin1245234785-stack/Xin-Music-Lab-Fusion 建立 main / origin，纳入当前 history.1 / core.25 源码与精简文档。新增根忽略规则、保留原字节的 Git 属性、GitHub 开发说明和 runtime.local.example.json；运行环境、模型、曲库、生成音频 / MIDI、旧安装包、凭据和本机配置保持本地。常见凭据模式和大文件扫描通过，未修改应用算法或重跑推理。首次远端上传状态以 work/github-setup-20260917/HANDOFF.md 后续验证及远端 main 提交为准。

GitHub 接入后续验证：用户完成设备授权；远端为私有仓库且可推送。初始提交 9d40d55 已上传，远端 main 与本地一致，设置 origin/main 跟踪。模型、运行环境、音乐和生成结果未上传。


## 2026-09-18：钢琴默认切换 Transkun V2（piano.2）

用户听评 Nancy 三段对比后认为 HiRes 有杂糅的根音（钢琴共鸣音识别不准），接受 Transkun V2 为钢琴主选。发布 releases/0.5.0-dev.piano.2（XLD core.28 / XML stems.11）：models.json 只改 defaultFor，模型串与参数不变，旧结果继续可读；首次迁移标记 `xld.midi.piano-default`，清除旧显式 HiRes 选择、保留 Basic Pitch、之后尊重手选；文案、使用说明与 README 同步。两端 npm test 通过；发布包窗口检查覆盖默认选中、迁移矩阵、五声部一键 / 融合 / 目录、中英提示、宽窄布局；真实曲库只读回读正常，Nancy 仍以 HiRes 为活跃结果、Transkun 缓存有效。详见 work/piano-default-20260918/HANDOFF.md。

## 2026-09-18：面向使用者的文档与试用发布准备

README 改为功能、获取状态、使用入口、模型选择与反馈；旧版归档。新增 docs/USER_GUIDE.md、DEVELOPMENT.md、PREVIEW_RELEASE_PLAN.md；重写两份随包 README 模板。明确源码 ZIP 不包含模型和运行环境，目前没有通用下载包。

确认 history.1 的21条 runtime 路径均为绝对路径、开发种子含个人曲库、MuScriptor共用YourMT3 Python；下一步先做可搬迁包与首次配置，再做干净系统 / GPU 验证。离线 HTML 帮助仍待统一。本轮未改应用版本、模型、现有发行包或仓库可见性，也没有创建 Release。见 work/public-preview-20260918/HANDOFF.md。

## 2026-09-18：相对路径预览

已生成本地 `0.5.0-preview.paths.1`（XLD core.26 / XML stems.11）。环境配置的 21 个路径全部相对 runtime.json 保存；打包同时换算旧绝对配置。程序与 runtime 保留层级即可一起搬迁。曲库和分析结果是用户自己选择的外部目录，继续记录绝对路径，避免因移动程序而失联。

首次使用系统音乐目录与文档/Xin Music Lab/Analysis；预览版偏好独立、不复制个人开发设置。旧版本及已有结果未迁移。MuScriptor 共用 YourMT3 Python 的关系已在配置生成中明确。

本机中文/空格目录搬迁：11 组环境检查通过、6 个 Python 的受检导入路径均在新目录；XLD/XML 启动、目录保留、共享配置与帮助通过。30 秒 toe 鼓片段在新位置用 ADTOF/CUDA 完成转谱，保存及回读 30 个音符。两套源码回归、发布路径及诊断测试通过。

仍未进行原开发目录不可见的独立机器验证。大二进制搬迁测试采用同盘硬链接，不等于新 Windows 安装；强制隐藏 GPU 时发现现有 PyTorch/cuDNN 的 min() 空集合错误，CPU 模式待处理。公开安装包、组件再分发核实和模型安装引导仍待完成。

## 2026-09-18：R2 和弦对照引擎（chords.1）

发布 releases/0.5.0-dev.chords.1（XLD core.29 / XML stems.11）。新增 `chord-chordmini`（ChordMini BTC-CL，MIT，与 BTC 同架构、同 170 类词表，ai 环境加载）与 `chord-consonance`（consonance-ACE 分解式 Conformer，MIT，`runtime/addons/chords-v1` 运行，保留转位与 Harte 原标签）；二者为备选，BTC 仍是基准与 XML 共识主引擎。和弦 runner 与 vendored BTC / ACE 代码从 runtime/0.5.0/scripts 迁入 source/xld-runtime-baseline/analysis-harmony，权重留在 runtime；结果新增 rawLabel、bass、engine.checkpoint。ai 环境补装 soxr 与 packaging（此前缺失使四个旧和弦引擎在打包 runtime 下无法启动），runtime-manifest 重新生成。新增环境变量 XLD_CHORDS_ROOT / XLD_CHORDS_PYTHON。

验证：四个旧引擎在源码 runner 与 runtime runner 下逐段一致；两端 npm test 与 release-tools 测试通过（新增 tests/harmony-engines.cjs）；打包 runner 六引擎全部可用且片段结果可复现；MEGURI、toe Goodbye、BCNR Nancy、七里香四首整曲四引擎真实运行（隔离输出），与 BTC 三和弦一致率 ChordMini 77–91 %、ACE 56–78 %，对照页含原曲播放与分歧跳转；打包 UI 从界面运行两个新引擎、六卡片、中英文案、宽窄布局。真实曲库未写入和弦结果。下一步：用户听评对照页后决定共识权重；ChordFormer 许可 issue 待用户确认；R3 / R4 / P0 轮次 B。

## 2026-09-18：ChordMini 成为和弦主引擎（chords.2）

用户看过四首整曲对照页后拍板“主引擎为 ChordMini”。发布 releases/0.5.0-dev.chords.2（XLD core.30 / XML stems.12）：XLD 新增 `PRIMARY_HARMONY_ENGINE`，专辑批量与和弦页默认选中 ChordMini、不可用退 BTC；XML `CHORD_ENGINE_PRIOR` 与 `HARMONY_PRIOR` 同改为 ChordMini 1.5 / BTC 1.35 / 其余 1，曲目徽标有 ChordMini 时显 M，共识下拉文案列出全部引擎。引擎、runner、权重、注册表、MIDI 默认不变（包内 analysis-harmony 与 chords.1 逐字节相同）。两端 npm test 与 release-tools 测试通过，新增共识先验 contract；打包 XLD 窗口验证默认选中、批量 pick、文案与从界面运行 BTC；打包 XML 窗口验证下拉、徽标、435.6 s 处共识跟随 ChordMini（Dm）而非 BTC（A）、BTC 单选可用。ChordFormer 许可 issue 用户选择暂不发。下一步 R3 / R4 / P0 轮次 B。

## 2026-09-18：R3 鼓 7 类 + 相对力度（drums.1）

可行性门通过：MDX23C DrumSep 6 stem 权重（aufr33 / jarredou，CC BY-NC-ND，作者仓库已删、Wayback README 可证，三镜像 sha 一致）+ MSST 模型代码（MIT）；toe 鼓轨分离 11.1 s ≤ 基础六轨 58.3 s。发布 releases/0.5.0-dev.drums.1（XLD core.31 / XML stems.12 不变）：新引擎 `drums-adtof-stems` 作备选——鼓点与 5 类仍由 ADTOF 给出（`drums.py` 拆出 `activations()`，基线输出逐字节不变），DrumSep 六轨用于把镲片拆成 crash / ride 并按各击在自己 stem 上的能量给出曲内相对力度（32–127）；GM 键 36 / 38 / 47 / 42 / 49 / 51；notes.json 每击附 ADTOF 原类与能量。鼓组 stem 不落盘（偏离冻结“存入 refinement/”，每曲约 0.9 GB 且无消费者），CLI `--keep-kit` 供验证。新增 runtime/addons/drumsep-v1 与 XLD_DRUMSEP_ROOT。

验证：两端 npm test 与 release-tools 测试通过（新增 tests/midi-drumkit.cjs、drumkit.py --selftest）；toe / MEGURI 夹具整曲击数与 ADTOF 相等、同一 onset 集，toe 最安静 20 % 窗口力度 32 vs 最响 103；打包 XLD 窗口从界面运行 16.9 s、默认 / 备选徽标、中英提示、目录、宽窄布局；MEGURI 夹具五声部融合的合并 MIDI 鼓轨带相对力度与 ride 键；三方试听页（原鼓 / ADTOF / 新引擎）。默认未动，真实曲库未写入。下一步：用户听评决定鼓默认；R4 Beat This!；P0 轮次 B。

## 2026-09-18：R4 节拍 Beat This! —— 试验后放弃

按冻结 §7 完成了完整接入并发布过 `0.5.0-dev.beats.1`（XLD core.32）：新结果类型 `rhythm`、引擎 `beat-this`、概览页摘要卡片、music-lab.json 可选 `rhythm` 字段、四首整曲真实运行（均 5 秒内）、点击轨试听页、打包窗口验证与两端测试全绿。

用户听评后判定：除有华尔兹铺底的 MEGURI 外，其余曲目识别不可用。独立核对（librosa onset 包络与其自带跟踪器）确认两类失败：**倍频错误**——七里香跟成 71.4 BPM，独立估计为 143.6 BPM，拍点仍落在真实 onset 上，所以"拍间隔变异 1.2 %、100 % 四拍小节"这些指标反而最漂亮；**强拍漂移**——Nancy 与 toe 的速度与独立估计一致（107.1 vs 107.7、136.4 vs 136.0），但小节长度分布散乱（Nancy 只有 29 % 的小节是四拍），点击轨里的强拍一直换位置。排除了渲染与解码问题：Beat This! 因缺 torchcodec 实际也走 soundfile 解码，与试听页切片同源，四首时长逐毫秒一致；拍点处 onset 强度为全曲均值的 3.0–3.6 倍，偏移半拍只有 2.2–2.5。

决定放弃 R4。回滚方式：以 drums.1 的暂存快照逐文件还原全部 R4 改动（2839 个源文件哈希比对零差异），删除 `releases/0.5.0-dev.beats.1` 与 `runtime/0.5.0/models/beat-this`，从 envs/ai 卸载 beat-this 与 rotary-embedding-torch，重算 runtime-manifest，两端测试复跑通过。证据保留在 work/beats-20260918 与 artifacts/beats-20260918。

教训写入交接：节拍追踪不能用自洽类指标验收（拍间隔变异、拍号占比），必须人工数拍或与独立估计器交叉验证；倍频错误在自洽指标上表现最好。冻结 v1 最终交付 R1 钢琴、R2 和弦、R3 鼓三轮，R4 记为"已试验、不纳入"。

## 2026-09-18：时间轴视图 第 1 轮（timeline.1）

模型迭代告一段落后转做可视化。用户的核心需求是"直观看到结构化分析的结果，后续可以直接在图上标和弦、标段落变化"；调研过 wave-roll（MIT，ISMIR 2025 LBD，实测显示离线可用、播放需改一处 URL 常量）与 Sonic Visualiser（GPL-2.0，只能当外部工具），结论是自建——因为共享时间轴与标注机制 XLD 本来就有，第三方查看器接进来反而要重做这两样。

发布 releases/0.5.0-dev.timeline.1（XLD core.32 / XML stems.12 不变）：新增「时间轴」页签，把段落轨、手动标记轨、和弦轨与五个声部的 MIDI 音符轨画在同一根时间轴上，只读；原「MIDI」页签改名「转谱」（它做的是转录与合并）。段落类保持 DOM 方块（几百块，保留 tooltip 与命中测试），音符走 canvas（单曲五声部可超万个音符），两者的 x 都由同一个时长与同一个缩放算出。缩放 1×–8×（dpr 按 16384 画布上限压制）、任意轨拖动跳转、每轨一个播放头、声部配色固定、鼓轨按 GM 键名分组、音高范围按轨自适应并有 8 个半音的下限。主进程新增只读 IPC `assets:midi-notes`，把每声部当前生效的 MIDI 压成 [start, end, pitch, velocity] 四元组；不写分析目录。不量化、不画网格、不能编辑音符，图上标注留给第 2 轮。

验证：三条回归链全绿（新增 tests/timeline-view.cjs，用 DOM 替身覆盖轨组合、共享时长下的宽度、缩放、播放头读数与页签点击重新取数）；打包 XLD 窗口在隔离 MEGURI 夹具上取到 3 条和弦轨 + 5 条音符轨（896 / 540 / 2916 / 4698 / 1596 个音符）、752 个段落块、画布首 2000 列 118534 个着色像素、缩放把轴从 1154 px 拉到 2308 px、中英标签、宽窄窗口无溢出无控制台错误。纯渲染端改动：分析代码、所有模型注册表、core/ 与整个 XML 包对 drums.1 逐字节相同，MIDI 默认未动。

两处经验：构建除 index.html 外还会往 desktop/preload.cjs 追加 XinRelease contextBridge，verify 对这两个文件都要按"源文件 + 恰好那一处注入"比对；以及第一版 app.js 只接了 render() 没接 refresh()，DOM 替身测试全绿而打包窗口音符轨为 0 —— 替身验证组件行为、真窗口验证接线，不能互相替代。

下一步：时间轴第 2 轮（图上标注和弦与段落，要开 upsertAnnotation 目前跳过的和弦分支并改存储契约）；鼓默认待用户听评；P0 轮次 B。

## 2026-09-18：时间轴 第 2 轮 —— 单轨查看与播放光标（timeline.2）

用户看过首版后提两点:「需要放大图」「当前的光标不会动」。追问确认「放大」指的是**单独查看一轨,直观看到音轨,后续和弦标注也更直观**,不是铺满窗口也不是提高横向缩放上限。

发布 releases/0.5.0-dev.timeline.2（XLD core.33 / XML stems.12 不变）。

**光标**:首版把 `updatePlayhead()` 导出了却没接到任何事件上,所以它只在渲染那一刻画一次。现在由 `app.js` 的 `timeupdate` 驱动。`timeupdate` 约 4 Hz 而和弦轨可达 750 个块,所以同时改成每条轨用 `row.activeSegment` 缓存光标所在的块、只有离开区间才重新查找,块的起止在创建时就存成数字;面板隐藏时直接返回。保留「当前播放曲 = 选中曲」才显示光标的约束。

**单轨查看**:点音符轨的轨头(改成 `<button class="tl-row-toggle">`)进入,该声部占满 `clamp(320px, 56vh, 620px)`,其余音符轨收起,段落 / 手动 / 和弦轨全部保留作参照。旋律轨画黑键底色与每个 C 的参考线;鼓轨改成每个实际出现的 GM 键一行并写 kick / snare / hihat / tom / crash / ride。音名标签沿轨每 320–720 px 重复一组——画布宽度等于缩放倍数,单独一个左侧标尺放大后会滚出视野。Esc、轨头、「返回全部轨」按钮都可退出;焦点声部在换曲或换 MIDI 后不存在时自动回到全部轨。

验证:打包窗口把 `currentTime` 设到 60 s 与 300 s,光标从 10.5495 % 走到 52.7473 %（对应 60/568.75、300/568.75）、八条轨一致、读数行跟到 5:00 并报出该处和弦、段落块高亮;单轨 piano 轨高 72 → 477 px、保留 3 条参照轨、64.6 万着色像素;Esc 恢复五条轨;单轨 drums 105.8 万像素;缩放与中英文案照常;宽窄窗口无溢出无报错。三条回归链全绿。首版加的音符 IPC（main.cjs / preload.cjs / workspace-controls.js）与分析代码、注册表、core/、整个 XML 包对 timeline.1 逐字节相同,verify 里有断言。

下一步:图上标注（点和弦块改标签、任意位置打段落标记,要开 `upsertAnnotation` 跳过的和弦分支并改存储契约）。横向深缩放（8× → 32×+，需改成只渲染可视区）按需再做。

## 2026-09-18：声部拆分的边界 —— 身份 vs 角色（决策，未实装）

用户追加的需求:guitar 里节奏吉他与主音吉他结构功能完全不同,strings 里 cello 与 violin 职责也完全不同,归为同一轨是否合理。

查证后结论是这属于两类问题:

- **cello / violin 是声源身份问题,分离层已经能做。** `analysis-refine/mega-targets.json` 的 53 个目标里 `violin` / `viola` / `cello` / `double-bass` 各自独立,`core/string-source.cjs` 的 TARGETS 表也已按 GM program 40 / 41 / 42 / 43 解析。挡住"并存"的是 XLD 自己的记账:`midi/strings-source.json` 是单指针、MIDI 记录按 stem 单键存、`derived-assets.cjs` 的 `sourceMismatch` 把 `sourceTarget` 变化判为 stale。要并存需给 stem 引入子键,牵动 `readMidi` / `midi-delete` / `midi-merge` / 时间轴轨组合,是与 P0 轮次 B 同量级的存储契约变更。
- **节奏吉他 / 主音吉他是角色问题,分离层原理上做不到。** 两把电吉他在 BS-RoFormer 下是同一条 stem;Mega53 的吉他细分只到 electric / acoustic / banjo / dobro / mandolin 这种音色身份。区分只能从 MIDI 推断:同一 onset 簇内 ≥3 个不同音高 → 和弦性,单音连续行进 → 线性,再叠与和弦轨标签的吻合度、onset 是否压在和弦变化点上。规则实现即可,不需要模型。

架构决定:**角色是音符之上的一层,不是新的 stem**——同一轨内两种角色经常时间重叠,拆成两条轨是在撒谎。落地形式为时间轴单轨模式下按角色上色 + 轨下方的角色区间条,与路线图 P5 的 "Role 随区间变化" 是同一件事。前提是角色推断继承转谱误差,因此依据必须可见,不得只给标签。

顺序:排在图上标注之后——角色区间条与手工标注同构（时间区间 + 标签）,标注的存储契约开出来后角色层只是它的一个自动来源。弦乐子键单独排一轮。详见路线图 §P4.5 与执行顺序表 F / G 行。本次只写入文档,未改代码。

## 2026-09-18：时间轴 第 3 轮 —— 图上标注（timeline.3）

用户提出时间轴需求时说的核心:「可以直接在可视化的图上标记和弦,段落变化」。本轮交付。

发布 releases/0.5.0-dev.timeline.3（XLD core.34 / XML stems.12 不变）。

**交互**:页签头加「标注」开关,默认关闭（关闭时与上一版完全一致,拖动 = 跳转）。开启后,在任意轨上拖动划出区间、或点某一块把它的**区间与标签抄进**编辑器——点 ChordMini 的和弦块改标签,就是在图上标和弦。点自己的标记可编辑或删除。Esc 一次退一步（先关编辑器,再退单轨模式）。两条人工轨分别紧挨它们所校正的引擎:人工标注（段落轴）、人工和弦（和弦轴）。音符轨按段落轴处理——盯着某个声部找结构变化正是单轨模式的用途。点击命中按时间查找而非 DOM 命中测试,因为适应全曲时一个和弦块可能只有一像素宽。

**存储契约**:标注增加 `kind`（section 默认 / chord）。读取时缺字段一律按 section,**无需迁移**——该字段出现前写的每一条本来就是段落标记。`music-lab.json` 的 `manualTags` 只导出 section 标记（main.cjs 与 analysis-service.cjs 两处桥接同时过滤）,XML 看到的与之前一致、契约未动、XML 包逐字节不变。人工和弦如何进入 XML 共识尚未设计,本轮明确不做。

**模型结果永不被改写**——图上的一切都写进 manual-tags.json。打包检查里断言了标注前后三个和弦结果文件的 sha256 逐字节不变;verify 另断言 IPC 通道集合与上一版逐条相同（本轮没有新增 handler）、preload / derived-assets / midi-merge / midi-delete 逐字节相同、core/ 下只有 analysis-service.cjs 变化且文件数不变。

验证:打包窗口点 ChordMini 的 Fmaj7（4:43.796–4:46.019）抄进编辑器 → 改为 Cmaj7(#11) 保存 → manual-tags.json 多一条 kind:'chord',三个和弦结果未变;music-lab.json 不含 chord 标记;段落实验室列表出现同一条;人工和弦轨画出它;重开有删除、删除后恢复;Esc 关闭;关掉标注后拖动恢复跳转（143 s）;单轨、缩放、中英文案、宽窄窗口均不受影响,无控制台错误。三条回归链全绿。

另记:本轮构建时发现 `releases/` 下除 timeline.1 / timeline.2 与两个 preview 外的旧开发包（drums.1、chords.2、chords.1、piano.2、piano.1、muscriptor.4、history.1）已不在磁盘上,D 盘尚有 127 GB 空闲;build.cjs 原从 drums.1 取开发种子因此首次构建在打包完成后失败,已改为从 timeline.2 取。artifacts/ 与 work/ 下的证据完整。

下一步:路线图 §P4.5 的 F（角色层:吉他节奏 / 主音规则判定 + 上色与区间条）与 G（弦乐子键:cello / violin 并存）。

## 2026-09-18：时间轴 第 4 轮 —— 导航（timeline.4）

用户用过 timeline.3 后提两点:「目前无法快速定位光标位置」「想尝试拖动时间轴发现没有这个功能」。本轮只做这件事。

发布 releases/0.5.0-dev.timeline.4（XLD core.35 / XML stems.12 不变）。新增**跟随光标**按钮（默认开:播放时光标离开视野中段就把画面拉回;关着时点它＝跳回光标并重新跟随）;**拖刻度条**平移,任意轨上 **Alt 或中键**拖动同样平移（左键留给跳转 / 标注）;手动平移**自动关掉跟随**（拖走就是要看别处,不该被拽回来）;**缩放保持画面中心**（以前放大后滚动位置归零,现在保持当前中心时间,跟随时以光标为中心）;**轨头钉在左边缘**。副作用:4× 以上和弦标签终于读得出来,因为现在能走到想看的地方。纯渲染端,app.js / desktop/main.cjs / core/analysis-service.cjs 逐字节未动。

过程中挖出两个真问题。其一,**`setPointerCapture` 对合成指针事件抛 `NotFoundError`,把 pointerdown 处理器后半截整个打断**——打包检查里表现为「拖刻度条能平移但跟随没关掉」,用一次性探针在真窗口确认。指针捕获只是让指针移出元素后事件仍能送达,不是手势的前提:两处手势都改成自己记 `active = pointerId`、捕获包 try/catch、`pointermove` 不再依赖 `hasPointerCapture`;原来的拖动跳转一旦捕获失败会静默失效,是真实环境也会碰到的脆弱点,一并修了。测试替身现在照浏览器的行为在捕获 API 上抛异常,钉住回归。其二,**钉住的音符轨头是透明的**（音符轨头是 button,`.tl-row-toggle` 的 `background:none` 盖掉了底色）,看截图发现,已修并加了两条断言。

另记一条不是 bug 的:缩放保持中心的检查第一次挂在 0.914 → 0.872,原因是曲子末尾处 4× 下想要的中心根本到不了（右半屏越过末端,浏览器截断 scrollLeft）。检查改到曲子中段,量的才是行为本身。

实测:8× 下光标停在窗口 0.50 处;拖刻度条 300 px 画面精确移动 300 px 并关闭跟随;跟随关闭后时钟推进画面纹丝不动;点跟随跳回并居中;8×→4× 中心 0.445 → 0.445;平移到最右端轨头仍贴左边缘、背景 rgb(17,19,28) 不透明;Alt 拖轨不跳转、普通拖动仍跳转（520 s → 57 s）。三条回归链全绿。

下一步:路线图 §P4.5 的 F 行（角色层）。

## 2026-09-18：时间轴 第 5 轮 —— 定位光标与按键冲突（timeline.5）

用户用过 timeline.4 后提两点,都接受。

**Alt 有指令冲突。** Windows 上 Alt 是窗口菜单栏的保留键;XLD 用 `autoHideMenuBar: true`,按 Alt 会拉出 Electron 默认菜单（File / Edit / View / Window / Help）。平移改用 **Shift**,刻度条与中键拖动不变;Alt 对时间轴不再有特殊含义（按住 Alt 拖轨等同普通拖动）。verify 断言打包后的控制器不含 `altKey`。用户提到菜单栏可以常驻,没有那么做:那是原生默认开发者菜单,配色字体无法与这套深色界面统一,而帮助 / 版本 / 语言 / 字号在应用头部已经有了;若要彻底让 Alt 失效可用 `Menu.setApplicationMenu(null)` 或 `before-input-event` 拦截,代价是失去默认快捷键,需单独评估。

**「跟随光标」名不副实。** 它只在光标走出视野中段时才回中,8× 下那条带宽约 45 秒,大约 23 秒才动一次,观感就是单次触发。改成 **「定位光标」**:点一下把画面滚到光标当前位置并居中,没有状态,**播放本身不再移动画面**;当前播放曲不是选中曲时按钮禁用。真正的持续跟随（把光标钉在屏幕固定位置随音频平滑滚动）是另一件事,需要时单独做。

实测:未播放时按钮禁用;8× 下滚动归零后把播放位置设到 500 s,滚动位置保持 0、光标确实在视野外;点定位后光标居中 0.50,时钟推到 505 s 再点落点前移,连点两次落在同一位置;拖刻度条 300 px 精确移动 300 px,随后时钟推进画面不动,点定位回到光标;8×→4× 中心 0.445 → 0.445;Shift 拖轨平移且不跳转,Alt 拖轨不平移。纯渲染端,app.js / desktop/main.cjs / core/ 与 XML 包对 timeline.4 逐字节相同。三条回归链全绿。

下一步:路线图 §P4.5 的 F 行（角色层）。

## 2026-09-18：角色层 第 1 轮 —— 柱式 / 分解和弦 / 线性（timeline.6）

路线图 §P4.5 的 F 行。用户在实现前提出关键问题:**分解和弦的演奏如何识别?** 原定的两分法（同一 onset 簇 ≥3 个音 = 和弦性,单音行进 = 线性）会把分解和弦误判成主音线条——它确实一次一个音,但弹的是和弦。

改成按 **onset 间距** 分三类（扫弦本身也不同时发声,分解和弦也不是旋律）:柱式 / 扫弦 = 落在「60 ms 内、含 ≥3 个不同音级」的簇里的音符占该段一半以上;分解和弦 = onset 错开但音级留在当前和弦内（时值加权 ≥75%）且以跳进移动（级进 ≤35%）;线性 = 级进为主或大量非和弦音。**没有和弦参照就不判分解和弦**;鼓轨不给判读。

三个刻意的设计:不看段内最大簇而看占比（第一版用最大簇 ≥3,MEGURI 吉他几乎整条轨都成了柱式——一个偶然的密集时刻就污染两秒）;簇内要 ≥3 个不同音级（同一音高被切成三个不是和弦）;簇的窗口从簇首算起不链式延长（否则快速音会连成一簇）。

呈现:每条音符轨底部一条角色条（橙 / 绿 / 蓝 / 灰,相邻同类合并）,单轨模式下音符按角色上色,轨头副标题给角色占比,每段 tooltip 写明「同时 N 声部 · 和弦音 X% · 级进 Y% · N 个音符;依据来自转谱结果,不是音频」。全部在渲染端从时间轴已取到的音符算出——无新分析、无 runner、无结果类型、无存储变更;verify 断言打包控制器不含 spawn / child_process / models.json,且 app.js、desktop/main.cjs、core/ 与 XML 包对 timeline.5 逐字节相同。

实测（MEGURI）:角色条 bass 90 段 / piano 92 / guitar 92 / strings 110 / drums 0,288 段有和弦参照。弦乐 54% 柱式（铺底）、贝斯 39% 分解（走和弦音跳进）、吉他真实混合（柱式 17 / 分解 11 / 线性 11）。单轨 guitar 画出三种角色色。三条回归链全绿。

已知代价:继承转谱误差;「难以判定」占 15–36%（诚实,不硬给标签）;贝斯走根音五音被判成分解和弦——判据上没错,若要单独一类是另一轮。

下一步:用户已明确后置的单轨和声协调（每轨与全局和弦的一致 / 补充 / 冲突 / 未发声,bass 轨给转位）,复用本轮的区间条渲染。

## 2026-09-18：弦乐分件 —— 可行性门与实装（strings.1）

用户选择先做可行性门。**门（work/strings-gate-20260918，未改一行源码）**:在两首真有弦乐编制的曲子上，从曲库现成的 `other` 分轨（只读）跑 Mega53 全曲分离，四个目标各一次，共八次，全部成功，7.8–8.4 倍实时（MEGURI 569 s 每目标 67.7–72.1 s，Nancy 397 s 49.9–50.9 s），输出全部落在 D:/Caches。除试听页外给出两两互相关:**cello↔violin 0.016 / 0.194**（分得开）、viola↔violin 0.235 / **0.429**、cello↔viola 0.36 / 0.425、double-bass↔任何 ≈ 0。关键读数:BCNR《Nancy》编制里没有大提琴与低音提琴，模型给的是 −51.8 / −56.6 dB 的接近静音——说明这些目标真有判别力；但同一首里**没有中提琴，viola 却占弦乐组 24.6% 能量**，那条轨大部分是漏过去的小提琴。用户听评认可:「viola 分不开完全理解，中提琴人耳都不一定完全区分；高把位 bass 同样也没办法与 guitar 区分」，拍板实装。

**实装（0.5.0-dev.strings.1 / XLD core.38）**:做成**正式 stem** 而非 stem 子键——子键要处理复合键、Windows 文件名不能带冒号，且 `readMidi(track, stem)` 的返回契约要从“一条”变“一组”，所有调用点都得改；正式 stem 只需注册表扩 `stems`、两处 strings 特判泛化、来源指针改成每 stem 一个，融合 / 删除 / 存储 / 时间轴都是 `for (const stem of STEMS)` 循环，自动生效。`strings` 整组原样保留、仍接受全部六个 Mega53 目标，旧结果不需迁移。`core/string-source.cjs` 新增 `STEM_TARGETS` 规定谁接受什么目标（组轨全部、分件只接受自己那个），指针改为 `midi/<stem>-source.json`；`runner.py` 八处 `stem == "strings"` 守卫泛化为 `STRING_STEMS`；`defaultFor` 支持数组。**没有新增任何 IPC 通道。**

一个设计取舍:原规则“弦乐声部必须显式选源后才出现”在分件后会把自己锁死（violin 要选源才出现，而选择器只作用于当前选中的声部）。改成“磁盘上有该乐器的分离，声部就出现；但没选音源不能转谱、也不进一键批量”——这条规则真正要守的东西原封不动，测试里明确断言。

验证:真实端到端（隔离夹具）分离 75 s → 转谱 145 s 得 1528 个音符、GM 程序号 40 → 融合变六声部 → 清空组轨音源后 violin 结果依然有效；核心契约与界面契约各新增一段断言；打包窗口验证声部列表、按 stem 的音源选择器与占位文案、组轨指针未变、时间轴多出 violin 轨；verify 断言 analysis-midi 下只有 models.json 与 runner.py 变化、注册表只增不改、IPC 通道集合逐条相同、XML 包逐字节不变、STEMS 恰为七个且不含 viola / double-bass。三条回归链全绿。

double-bass 未做（门里相关性同样干净，但两首测试曲只占 2.5% / 0.2% 能量），要加只是注册表与文案的事。下一步:用户已后置的单轨和声协调。

## 2026-09-18：弦乐分件 第 2 轮 —— 按音区重述、加低音提琴、以及一次误删事故（strings.2）

用户看了分轨页后提出重述:「弓弦乐不特定分成三类吧，只分成相对高低音，大致辨别 violin 与 cello 即可」。这个说法正好解释了可行性门:模型有判别力的是**音区**不是乐器身份——violin↔cello 0.016 / 0.194（两端，分得开）、viola 对两边 0.235–0.429（中间，两头漏）、double-bass 对高音区 ≈0、cello↔double-bass 0.291（低音区内部，不如两端干净）。

发布 0.5.0-dev.strings.2（XLD core.39）:**stem id 保留** violin / cello / double-bass（它们是 Mega53 的目标名与 GM 程序号 40/42/43，分轨页的「提取目标」用的也是这些名字，改名只会制造迁移并让两页对不上——用户最初的困惑正是对不上），**改的是文案口径**:高音弓弦 / 低音弓弦 / 最低音弓弦，并写明中提琴可能漏进小提琴那条、低音区的划分不如两端干净。按用户「可以试试」把 double-bass 加为正式声部，STEMS 现为八个。viola 仍不成轨，verify 断言它不是 stem；中提琴的分离依旧可作「弦乐」组轨的音源。

实测:真实端到端分离低音提琴 70 s、转谱 60 s，得 795 个音符、GM 程序号 43，融合七声部；打包窗口声部为 bass / piano / guitar / drums / strings / violin / double-bass，小提琴提示确实写着「高音弓弦」，组轨指针未变，时间轴七条轨。三条回归链全绿。

**事故:重建时 `rm -rf` 了用户正在运行的 `releases/0.5.0-dev.strings.1`。** 该目录只剩两个被进程锁住的文件，用户当时开着的 XLD 靠已加载文件继续运行但无法重启。起因是删除前没查进程。证据已从 work/ 还原回 artifacts/strings-split-20260918，包由 strings.2 取代，因此 strings.2 的 verify 基线取 timeline.6 而非 strings.1。**删除任何 releases/ 目录前必须先查 XLD.exe 进程**，这条已写进 CLAUDE_HANDOFF 的限制清单。

## 2026-09-19：弦乐重叠修正（strings.3）

用户在真实曲库上跑完小提琴后发现问题:「那么现在小提琴岂不是被重复识别了？」——是的。MEGURI 的合并是 `bass 896 | piano 232 | guitar 3156 | strings 4698 | violin 1528 | drums 2147`，而 `strings` 的 `sourceTarget` 就是**弓弦乐组**，本身包含小提琴。同一段演奏进了合并两次。

**这是 strings.1 弄坏的一条既有约束。** 旧限制清单里写着「弦乐一次显式选择一个 Mega 整曲来源，避免总组与子声部同时加入融合」——单指针设计靠结构保证它，拆成独立 stem 后我没有把约束补回去。

修法:`core/string-source.cjs` 定义 `GROUP_TARGETS = ['strings','strings-all']` 与 `overlaps(a,b)`（任一为组目标，或两者同目标）；`core/midi-merge.cjs` 的 `plan()` 据此裁剪。由于 `STEM_TARGETS` 限定只有 `strings` 能持有组目标，冲突永远是「组 vs 分件」，规则收敛成一句:`strings` 与任一启用分件重叠即从合并中去掉，并记入 `plan.skipped`。界面在融合状态行显示「已跳过 strings：violin / double-bass 已经把同一段演奏单独分了出来」（中英各一条），`read()` 在合并文件尚未生成时也带上 `skipped`。**磁盘什么都不动**——清掉分件音源，组轨立刻回到合并里；音区不相交（组为中提琴、分件为小提琴）则两者都保留。

验证:测试覆盖三种情形（组含分件→跳过且 skipped 精确、中提琴组来源→都保留、换回组→再次跳过）；verify 直接跑 `overlaps` 的六组真值表，并断言包内只有五个文件变化、所有分析目录与 XML 包对 strings.2 逐字节相同；打包窗口确认状态行文案。三条回归链全绿。

顺带:`build.cjs` 原本写死从某个旧版本取开发种子，而用户会清理旧包（这次 timeline.1–6 全被清掉，releases/ 只剩 strings.*），改成自动取最新一个仍带该文件的发布包。

留下的取舍:跳过是自动的，逃生口是清掉分件音源，但那会连带让该分件的 MIDI 不可读。若要「时间轴看分件、合并用整组」，需要给合并加按声部开关，另起一轮。

## 2026-09-19：弦乐分件撤回（revert.1）

用户看过实装后的层级指出：「我的目的是拆分 strings 不是只是提一个 violin，这两者层级完全不同，violin 才能和其它器乐同层级在 MIDI 里显示」。

这是对的，我做的不是拆分。`strings`（弓弦乐组）是**容器**，不该和 bass / piano / guitar / drums 并列；把 violin 提成独立 stem 之后组轨仍留在同一层，层级混乱原样还在。strings.3 的「重叠就跳过组轨」只是给两个不同层级的东西排优先级，还会**静默丢掉中提琴**（组里没被摘走的部分无人认领）。真正的拆分需要**链式残差**（other → violin + 剩余 → cello + 剩余 → …「其余弦乐」）——细分每次都产出 `residual.wav`，各部分在构造上加起来等于原组，既不重复也不丢失；但要求 `core/refinement.cjs` 的 `context()` 接受上一次细分的残差作为输入（现在只收六条基础分轨 + mix），是另一套机制。用户选择先不做，三轮退回。

撤回方式与 R4 相同：以 timeline.6 的暂存快照逐文件还原 15 个文件，再对整棵暂存源码树（2841 个文件）做哈希比对，除 `package.json` 版本号（前进到 core.41）外**零差异**；`diff-baseline.cjs --expect-clean` 与 verify 各跑一遍。发布 0.5.0-dev.revert.1。

撤回后：五条声部回归（bass / piano / guitar / strings / drums），注册表、runner、IPC、界面文案、时间轴配色里无残留，`midi-merge.cjs` 里的 `skipped` / `overlaps` 记账一并删除。**分轨页本来就没动过**——Mega53 的六个弦乐目标仍可提取、仍可作「弦乐」这一条声部的音源，所以「用小提琴分离去转谱」这件事没丢，只是回到原来的层级：**音源的选择，不是独立声部**。时间轴六轮的成果（单轨查看、图上标注、定位与平移、角色层）全部保留。

用户已有数据**一个字节没删**：小提琴 / 低音提琴的分离、音源指针、MIDI 结果与含 violin 的旧合并文件都原样留在磁盘上，新版本只是不再读它们；打包检查里有一条断言专门守这点。可行性门的证据（artifacts/strings-gate-20260918）保留——弓弦乐的可分性是音区问题、violin↔cello 分得开而 viola 分不开，这些结论不随代码撤回而失效。路线图 §P4.5 的 G 行状态改为「已试验、已撤回」。

## 2026-09-19：鼓默认切换（drums.2）

用户听评后拍板:「鼓可以切换，没有问题」。默认从 ADTOF Drums 切到 **ADTOF · DrumSep 7 类**——同一批鼓点与 5 类检测，额外用 MDX23C DrumSep 的分离 stem 拆 crash / ride 并给出曲内相对力度。引擎在 R3（drums.1）已接入验证，本轮只动默认。

三个文件:注册表的 `defaultFor` 位移、`derived-controls.js` 的一次性迁移 `xld.midi.drums-default`（照 piano.2 的既有模式，只清"存的是旧默认"这一种，用户明确选过的保留）、版本号。verify 把两份注册表剥掉 `defaultFor` 后深比较，证明模型串 / 权重 / 全部 options 一字未改；其余四个声部的默认逐一断言未变；包外只有带版本号的六个文件变化。打包窗口（全新配置档）确认卡片为 `drums-adtof-stems[默认] / drums-adtof[备选] / …`、新配置档自动落在新默认、点回 ADTOF 其既有结果仍显示「当前用于融合 · 1596 个音符」、磁盘上的 drums.json 逐字节未动。三条回归链全绿。

另写了 `delete-superseded.cjs`（**未执行**，交用户自行运行）:把不在当前默认引擎上的旧 MIDI 结果走应用自己的删除路径清掉（回收站、依赖保护、指针回退），默认排除 drums。空跑报 10 条可删、7 条无法检查（2 首源音频已不在、5 首 track.json 推不出自己的目录名）。第一版把这两类静默跳过、报"0 条可删"——看上去像没事可做；现在一律报出来。这条比脚本本身更值得记住。

## 2026-09-19：单轨和声协调（timeline.7）

用户此前后置、本次指定要做的一项（路线图 §P4.5 追加项）。每条音符轨下方的区间条现在可读两种东西，由页签头的「轨下条带」下拉切换:**演奏方式**（timeline.6 的柱式 / 分解 / 线性）或**和声关系**（本轮新增），或关闭。一条轨只显示一种——两条同时画会占掉紧凑模式 72px 轨高的三分之一。

判据:全局和弦轨仍是**参照系**（这是"关系"不是对和声的第二种意见，单个声部通常不足以定和弦——撤回弦乐分件时已论证）。按和弦区间切分、时值加权:一致 = 和弦内音 ≥60%;补充 = 标签未写的七 / 九 / 十一 / 十三音 ≥15%;冲突 = 和弦外 ≥25%（时值加权所以经过音不会被误判）;标签为 `N` 的段落无参照，诚实显示破折号。每段还算出最低音相对根音的度数作为**转位**（根音 / 三音 / 五音 / 七音 / 和弦外音）。

呈现:条带按关系上色，单轨模式下音符按同一读数上色，轨头副标题给关系占比，每段 tooltip 摊开依据（`和弦 Em · 和弦内音 100% · 附加音 0% · 和弦外 0% · 最低音是根音 · 1 个音符;依据是转谱结果与和弦轨的比对,不是音频`）。两种读数共用同一个区间遍历与缓存（`spansFor`）。

实测（MEGURI，413 段有命名和弦）:bass 一致 46 / 补充 25 / 冲突 6；piano 41 / 26 / 3；guitar 21 / 38 / 3；strings 25 / **56** / 8。弦乐大量"补充"符合其铺底加七九音的编配；**冲突只占 3–8%**，这正是有用的信号——和弦轨与转谱大体一致，那几个百分点才值得去看。纯渲染端:分析目录、core/、desktop/ 与 IPC 通道集合对 drums.2 逐字节相同，包内只有 5 个文件变化。三条回归链全绿。

打包检查里又踩了同一个坑两次:把"第一段"当代表（无和弦参照的段落本就该显示破折号），以及 `\d` 写在 JS 字符串里被吞掉。两处都已改成先验形状、再单独统计有效段数。

下一步:P0 轮次 B。

## 2026-09-19：同引擎多版本切换 / 回退 / 有限保留（P0 轮次 B，history.2）

轮次 A 让旧版本**可读**，但旧版本没有**地址**——只能通过"哪个指针恰好指向它"来读。于是回退只能靠重新推理，A/B 过程留下的 run 删不掉，同一引擎的历史只增不减。本轮给每个 run 一个 runId 地址，并在其上做切换、保留与有限回收。

**保留策略**（唯一会真正删东西的部分）只有一个触发点:MIDI 生成成功、激活之后，整段包在 try/catch 里，扫描失败只写进 `response.retention.warning`，不会把成功的任务变成失败。候选必须同时满足:状态是当前 / 旧版本、**没有任何指针指向它**、没有保留标记、不在本次保护名单。第二条是主不变量——`read()` 只查三个固定指针路径、从不看 `runs/`，所以没被指到的 run 就是没有读者能解析到的 run；**结构上**不可能删掉正在用的那版、不可能留下悬空指针、不可能让声部变哑。与当前版本 identity 相同的重复版硬删（和服务里已有的同类清理是同一种），其余按时间留最新的一个当对照位、剩下的进**回收站**（只动 run 目录，记录与指针留着，从回收站恢复即恢复缓存）；没有 trash 回调时一律不删只报告。融合**不豁免**——融合依赖的 run 本来就被指着，扫 `midi/merged/*` 会造出只增不减的豁免集合，"有限保留"就成了空话。

磁盘增量只有一类文件 `midi/<声部>/kept/<runId>.json`:`kept/` 是目录，`listRuns` 的 `.json` 过滤看不见；`kind:'midi-keep'` 不是 `'midi'`，存储面板的依赖计数不会把它算进去。打包检查实测整轮操作后新增项**只有 `kept/`**。

`readRun` 的返回**刻意嵌套**（`{ok, run:{…盘上的记录…}, identity, matches, status, directory, pointed, kept}`）:交给 `activate()` 的是 `view.run`，任何派生字段都不可能通过 `cleanMidi` 漏进去。另外断言 `record.runId === runId`——`checkRecord` 只按记录体自称的 runId 校验 `file`，没有这条，文件名叫 A、内容写 B 的记录会让删除对话框说 A 而实际动 B。`listRuns` 新增的 `active` 由一次 `read()` 推出而不是读指针标签:`read()` 优先 `by-source` 且只认第一个"当前版本"的候选，删除留下悬空指针后两者会不一致。

界面:MIDI 页多一个默认折叠的「模型版本」，是引擎卡列表的兄弟节点（每张卡是一个 `<button>`，不可能嵌套交互控件）。折叠不画不发 IPC，展开才拉一次。每行给时间、音符数、**模型串**（真正的版本判别依据，uuid 只进 tooltip）、状态与四个按钮:切换 · 保留 · 删除 · 打开目录。**切换就是回退**；切换后回调让时间轴重画该声部。文件已删除的版本不做成行，收成一行"在回收站中，可恢复"。

一处诚实的文案修改:回退之后点"生成 MIDI"**确实会重跑模型**（缓存分支按引擎取指针且要求当前版本，本轮刻意没动）。文案补上"或在「模型版本」里切回当前版本（无需重新推理）"，而不是偷偷把新版切回来——后者会在一个写着"生成 MIDI"的按钮背后撤销用户的选择。存储面板那句"MIDI 不会删除"在有回收之后不再成立，改成"本面板不删除 MIDI，MIDI 版本在 MIDI 页管理"。

新增 `tests/midi-versions.cjs`，`tests/midi-models.cjs` 追加端到端 A/B（切换 → 回退后生成不是缓存命中 → 回退留下的孤儿被当场回收而**用户选的那版幸存** → 钉住后连生两次仍在 → 按 runId 删除 superseded、删当前启用的则回退到同引擎幸存者 → 缓存分支未被改坏）。`tests/midi-delete.cjs` 两处行为更新:`'../outside'` 现在读作"无效选择"（守卫上移到 `validId`），删当前启用的 run 现在会回退到同引擎的旧版本而不是让声部变哑。`derived-flow` 的三条不误命中钉子原样通过。三条回归链全绿。

计划里被否掉一条:原计划要给 `failureKey` 加 runId 分量，但失败属于一次生成尝试、没有存活的 runId，查询侧也拿不出来，加了会让失败提示永远查不到。未采纳并记录。

下一步:一键批量计划感知版本（现在会重新生成被回退过的声部）；`assets:read` 的 per-run 维度；`activate()` 的事务性。

## 2026-09-19（当日第二次）：修 history.2 的数据丢失回归（history.3）

轮次 B 发布几小时后的一轮代码审计查出来的，是**我自己当天引入的回归**。

`analysis-service.cjs:401` 的同版本清理**早于**「保留」这个概念存在:同一模型版本重算时，它用 `removeRun`（即 `fs.rm`，**不进回收站**）删掉上一次运行。轮次 B 加了保留标记，只教会了下面五行的 retention sweep，没教会这一处。于是"标记保留 → 勾重新生成 → 生成"会把被钉住的那版连文件带记录永久删除；`kept/<runId>.json` 变成孤儿，而 `collectRuns` 看不到已消失的 run，面板上连行都不画，`keepRun(...,false)` 又在"run 不存在"上抛错——**连取消保留都做不到**。这同时违反硬约束"绝不删除用户结果"和界面页脚那句「…以及你标记保留的版本」。讽刺的是 sweep 自己守卫齐全，还把上一版放进了 `protect`，偏偏 `:401` 在它之前就动手了。

修法是在那处删除前查一次标记，并且**读不到标记目录时默认保留**——不确定是否被钉住的东西一律不删；跳过的情况写进 `retention.skipped`，运行报告仍然如实。顺带把 `keepRun` 的存在性检查挪进 `if (value)` 分支:钉住仍要求 runId 真实存在，**取消保留永远可行**，因为"标记比 run 活得久"正是必须能清掉的那种状态。新增的回归钉子经实测确认——把守卫改回去，`tests/midi-models.cjs` 立刻变红。

同轮修掉另外两个轮次 B 的毛病:**生成之后版本列表不刷新**（一次转谱不改变 `midiSourceKey`，而那是版本缓存键唯一的轴；改在 `refresh()` 里一行，一处覆盖生成、一键批量和任务完成回调）；**删除失败一声不吭**（`midi-delete.clear` 是先 `plan()` 后 `confirm()`，所有拒绝都发生在对话框之前，所以点了就像按了个死键；另加两处清消息，免得 bass 上的确认语出现在 piano 的页脚）。

包内只有四个文件变化，IPC、分析目录与 retention 模块对 history.2 逐字节相同。

过程里两个教训:打包检查第一次失败后没清理隔离夹具，留下指向已删除 run 的悬空指针，第二次跑直接卡住——脚本现在先把指针指回真实 run 再清理合成版本，并在 `finally` 里兜底；另外断言正则写成了"删除失败"，而真实文案是"删除 MIDI 失败"，白跑一轮。

同一轮审计还查出四条**非本次引入**的问题，未擅自改动，已列在交接里待定:鼓引擎提示文案与「默认」徽章自相矛盾（drums.2 漏改字符串）；换弦乐来源会让整个融合任务失败并抛出内部 token（`midi-merge.plan()` 的容错白名单漏了 `midi-string-source-stale`）；回退后状态行与引擎卡片判断顺序相反；时间轴音符轨不标「旧模型版本」（`matches` 已在下发数据里）。同时更正了 history.2 交接里的一个**错误诊断**——状态行那条接缝不需要给 `assets:read` 加 per-run 维度，数据本来就在 payload 里。

## 2026-09-19（当日第三次）：分析结果删除改为可撤销且不谎报（results.1）

用户要"每一个产出的内容加一个删除的功能"，动机是想清掉一批很差的 MSAF 切分。我最初判断"段落 / 和弦结果没有删除入口"——**判断错了**。入口一直在（`index.html:267` 「删除当前结果」、`:268`「清空本曲分析」），而真实情况比缺功能糟:**那个按钮在永久删除用户的结果并且无条件报成功。**

原实现（`main.cjs:602-624`）用 `fs.rm({force:true})`——全仓库另外三处破坏性操作都走 `shell.trashItem`，只有这一处不走；删除套 `catch (_) {}` 吞掉失败，然后 `return {ok:true}`；`readdir` 失败也吞掉，于是报"删了 0 个"且成功；还会删 `${id}.next.` 开头的文件，那是 `analysis-service.cjs:305` **正在跑的任务**的 staging——用户会同时开多个 dev build（本次实测四个进程），在一个窗口点「清空本曲分析」就能让另一个窗口正在跑的分析失败，且看不出原因。

新实现 `core/result-delete.cjs`:进回收站、`ok = failed.length===0`、trash 之后复查文件是否真的不在（`shell.trashItem` 在长路径上可能静默无效，而库里全是日文曲名，artifacts root 下已有 67 个文件路径超过 259 字符），**没有任何回退成真删除的分支**。

安全保证是结构性的，但和 MIDI 删除那条不同。MIDI 靠"目录里必须恰好两个文件"，这条搬不过来——段落 / 和弦结果是曲目目录下的单个 JSON，而 `manual-tags.json`、`track.json`、`stems.json`、`music-lab.json` 就在同一个目录里。等价规则是:**删除目标永远不来自磁盘内容**，而是 `targetNames(id)` 由引擎 id 生成的三个固定名字；受保护的邻居对**任何输入**都不在这个函数的像里。`core/storage.cjs` 本轮一个字没动，它的"四段路径且第三段是 stems/refinement"限制因此仍是第三道独立保护。

顺带修:`writeMusicLabBridge` 对不认识的 trackId 是返回 `{ok:false}` 而不是抛异常，原来的 try/catch 接不住。

跨曲批量 sweep（用户真正要的"一次清掉很多"）不在本轮，连同退役轮一起做。

打包检查里另外暴露一件与本轮无关的事:**应用载入曲目时会重写 `manual-tags.json`，静默丢掉解析不了的条目**。正常标注由应用自己写不会触发，但文件若部分损坏，剩下的会被无声清空而不是保留或报错。已记录，未处理。

## 2026-09-20：删繁就简 —— 退役已输掉对照的模型，并给每种产出一条清理路径（retire.2）

用户定的范围:淘汰已输掉对照的模型、取消重复入口、收起解释性信息，外加"每一个产出的内容加一个删除的功能"。

**贯穿全轮的一条性质:退役是一个标记，永远不是删除 id。** 被退役的引擎必须仍然解析得出、结果仍然读得出、**尤其仍然删得掉**——否则退役一个烂引擎等于顺手夺走清理它产物的能力。测试双向钉死:退役表里的 id 必须仍在注册表里，且删除与清理模块**不得**出现任何退役查询。

先做纯重构:`MSAF_ENGINE_IDS` 原先在 `app.js`、`core/analysis-service.cjs`、`desktop/main.cjs` **抄了三份**，三份各自是"能跑的列表""能读的列表""能删的列表"，删哪一份效果就不同，三份都删则 79 个既有结果同时读不了也删不掉。现在是 `core/result-engines.cjs` 一份；`app.js` 无模块系统只能留字面量，由测试逐项比对。两条既有测试钉的正是那份重复，改成钉新的不变量。

退役:段落四变体、`drums-muscriptor-medium`/`-large`、`bowed-strings-v2`、`audiosep-strings`。鼓四张卡→两张，段落五张卡→一张。两道闸让它真的生效——服务层拒绝启动（`engine-retired`），引擎列表滤掉退役 id。保留为备选的五项各自附一句可验证的切换条件，写不出那句的就退。

**全库结果清理**:跨曲列出全部段落 / 和弦结果，每行把切分本身画出来，按碎片数排序，勾选批量移入回收站。判据在真实数据上验过（100 个结果）:MSAF 碎片中位 3、最多 12、最短段 0.00 秒；SongFormer 中位 0、最多 2、最短 1.00 秒；碎片 ≥3 的 20 条全部是 MSAF 系。覆盖率（93–100%）与段数都不具区分度。

retire.1 发布后看截图发现一个真问题:**和弦结果把排序占满了**——`chord-chordmini` 255 段里 105 段短于 2 秒，整条分段条全红。和弦本来就一两小节一换，2 秒阈值只对段落有意义，后果是打开面板想找烂切分、最上面三行却是完全健康的和弦轨。阈值改为按类型区分（段落 2 秒 / 和弦 0.25 秒），面板默认开在段落，retire.1 删除。

**源码里的 NUL 字节**:我写的分隔符被 bash heredoc **三次**吃掉转义的反斜杠、变成真正的控制字符写进源文件。它通过语法检查、通过全部测试、应用照常运行，只有 grep 说 "Binary file matches" 时才露馅。换成不需要转义的字符，并新增 `tests/source-hygiene.cjs` 扫描全部 138 个源文件——守卫立刻抓到一个**既有的**（`desktop/audio-tags.cjs:42` 用字面 NUL 剥 ID3 填充，用途正当但写法同样脆弱，改成转义，行为实测相同）。真正解决它的不是更小心，是那条测试。

退役 AudioSep 与 Bowed Strings 之后产品里不再有 `fullTrack:false` 的引擎，三道守卫没有已发布引擎能触发。这不构成保留一个已输掉听评的模型的理由——`createRefinement` 增加可注入的 `profiles`，测试自己声明"仅预览"夹具。

所有新错误码都进了中英文案表并由测试钉住，否则会像审计查到的 `midi-string-source-stale` 那样把内部 token 原样抛到中文界面。

未做:界面收缩（注意 `#labNote` 与 `#analyzeAllButton` 是两个 lab 共用节点，只能隐藏不能删）。待用户裁决:Basic Pitch（18 个测试文件 67 处依赖，且能写出切换条件——唯一跑在轻量环境的 MIDI 引擎）、Demucs（六轨断言证明它不产出独有 stem，但从无听评）、和弦引擎。

## 2026-09-22：固定音高行与深缩放（R9，pitch.1）

- XLD core.57 / XML stems.13，开发包 releases/0.5.0-dev.pitch.1。
- 单轨每半音或 GM 鼓键固定 18px；滚轮/原生滚动条纵向浏览，滚动条在深缩放时仍位于可见右边缘。
- 时间放大上限 128×，点击倍率回到全曲；缩放保留中心，细刻度显示小数秒。
- 纵向滚动保留已选和播放位置，取消尚未完成的框选；画布仍按视口分配，选择/命中共用偏移。
- 五链全绿；实际 MEGURI 窗口检查基础和后段音符、纵向滚动后命中、128× 短音符以及 WAV/MIDI 对照循环。约 109ms 音符在 128× 下宽 32.3px。
- 修正概览进入单轨时错误继承 pitchTop=0 的问题。模型、核心分析、XML 与真实 WAV/MIDI 不变。
- 交接 work/pitch-zoom-20260922/HANDOFF.md；证据 artifacts/pitch-zoom-20260922。下一轮 R10 音符编辑、撤销重做与草稿。

## 2026-09-22：视口绘制与画布复用（R8，viewport.1）

- XLD core.56 / XML stems.13，独立开发包 releases/0.5.0-dev.viewport.1。
- 音符只绘制横向可见范围；保留跨视口长延音与最小可见音符；滚动合并到一帧。
- 同轨跨重绘复用画布，尺寸/DPR 稳定时不重置位图。选择高亮独立，单选和清空不重画底层。
- MEGURI 8× 真实窗口：底层约 2.94M 像素，连同叠加层比旧方式的画布像素预算少约 60%；不作为整个进程内存或帧率结论。
- 五条回归链全绿，24 个音符中心及 6 个后段命中、原有 WAV/MIDI 对照循环通过；源码和发布哈希验证通过。
- 模型、分析、XML 及真实音频/MIDI 不变。下一轮 R9 固定行高、纵向滚动、深缩放。
- 交接 work/viewport-render-20260922/HANDOFF.md；证据 artifacts/viewport-render-20260922。

## 2026-09-22：音符选择与属性查看（R7，selection.1）

- 开发包 releases/0.5.0-dev.selection.1，XLD core.55 / XML stems.13。
- 单轨模式可单选、Ctrl/⌘ 加选或取消、拖动框选；Shift/中键平移，Esc 逐级退出。
- 一行属性显示音高、起止、时长、力度和多选范围；按原始 instrumentIndex/noteIndex 识别音符，排序不造成选错。
- 与循环圈选、标注互斥；刷新/换曲/换轨清空，过时请求不能恢复旧状态。选择不改音符或播放位置。
- 五条测试链全绿；打包窗口对 MEGURI 的 24 个音符中心进行 8× 命中检查，验证加选/框选/属性，并回归 WAV/MIDI 对照循环。
- 源码暂存 2860 文件、发布 2775 文件哈希核验通过；模型、核心分析、XML 及真实音频/MIDI 不变。
- 交接 work/note-selection-20260922/HANDOFF.md；证据 artifacts/note-selection-20260922。下一轮 R8 渲染优化，编辑仍在 R10。

## 2026-09-22：WAV / MIDI 原位对照与区间循环（R6，compare.1）

- 开发包 releases/0.5.0-dev.compare.1，XLD core.54 / XML stems.13。
- 单轨 MIDI/来源声部 WAV 原位切换；圈选、精确起止秒数、循环开关和清除。
- 共用音频时钟，处理跨边界长音，不量化、不修改结果；首次 WAV 按需解码，仅缓存一份。
- 停止、切轨/版本、换曲、取消加载和主播放器接管均有保护。子轨与组轨 WAV 明确区分。
- 修复两个页面共用缩放标签 id；定位光标接入试听位置。
- 五条回归链与打包窗口验证通过；模型/core/XML 未改，真实分析根未写入。
- 完整交接：work/compare-loop-20260922/HANDOFF.md；证据：artifacts/compare-loop-20260922/。
- 下一轮 R7 音符选择与属性读取，尚未实现编辑。

## 2026-09-21：修订写入器与提交路径（音符级 MIDI 修正方案 R4，writer.1）

**先量后做，结果推翻了企划书的核心设计判断。** 企划书说主要风险是「往返把某些事件悄悄丢掉而校验通过」，
并规定用「重读父文件 vs 重读子文件」的逐字段比对。**两个方向都错。**

对**未编辑的乐器**，那个检查结构上不可能失败：库里每个 `.mid` 都是 pretty_midi 自己写的，已经是往返的不动点
（两个分析根共 163 个文件，116 + 47，全部逐字节重现）；而内存对象**就是** source 的解析结果，所以两种比法
**是同一个比较**。对**被编辑的乐器**，企划书把它排除在校验之外——而那是唯一会出错的地方：同音高重叠写进去，
读回来数量不变、音高不变、力度不变、**结束时间早 1000 ms**。

所以校验被倒过来做：未编辑乐器用**原始 MTrk 块的 SHA-256**（一次编辑的影响半径实测**恰好一个块**，
而字节相等对 pretty_midi 读取时就丢掉的东西——sysex、marker、aftertouch、running status、通道分配——免疫）；
被编辑乐器对照**请求的音符**，其 CC / 弯音 / 名称 / program 对照父文件。

**对抗性检查逼出一条真漏洞。** 块校验建好后自己去攻，五种破坏拓到四种——漏的那种是：被编辑乐器
**自己的 CC 与弯音就在允许变动的那一块里**，擦掉钢琴声部 **646 个延音踏板事件**能完整通过。已补。

六类会被序列化器吃掉的音符写前即拒（空列表、力度 0、零负长度、短于一个 tick、同音高重叠、无改动），
全部是实测而不是猜的（实测阈值：960 PPQ / 120 BPM 下 0.26 ms 消失、0.40 ms 存活）。容差用**一个 tick 而不是一毫秒**——
这里一毫秒接近两个 tick，足够藏住一次真实截断，`merge.py` 现在的 `> 0.001` 就放得过。

**提交顺序的三条理由都来自已经发生过的事。** 先校验再写一个字节（`activate()` 自己也校验，但那是在文件已落盘
之后，会留下孤儿目录）；暂存放在目标目录**之外**（`midi-delete` 只删「恰好两个文件」的 run，残留的 job JSON
会让那个 run 永久删不掉也看不见）；**激活失败不是「删掉目录」**而是先把父记录激活回去（否则这个声部会
一条可读 MIDI 都没有，而父记录完好地躺在一步之外）。

**一条由 R3 直接造成的问题**：`pythonFor('manual-revision')` 拿不到正确的解释器——每个 MIDI 分支都按
`ENGINE_IDS` 判断，而它被 R3 刻意排除在外（那正是它不可启动的原因），于是一路落到 MSAF 解释器——那个没有
pretty_midi。写入器显式解析 `XLD_MIDI_PYTHON`，`check-runtime.cjs` 补了一条探针，而那个自检做的是**真实往返**
而不是裸 import。

验收：五条链全绿（XLD 36 / XML 15 / release-tools 4 / 融合 1 / **Python 往返 1**）。Python 往返测试**不进**
`npm test`（企划书要求，那条链是纯 Node），作为独立日志随本轮发布。真实父文件三个：
**piano（14 个 CC64，企划书点名的验收，全部保留）**、13 乐器的 merged（编辑其中带 646 个 CC 的钢琴声部，只动第 3 块）、bass。
打包窗口走真实 IPC 保存一份修订，64 个 CC 保留，版本面板 / 状态行 / 时间轴三处可见，夹具逐字节还原并已验证。

顺带：`publish.cjs` 无条件拄 png 进 artifacts，**连续两轮**把中途失败截图带进了已发布证据；本轮改成只拄
`defaults-ui.json` 列出的那几张。

## 2026-09-20：人工修订记录契约（音符级 MIDI 修正方案 R3，revision.1）

**全案最贵的一条约定。** identity 怎么归并，决定的是以后改动要不要迁移用户已保存的工作。
用户拍板：**每份修订各有唯一 identity**。后果是明知且永久的——任何模型版本都不会「匹配」一份人工修订，
所以它永远 `matches:false`、状态永远 `superseded`。而此刻还没有编辑界面，出了事没有征兆。

动手前跑了一轮并行精读（五个区域 + 一个完整性批评者），**三条结果直接改变了实现**：

**一、XML 可视化端有自己的转谱入口，而且在任何一种设计下都会覆盖人工修订。** 企划书的文件清单里没有它，
五个读者一个都没打开它。`fusion:midi-run` 自己挑引擎，profile 带 `retiredFor` 就静默换成默认模型去跑，
不带就拿 `manual` 当模型跑；而渲染端传的 `force` 只要有任何 MIDI 就是 true，工作台那条保护修订的缓存分支
**根本走不到**。现在主进程在挑引擎**之前**拒绝，按钮也在那种状态下禁用。

**二、`manual` 这个 id 已经被占用了**——`app.js` 里人工段落 / 和弦标注的引擎 id 就是它。改成 `manual-revision`。
盘上 497 条 MIDI 记录、14 个 engine id，没一条占用，所以现在改零成本，以后改要迁移。

**三、MANUAL 不能进 `models.json`，但必须进 profile 查找。** `verify()` 找不到 profile 就抛 `midi-invalid`，
而它在界面上渲染成**「记录损坏」**——用户的编辑会被当成坏文件展示，还不能切换。
同一条推理还决定了 `options` 必须为空：`profileMismatch()` 先比 profile 声明的 options，任何差异直接返回
`midi-invalid`（比让记录仅仅「过期」的 `midi-model-invalid` 狠）。

**回收守卫已用行为证明承重。** 把一份修订排在回收范围正中间，用 `sweep(track, stem, null, ...)` 驱动：
去掉守卫再跑，那一次 sweep 回收**两个** run——多余的模型 run，和用户的人工修订。

**版本面板无条件多查一次修订。** 面板本来按「当前选中的模型」取版本，而修订不属于任何模型——
不多查这一次，用户的编辑一行都不会出现，于是既切不回去，也**没有「保留」按钮**——而「保留」是对抗回收的唯一手动保护。
看不见的工作就是钉不住的工作。状态行的人工分支排在模型查找之前：原来那句「来自旧模型版本…点击『生成 MIDI』
重新转谱」是**全应用唯一一句主动劝你毁掉自己成果的话**。

**顺带修掉一个既有缺陷。** `tests/midi-merge.cjs` 需要夹具才能跑，因此不在 `npm test` 里，而它是融合子系统唯一的守卫。
把它跑起来之后发现：一个从未分轨的曲目会让 `plan()` **抛异常**而不是返回拒绝。已改。它最后一段需要「两个分轨模型」
的夹具，隔离夹具只有一个，**明确跳过并写进输出**——一个悄悄不再运行的检查，读起来和通过一模一样。

打包窗口实测（修订由夹具手工拼出，用完逐字节还原并已验证）：状态行「当前使用人工修订 · 540 个音符」；
版本面板有那一行且可切换可保留；时间轴轨名 `Manual revision`；融合计入 5 个声部含 `piano:manual-revision`；
试图运行它返回 `midi-manual-not-runnable`；控制台零错误。

## 2026-09-20：单轨 MIDI 试听（音符级 MIDI 修正方案 R5，audition.1）

**这个应用第一次自己发声。** 在此之前那个叫「MIDI 试听」的按钮播的是转谱模型吃的那条 WAV，
XLD 渲染端全仓 0 处 `AudioContext`。企划书 §4 第一条「这几个碎片是不是本来就是同一个持续音」
根本无法只靠看图判断。现在时间轴工具条有试听按钮，播当前单独查看的那条轨（R2 之后可能是
「strings · cello」这样的单件）。音色手写，**够判断音高 / 起音 / 时长 / 粗力度，判断不了鼓类别与音色**。

三个关键数字来自全库实测而不是一首曲子：**复音上限 64**（最密的一条轨同时发声 43 个音，
而夹具那一首只会说 15）；**可听下限 30 ms**（4.2% 的音符短于 50 ms，最短 0.6 ms；下限还必须小，
把 5 ms 碎片垫到 40 ms，两个相距 10 ms 的碎片就会听起来是连着的）；**鼓完全不用音符时长**
（库里每个鼓音符都恰好 0.100 s，适配器从 onset 写固定长度，那个数字不携带信息）。

WebAudio 没有 `timeupdate`，而时间轴光标一直由 `<audio>` 的 `timeupdate` 推动——那个元素此刻是暂停的。
`timeline-controls.js` 新增可选时间源，**这道缝正是 R6「WAV / MIDI 同钟」要换的地方**。
五条停止路径（暂停 / 切轨 / 切版本 / 清理存储 / 点主播放器）共用一个 `silenceAll()`，每次都是斜坡而不是直接置零。

**两个被测试逼出来的真问题。** 一是复音上限会反复偷同一个声部：已经开始释放的声部仍被算作
「正在发声」，于是到顶之后位置永远腾不出来。二是开始试听会故意暂停录音，而播放按钮调的是裸
`play()`，先按播放再点试听就会在控制台留下未处理的 AbortError——这条路径是本轮改动让它变得容易撞上的。

打包窗口实测：真实 AudioContext 确实在跑（时钟 0.67 → 1.88 s，不是冻结在 suspended），11 个声部，
光标随之移动，暂停后声部归零且位置保留，切轨后停止并交还光标，点录音则试听让位，控制台零错误。
点击都带 `userGesture`——没有用户手势 Chromium 不会让 AudioContext 离开 suspended，少了这一条
测试会在**静音**的情况下通过。

**听评是用户的。** 我能证明它不挂音、不卡顿、时钟对得上；听不听得出碎片问题只能他判断。
若听感差到判不了，就是音色方案选错了（企划书 §5 给 R5 写的回头信号），而此刻 R6 还没建在它上面。

过程上又一条：Bash heredoc 吃掉一层反斜杠这件事本轮又撞了两次，第二次把 `\n` 变成真换行写进了
JS 字符串里。凡带转义的文件改动一律用编辑工具落盘。

## 2026-09-20：乐器维度（音符级 MIDI 修正方案 R2，instrument.1）

**数据一直在盘上，界面从来没读过。** MuScriptor 写出来的 `.mid` 是多条命名乐器轨：MEGURI 的弦乐是
cello 1128 / string ensemble 1014 / contrabass 265 / violin 1123 / viola 1168，吉他是
distorted electric 2455 / clean electric 451 / acoustic 10。`runner.py` 生成 `notes.json` 时用
`for part in midi.instruments for note in part.notes` 压平，于是时间轴只能显示一坨。这一轮新增只读 SMF 解析器
`core/midi-read.cjs`，按 pretty_midi 的 `(program, channel, track)` 首次出现顺序分组——那正是 `notes.json` 的拼接顺序——
把边界读回来。MEGURI 从 5 条轨变成 11 条。**没有引入任何模型，没有重新转谱，盘上的结果一个字节没动。**
撤回弦乐分件那轮的结论（组不是乐器、真正的分轨需要链式残差）对**分轨**仍然成立；这里是 MIDI 层，分件本来就是现成的。

这一轮的危险不是会崩，而是**分段错了看起来完全正常**：五条轨照样出现，每条音符数都像模像样，屏幕上没有任何东西
会说边界落错了。R3 之后编辑要挂到这些轨上，错一个音符就会静悄悄改到文件的另一部分。三道防线：
**对不上就不给答案**（`segment()` 在文件音符数 ≠ `notes.json` 音符数时返回 `offsets: null`，lane 退回单轨显示，
而不是返回一个看起来合理的拆分）；**对齐检查用「每乐器内 start 单调不减」**，不用「偏移之和等于 noteCount」——
后者对完全打乱的顺序也成立，等于没查；**渲染端根本拿不到 offsets**，按下标切数组是最顺手也最错的写法
（渲染端会按时间排序，排完下标和乐器边界就对不上），现在连犯这个错的手段都没有。全库只读实测：124 个运行目录，
124 个解析成功且音符数吻合，0 处组内时间倒退，29 个多乐器，最多一个 12 条。

**发布前改掉一处契约缺陷。** `editable` 起初只在 `notes.length > 0` 时才可能为真，于是空结果会被标成不可读。
盘上正好有一个空结果——New Order「Ceremony」的 strings，41 字节，而且是真实的 active 指针。`editable` 是 R4 / R7 / R10
都要读的契约字段，这样一来**最需要「加第一个音符」的那个声部，恰好会是唯一加不了的那个**。已改成空文件也走解析器。
企划书把 R2 列为「契约，代价高」，这种字段发布后再改就要迁移。

顺带修掉中文汇总行 `{stems} 条音符` → `条音符轨`：它一直在数轨不是数音符，数字从 5 跳到 11 之后歧义变明显了。

**空声部这一条没有在打包窗口里看过**：隔离夹具里没有空结果，而不会把界面测试指向真实曲库。渲染层测试与发布包解析器
对那个 41 字节文件的实测两端都钉住了，中间那段（同一条 lane 走完 IPC）没有像素证据。

过程上的一条：Bash heredoc 仍然会吃掉一层反斜杠，改 `verify.cjs` 的正则时又撞上一次，改用编辑工具直接落盘。

## 2026-09-20：融合容错与跳过说明（音符级 MIDI 修正方案 R1，merge.1）

企划书 `docs/XLD_MIDI_EDITING_PROJECT_PLAN_20260920.md` 拆成了十一轮可独立交付的执行方案（`docs/XLD_MIDI_EDITING_EXECUTION_PLAN_20260920.md`），本轮是第一轮，也是它主验收路径被卡住的那一条。

换过弦乐来源之后**整个融合任务失败**，而且以内部 token `midi-string-source-stale` 的形式抛到中文界面。那个码只是 `midi-stale` 的弦乐拼写——`sourceMismatch` 返回它的唯一原因是声部是 strings——而 `midi-stale` 早就在容错名单里。

**但只把码加进名单会比 bug 更糟**:弦乐会静默地从融合里消失，`parts` 与 `provenance` 都只为被采纳的声部构造，返回值里没有任何字段说明谁被丢了。融合会"成功"而文件里少一个声部，后面每道检查照样通过，§9.1 第 6 步会在一个根本不含弦乐的文件上通过。

所以本轮真正的交付是 `skipped`:有结果但用不上的声部连同原因一起带出来，穿过 `plan()`、穿过 `read()` 的 catch、进到状态行。

两条被测试逼出来的修正:**跳过只说"有结果但用不上"**（第一版把没转谱的声部也列进去，5 个声部转 2 个就常年挂 3 条噪声，真正要看的被埋掉）；**标点是语言的一部分**（第一版把全角括号和顿号写死，英文句子被套上中文括号，现在两套标点都进 i18n 并由测试钉住）。

不变量:融合 fingerprint 的哈希输入逐字节未变，`skipped` 与 `provenance` 一样在哈希之外，盘上既有的 merged 目录照常解析；verify 另断言 `generate()` 与模块头逐字节不变——本轮改的是 `plan()` 报告什么，不是融合怎么做。

顺带确认一条对后续 R4/R10 有用的性质:换过来源后声部组合变了 → fingerprint 变了 → `read()` 如实返回"这个组合还没融合过"，不拿旧文件充数，旧目录原封不动。企划书 §7.2.10 对人工修订的要求，融合这一侧本来就满足。

过程教训两条。**verify 的证明本身不能易碎**:本来用一串替换把新文件还原成旧文件来证明别处没动，某条替换失配就整体失败，换成模块头与 `generate()` 的切片逐字节比较。**检查了不等于挡住了**:进程检查和 `rm -rf releases/...` 串在同一条 `&&` 链里，检查打印了 RUNNING 但那条命令无论结果都退出 0，删除照样执行——当时跑的是 retire.2、merge.1 未发布所以没有损害，但性质不对。


## 2026-09-23 — 工作台整合第一轮

默认时间轴、折叠曲库和分析/结果侧栏实装；复用原节点、后台、草稿和播放器，支持宽面板。交付 workbench.4/core.66，XML stems.13 不变。实际窗口验证选音/编辑保持、混播不中断、缩放浏览定位、轨组编辑与排序重载；六组回归通过，原文件哈希保持。第二至四轮尚未完成。详见 [HANDOFF](work/workbench-shell-20260923/HANDOFF.md)。


## 2026-09-23 — 工作台第二轮：结果与导出

交付 workbench.6/core.67，XML stems.13。结果中心集成版本/回退、一键 MIDI、细分对照、草稿、清理导航；原融合与 XML 操作移入导出区，单声部导出共享原状态检查。保留原静态 ID 和控制器。附带修复 Windows 同进程 XML 请求重复领取，增加 30×8 并发验证。XLD 78、XML 74、发行工具 4 项命令及三组 Python 回归通过；实际窗口验证入口、草稿/导出阻挡、编辑保持和混播；原 MIDI 哈希不变。第三/四轮及所有模型任务完整实跑仍待完成。见 [HANDOFF](work/workbench-results-20260923/HANDOFF.md)。


## 2026-09-23 — 工作台第三轮：属性面板

workbench.7/core.68 将原监听、循环、选音、编辑、标注和说明集中到属性面板。保留原节点和后台规则；关闭面板不退出编辑、不清除选音。现有回归与实际窗口验证通过，包括精确循环、保存/撤销重做、轨组排序、混播及窄面板。下一步第四轮全场景验收，未声称正式发行完成。见 [HANDOFF](work/workbench-properties-20260923/HANDOFF.md)。


## 2026-09-23 — 工作台第四轮核心流程验收

交付workbench.8/core.69：空结果导航、属性/日志顺序收尾。实际混播、完整编辑、真实MIDI导出、融合与新进程重启通过；导出字节一致、旧源/草稿保护通过。最大字号112%在1100/1280/1600宽度通过。全模型任务、部分删除/管理UI和正式发行仍待补，详见 [53项验收](work/workbench-review-20260923/FEATURE_ACCEPTANCE.md) 与 [HANDOFF](work/workbench-review-20260923/HANDOFF.md)。


## 2026-09-24 — 管理流程实际窗口补验

保持workbench.8/core.69，源码未改。完成标注增改删、版本保留/取消/切换、取消删除与指定人工版删除回退、单项自动结果清理、WAV保留保护和取消批选；原28个MIDI哈希保持。系统确认/回收以受限隔离适配执行，未验证系统回收站服务或永久删WAV。见 [HANDOFF](work/workbench-management-20260924/HANDOFF.md)。


## 2026-10-18 · Large弦乐50ms连音采用

弦乐更新（2026-10-18，优先于下文历史）：当前本机开发版 `releases/0.5.0-dev.strings.1/XLD.exe`，XLD core.72，XML stems.13。项目根目录“启动XLD.cmd”为新入口。用户确认MuScriptor Large“新版＋填空50ms”有明显提升，已设为默认，并提供原时序Large备选。固定上游4c03caf单独目录，其他用途保留原上游/配置，权重复用。旧MIDI/人工修订可切回，不批量重算；原storage.1保留。回归与30秒真实GPU输出/预览一致性已通过，个人听评不作普适精度声明。详见[本轮交接](work/muscriptor-update-20261018/HANDOFF.md)。未发布GitHub。


## 2026-10-26 · MuScriptor v0.4独立节拍候选

节拍候选更新（2026-10-26，优先于下文历史）：当前本机入口为 `releases/0.5.0-dev.tempo.1/XLD.exe`，XLD core.73 / XML stems.13。MuScriptor v0.4.0（8a1ef886）已作为弦乐的“v0.4 · 节拍试验”独立卡片；默认仍是用户确认的4c03caf/50ms。新拍点分析在CPU处理原曲，正常MIDI/编辑/混合仍按秒且不量化，另行导出带速度图的谱面MIDI；谱面可能增加弱起留白。Large权重不变，无新的音符精度结论。真实MEGURI/toe拍点与导出、既有回归和对照页逻辑通过，拍号未确定、听评待用户验收；MEGURI音符复用已验收事件，本轮未重新运行Large GPU。旧strings.1及原数据保留。详见[本轮报告](work/muscriptor-v04-20261026/REPORT.md)和[试听对照](work/muscriptor-v04-20261026/listening/index.html)。未发布GitHub。
