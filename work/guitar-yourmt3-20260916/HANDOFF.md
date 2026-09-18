# 吉他 YourMT3+ 接入与试听

## 当前阶段
实现、真实 MEGURI 推理、回归、桌面交互、打包检查完成；交付 releases/0.5.0-dev.guitar.1。XLD core.20 / XML stems.8。

## Spec 摘要
guitar 增加 YourMT3+ 备选；GAPS 仍默认。模型卡片显示用途与引擎名；生成、缓存、一键 MIDI、融合、删除、目录保持统一。使用现成 WAV，不重新分轨或训练。

## 已定决策及理由
- GAPS：原声／清晰拨弦；YourMT3+：电吉他 · 试听；Basic Pitch：通用／弯音检测。用途说明不是准确率承诺，用户试听后再决定默认。
- 复用现有 YourMT3+ 权重和环境，不新增模型依赖。弦乐默认及缓存参数不变。
- 吉他统一输出既有 guitar program 24；合并模型猜测的非鼓乐器组，保留所有音符。跨段解码沿用官方方法，同音重叠分通道，不截断或粘连。
- MEGURI 联合融合暴露原有通道上限：同声部同音色且没有弯音/控制曲线的多轨现在聚合并按重叠拆通道；不同声部、音色和有表情控制的轨不合并。鼓使用专用通道。融合指纹版本升为 2，旧融合文件保留。
- 新增 MEGURI YourMT3+ guitar 缓存，仅写模型索引，不改当前启用指针。WAV 与原 MIDI 不修改。

## 文件地图
- analysis-midi/models.json、runner.py：吉他能力与音色、通道导出。
- analysis-midi/merge.py、core/midi-merge.cjs：融合通道整理与缓存版本。
- derived-controls.js、i18n/runtime-messages.js：用途卡片、双语说明。
- tests/yourmt3-guitar.py、test_midi_merge.py、midi-models.cjs、derived-flow.cjs、guitar-ui.cjs：导出/缓存/状态与实际窗口回归。
- artifacts/guitar-yourmt3-20260916/listening/吉他MIDI对比.html：三个 30 秒片段与完整 MIDI。
- 工作暂存 D:/Caches/codex/xld-guitar-20260916；本目录脚本按其暂存路径运行。

## 不变量
分轨与模型参数不变；不自动合并碎音，不推测还原揉弦；弦乐单独导出行为不变；原音乐、WAV、旧 MIDI/融合结果与旧版本保留；回收站测试仅使用隔离复制文件。

## 结果与限制
- MEGURI 568.75 秒同源 BS-RoFormer SW 吉他：GAPS 883 音符，YourMT3+ 1912 音符；YourMT3+ 约 68 秒，3 条输出轨。统计不是准确率，模型误识别/漏音仍需试听。
- YourMT3+ 此结果时长中位数 0.11 秒，GAPS 0.13 秒，不能宣称碎音已改善。YourMT3+ 长于等于 2 秒的音符更多（38 vs 13），也不能据此单独判优。
- YourMT3+ 原生分类包含 piano 等多个乐器组；保留全部非鼓音符以免按不可靠标签漏删。原生分类计数与解码错误计数保留在结果 backend。
- 两模型本次均无 pitch bend；YourMT3+ 不提供连续揉弦曲线。固定试听用清音电吉他 program 27、力度 90，下载 MIDI 保留实际输出。
- 五声部（含真实 YourMT3+ 弦乐）融合为 10 轨 / 9260 音符，音高、时值、力度回读验证通过。
- 更复杂组合仍可能超过 15 个旋律通道，此时明确失败，绝不删音迁就。
- 本机个人开发版；复用现有运行环境，未做干净 VM 发行验证。

## 验证与命令
- npm test：XLD 与 XML 全通过。
- YourMT3 Python: tests/yourmt3-guitar.py；重叠同音、跨组音符、吉他/弦乐音色与时值。
- highres Python: tests/test_midi_merge.py；不同速度图、踏板/弯音、双多轨声部压缩且不丢音。
- node run-real.cjs：真实整曲推理与缓存；verify-merge-and-cache.cjs：五声部回读及同源缓存规划。
- node run-ui.cjs：GAPS 默认、三卡用途、一键真实缓存及融合、目录、取消/回收站/GAPS 回退、双语、1180×780单屏。
- node run-package-ui.cjs；node run-listening-ui.cjs：发布壳和九段音频加载。
- 源码发布前比对 baseline.json；发布产物逐文件校验 SHA-256。

## 下一步
用户试听后评价 MEGURI 的持续音、重复拨弦与和弦。决定是否将电吉他默认切为 YourMT3+；暂不接 FretNet/Ti-hFT 或自动音符修补。
