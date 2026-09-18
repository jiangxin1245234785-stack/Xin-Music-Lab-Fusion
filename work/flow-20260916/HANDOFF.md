# 分轨与 MIDI 流程整理 — 2026-09-16

阶段：实现与本机验证完成；发布目标 releases/0.5.0-dev.flow1，XLD core.15 / XML stems.8。

范围：沿用基础分轨与四声部 MIDI，整理来源、选择、状态与目录；不引入新模型或新增弦乐转谱。

已定逻辑：
- MIDI 用独立转谱声部选择器；全局播放器、原曲/other 试听不改变目标。转谱声部旁试听按钮沿用当前播放位置。
- 显示当前启用 WAV 模型；基础分轨选择卡片只有点击使用/生成才会启用。细分 WAV 明确不参与 MIDI/融合。
- 模型卡片区分当前用于融合、已缓存、空结果；仅预选卡片不激活。成功生成 MIDI 后显示实际音符/空结果状态。
- 一键计划显示各声部模型和复用/待生成/重算/不可用；原有串行四声部与融合规则不变。
- MIDI 失败键包含 WAV runId，批量/融合消息包含歌曲和 WAV 来源，换来源不沿用旧完成提示。
- 分轨/MIDI 的重算选项按页分别保存，换歌曲重置；MIDI 强制重算不会影响 WAV。
- 请求完成后保持 pending，直到结果刷新结束；修复完成状态先出现、融合结果仍未读回的窗口时序。
- 空 MIDI 可打开目录，不进入融合；本曲目录与单声部目录继续分开。

文件：derived-controls.js、index.html、i18n/runtime-messages.js、package.json；tests/derived-flow.cjs 与相关 Electron 选择器适配。分析服务/模型/音频格式/缓存接口未改变。

验证：
- XLD/XML npm test 均通过；新增控制器测试覆盖音源/播放独立、模型激活、空音符、目录、来源隔离、迟到结果、任务刷新前锁定、取消与双语。
- 隔离真实 Electron midi-batch-ui 通过：复用 Radioactive Spell Wave 四声部缓存、融合、目录、失败/取消、空结果不融合、重载、无 WAV 禁用、双语与较小窗口布局，零 console error。
- Electron 第一次受限运行 GPU 子进程退出；正常 Windows 权限下通过。没有用更改产品 GPU 配置来掩盖问题。
- 已查看 MIDI 单声部/小窗口截图；现有窗口最小宽度仍有效。
- release shell 测试与9组引擎可用性检查通过；打包文件一致性在发布前后检查。
- 无新模型推理或音质比较；未做干净 Windows VM 验收。

测试数据：缓存工作区 test-analysis 内独立复制 JSON/MIDI，WAV 只读硬链接至旧测试夹具；未强制生成 WAV，未修改用户分析目录或原曲。

不变量：XLD 所有权、XML 接口、原曲、历史结果、人工标注及现有 runtime 均保持；旧开发版保留。沿用 artifacts/refinement-three-20260915/analysis，偏好使用新开发版目录。

复现：D:/Caches/codex/xld-flow-20260916；source/xld-runtime-baseline 下 npm test；source/fusion-runtime-baseline 下 npm test；node run-ui.cjs；node source/release-tools/check-runtime.cjs runtime.build.json candidate/resources/apps diagnostics.json。

下一步：用户使用这版检查流程；细分转谱、新模型、跨实例协调都在 backlog，无需本轮扩展。
