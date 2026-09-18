# Xin's Music Lab — Glitch 生成逻辑研究

记录日期：2026-06-20

## 研究目标

目标不是继续收集更多“乱闪”效果，而是建立一套原创、可解释、可复现的音乐驱动 Glitch 生成系统：音乐决定何时破坏、破坏什么、破坏多大以及破坏保留多久；随机性只负责在约束内产生差异，不替代音乐结构。

## 从 Tack Tile 学到的内容

当前 Tack Tile 对应的原始 MilkDrop 预设为：

`An AdamFX n Martin Infusion 2 flexi - Why The Sky Looks Diffrent Today - AdamFx n Martin Infusion - Tack Tile Disfunction B`

它通过 Butterchurn Presets 2.4.7 离线加载。其关键生成逻辑不是某一种“瓷砖”外观，而是以下结构。

### 1. 自适应事件检测

- 以 `max(bass, mid, treble)` 表示当前冲击。
- 维护慢速平均与会衰减的历史峰值。
- 当前冲击越过动态阈值，且距离上次触发超过约 100 ms，才产生有效 beat。
- 因此持续高响度不会无限触发，安静段落中的相对突变也有机会被识别。

### 2. 多级音乐时钟

- 每个有效 beat 推进离散状态。
- 2/4/8/16 拍承担不同尺度的方向、相位、旋转和构图变化。
- 视觉变化因此具有节拍语法，而不是只对瞬时响度作连续缩放。

### 3. Sample-and-Hold 随机性

- 随机方向和位移只在指定节拍生成。
- 两次事件之间保持随机状态，不逐帧重新抽样。
- 这使随机性获得连续性、可读性和因果关系。

### 4. 连续混沌载体

- 预设使用约 175 个三角形实例。
- 其三维运动方程具有 Lorenz 混沌吸引子的结构，再经过旋转和透视投影。
- 短时间连续、长时间分岔，产生“有机失稳”而不是白噪声运动。

### 5. 反馈重采样

- 上一帧不会立即清空，而会经历坐标扭曲、极坐标转换、纹理回卷、旋转复制与模糊后进入下一帧。
- 接近 1 的反馈衰减使一次小位移能够在后续帧中复制、折返和扩大。
- 低频还会注入中心亮度，使声音事件在历史画面中留下可见伤痕。

### 6. 核心结论

Tack Tile 的生成语法可以概括为：

> 连续运动建立秩序，离散事件破坏秩序，反馈记忆保留破坏结果。

值得继承的是状态、时钟、受约束随机性和反馈，不是它的具体 Shader 或图形外观。

## 当前 Xin's Music Lab 与 Tack Tile 的差异

当前系统的音乐感知更丰富：已经具有低中高频瞬态、响度、Flux、Onset、频谱密度、动态范围、编制与 Acid 等特征。但视觉时间结构仍弱于 Tack Tile。

主要差异：

1. 多种声学事件最终大量汇入单一 `beatStrength`，事件来源身份丢失。
2. 已有 burst、速率累积器和冷却时间，但缺少稳定的 2/4/8/16 拍视觉时钟。
3. 片段的随机位置与位移多在生成瞬间独立抽样，缺少跨拍保持的视觉动机。
4. 除 Datamosh 风格外，大部分损伤寿命结束即消失，没有成为通用的画面历史。
5. 音乐特征主要作用于后处理强度，较少改变画面拓扑和长期状态。
6. 现有随机结果不可复现，没有 Seed、参数锁定和渐进突变机制。

因此当前系统“更懂声音”，但 Tack Tile“更懂得让一次声音事件留下后果”。

## 成熟开源方案研究

GitHub 星标仅作为社区传播度的粗略参考，不等同于艺术质量。星标为 2026-06-20 查询快照。

