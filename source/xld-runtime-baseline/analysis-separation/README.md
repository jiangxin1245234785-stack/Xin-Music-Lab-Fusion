# XLD 分轨

XLD 提供两个六轨后端：BS-RoFormer SW 为可用时默认，Demucs 6s 为备选。两者输出 bass、piano、guitar、drums、vocals、other。默认是产品预设；当前没有 WEG 原始多轨真值，也没有证明任何模型在所有复杂曲目上最优。

在 XLD 选曲后选择模型，点击「分轨」或「使用此分轨」。选卡片只预选；成功生成或使用缓存才激活音源。界面明确显示试听与 MIDI 使用的模型。失败、取消保留上次成功结果。XML 读取同一当前结果，便捷生成沿用当前模型；首次生成选可用默认。更换模型的主要入口在 XLD。

## 接口与缓存

models.json 同时供 Python 与 JS 使用。runner.py 的 separate(input_path, output_path, track_id, run_id, notify, engine) 可直接导入；CLI 支持 --engines、--engine、--input、--output、--track-id、--run-id。旧调用省略 engine 仍使用 Demucs，UI 显式发送选择的模型。

所有输出为 44.1kHz、双声道、float WAV，时间原点为母曲 0 秒，长度为原曲时长重采样后的帧数。分块只用于推理和内存控制，不代表识别出音乐段落。RoFormer 按上游窗口重叠累加，整曲结果在系统内存中累加，GPU 只处理当前块。

- stems/<runId>/<stem>.wav：实际音频。
- stems/<engine>.json：各模型最近一次成功结果。
- stems.json：当前激活结果，兼容既有共享读取入口。
- midi/<stem>/by-source/<sourceRunId>/<engine>.json：绑定分轨来源的 MIDI 缓存；active.json 保存此来源最近使用的 MIDI 模型。

切换分轨前自动保留旧 MIDI 模型变体；切回来可恢复。强制重新分轨会产生新 runId，对应旧 MIDI 不再作为当前音符。强制生成替换同模型最近结果；本轮没有无限历史版本管理和自动垃圾清理。消费者应使用 core/derived-assets.cjs 的 readStems/readMidi，不应自行拼接旧 MIDI 指针。

## 模型与环境

推理代码：[openmirlab/bs-roformer-infer](https://github.com/openmirlab/bs-roformer-infer/tree/90346ad4a4db7334f3378054a46adf7280b72f73)，固定 revision 90346ad4a4db7334f3378054a46adf7280b72f73。权重：[enerjazzer/BS-ROFO-SW-Fixed](https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed/tree/a443a2985534b3bc815ef54a5d446c6a0390f974)，固定 revision a443a2985534b3bc815ef54a5d446c6a0390f974。SHA256 记录在 models.json，每次推理检查。代码 MIT，权重按上游登记为 CC-BY-NC-SA-4.0；许可证与复现记录见 THIRD_PARTY_LICENSES.txt、runtime-lock.json。

独立环境 D:/Caches/codex/runtimes/xld-roformer，权重 D:/Caches/codex/models/xld-roformer。XLD_ROFORMER_PYTHON、XLD_ROFORMER_MODELS 可以覆盖。环境只读复用现有 XLD AI site-packages 中的 torch/CUDA 等依赖，新增 bs-roformer-infer 0.1.6、rotary-embedding-torch 0.9.1、ml-collections 1.1.0、absl-py 2.3.1。setup_runtime.py 是显式安装脚本，不由 GUI 自动执行；它依赖当前 Windows XLD AI 安装，未制作为可分发安装包。

## 本轮验证

真实 WEG 两首完整曲目、两模型对照，六轨时长/声道/采样率/有限值检查；短音频、静音及 16k/48k 重采样；与固定上游 30 秒片段数值对照；真实运行取消；新 WAV 的 guitar/piano/bass 全曲 MIDI；XLD 与 XML 实际窗口的模型切换、缓存、目录和播放位置；两产品完整 npm test。

听感对照在 D:/Caches/codex/weg-separation/outputs/。进一步质量改进应基于具体片段的串音、目标声部保留、瞬态和尾音听感；不能用音符数量或混合重建误差代替分离准确率。
