# 开源项目研究与产品取舍

本记录对应 1.1.0 的产品化升级。调研日期：2026-06-19。

## 参考项目

| 项目 | 许可证 | 成熟能力 | 本项目的取舍 |
|---|---|---|---|
| [Meyda](https://github.com/meyda/meyda) | MIT | Web Audio 实时 / 离线音频特征提取 | 采用“先提取稳定音乐特征、再驱动画面”的架构思想；本项目独立实现轻量 RMS、正向 spectral flux、对数频谱重心、谱平坦度、密度、动态范围和 onset，未打包 Meyda 代码 |
| [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) | AGPL-3.0 | 高分辨率频谱、峰值保持、权重、镜像、反射、径向、FPS 上限与渐变 | 仅研究功能边界；没有复制或链接其代码。现有真实 Hz / dB 映射、峰值保持与新增自适应像素密度均为本项目实现 |
| [Butterchurn](https://github.com/jberg/butterchurn) | MIT | MilkDrop WebGL 引擎、预设混合过渡 | 已固定版本离线打包，继续作为 Beta 基础渲染层 |
| [PixiJS Filters](https://github.com/pixijs/filters) | MIT | Glitch、RGB Split、噪声、径向模糊等 GPU 后处理分类 | 参考效果分类，使用原生 Canvas 2D 独立实现实时片段处理，避免引入整套 Pixi 运行时 |
| [glitch-canvas](https://github.com/snorpey/glitch-canvas) | MIT | JPEG 数据损坏式静态图像 Glitch | 适合单张图片，但逐帧编码会造成实时音乐可视化卡顿，因此没有引入；改用节拍触发的跨帧残留与切片 |
| [Wave.js](https://github.com/foobar404/wave.js) | MIT | 多种音频流可视化与渐变配置 | 参考“统一输入、多渲染器”的产品结构；没有复制运行时代码 |
| [MSAF](https://github.com/urinieto/msaf) | MIT | 音乐结构边界、标签聚类、Foote 棋盘新颖度、谱聚类等研究框架 | Demo.10 参考其问题拆分与算法家族，独立实现因果 Foote 窗口和轻量复现聚类；没有复制、链接或分发 MSAF 源码 |
| [All-In-One](https://github.com/mir-aidj/all-in-one) | MIT | 节拍、重拍、功能段落边界与标签；基于分轨音频的神经网络模型 | 仅作为未来重型旁路适配器候选；Demo.10 未打包模型、PyTorch 或 Demucs，也没有用启发式结果冒充其输出 |

## 1.1.0 的核心升级

1. 音频特征层：视觉不再直接依赖单一三段能量，能够区分“同样响但频谱稀疏”和“频率丰富”的声音。
2. 演出导演：在乐句边界换场，按能量、频谱重心与纹理复杂度选效果，并维护最近场景历史避免重复。
3. 四种实时 Glitch：Datamosh、RGB Split、Codec Rain、Signal Loss，各自使用不同音乐特征驱动，而不是固定随机数定时器。
4. 自动画质：持续测量真实帧率，只在需要时调整 DPR；High 和 Eco 仍可手动锁定。
5. 桌面工作流：加入无 UI 快照和窗口置顶，适合演出、桌搭与长时间背景播放。

## 隐私与运行边界

- 所有声音特征只在当前进程内存中计算。
- 不录音、不上传、不调用云端分析服务。
- 所有渲染依赖均随 EXE 本地提供，断网可用。

## Demo.10 · 段落识别引用边界

- `section-features.js`、`section-engines.js` 与新版 `mapping-lab.js` 均为本项目独立代码。
- “Foote Novelty”引用公开的棋盘新颖度思想；实现改为只使用过去窗口的因果比较，因此能监听系统音频，但相对真实边界存在约一个半窗口的延迟。
- “Recurrence Form”引用 MSAF `scluster` 所在的重复结构/谱聚类问题域，但当前是适合实时运行的质心复现近似，不声称与 MSAF 数值输出等价。
- 三套引擎暂不参与视觉调制，避免在完成误报、漏报和延迟评估前形成新的闭环依赖。
