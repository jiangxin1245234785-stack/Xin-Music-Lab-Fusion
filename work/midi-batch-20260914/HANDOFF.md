# 一键 MIDI · 2026-09-14

开发版 XLD 0.5.0-dev.core.8；XML 0.5.0-dev.stems.7 不变。

## 使用

选曲 → MIDI → 一键生成 MIDI。必须先有有效 WAV 分轨。依次生成 bass、piano、guitar，最后自动融合；启动前列出各声部使用的模型。各声部记住的模型优先，否则采用现有可用默认模型。

有效缓存直接复用；原“重新生成”选项会重算三个 MIDI。可通过常驻任务栏取消；失败、取消或 WAV 来源变化停止后续步骤，完成结果保留。单声部转谱、模型选择、独立融合和目录入口继续使用。

## 实现

- midi-batch.js：串行计划、取消检查、WAV runId 检查，失败短路。
- derived-controls.js：固定歌曲/模型/force/source，组织三次 runDerived 与一次 mergeMidi；刷新结果和终态。
- app.js：复用现有 batchRunning/batchCancelled，避免步骤间并发启动其他分析；沿用进度和取消。
- index.html / workspace.css / i18n/runtime-messages.js：顶部入口、模型预览、中英文状态。
- 没有新依赖、后台队列、模型或音频格式；XLD 核心及 XML 读取契约不变。

## 验证

XLD npm test 通过，覆盖串行、缓存流程、取消、失败不融合、WAV 来源变化、请求异常及既有分析/分轨/MIDI 回归。

隔离 Electron 使用 Radioactive Spell Wave 已有真实缓存：HiRes Bass → HiRes Piano → GAPS Guitar → 融合，3 轨 4165 音符。验证固定歌曲、试听声部不变、失败停止、取消停止、中英文切换、无 WAV 禁用，控制台错误为零。失败/取消用测试替身注入；本轮没有重跑模型推理，模型质量不是此次验收项。

证据：artifacts/midi-batch-20260914/batch-ui.json 与 midi-batch-ui.png。测试脚本 tests/midi-batch-ui.cjs 需隔离 XLD_BATCH_TEST_ROOT，fixture.json 指向测试曲库设置及分析缓存。

## 交付边界

仅更新开发源码，关闭旧开发窗口后用 start-dev.cmd 重开。安装目录未更新。WAV 分轨仍需先执行；一键范围是当前一首歌的三个支持声部，不包含整张专辑或鼓轨转谱。融合沿用当前启用结果与现有来源校验；不新增跨应用任务服务。

发布前逐文件校验原始哈希并备份，发布后校验新文件哈希；备份及发布清单位于 D:/Caches/codex/xld-midi-batch。
