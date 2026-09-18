# MIDI 保存修复

阶段：完整歌曲与界面复测通过，准备更新 XLD 开发版 core.4；XML 维持 stems.6。

原因：Nancy Tries to Take the Night 的钢琴、吉他任务在最后的 MIDI 回读校验失败。几乎同时出现的不同音高落在同一 tick 后按音高重新排序，原代码按浮点起音排序后 zip 比较，导致有效 MIDI 被误判。吉他原始与回读均 2915 音符却出现 179 个位置错配；钢琴均 3086 音符却出现 143 个位置错配。失败文件按原策略清理。刷新同时清除了界面错误提示。

修复：runner.py 按 MIDI tick 上的音高、力度、起止时间多重集合校验，保留完整回读与数量检查，不修改模型输出、阈值、notes.json 秒时间或节拍量化。derived-controls.js 按歌曲/声部/模型保留会话内失败原因；刷新不清除，重试或出现新成功结果清除。已有成功缓存保留。app.js 传入既有后端错误翻译器，runtime-messages.js 增加中英提示。

文件：analysis-midi/runner.py；derived-controls.js；app.js；i18n/runtime-messages.js；tests/midi-roundtrip.py；tests/midi-status-electron.cjs。模型、分析服务、XML 读取合同不变。

验证：两个 Python 环境各 4 项序列化回归，覆盖同 tick 和弦、长时间戳、真正的错音/力度/起止变化、缺失/多余音符、空结果；XML/XLD 完整 npm test 通过。完整 396.581 秒实际分轨在隔离目录重新推理：GAPS guitar 2915、HiRes piano 3086 音符，发布及当前/模型缓存回读通过。实际 Electron 窗口验证无缓存失败、有缓存重新生成失败、手动/焦点刷新、声部/模型切换、中英文错误、成功重试和目录目标；成功读取原完整歌曲结果。

测试说明：窗口失败采用 IPC 注入，以便稳定覆盖错误状态；成功使用真实整曲 MIDI 缓存。初次 GUI 检查因测试库根目录选到专辑内，导致按散曲路径查找不到夹具；改成原曲库层级后通过。首次截图等待窗口尺寸稳定后重拍。源代码没有因此新增路径兼容规则。沙箱中的 Electron GPU 子进程缺 DLL，使用批准的隔离隐藏窗口验证。

不变量：不更换分轨、不改原音频或人工标注、不改安装版、不把音符数量等同于转谱准确率。尚不新增跨进程任务协调。错误记忆限当前应用会话；原持久日志仍保留所有失败。

下一步：将经校验的源更新写回开发目录，在用户分析目录补生成此前失败的 guitar/piano（不强制覆盖已有成功结果），记录恢复回执；用户刷新读取。

测试命令：在两边 source 基线目录执行 npm test；分别用 D:/Caches/codex/runtimes/xld-midi-highres/Scripts/python.exe 和 xld-midi/Scripts/python.exe 执行 tests/midi-roundtrip.py。实际窗口设置 XLD_STATUS_TEST_ROOT=D:/Caches/codex/midi-save-fix，由 Electron 执行 tests/midi-status-electron.cjs。完整推理见同目录 full-track.cjs、fixture.json、full-track.json。


恢复回执：已在用户实际分析目录成功补生成本次 guitar/piano MIDI，XLD 模型结果与 XML 当前结果回读一致。没有强制重做分轨。用户当前窗口点击刷新即可读取；重启开发版加载错误提示修复。详细文件位置、任务 ID 和音符数量见 recovered.json。