| 路线 | 代表项目 | 核心机制 | 对本项目的启发 |
|---|---|---|---|
| 反馈方程 / 预设系统 | [projectM](https://github.com/projectM-visualizer/projectm)（约 4.3k）与 [Cream of the Crop](https://github.com/projectM-visualizer/presets-cream-of-the-crop) | FFT、beat、逐帧方程、逐像素方程、Warp/Composite Shader 与历史帧反馈 | 把视觉定义成可组合方程与状态，而不是固定效果列表 |
| 模块化视频合成 | [Hydra](https://github.com/hydra-synth/hydra)（约 2.7k） | 视频源、坐标变换、纹理调制、反馈输出形成可组合信号链 | Glitch 应是一张可生成的处理图；调制源和被调制参数分离 |
| 模拟/数字故障分类 | [KinoGlitch](https://github.com/keijiro/KinoGlitch)（约 2.8k） | 模拟侧包含扫描线抖动、色漂、垂直跳变、水平摇晃；数字侧包含块损伤、旧帧替换和色彩故障 | 先区分故障的物理语义，再决定音频如何映射，避免所有效果共享一种撕裂 |
| 帧间预测失效 | [KinoDatamosh](https://github.com/keijiro/KinoDatamosh)（约 0.5k） | 用运动矢量更新位移缓冲，复用工作帧，并模拟 DCT/压缩噪声 | 真正的 Datamosh 重点是错误运动继承与历史污染，不是随机矩形 |
| 编码数据损坏 | [jpg-glitch](https://github.com/snorpey/jpg-glitch)（约 1.2k）与 [glitch-canvas](https://github.com/snorpey/glitch-canvas)（约 0.7k） | 在 JPEG 头之后按 seed、amount、iterations 修改编码字节，再重新解码 | Seed 与迭代次数天然形成可复现“配方”；但逐帧 JPEG 编解码不适合实时主渲染 |
| 内容门控重排 | [pixelsort](https://github.com/satyarth/pixelsort)（约 0.9k） | 先按亮度阈值、边缘、波形或随机区间划分，再在区间内按亮度等指标排序 | 最重要的不是排序，而是“在哪里允许排序”的 mask；音乐可控制阈值与区间而非直接控制全部像素 |
| 模拟信号失锁 | [Bad TV Shader](https://github.com/felixturner/bad-tv-shader)（约 0.5k） | 多尺度 Simplex noise 控制横向偏移与垂直滚动 | 连续低频噪声适合表示漂移，稀疏阈值事件适合表示失锁；两者不应混为同一随机源 |
| 预设混合/生成 | [MilkDrop2077](https://github.com/milkdrop2077/milkdrop2077) | 分别从不同预设抽取 Wave/Shape、Per-Frame、Per-Pixel、Warp、Composite 模块，并在限定百分比内扰动数值和颜色 | 随机生成应在模块边界上重组，并允许只重生成某一层；完全无约束的参数随机化容易产生大量废品 |

### 各方案的关键逻辑

#### Hydra：调制图而不是效果菜单

Hydra 将 oscillator、camera、previous output 等都视为纹理源；`modulate` 使用调制纹理的红绿通道改变基底纹理的 x/y 坐标。反馈只是把输出重新作为输入。它说明：我们的随机生成器应该生成一张小型处理图，而不只是生成若干数值。

#### KinoGlitch：先定义“故障来自哪里”

- Analog：扫描同步不稳、垂直保持失锁、色彩通道漂移。
- Digital：噪声纹理通过阈值产生位移 mask、旧帧替换 mask 和颜色 mask。

同一个噪声场可产生相关但不同的故障层；通过阈值控制故障稀疏度。这比为每一层独立调用随机数更统一。

#### KinoDatamosh：错误地相信上一帧

它维护位移缓冲和工作帧，以运动矢量追踪画面；当缓冲不重置或运动被错误传播时，旧内容沿错误轨迹侵入新帧。其本质是“预测模型没有及时获得关键帧”。音乐映射应控制关键帧丢失、运动继承、污染时间和重置，而不仅是位移幅度。

#### Pixel Sorting：先分区，再破坏

Pixel Sorting 只对由阈值、边缘或 mask 划定的区间排序。排序方向、排序键、阈值、区间长度和漏排概率彼此独立。对应音乐时：编制密度决定 mask 覆盖率，响度决定阈值，高频决定区间细度，节拍决定排序何时推进。

#### JPEG Glitch：可复现的数据层损坏

它保留文件头，在安全范围内选择编码字节位置，按 amount 修改字节，并执行有限次迭代。其启发不是实时使用 JPEG，而是保留 `seed + amount + iterations` 的配方思想，并区分结构保护区与允许破坏区。

#### MilkDrop2077：结构级 Mashup

它不是只随机几个滑块，而会分别选择 Wave/Shape、Per-Frame、Per-Pixel、Warp 和 Composite 的来源，再按概率对可编辑数值作有界扰动；也允许仅混合 Warp+Composite。它证明随机生成器需要模块锁定、来源记录和有限变异。

## 口碑较好方案的共同结构

### 1. 都有一个稳定载体

原始视频、历史帧、几何场或排序区间在破坏前已经具有结构。优秀 Glitch 很少从空白画布直接生成纯噪声。

### 2. 破坏发生在明确边界

- JPEG：文件头之后的编码数据。
- Pixel Sorting：阈值或边缘定义的区间。
- Digital Glitch：噪声超过阈值的块。
- Datamosh：关键帧与预测帧之间。
- MilkDrop/Hydra：反馈链和坐标映射中。

故障之所以可读，是因为画面仍保留“未损坏部分”作为参照。

### 3. 随机性被门控和保持

随机数通常先生成一个场、mask、seed 或状态，再在一段时间内保持；它不会让每个像素、每一帧毫无关联地重新抽样。

### 4. 具有跨帧记忆

反馈、旧帧、运动矢量、工作缓冲或渐进排序，使当前画面包含过去事件。没有记忆的效果更接近滤镜，而不是系统性 Glitch。

### 5. 同时存在多种空间尺度

大尺度负责构图位移，中尺度负责块和切片，小尺度负责扫描线、DCT、颗粒与色差。只有一个尺度会显得单薄；所有尺度同时满载会失去重点。

### 6. 参数具有相对独立的语义

Damage、Memory、Scale、Density、Direction、Color Error、Clock Division 应尽量正交。一个 Acid 权重同时无上限地提高亮度、速度、色相、数量和位移，会使结果不可调。

### 7. 生成依靠约束组合而非纯随机

成熟生成器从兼容模块中选择、锁定部分模块、记录 Seed，并只做有限突变。艺术质量来自约束空间，不来自随机范围足够大。

## 拟议的原创 Glitch 架构

```text
Audio Features
  loudness / low-mid-high events / flux / density / ensemble / acid
        ↓
Event Vector
  lowHit / midHit / highHit / densityRise / acidSpike / broadbandOnset
        ↓
Music Clock & Section State
  phase / 2-4-8-16 beats / BUILD-HOLD-BURST-VOID-RECOVER
        ↓
Glitch Genome
  topology / mask / scale / direction / color rule / feedback / mutation
        ↓
Renderer Graph
  carrier → coordinate damage → block/data damage → history feedback → grade
        ↓
Frame History
  current damage + warped previous state × memory
```

### Glitch Genome 建议字段

```js
{
  seed,
  carrier,
  topology,
  maskType,
  clockDivision,
  symmetry,
  direction,
  macroScale,
  microScale,
  damage,
  memory,
  displacement,
  colorRule,
  mutationRate
}
```

### 随机生成器规则

1. 使用 Seeded PRNG，结果可复现。
2. 允许锁定配色、拓扑、反馈、节奏语法和 mask。
3. “重新生成”生成整套 Genome；“突变”只改变少数未锁定字段。
4. 微观随机由瞬态触发，节拍随机在 2/4/8 拍边界触发，结构随机只在 16/32 拍或段落边界触发。
5. 随机值采用 Sample-and-Hold；连续参数在旧值和新值之间平滑迁移。
6. 使用兼容性规则排除坏组合，例如高 feedback + 全屏 mask + 高频 mutation 不允许同时达到最大值。
7. 每个 Genome 记录来源、Seed、用户锁定项和音乐权重，便于保存为用户预设。

## Demo.9 已实装的第一阶段

- 新增纯逻辑 `glitch-engine.js`，把包络、张力、节拍约束和释放事件从 Canvas 绘制中分离，可在 Node 中用合成音乐特征独立测试。
- 基础层连续调整当前场景：响度映射亮度、频率丰富度映射饱和度、动态范围映射对比度。
- 底噪层由平坦度、高频能量、flux 与 Acid 共同驱动；图样采用 Sample-and-Hold，仅在音乐信息变化时刷新，不再逐帧随机。
- 爆发层区分 micro 与 macro：micro 跟随有效瞬态，macro 需要张力越阈、高潮瞬态或抽空事件，并设置独立最小间隔。
- 渲染器根据主导信号选择横向撕裂、块位移、切片拉伸或同步丢失；资源数量受 Auto / Eco / High 质量预算限制。
- 这一阶段尚未加入历史帧反馈和 Genome 随机生成器；它们继续保留为 JPEG 支线后的下一阶段。

## 下一轮需要继续更新的认知

1. 音乐时钟应依赖实时 beat tracker，还是使用现有 onset 建立宽容的“视觉脉冲时钟”。
2. 通用历史缓冲应采用半分辨率 Canvas 2D，还是直接建立 WebGL ping-pong framebuffer。
3. Pixel Sorting 是否只在 burst 时对低分辨率历史纹理执行，以控制性能。
4. Genome 的模块兼容性是人工规则表，还是以后从用户收藏结果中学习。
5. 段落状态对 Damage、Memory 和 Mutation 的具体控制曲线。
6. 如何定义“留白预算”：同一时刻允许多少空间和多少故障层处于活动状态。

## 许可证边界

- 当前研究用于理解架构和视觉机制，不等于复制源码。
- Hydra 为 AGPL-3.0；projectM 为 LGPL-2.1；其他项目许可证各异，真正引入任何运行时代码前必须单独复核许可证与分发义务。
- 本项目优先独立实现共同原理，并在文档中保留灵感来源和第三方归属。
