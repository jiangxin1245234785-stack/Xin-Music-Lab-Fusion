# Xin's Music Lab：Glitch 生成逻辑与 Tack Tile 拆解 v1

研究快照：2026-07-14  
目的：为“音乐事实 → 艺术动作 → Glitch 视觉参数”的新映射系统建立机制基线。

## 0. 先定义这里的“生成模型”

这里的“模型”主要不是机器学习模型，而是**生成控制架构**：它规定画面载体是什么、故障在哪里发生、随机性何时更新、事件如何留下历史，以及一套效果如何被组合成可复现的作品。

一个完整 Glitch 生成器至少包含五层：

```text
Carrier 稳定载体
  → Damage Operator 损伤算子
  → Temporal Controller 时间控制
  → Memory 跨帧记忆
  → Generator / Preset 组合与变异规则
```

大量“Glitch 库”只有第二层，所以能提供效果，却不能自动形成有音乐结构的视觉作品。Tack Tile 的价值在于它接近一个完整系统。

## 1. 当前能确认的主要生成范式

| 范式 | 代表实现 | 核心逻辑 | 强项 | 对本项目的价值 |
|---|---|---|---|---|
| 方程预设 + 历史反馈 | [projectM](https://github.com/projectM-visualizer/projectm)、[Butterchurn](https://github.com/jberg/butterchurn) | FFT/beat 数据进入 per-frame、shape、warp、composite 方程；上一帧继续参与下一帧 | 时间连续、反馈复杂、预设可保存 | 最适合作为“视觉状态机 + 反馈记忆”的参考 |
| 纹理节点图 + framebuffer feedback | [Hydra](https://github.com/hydra-synth/hydra) | source、transform、modulate、blend、previous output 构成处理图 | 组合直观，调制源与目标分离 | Generator 应生成处理图或 recipe，而不只是随机滑杆 |
| 模块混合 / preset mashup | [MilkDrop3](https://github.com/milkdrop2077/MilkDrop3) | 双预设、模块级 deep mashup、blend pattern、beat hard-cut、可保存随机值 | 生成空间大，允许重组与回退 | Glitch Genome 应支持模块锁定、来源记录和局部突变 |
| 模拟同步故障 | [KinoGlitch](https://github.com/keijiro/KinoGlitch) | scan-line jitter、color drift、vertical jump、horizontal shake | 故障语义清楚、成本低 | 适合 Signal Loss/Scanline 家族，不应与数字块损伤混成一个强度 |
| 数字块损伤 | [KinoGlitch](https://github.com/keijiro/KinoGlitch) | 噪声/阈值形成块 mask，再决定位移、旧帧或颜色错误 | 可控、实时、空间边界明确 | 音乐更适合控制 mask、密度、寿命，而不是逐像素随机 |
| 运动预测失效 / Datamosh | [KinoDatamosh](https://github.com/keijiro/KinoDatamosh)、[Supermosh](https://github.com/supermosh/supermosh.github.io) | 沿运动矢量错误继承旧帧，模拟关键帧缺失与预测污染 | “过去入侵现在”的时间感很强 | 映射参数应是 reset、inheritance、pollution lifetime，而非只有 displacement |
| 内容门控重排 | [pixelsort](https://github.com/satyarth/pixelsort) | 先由亮度、边缘、随机区间或 mask 限定区域，再在区域内排序 | 保留未损坏区域，故障可读 | 关键参数是 interval/mask/threshold，排序只是损伤算子 |
| 编码数据破坏 | [jpg-glitch](https://github.com/snorpey/jpg-glitch) | 保护文件头，对编码数据按 amount、seed、iterations 进行有限修改后解码 | 数据层故障真实、天然可复现 | 适合作为离线支线；实时主渲染应借鉴配方思想，不逐帧 JPEG 编解码 |
| 多算子桌面工具 | [BitRot](https://github.com/sixem/bitrot) | 将 pixelsort、chroma、datamosh、VHS 作为不同物理语义的工作流 | 说明当代工具仍以机制组合为主 | 可作为故障分类与 UI 命名参考，不是音乐时间模型 |
| AI/扩散式离线工作流 | [ComfyUI RyanOnTheInside](https://github.com/ryanontheinside/ComfyUI_RyanOnTheInside) 等 | 音频、MIDI、运动等特征调制 mask、IP-Adapter、图像/视频生成参数 | 语义变化能力强 | 适合离线音乐影像；当前不适合作为 XML 实时、低延迟、严格确定性主链 |

### 共同结论

成熟方案反复出现的不是某一种外观，而是以下结构：

1. 先有稳定载体，再允许部分区域受损。
2. 故障由 mask、阈值、区间或编码边界约束。
3. 随机状态保持一段时间，不逐帧重抽。
4. 当前帧包含历史帧的后果。
5. 宏观位移、中尺度块损伤和微观颗粒分工明确。
6. 生成器在兼容模块间组合，并记录 seed 与锁定项。

## 2. Tack Tile 的可验证来源

本次直接读取了 `butterchurn-presets@2.4.7` 中的转换后 preset：

`An AdamFX n Martin Infusion 2 flexi - Why The Sky Looks Diffrent Today - AdamFx n Martin Infusion - Tack Tile Disfunction B`

[npm 包](https://www.npmjs.com/package/butterchurn-presets)和 [jsDelivr 2.4.7 文件目录](https://cdn.jsdelivr.net/npm/butterchurn-presets@2.4.7/)可确认该 preset pack；Butterchurn 官方说明它是 MilkDrop 的 WebGL 实现。以下“代码事实”来自该 preset 的 `baseVals`、`frame_eqs_str`、shape、warp 和 composite shader，不依赖观看印象。

## 3. Tack Tile 的实际逻辑

### 3.1 它不是 BPM tracker，而是自适应冲击探测器

核心输入被压成：

```text
impact = max(bass, mid, treble)
```

它维护：

- `avg`：较慢的指数移动平均；
- `peak`：有效事件后被抬高、随后较快衰减的峰值门槛；
- `t0`：上一次事件时间。

只有同时满足以下条件才生成 `is_beat`：

```text
impact > avg + peak
time > lastBeatTime + 0.1 s
```

三个衰减系数按 `fps` 归一化，因此在不同帧率下大致保持相同时间尺度。按 30 fps 估算：

- slow 平均的时间常数约 0.82 s；
- medium 峰值的半衰期约 0.22 s；
- 另有更快的约 0.065 s 平滑状态。

效果：持续高能量不会每帧触发；相对安静段落中的突然变化仍可能被识别。但它不知道 kick、snare、onset、downbeat 或段落，只知道“这次相对冲击是否足够大”。

### 3.2 事件被推进成多级视觉时钟

每个 `is_beat` 推进一个 0–15 的 `index`。从源码可确认：

| 周期 | 状态变化 | 作用方式 |
|---|---|---|
| 每 2 个有效事件 | 重新抽取 `vx`、`vy` | 控制连续漂移、尺度和局部偏移；两次更新之间保持 |
| 每 4 个有效事件 | 重新抽取整数方向 `dir` | 经过平滑后形成方向/相位变化 |
| 每 8 个有效事件 | 推进 `p1` | 平滑为旋转矩阵状态，供 shape/坐标关系使用 |
| 每 16 个有效事件 | `index` 回卷并推进 `index2` | 改变 composite 的极坐标复制结构 |
| 8 次 16-event 回卷 | `index2` 完成循环 | 形成最长约 128-event 的超周期 |

需要注意：preset 曾给全局 `rot` 赋予一个表达式，但紧接着又把 `rot` 覆盖为 0。因此不能简单宣称“全局画布每个长周期旋转”；真正生效的是 q 状态对 shape 和 composite 重采样的影响。

### 3.3 Randomness 是 Sample-and-Hold，不是逐帧噪声

`vx/vy` 只在 2-event 边界更新，`dir` 只在 4-event 边界更新。其余帧沿用旧值，并通过积分或指数平滑形成连续运动。

这解释了 Tack Tile 的关键观感：随机值像一次“构图决定”，不是不断抖动的噪声。音乐事件决定何时换决定，连续方程负责把决定展开成运动。

### 3.4 稳定载体：175 个 additive 三角形实例

源码确认：

- shape 为三角形；
- `num_inst = 175`；
- additive blending 开启；
- 每个实例经历三维状态更新、旋转、透视投影和按深度缩放。

shape 方程写出了 Lorenz 形式：

```text
dx ∝ (y - x)
dy ∝ x(k - z) - y
dz ∝ xy - kz
```

但必须保留一个证据边界：这些方程使用的 `q14–q17` 系数，在该转换 preset 的主 frame/init 代码中没有明确赋值。因此目前只能确认“存在 Lorenz 形式的更新结构”，不能确认它在 Butterchurn 当前运行时以一组标准 Lorenz 参数工作。要下最终结论，需要运行时记录 q 值和 shape 坐标。

### 3.5 真正塑造 Tack Tile 的是强反馈重采样

重要基础参数：

- `decay = 1`；
- `zoom ≈ 0.9999`；
- 开启 warp 与 composite；
- 输入纹理包括 `sampler_main`（历史主画面）与 `sampler_blur1`（历史模糊层）。

Composite 的主要步骤：

1. 把画面坐标移到中心并校正宽高比；
2. 转为角度与逆半径形式；
3. 用 `q28` 改变角向复制密度，用 `q9` 推进连续漂移；
4. 以约 1/3 周期错开的多个 phase 重采样历史主纹理；
5. 使用数个旋转矩阵得到不同方向的历史副本；
6. 将副本与 blur 历史层组合，再以 `max` 合成；
7. 用 `bass_att / radius` 一类项向中心注入低频亮度和历史污染。

Warp shader 还对历史纹理坐标施加非线性的正切形变，并叠加低分辨率噪声。由于 `decay = 1`，画面不是靠统一淡出来遗忘，而是靠重采样、相位权重、裁切、模糊和覆盖逐步改变。

所以 Tack Tile 的“瓷砖/折叠”并不是一个 tile shader 的结果，而是：

```text
极坐标回卷
+ 多方向历史重采样
+ phase 错位
+ max 合成
+ 模糊反馈
+ 低频中心注入
```

### 3.6 它如何使用音乐

Tack Tile 并没有让每个视觉参数都连续跟随频谱。音乐主要做三件事：

1. 决定是否发生离散事件；
2. 推进 2/4/8/16-event 的状态时钟；
3. 通过 `bass_att`、峰值和少量 q 状态向历史反馈注入能量。

换句话说：**音乐更多是调度器，而不是遥控每个像素的木偶线。**

## 4. 为什么 Tack Tile 比普通 audio-reactive glitch 更成立

### 有秩序可被破坏

175 个 shape、连续漂移和历史纹理先建立稳定运动。没有载体，故障就只剩噪声。

### 一次事件会产生后果

事件改变方向或相位后，历史帧被反复折返、放大、模糊和覆盖。视觉高潮往往发生在触发之后，而不只发生在触发那一帧。

### 随机性有音乐位置

随机改变被绑定到 2/4/8/16-event 边界。即使事件检测并不是真正拍号分析，观看者仍会感到有动机、乐句和回归。

### 音乐输入很少，却没有全部压在强度上

它虽然把 bass/mid/treble 压成一个事件探测值，但后续并不是简单放大同一个效果，而是把事件送入不同周期的状态更新。

### 反馈承担了“艺术记忆”

普通 Glitch 在 envelope release 后恢复原图；Tack Tile 让损伤进入下一帧的材料本身。

## 5. Tack Tile 的局限

1. `max(bass, mid, treble)` 丢失事件来源，无法区分低频冲击、高频瞬态和宽频 onset。
2. event counter 不是可靠 beat/downbeat tracker；切分音或持续噪声可能改变视觉计数。
3. 没有 section、build、drop、climax、confidence 或 provider 概念。
4. 随机函数没有本项目要求的显式 seed/recipe 管理。
5. q 状态语义高度隐式，难以让用户在 UI 中理解和编辑。
6. 强反馈可以产生优秀结果，也容易 runaway；原 preset 没有 XML 产品级安全预算。

因此应该继承它的**时间语法和反馈因果**，而不是复制 preset 外观或照搬其输入压缩。

## 6. 转译到 Xin's Music Lab 的建议

### 6.1 用 Event Vector 替代单一 impact

```text
lowHit / midHit / highHit / broadbandOnset
fluxSpike / densityRise / sectionBoundary
```

它们可以共享时钟，但必须保留来源身份，让不同事件损伤不同空间尺度。

### 6.2 建立显式 Visual Clock

```text
micro：onset / bassPeak
motif：2 / 4 / 8 beats
structure：16 / 32 beats 或 sectionBoundary
```

如果可靠 downbeat 不可用，先使用带置信度的 visual pulse clock；不要把启发式 pulse 伪装成已确认拍号。

### 6.3 将 Sample-and-Hold 正式化为 mapping 行为

Mapping schema 应支持：

- `sampleOn`：event/beat division/section boundary；
- `holdFor`：保持周期；
- `transition`：step、slew、spring；
- `seedScope`：preset、track、section、event；
- `lock`：方向、mask、配色、feedback 等组件锁定。

### 6.4 将反馈从单个参数提升为 Memory 模型

Memory 至少应区分：

- retention：保留多少；
- contamination：新事件污染历史的比例；
- transport：历史如何移动；
- diffusion：历史如何模糊/扩散；
- reset：何时清除或恢复关键帧；
- lifetime：损伤可存活多久。

### 6.5 第一组“Tack Tile Grammar Probe”不要复制它的画面

只复现四个语法组件，并逐层 A/B：

1. Stable Carrier：连续、低强度运动；
2. Event Clock：2/4/8/16 拍推进不同状态；
3. Sample-and-Hold：方向与 mask 跨拍保持；
4. Feedback Memory：事件进入历史缓冲并逐步衰减。

四个版本使用相同音乐、相同 seed、相同初始帧：

```text
A 直接音频映射
B A + 事件门限
C B + 多级时钟/S&H
D C + 历史反馈
```

这样可以明确证明 Tack Tile 的力量究竟来自哪一层，而不是凭主观印象重写 shader。

## 7. 当前研究结论

Tack Tile 最值得继承的不是 tile、三角形、颜色或某个 warp 公式，而是下面这条生成逻辑：

> 连续系统建立秩序；音乐事件只在越过门限时改变状态；随机决定被量化到音乐周期并保持；历史反馈把一次事件扩展成可持续的画面后果。

对 Xin's Music Lab 而言，正确方向不是增加更多 Glitch 效果，而是让已有 21 个 targets 服从一个具有事件身份、多级时间、受约束随机性和跨帧记忆的艺术语法。

## 8. 后续需要实证的项目

1. 在 Butterchurn 运行时记录该 preset 的 `q14–q17`，确认 Lorenz 形式 shape 的实际参数来源。
2. 用固定音频脉冲记录 `is_beat/index/index2/vx/vy/dir`，验证跨帧和 seek 后的状态。
3. 对 Tack Tile 录制 target/event trace，区分“源码机制”和“观看时的视觉解释”。
4. 将 Grammar Probe 映射到现有 21 targets，但先运行 shadow，不接管正式舞台。
5. 继续补充现代实时 GPU 方案；AI/扩散路线单列为离线研究，不混入实时确定性主链。
