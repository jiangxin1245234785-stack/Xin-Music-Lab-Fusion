# 单轨 MIDI v1 交接

阶段：本机开发版已完成，待用户试听/编辑转谱结果。构建 0.5.0-dev.stems.2。

范围：已有 bass / piano / guitar WAV → MIDI + notes.json；沿用单任务、进度、取消。保持母曲秒级时间，不量化；120 BPM 是 MIDI 时间编码，不是检测到的歌曲速度。

已定决策：Basic Pitch 0.4.0 + ONNX CPU；独立 Python 3.10 环境 D:\Caches\codex\runtimes\xld-midi。可通过 XLD_MIDI_PYTHON 指定。旧 Python 3.12 环境保持原样。依赖固定在 analysis-midi/requirements.lock，包含 Basic Pitch 实际需要的 setuptools 80.9.0；不打包独立 exe。

数据：每曲 midi/<stem>.json 指向 midi/<stem>/<runId>/<stem>.mid 和 notes.json。关联 sourceRunId；重分轨后旧 MIDI 保留在磁盘但不作为当前缓存。重新转谱成功后替换该声部的旧成功结果；失败和取消保留原有结果。

文件：analysis-midi/runner.py 为可导入转谱/CLI；desktop/midi-assets.cjs 为读取与校验；desktop/xld-analysis-service.cjs 复用任务生命周期；main/preload 接 IPC；stem-controls.js 与现有音轨选择衔接。

验证：20 秒真实 guitar 片段 74 音符；完整 LAST WALTZ 211.515 秒 bass 337、piano 406、guitar 844 音符，CPU 约 4 秒/轨。每次 runner 回读 MIDI 校验数量和时间（1 ms 容差）。真实缓存与取消保留通过。新增任务回归覆盖重复提交、以分轨为输入、空结果、缓存、无效输出、运行中取消和源版本过期。完整 npm test 通过；Electron 真实转谱/试听/目录动作/重载通过，时间线采用 fixture。

不变量：原音频、分轨 WAV、人工标签、主时间线、视觉映射和安装目录保持原有边界。MIDI 与 notes.json 是机器结果，外部人工编辑请另存文件。

已知限制：MIDI 音符质量尚未人工验收，WAV 分离质量的接受不等同于 MIDI 转谱准确。尚未实现内置 MIDI 播放、编辑或自动拍速；钢琴串音可能形成误检。只处理单轨。

下一步：用户将 MIDI 以 120 BPM 时间基准导入编辑器，对照对应 WAV 检查时值与音高；根据具体反馈调整一项参数或后端，不扩展完整编辑器。

检查：npm test；npm run test:analysis。界面用本机 Electron 执行 tests/stems-electron-smoke.cjs，设置 STEM_SMOKE_INPUT、STEM_SMOKE_OUTPUT、MIDI_SMOKE=1；使用已生成三轨 MIDI 的测试曲目，MIDI_SMOKE 会重做 bass。
