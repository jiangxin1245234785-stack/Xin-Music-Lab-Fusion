# MIDI 多模型与分轨面板整理
1. 输入：当前单曲已有 bass/piano/guitar WAV；沿用母曲 ID、时间原点及单任务。
2. 接入 HiRes Piano、GAPS Guitar、HiRes Bass 预训练模型；Basic Pitch 保留为通用备选，专用模型就绪时为对应声部默认。
3. XLD 使用现有分析器卡片样式，显示默认/备选、可用/未就绪/已缓存；不添加通用插件体系。
4. 面板按音轨试听、WAV 分轨、MIDI 模型与生成/目录分组；保留刷新和重新生成，适配中文、英文及窄窗。
5. 每个声部各模型独立缓存，运行或复用结果后更新当前 MIDI；旧 Basic Pitch 和 XML 读取兼容。
6. 输出 .mid、notes.json 与模型/权重/参数记录；保持未量化秒级时间，失败/取消保留已有结果。
7. Windows Electron 本机开发版；保留现有界面与运行时，新增独立转谱环境/权重到 D:/Caches/codex。
8. 复用已有 torch/CUDA、librosa/numba；音频由 soundfile 读取，无新增 ffmpeg/外部服务，无 EXE 打包。
9. 核验公开权重、输入匹配、真实片段推理、缓存隔离/切换/取消、XML 兼容、实际窗口布局。
10. 不改原音频、安装产品、段落/和弦逻辑；本轮不将工程检查视为音乐质量验收。
11. 后续：Aria/YourMT3、更换分轨模型、批处理、内置 MIDI 编辑、跨进程协调。
