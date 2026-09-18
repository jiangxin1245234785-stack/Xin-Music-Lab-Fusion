# 弦乐默认与 toe 鼓对照
## 当前阶段
2026-09-17 本机开发版 0.5.0-dev.muscriptor.4；XLD core.24，XML仍stems.10。实现、整曲运行、播放和实际界面验证完成，发布以artifacts/toe-drums-20260917/published.json为准。
## 决策
用户验收MEGURI MuScriptor Large弦乐，默认改Large；YourMT3+、Medium、Basic Pitch保留。首次升级迁移旧YourMT3+/Basic Pitch偏好，保留显式Medium/Large；之后手选YourMT3+也会跨重启保留。模型菜单标为弦乐叠奏Large/快速处理Medium。
模型参数、权重、model ID、缓存均不变；单声部、一键采用同一默认。鼓默认仍ADTOF；toe听评已完成，见文末用户反馈。
## 实曲结果
本地toe《For Long Tomorrow》10 Goodbye专辑版，425.533333秒，trackId 5bcc39d9a9bed55ddb658793497951e73a42a71e。
无原鼓轨缓存，真实服务生成BS-RoFormer SW整曲分轨；所有3模型读取同一drums.wav。
ADTOF 2391音符 / 18.516秒任务；Medium 2741 / 21.031秒；Large 2779 / 98.031秒。
MuScriptor原生CUDA；Medium峰值3162MiB，Large10523MiB（包含加载临时状态）。ADTOF5种键、Medium19种、Large20种，不把数量差异当准确率。
三份整曲MIDI在实际用户曲库中已验证缓存回读，活跃鼓为ADTOF。分轨WAV可用现有存储管理。
试听：1:00–1:30、3:30–4:00、6:00–6:30；同音源/音色/力度100，同鼓声部统一防削波增益，原分轨WAV对照；附3完整MIDI。
标准鼓合成仅用于比较敲击事件，不表示原录音音色还原；不额外量化，MuScriptor鼓沿用100ms并在下次同键敲击前截止。
## 验证
XLD完整npm test通过，xld-tests.log；XML完整npm test退出0，regression.json。
实际发布壳 defaults-ui.json：首次默认、旧默认迁移、显式Medium保留、后续YourMT3手选跨重启、五声部缓存一键/融合/三个目录、宽窄屏、双语通过。看图无溢出。
midi-delete回归现在验证删除旧备选后回退新Large默认，取消/回收站恢复等原检查通过；仅隔离夹具。
real-parts.json整曲3模型缓存；listening/comparison.json导出/鼓通道/时长/12段音频数据；listening-ui.json实际12段播放和宽窄屏通过。试听截图已查看。
verification.json全部模型参数保持、两声部默认、toe实际缓存、2722发布文件哈希校验通过。
## 文件地图
source/xld-runtime-baseline：models.json默认、derived-controls.js迁移与菜单、i18n/runtime-messages.js提示、package.json版本、2个默认/删除测试。
run-real.cjs真实分轨转谱，fixture.json是实际toe曲库地址。default-fixture.json是隔离MEGURI UI夹具（WAV只读硬链接）。render.py合成试听，defaults-ui.cjs验证默认与一键，verify.cjs/publish.cjs校验发布。
## 不变量与已知限制
不改原曲、不删除真实用户结果、不更改吉他/钢琴/贝斯/鼓默认和算法。现有YourMT3弦乐与旧版本保留。未做干净VM通用发行验收，仍本机开发版，无新依赖。
## 下一步
toe鼓已试听，用户认为整体相近、ADTOF镲片尾音略逊；尚未指定改变默认，继续保留ADTOF及MuScriptor备选。不从音符数推断优劣。后续新曲直接沿用菜单；不需要重跑本轮整曲。


## 2026-09-17 用户反馈及交接补充

用户已试听：ADTOF镲片尾音略逊，整体差异不大。没有新的默认切换指令。MuScriptor鼓当前为onset转约100ms音符，试听尾音还受鼓键映射和合成音源影响，不能当作真实延音估计质量的直接证明。

下一轮建议先整理模型版本、历史结果读取、缓存与回退，再独立试验ChordFormer和BeatThis。完整状态与计划见 ../../docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md；接手入口 ../../CLAUDE_HANDOFF.md。本补充不修改此前版本和测试事实。
