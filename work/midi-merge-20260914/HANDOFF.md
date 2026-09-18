# MIDI 融合 · 开发版 core.7

在 MIDI 工作区末尾增加“实验 · MIDI 融合”。将当前 WAV 来源下已经启用的 bass、piano、guitar MIDI 合成一个多轨文件；至少需要两个有音符的声部。有三个就合成三轨，仅预选备选模型不会改变融合来源，需先使用该模型的 MIDI。

输出保留独立乐器、通道、力度、延音控制及弯音，沿原曲绝对时间对齐。输出采用统一的 120 BPM 时间基准，不估计歌曲 BPM、不量化节拍。输入含不同速度变化时先转换到绝对秒再保存；已用测试验证。试听使用系统关联的 MIDI 软件，播放音色由该软件决定。本轮不增加内置合成器、音色库、编辑器或新转谱模型。

文件位于原歌曲分析目录 `midi/merged/<来源指纹>/merged.mid`，来源、模型、runId 和校验信息保存在同目录 `merge.json`。融合不覆盖原始 MIDI，不改变已启用模型；相同输入复用结果。当前 WAV 或 MIDI 来源变更后，旧组合不再显示为当前结果；切回原组合可以再次使用旧结果。

实现：`analysis-midi/merge.py` 复用既有 pretty_midi；`core/midi-merge.cjs` 验证来源、缓存及输出；`core/analysis-service.cjs` 使用原有任务锁、进度和取消；`desktop/main.cjs` 与 `preload.cjs` 增加融合/打开接口；`derived-controls.js`、`index.html`、`workspace.css` 提供入口和中英状态。XML 接口与原模型流程保持兼容。

验证：真实 Radioactive Spell Wave 三声部合成 4,165 个音符；核心测试覆盖缓存、任务互斥、早期取消、来源切换及原 MIDI 不变。Python 测试覆盖不同速度图、独立通道、乐器、绝对时间、延音和弯音。Electron 界面验证生成、打开文件/目录、语言切换和切歌后旧结果不可用。

复现：`npm test`；既有 MIDI Python 运行 `tests/test_midi_merge.py`；隔离 `XLD_MERGE_TEST_ROOT`（含 fixture.json）运行 `tests/midi-merge.cjs` 和 Electron `tests/midi-merge-ui.cjs`。开发入口仍是 `start-dev.cmd`。本轮交付源码，复用已有 MIDI Python 环境，无新增安装依赖或产品打包。

后续只根据实际试听反馈调整。融合本身不修正转谱错误，也不补出尚未生成 MIDI 的鼓、弦乐和环境声。
