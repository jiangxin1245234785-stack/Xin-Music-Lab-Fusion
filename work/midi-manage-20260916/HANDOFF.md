# MIDI 清理与弦乐默认模型

## 当前阶段
实现、隔离回归、真实 Electron 回收站和发布壳检查完成，交付 releases/0.5.0-dev.yourmt3.2。XLD core.19；XML stems.8。

## Spec 摘要
strings 默认 YourMT3+；在 MIDI 页删除当前音源与模型的生成结果，回收站可恢复；删除启用结果时自动选用已有默认模型缓存，刷新一键 MIDI、融合和目录状态。

## 已定决策及理由
- 用户试听 MEGURI 后接受 YourMT3+，将其设为 strings 默认。其他声部默认不变；不修改模型参数。
- 一次性迁移旧 localStorage 的 strings Basic Pitch 选择。以后仍允许明确选 Basic Pitch，并保留选择。
- 删除操作位于单声部操作区，与生成、目录按钮同排。原生确认框显示曲目、声部、模型。
- 用 Windows 回收站，运行期间与存储操作共用现有互斥标记。
- 小型缓存索引保留，读取必须验证真实文件。这样恢复原文件夹可恢复缓存；删除文件后不再显示有效结果，也不再作为 WAV 的有效依赖。
- 删除启用中的 Basic Pitch 且同源 YourMT3+ 已缓存时，自动启用后者。无默认缓存时等待生成或用户选择；不会自动生成或切回其他备选。
- 已有融合文件保留；根据现有输入指纹判定当前组合是否需要重新融合。

## 文件地图
- analysis-midi/models.json：YourMT3+ defaultFor strings。
- core/midi-delete.cjs：删除计划、文件校验、回收站和默认缓存启用。
- desktop/main.cjs、preload.cjs：IPC、忙碌锁、双语确认框。
- derived-controls.js、index.html：删除入口、状态刷新和旧偏好迁移。
- i18n/runtime-messages.js：按钮、完成状态与错误文本。
- tests/midi-delete.cjs：核心回归；tests/midi-delete-ui.cjs：隔离窗口测试。
- 暂存根目录 D:/Caches/codex/xld-midi-manage-20260916。存档开发脚本在此根目录运行；fixture 只供本机隔离验收。

## 不变量
原始音乐和 WAV 不删除、不改写；不同音源/模型的 MIDI 不连带删除；模型算法和既有结果时间不改动；旧版本保留。未对用户真实曲目执行清理。

## 已知限制
- 本入口清理当前选中的有效模型结果；历史孤立目录与损坏结果仍需打开目录管理。
- 删除后先占用回收站空间；清空回收站才实际释放空间。
- 回收站恢复需恢复整个原文件夹；源音频已改变时缓存仍会按既有规则失效。
- Windows 本机开发版，未做干净 VM 或任意机器正式发行认证。
- 揉弦造成碎音目前仅是待验证解释，本轮不增加自动粘连、调参或训练。

## 验证与命令
- XLD npm test、XML npm test 全通过。
- node tests/midi-delete.cjs：取消、指定模型、默认切换、回收站恢复、最后结果、路径穿越、链接目录、额外文件、源/文件变化、回收站失败。
- node run-ui.cjs：真实 Windows shell.trashItem，仅作用于 test-analysis 的复制 MIDI/notes；原曲/WAV未删除。一次性默认迁移、后续手动选择持久化、默认批次方案、确认期间源锁、自动启用、打开正确目录、最后结果的禁用状态、双语、1180×780 单屏和大字体通过。
- node run-package-ui.cjs：打包后的默认卡片、删除按钮、帮助/版本/字体控制，宽窄及大字体通过。
- prepare-fixture.cjs 创建隔离复制；rekey-fixture.cjs 重建路径相关的细分缓存键；reset-midi-fixture.cjs 只恢复复制的两个 MIDI 模型文件。
- 发布逐文件 SHA-256 验证，源码发布前校验 baseline.json，防止覆盖并行改动。

## 下一步
用户在新版 MIDI 页选择 strings → Basic Pitch → 删除 MIDI。暂不扩大为跨曲目批量清理，也不进入 MIDI 编辑器开发。
