# Guitar-FL 试听实验

## 当前阶段
MEGURI 整曲 CUDA 推理完成；MIDI 回读、输入哈希、九段试听播放和宽窄布局检查通过。听感待用户验收。

## 范围与决定
- 仅独立实验，不修改 XML/XLD 菜单、默认值或曲库结果索引。
- 用户已否决 YourMT3+ 在 MEGURI 吉他的试听效果；不再据弦乐效果推荐其处理吉他。
- Guitar-FL 和 GAPS 同源 BS-RoFormer SW guitar.wav，源长 568.75 秒；同一解码阈值 0.3/0.3/0.1。
- 复用原 GAPS 883 音符的完整结果。FL 为 3486 音符；数量不代表准确率。
- FL 68.656 秒，NVIDIA GeForce RTX 5070 Ti Laptop GPU，CUDA 峰值已分配显存 277 MiB（非总显存占用）。
- FL 中位音长 0.106 秒，GAPS 0.13 秒；短于 200ms 比例 76.2% / 74.4%，长于等于 2 秒 102 / 13。不能据此断言连贯性改善。
- 两者都没有 pitch bend。不合并碎音，不手工修音。
- 三个 30 秒片段从 60/270/480 秒起，复用既有比较窗口。试听统一 GM program 27、力度 90；完整 MIDI 保留实际输出。
- Ti-hFT 仍未发现官方推理代码/预训练权重，没有运行，也不自行训练。

## 文件地图
- prepare.py：固定官方 HF 版本，验证 LFS SHA256，复制隔离适配器。
- run.py：复用 XLD runner，独立整曲 CUDA 推理并验证回读/源不变。
- render.py：同音色试听页、完整 MIDI、客观统计。
- check-ui.cjs：九段文件加载/实际播放、宽窄布局检查。
- provenance.json / result.json：权重、输入、运行来源。
- 暂存/权重：D:/Caches/codex/guitar-fl-trial。
- 交付：artifacts/guitar-fl-20260916/listening/吉他FL对比.html。

## 验证与运行
使用 runtime/0.5.0/envs/highres/python.exe 顺序运行 prepare.py、run.py、render.py；run.py 拒绝覆盖已有结果。
Electron 运行 check-ui.cjs。无需新装依赖或打包产品。页面视觉检查完成。

## 下一步
用户听同片段 GAPS/FL，尤其检查多余音符、持续音截断。仅在听感通过后考虑产品接入。
