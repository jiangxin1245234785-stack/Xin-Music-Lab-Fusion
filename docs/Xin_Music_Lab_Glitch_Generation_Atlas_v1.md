# Xin's Music Lab：Glitch 生成机制图谱 v1

研究快照：2026-07-16  
范围：Tack Tile 之外，可用于音乐可视化的模拟信号、数字压缩、时间缓存、程序化场、物理系统、人工生命与神经生成方案。  
判断基线：当前 Fusion 已有统一音乐帧、事件映射、Visual Clock / Sample-and-Hold 语法、seed、TargetMixer、安全层、WebGL2 ping-pong feedback 与可选 GLSL pass；本报告不建议另建一套音频引擎。

## 0. 结论先行

可以借鉴的 Glitch 方案很多，但不应继续以“效果名称”组织它们。真正可持续的分类方式是：**哪一种介质或系统失灵了，它如何留下后果，以及音乐在什么时候获得破坏权。**

本轮共整理出 16 类机制。对 Xin's Music Lab 最有价值的不是再增加 16 个开关，而是补上三个目前尚弱的视觉器官：

1. **Temporal Reservoir / 时间蓄水池**：不只保留上一帧，而是保留 8–16 个历史切片，让每个像素选择自己的“年龄”。
2. **Raster Deflection / 扫描偏转**：把图像亮度、音频波形和控制场接入水平/垂直扫描结构，让画面从“贴图”变成可弯曲的电子表面。
3. **State Field / 状态场**：用 reaction-diffusion、流体或 cellular automata 让损伤扩散、相撞、结疤、修复，而不是在 envelope 结束时立即消失。

最推荐的下一项实验是：

> **Temporal Excavation / 时间考古**  
> 8 帧低分辨率历史纹理 + 逐像素 age field + Visual Clock 量化更新 + section boundary 局部刷新。

它最直接地继承 Tack 的时间语法，却不会复制 Tack 的极坐标瓷砖外观；同时会为后续 datamosh、多延迟反馈和“旧画面侵入现在”提供共用基础设施。

## 1. 艺术判断：Glitch 不是持续的脏，而是介质规则被打破

Rosa Menkman 对 glitch 的讨论一直在强调 artifact、failure、noise、技术介质与文化语境之间的张力；当一种故障被固定成可随时调用的滤镜，它也会从“断裂”变成惯例。[The Glitch Moment(um)](https://networkcultures.org/blog/publication/no-04-the-glitch-momentum-rosa-menkman/)

对本项目最实用的翻译是：

```text
先让观众理解这套画面的正常秩序
→ 事件打破某条具体规则
→ 错误进入历史或状态场
→ 系统恢复、变异，或进入新的秩序
```

因此，优秀的 Glitch 生成器至少包含：

```text
Medium Model      介质模型：扫描、缓存、压缩、扩散、代理……
Damage Operator   损伤算子：丢失、错位、污染、重排、偏转……
Temporal Grammar  时间语法：何时触发、保持多久、何时换规则……
Memory            后果：旧帧、状态场、错误传播、修复……
Recovery Policy   恢复策略：关键帧、局部刷新、衰减、再生……
```

Tack 的强项主要在 Temporal Grammar + Memory。本轮研究要补的是更多 Medium Model 与 Recovery Policy。

## 2. 机制图谱总览

| # | 机制族 | 真实逻辑 | 最适合表达 | 当前管线适配 |
|---|---|---|---|---|
| 1 | 多抽头反馈 / Delay Network | 同时读取多个不同年龄的历史帧，再做变换与混合 | 回声、拖影、记忆和复调 | 高 |
| 2 | 逐像素时间位移 / Time Machine | 控制纹理决定每个像素读取哪一层历史 | 时间撕裂、过去侵入现在 | 高，需帧环形缓存 |
| 3 | Motion-field Datamosh | 用一段运动场搬运另一段视觉内容 | 运动继续、身份错位 | 中，需运动场 |
| 4 | 丢包与错误隐藏 | 缺失块由旧帧、邻块或错误运动矢量补偿，并向后传播 | 网络故障、冻结、伤口扩散 | 高，可模拟 |
| 5 | 复合视频 / NTSC / VHS | RGB 经亮度/色度带宽、相位、扫描与磁带误差链 | 模拟信号失真、色度漂移 | 高，多 pass |
| 6 | CRT Raster Deflection | 直接调制 H/V 扫描斜坡、位置、尺度和强度 | 电子雕塑、亮度地形 | 高，片元近似或线网格 |
| 7 | DCT / 频带系数损伤 | 8×8 块变换后丢弃、量化、换位不同频率系数 | 真正的数字块、频带断裂 | 中，多 pass |
| 8 | 位平面 / 调色板 / 抖动 | 破坏颜色的离散表示、位权与误差分配 | 数字阈值、色阶崩塌 | 很高 |
| 9 | Pixel Sort / Local Rank | 先由 mask 切出区间，再按亮度/色相局部排序 | 内容门控的拉丝和重排 | 中；全局精确排序代价高 |
| 10 | Field Modulation / Domain Warp | 一张纹理不作为画面，而作为另一张画面的坐标场 | 局部变形、空间调制 | 很高 |
| 11 | Vector Advection / Fluid | 速度场搬运颜色、损伤与历史 | 流动污染、旋涡记忆 | 中，多 pass |
| 12 | Reaction-Diffusion | 两个局部反应/扩散的状态量产生斑点、波和分裂 | 生长、腐蚀、结痂 | 高，低分辨率 ping-pong |
| 13 | Cellular Automata / Lenia / NCA | 每个单元只看邻域，却能形成持久、再生的整体 | 损伤生命体、修复行为 | 中，规则设计较难 |
| 14 | Agent / Physarum | 大量局部代理沉积并追随场，形成网络 | 神经状路径、运输与愈合 | 中，需代理模拟 |
| 15 | Luma Geometry / Point Scan | 把亮度变成深度、点云、线条或表面位移 | 图像实体化、扫描地貌 | 高，需几何 pass |
| 16 | Streaming Neural Generation | 扩散/风格网络将当前帧转译成新的语义图像 | 梦境化、身份和场景变异 | 低，适合作为侧链 |

另有一个跨越所有机制的第 17 项：**Glitch Genome / 处理图变异**。它不是某一种外观，而是有约束地选择、连接和突变上述机制，同时锁定 seed、拓扑、时间、颜色与恢复策略。

## 3. 时间类：最值得先做

### 3.1 多抽头反馈：把一帧历史升级成“延迟网络”

当前 ping-pong feedback 主要回答“上一帧保留多少”。更深的方案是缓存一组历史帧，并同时读取 `t-1 / t-2 / t-4 / t-8 / t-16`：

```text
out(t) = fresh(t)
       + w1 · transform(history[t-1])
       + w2 · transform(history[t-4])
       + w3 · transform(history[t-8])
```

TouchDesigner 的 Cache TOP 将图像序列保存在 GPU 中，可延迟、回放、冻结和重新索引；ISF 则把 `PERSISTENT` buffer 与 multi-pass 作为正式 shader 能力，可以在不同分辨率的 pass 间保存和再读纹理。[Cache TOP](https://docs.derivative.ca/Cache_TOP)；[ISF persistent buffers / multi-pass](https://docs.isf.video/ref_multipass.html)

这不是普通拖影。多个 delay tap 可以像音乐中的复调一样，各自拥有旋转、缩放、颜色和损伤寿命。映射上应让：

- `bassPeak` 打开较老、较重的历史 tap；
- `highHit` 只打开短延迟和高频 RGB/bitplane tap；
- `pulse4 / pulse8` sample-and-hold tap 权重或方向；
- `sectionBoundary` 只刷新部分 tap，避免全部清空。

接入成本：低到中。它复用现有 feedback，但需要纹理环形缓存与显存预算。

### 3.2 Time Machine：让每个像素拥有不同的时间

TouchDesigner 的 Time Machine TOP 把图像序列放进 3D texture，并由第二张单色图逐像素决定时间偏移：黑色可指向最老层，白色可指向最新层。它不是空间 morph，而是沿时间维度 warp。[Time Machine TOP](https://docs.derivative.ca/Time_Machine_TOP)

转译到 Fusion：

```text
history[] = 最近 N 帧
ageField(x,y) ∈ [0,1]
index(x,y) = round(ageField · (N-1))
out(x,y) = history[index(x,y)](x,y)
```

`ageField` 可以来自：

- 亮度、边缘、频谱形状；
- 当前 damage mask；
- Voronoi / noise 低分辨率控制场；
- Visual Clock 上 sample-and-hold 的块级随机值；
- reaction-diffusion 的状态纹理。

这会产生一种比普通 feedback 更清楚的因果：同一画面中，有的区域活在现在，有的区域停在 2 拍前，有的区域从更早的段落被挖出来。

它特别适合本项目，因为音乐可以控制“时间选择”，而不是直接控制颜色或位移。它也是本报告的 P0 实验。

### 3.3 Motion-field Datamosh：让错误内容服从正确运动

真正 datamosh 的关键不是块状外观，而是**运动信息与图像身份被错配**。FFglitch 会延长 P-frame 区间、避免 I-frame 清除故障，并按宏块修改 forward/backward motion vectors；其教程明确指出 I-frame 会“deglitch”，而运动矢量按宏块行列组织。[FFglitch motion-vector tutorial](https://ffglitch.org/2020/07/mv.html)

更适合实时图形的版本是 optical-flow datamosh：先计算视频运动场，再用这个场持续 remap 一张不属于该运动的图像；位移产生的孔洞由当前画面补入。SIGGRAPH Asia 2023 的方法给出了这个迭代结构，并避免直接损坏编码流。[Datamoshing with Optical Flow](https://yaksoy.github.io/papers/SIGa23p-Datamosh.pdf)

```text
flow(t)     = motion(current[t-1], current[t])
stale(t)    = remap(stale[t-1], flow[t])
holeMask(t) = remap(holeMask[t-1], flow[t])
out(t)      = stale(t) where valid, otherwise current(t)
```

音乐映射建议：

- onset：决定是否拒绝“关键帧刷新”；
- bassPeak：提高旧内容继承量；
- flux：放大 flow 或注入旋涡；
- sectionBoundary：选择 freeze、flush、reverse-coalesce 三种恢复动作；
- motion confidence：低可信时退回 block flow，而不是制造随机矢量。

当前最现实的第一版不是上神经光流，而是 quarter-resolution frame-difference gradient / block matching，或由 Generator 自己提供已知速度场。TouchDesigner 的 Optical Flow TOP 说明 motion field 可用 RG 分别编码 x/y 速度，并能输出不确定度；其当前硬件实现也提醒我们，高质量光流可能有明显平台成本。[Optical Flow TOP](https://docs.derivative.ca/Optical_Flow_TOP)

## 4. 模拟信号类：从“画面”转向“电子材料”

### 4.1 Rutt/Etra Raster Deflection：优先级与 Time Machine 并列

Rutt/Etra Scan Processor 不是给画面贴扫描线，而是截获黑白监视器的 H/V sweep signals，再用外部控制电压、乘法器和加法器调制扫描。它可以改变位置、尺度、强度、zoom 和旋转；“Vasulka Effect”把视频亮度接到垂直位置，使亮处把扫描线向上拉，形成亮度决定高度的三维等高表面。[Rutt/Etra Scan Processor archive](https://vasulka.org/Kitchen/PDF_Eigenwelt/pdf/p136-139.pdf)

对 Fusion 有两条实现路线：

1. **片元近似版**：以 H/V ramp、luma 和控制场重写采样坐标；成本低，可先验证音乐映射。
2. **线网格版**：把画面渲染成 256–512 条水平 line strip，顶点高度由采样亮度与音频波形决定；更接近真正 scan processor。

建议参数不是“glitch amount”，而是：

```text
raster.hDeflection
raster.vDeflection
raster.axisCrossCoupling
raster.lumaElevation
raster.syncLock
raster.freeRunRate
raster.scanDensity
```

音乐映射：低频控制垂直“重量”，中频控制 H/V cross-coupling，高频控制扫描密度或强度闪烁；`pulse8` 更换自由运行 waveform，section boundary 决定重新锁相还是短暂失锁。

这条路线的艺术价值很高：它不会长得像 Tack，也不会落入常见 VHS overlay；它把音频—视觉映射直接落实到一套历史上真实存在的电子图像语法。Paik–Abe Video Synthesizer 同样说明了视频信号可以被视为可实时调制的电子材料，而不是不可触碰的成品图像。[ICC: Abe Video Synthesizer](https://www.ntticc.or.jp/en/archive/works/abe-video-synthesizer/)

### 4.2 Composite / NTSC / VHS：应该模拟信号链，不模拟贴纸

`ntsc-rs` 的价值在于它明确区别于 LUT、灰尘 overlay 和简单色偏：它依据 NTSC 传输与 VHS 编码过程建模，并通过多线程/SIMD 达到大部分实时处理。[ntsc-rs](https://ntsc.rs/)；[source repository](https://github.com/ntsc-rs/ntsc-rs)

适合 WebGL2 的精简信号链：

```text
RGB
→ YIQ / YUV
→ luma/chroma 分离
→ chroma 降带宽与相位误差
→ line timing jitter / time-base error
→ dropout / head-switch 区域
→ YIQ / YUV 回 RGB
```

可映射参数：

- `highHit → chromaPhaseJitter`
- `sharpness → chromaBandwidth`
- `bassPeak → lineTimingJitter / verticalHold`
- `fluxSpike → dropout spawn`
- `sectionDrive → tracking instability`

优点是成本可控、机制清晰；缺点是 VHS 已经非常常见，若把它当主视觉容易成为怀旧风格包。建议把它作为“介质皮肤”或微观层，而不是整个 Generator 的构图核心。

### 4.3 Sync Loss 与受控失锁

模块化视频合成的重要经验是：同步信号与画面信号可以分离，先让画面被处理，再重新编码稳定同步；这使“可控的危险”成为可能。LZX 对视频合成的定义也强调模块、宽带控制电压和可自由互调的图像/振荡器信号。[LZX: Learn Video Synthesis](https://lzxindustries.net/getting-started/learn)

所以本项目的 `syncLock` 不应是普通强度：

```text
1.0  完全锁相，只有图像内容受损
0.7  允许局部行相位漂移
0.3  允许垂直 roll / free-run，但仍有边界保护
0.0  仅在短 burst 中允许完全失锁
```

安全层必须限制失锁持续时间和亮度，避免整段作品持续“看不见”。

## 5. 数字压缩与离散表示

### 5.1 DCT Coefficient Damage：比随机方块更接近“数字介质”

JPEG 类块变换会把每个 8×8 区域表示成一组频率系数；libjpeg API 允许直接读取和写回 DCT coefficient arrays，说明系数域本身就是可操作层。[libjpeg-turbo documentation](https://libjpeg-turbo.org/Documentation/Documentation)；[libjpeg API: raw DCT coefficients](https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/main/doc/libjpeg.txt)

实时 shader 不必真的编码 JPEG。可以在半分辨率做 separable 8×8 DCT：

```text
tile RGB → YCbCr → DCT
→ coefficient mask / quantization / sign flip / band swap
→ inverse DCT → composite
```

不同损伤有不同语义：

- 丢 DC：整块亮度失去基准；
- 丢高频：块变平、细节消失；
- 放大中频：出现结构性振铃；
- 交换 Cb/Cr 系数：色度块拥有错误边缘；
- 跨块搬运 coefficient band：结构像被编码系统错误引用。

音乐映射不应逐帧随机改 64 个系数。建议 `pulse2` 选择一个 band mask 并保持，`highHit` 破坏高频，`bassPeak` 破坏 DC/低频，`sectionBoundary` 更换量化矩阵。它会比当前 block displacement 更有“编码介质的理由”。

### 5.2 Packet Loss / Error Concealment：把“修复算法失败”变成艺术动作

视频丢包不只产生坏块；解码器通常尝试从邻块、旧帧或运动补偿中隐藏缺失，错误还可能传播到后续帧。NIST 的 H.264 研究区分宏块丢失与整帧丢失，并使用运动矢量外推恢复缺失帧。[NIST: Hybrid Frame Concealment](https://www.nist.gov/publications/hybrid-frame-concealment-algorithm-h264avc)

这启发一个很适合本项目的 `Concealment Failure` 模型：

```text
lossMask 选择缺失块
repairMode ∈ {freeze-old, neighbor-smear, wrong-motion, flat-fill}
confidence 决定修复混合比例
errorLifetime 决定错误传播多少帧
keyframePulse 结束或重构损伤
```

它比“block probability + displacement”多了最关键的一层：系统先试图修好，再以一种可辨认的方式修错。

### 5.3 Bitplane / Palette / Dither：低成本的微观数字语言

这组机制对 WebGL2 非常友好：

- 对 8-bit channel 做 bitplane isolate、xor、rotate 或 stuck-bit；
- 动态改变 palette bins；
- 用 Bayer ordered dither 或蓝噪声控制量化边界；
- 在事件间保持位掩码，不逐帧闪烁。

它的角色应是微观层：highHit 改变低位或色度位，bassPeak 破坏高权重位，sectionBoundary 才允许更换整套 palette。单独使用不够构成作品，但它很适合作为 DCT、Time Machine 或 Raster 的末端材料化 pass。

### 5.4 Pixel Sort / Local Rank：可用，但不应成为主方向

Pixel sorting 的真正机制是：先由阈值、边缘或 mask 找到可排序区间，再在区间内按亮度、色相等排序。开源实现常按纵向和横向区间处理，并让 threshold 决定 interval border。[pixelsort](https://github.com/satyarth/pixelsort)

问题是：

- 视觉语言已非常普遍；
- 全行精确排序不适合普通 WebGL2 fragment pipeline；
- 如果没有时间语法，很快变成“拉丝滤镜”。

如要采用，建议只做 `Local Rank Burst`：8/16/32 像素有限窗口，odd-even compare/swap 多 pass，且只在事件 mask 内运行。这样排序是一次段落动作，而不是常驻外观。

## 6. 控制场、反馈与空间重排

### 6.1 Field Modulation：标量 target 之外必须有“控制纹理”

Hydra 把 modulation 与 blend 分开：blend 合并颜色，modulate 则让一张纹理的颜色影响另一张纹理的几何；同一个 modulator 可以控制 rotate、scroll、scale 或 hue warp。[Hydra modulation](https://hydra.ojack.xyz/docs/docs/learning/video-synth-basics/modulate/)

这对当前架构的含义非常直接：21 个标量 target 能控制全局量，但无法描述“左上角活在过去、右下角发生偏转、边缘区域开始腐蚀”。下一阶段需要一个低分辨率 `FieldBus`：

```text
field.damage       损伤发生在哪里
field.age          每个像素读取多老的历史
field.motion       RG = x/y 速度
field.rank         排序区间或方向
field.reaction     生长/修复状态
field.confidence   该区域控制是否可信
```

Field 不需要进入 `UnifiedMusicFrame`。它是 Generator / renderer 派生出的视觉控制材料，仍由统一音乐事实和 visual clock 调度。

### 6.2 Recursive Feedback：从单链升级成有类型的反馈

Feedback 不能只有 retention。至少应区分：

```text
transport    历史如何移动
diffusion    历史如何扩散
composition  add / max / min / difference / screen
contamination 新事件如何进入历史
reset        关键帧、局部刷新或软恢复
lifetime     错误可以活多久
```

TouchDesigner 的 Feedback TOP 本质上把下游处理结果作为上一帧重新送回环路；环内的 transform 决定反馈是缩放、旋转、模糊还是移动。[Feedback TOP](https://docs.derivative.ca/Feedback_TOP)

本项目应把反馈做成“typed memory”，而不是把所有历史行为折叠进一个 decay。

### 6.3 Quadtree / Voronoi / Tile Permutation

空间分割本身不是 glitch，但它可以定义“哪一块共享同一时间、速度或修复策略”：

- Voronoi cell：有机、非规则的故障边界；
- quadtree：按图像复杂度递归分块；
- scan band：遵循模拟扫描结构；
- codec tile：遵循 8×8 / 16×16 编码结构；
- semantic mask：人物、字幕、边缘拥有不同介质规则。

Hydra 将 oscillator、noise、Voronoi、shape、threshold 和 pixelate 都视为可组合纹理源，这个“mask 也是生成器”的思想比复制其某个效果更重要。[Hydra textures](https://hydra.ojack.xyz/docs/docs/learning/guides/textures/)

## 7. 物理系统与人工生命：让损伤有自己的时间

### 7.1 Reaction-Diffusion：最适合做“损伤生物学”

Gray–Scott 模型用两个化学浓度、扩散率、feed 与 kill 参数产生斑点、波、碰撞、分裂和稳定图案。其局部交互天然适合并行网格实现。[MIT Gray–Scott model](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/)

在本项目里，不应让 reaction-diffusion 直接取代画面，而应作为 damage mask 的状态引擎：

```text
event 在 field 中“种下伤口”
→ 伤口扩散、分裂、相撞
→ mask 决定哪些区域读取旧帧、偏转或破坏 DCT
→ healRate 让画面结痂或恢复
```

建议映射：

- `bassPeak → seed radius / feed`
- `flux → kill / instability`
- `spectralDensity → diffusion ratio`
- `sectionDrive → reaction steps per frame`
- `sectionBoundary → mutation or partial sterilization`

用 128×72 或 192×108 的 RG16F ping-pong texture 即可开始，视觉上再双线性放大。它的强项是后果和修复；风险是参数区间敏感，需要 curated regimes，不能把完整化学参数直接暴露给普通用户。

### 7.2 Fluid / Vector Advection：让损伤被流场携带

GPU fluid 的核心不是“烟雾效果”，而是把 velocity、pressure、dye 等状态存进纹理，通过 advection、diffusion、force 与 projection 多步更新。GPU Gems 给出了完全在 GPU 上运行的稳定 2D fluid 结构，并解释了 velocity field 如何搬运其他量。[GPU Gems: Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)

对 Glitch 最有用的是简化版 advection：不必完整求不可压缩流体，先让一个低分辨率 RG velocity field 搬运 `damage / age / color residue`。这会产生“污染被音乐推走”的感觉。

完整 fluid 成本较高，建议放在 Motion Mosh 之后；如果 motion field 与 fluid field 使用同一 RG contract，两者可以共享 renderer 基础设施。

### 7.3 Cellular Automata / Lenia / Neural CA：损伤可以再生

Lenia 把 cellular automata 扩展到连续状态、连续空间和连续时间，能产生具有生命感的持续形态。[Lenia paper](https://arxiv.org/abs/1812.05433) Growing Neural Cellular Automata 更进一步展示了局部规则如何学习生长、保持并在受损后再生目标形态。[Growing Neural Cellular Automata](https://distill.pub/2020/growing-ca/)

这条路线的独特价值是 Recovery Policy：

```text
普通 glitch：damage → decay → 消失
人工生命 glitch：damage → 应激 → 重组 → 形成新稳定态
```

短期不建议在 Fusion 内训练模型；可以先用固定 CA / Lenia kernel，或离线生成规则集，运行时只做确定性迭代。它属于 P2 研究，不是第一项开发。

### 7.4 Agent / Physarum：网络式的故障与修复

Physarum-inspired agent systems 让代理追随并沉积化学场，从简单局部规则形成运输网络、斑点、条纹和修复行为。它可以让“损伤”像神经或霉菌一样寻找通路，而不是均匀扩散。[Physarum transport-network research record](https://uwe-repository.worktribe.com/output/980579/characteristics-of-pattern-formation-and-evolution-in-approximations-of-physarum-transport-networks)

它非常独特，但需要代理状态、沉积纹理和扩散 pass。更适合未来做一个独立 Generator carrier，再由 Glitch 系统破坏，而不是近期的通用 post-FX。

## 8. 几何类：把二维图像重新物质化

### 8.1 Luma Topography / Point Scan

这类机制与 Rutt/Etra 同源，但更自由：

- 把像素亮度变成 z-depth；
- 以点云、横向扫描线或网格重新绘制；
- 让音频控制视角、采样间隔、点寿命和 depth gain；
- 让缺失块成为真正的几何孔洞。

它适合当前的 LED 频谱、镜像频谱和波形 Generator，因为这些载体本身已经有清楚结构。Glitch 不再是最后一层纹理，而是改变载体的拓扑。

### 8.2 Geometry Tear / Topology Mutation

对网格或实例系统，可进行：

- index buffer 错配；
- 顶点邻接重连；
- 局部坐标系冻结；
- instance transform 在事件边界交换；
- 一部分顶点读取旧时刻的位置。

这一方向非常适合 Glitch Genome，但它要求 Generator 暴露几何层，不应硬塞进通用 post-FX。建议在未来每个 Generator 自己声明可损伤的 topology hooks。

## 9. 神经生成：可借鉴，但只作为侧链

StreamDiffusion 通过 stream batch、Residual CFG、similarity filter、I/O queue 与 KV cache 等手段降低扩散流水线成本；其公开 RTX 4090 基准在特定 512×512、特定模型/步数下可达到实时 img2img，但这不是普通硬件或任意模型的保证。[StreamDiffusion](https://github.com/cumulo-autumn/streamdiffusion)

StreamV2V 用 feature bank 保存过去帧特征，再在新帧 attention 中使用这些历史特征，以提升连续流的时间一致性；公开页面报告 A100 上 20 FPS。[StreamV2V](https://jeff-liangf.github.io/projects/streamv2v/) 更新的 StreamDiffusionV2 继续使用 rolling KV cache、motion-aware noise 与调度器，但其高端多 GPU 基准进一步说明：这更像独立生成服务，不像轻量 WebGL post-FX。[StreamDiffusionV2](https://streamdiffusionv2.github.io/)

所以 AI 的正确接法是：

```text
Fusion 主链：60 fps、确定性、低延迟
AI sidecar：4–12 fps 生成 semantic / latent / keyframe texture
Fusion：用 Time Machine、feedback、flow 在两次 AI 帧之间继续运动
```

音乐只在 section boundary 改 prompt regime / style embedding；连续强度只轻调 denoise 或 blend。否则语义会随频谱抖动，既不稳定也不“懂音乐”。

AI 的优点是语义突变；缺点是因果难读、显存竞争、平台依赖、seed 仍不完全等价于逐帧可复现。它属于 P3 可选模块，不能成为 Glitch 系统的基础。

## 10. 音乐到介质故障的映射原则

不要让所有输入都控制 `amount`。让不同音乐事实获得不同的“介质权限”：

| 音乐事实 / 派生控制 | 更合适的视觉职责 | 不建议 |
|---|---|---|
| `bassPeak` | 重块、DC/低频系数、垂直偏转、旧帧继承、伤口 seed | 同时放大所有 FX |
| `midHit` | H/V cross-coupling、结构旋转、局部 topology、排序方向 | 只做色相 |
| `highHit` | chroma phase、bitplane、高频 DCT、短延迟 tap | 大尺度画面跳跃 |
| `onset` | spawn / freeze / refuse-keyframe 的一次事件 | 连续 retention |
| `fluxSpike` | flow turbulence、reaction instability、mask 扩张 | 稳定颜色基调 |
| `spectralDensity` | damage field 的空间密度、扩散/网格细度 | 触发次数 |
| `buildEnergy` | 历史深度、error lifetime、reaction steps | 每帧重新随机拓扑 |
| `sectionBoundary` | partial flush、keyframe、topology mutation、介质切换 | 普通一帧闪光 |
| `chordConfidence` | 颜色与几何秩序的稳定度 | 直接控制 glitch 强度 |
| `pulse2/4/8/16` | sample-and-hold 方向、mask、规则与恢复策略 | 冒充真实 downbeat |

统一时间层：

```text
continuous  音量、频谱、流场：维持载体与压力
micro       onset / bassPeak：产生局部伤口
motif       pulse2 / 4 / 8：保持并更换损伤决定
structure   pulse16 / sectionBoundary：刷新介质规则或恢复策略
```

## 11. 对当前 Fusion 架构的真正要求

### 11.1 保留现有控制链，不建立第二套音频映射

```text
UnifiedMusicFrame
→ VisualClock / NodeGraph / mappings
→ TargetMixer + Safety
→ scalar targets + field targets
→ PassGraph
→ WebGL2 renderer
```

### 11.2 新增 FieldBus，而不是无限增加全局滑杆

最小 contract：

```ts
interface VisualFieldFrame {
  damage: TextureRef;      // R
  age?: TextureRef;        // R
  motion?: TextureRef;     // RG
  state?: TextureRef;      // RGBA, reaction / CA
  confidence?: TextureRef; // R
  epoch: number;
  seed: number;
}
```

这些纹理是视觉派生状态，不进入音乐事实 contract。

### 11.3 新增 TemporalReservoir

功能边界：

- 8–16 层 ring buffer；
- 支持 full / half / quarter resolution；
- 支持 nearest / linear temporal sampling；
- transport epoch、seek、preset change 时有明确 reset；
- 可部分刷新，不只有 clear all；
- 报告显存与 frame cost。

WebGL2 可用 texture array / 3D texture，或一组固定 2D texture 实现。第一版优先 8 层 half-resolution，先把成本封顶。

### 11.4 新增有声明的 PassGraph

ISF 的 persistent buffer、不同 pass 分辨率和 `PASSINDEX` 说明，多阶段图像效果需要正式的 pass 元数据，而不是把所有逻辑塞进一个 fragment shader。[ISF multi-pass reference](https://docs.isf.video/ref_multipass.html)

建议内部 manifest：

```json
{
  "passes": [
    {"id":"age-field", "scale":0.25, "persistent":true, "format":"r16f"},
    {"id":"history-select", "scale":0.5, "history":8},
    {"id":"composite", "scale":1.0}
  ]
}
```

无需立刻兼容完整 ISF，但可借鉴它对 persistent、float、width/height 和 pass 顺序的声明方式。

### 11.5 Safety 从“强度限制”升级为“资源与可读性预算”

每个机制声明：

- 最大 pass 数；
- 最大 texture bytes；
- 最大历史深度；
- 最大失锁持续时间；
- 最大白场/黑场比例；
- reset / fallback 行为；
- shader 编译失败时是否保留上一版。

## 12. 候选机制评分

5 为最好；接入成本 1 为低、5 为高。评分针对当前 Fusion/WebGL2，而非一般艺术价值。

| 候选 | 介质逻辑 | 音乐因果 | 实时适配 | 原创空间 | 接入成本 | 决策 |
|---|---:|---:|---:|---:|---:|---|
| Per-pixel Time Machine | 5 | 5 | 4 | 5 | 3 | **P0，先做** |
| Rutt/Etra Raster Deflection | 5 | 5 | 4 | 5 | 3 | **P0，第二项** |
| Multi-tap Feedback | 4 | 5 | 4 | 4 | 2 | 与 Time Machine 共建 |
| Motion-field Datamosh | 5 | 5 | 3 | 4 | 4 | P1 |
| Reaction-Diffusion Damage | 4 | 4 | 4 | 5 | 3 | P1 |
| Composite NTSC/VHS | 5 | 4 | 4 | 3 | 3 | P1，作为材质层 |
| DCT Coefficient Damage | 5 | 4 | 3 | 4 | 4 | P1/P2 |
| Field Modulation | 4 | 5 | 5 | 4 | 2 | **基础设施，不是单一效果** |
| Bitplane / Palette / Dither | 4 | 4 | 5 | 3 | 1 | 可快速加入微观层 |
| Packet Concealment Failure | 5 | 4 | 4 | 4 | 3 | P1，适合与 mosh 合并 |
| Local Rank / Pixel Sort | 4 | 4 | 2 | 2 | 3 | 非主线，只做 burst |
| Fluid Advection | 4 | 4 | 3 | 4 | 4 | P2 |
| CA / Lenia / NCA | 4 | 3 | 3 | 5 | 4 | P2 研究 |
| Agent / Physarum | 4 | 3 | 3 | 5 | 5 | P2/P3 独立 Generator |
| Luma Geometry / Point Scan | 4 | 4 | 4 | 4 | 3 | P1，与 Raster 合并 |
| Streaming Neural Sidecar | 3 | 2 | 1 | 4 | 5 | P3 可选，不进核心链 |

## 13. 推荐实验队列

### Experiment 01 — Temporal Excavation / 时间考古

目标：验证“每个像素拥有不同历史年龄”是否比当前单帧 feedback 更有作品感。

最小版本：

```text
8-layer history，half-resolution
ageField：64×36 或 128×72
ageField 来源：luma + seeded Voronoi/noise + event mask
pulse2：S&H age bias
pulse4：S&H block direction
bassPeak：局部 freeze old
highHit：局部 snap current
sectionBoundary：随机刷新 25–50% cells，不全清
```

建议 targets：

```text
temporal.depth
temporal.ageBias
temporal.ageContrast
temporal.freezeMix
temporal.refreshProbability
temporal.spatialScale
```

A/B 版本：

```text
A 当前单帧 feedback
B 统一 4-frame delay
C per-pixel age field
D C + Visual Clock / S&H / partial refresh
```

成功标准：

- 安静段仍有稳定载体，不出现 perpetual glitch soup；
- 事件后 2–8 个视觉脉冲仍能辨认后果；
- 同一 seed、同一音乐与相同 transport epoch 可重现；
- 当前画布增加的 GPU 时间目标不超过 3 ms；
- history 总显存预算先限制在 64 MB；
- reset、seek、pause、track change 无幽灵历史泄漏。

### Experiment 02 — Raster Wound / 扫描伤口

第一版用片元近似：H/V ramp + luma elevation + waveform deflection + syncLock。第二版再做 line-strip mesh。与 Time Machine 组合时，旧帧不只被选出来，还可以成为不同高度的电子地形。

### Experiment 03 — Motion Inheritance / 运动继承

先用 quarter-resolution pseudo-flow 或 block flow，不上神经光流。复用 `field.motion` 与 TemporalReservoir，实现 stale content 被当前运动拖走、孔洞由新内容填入。

### Experiment 04 — Damage Biology / 损伤生物学

128×72 Gray–Scott RG16F，事件只负责 seed；reaction 自己生长与愈合。它输出 `field.damage`，不直接替代画面。

### Experiment 05 — Signal / Codec Material Pack

把三种成本较低、但单独不够构图的介质层组合成一个工具包：

```text
Composite chroma / line timing
Bitplane / palette
Concealment failure 或简化 DCT
```

它们由前四项产生的 mask、age、motion 或 reaction field 驱动，不各自制造独立随机噪声。

## 14. 最终建议

下一阶段不要同时制作十个效果。先做一个会改变架构、又能直接听出音乐因果的实验：**Temporal Excavation**。

选择它的原因：

1. 它延续 Tack 的“音乐负责调度、历史承担后果”，但画面逻辑完全不同。
2. 它将当前 one-frame feedback 提升为真正的时间材料。
3. 它为 datamosh、multi-delay、packet freeze、AI sidecar 插帧提供公共基础。
4. 它的第一版不需要光流、AI 或完整物理模拟，能在 WebGL2 内确定性运行。
5. 它能非常明确地回答艺术问题：**音乐不是让画面更脏，而是在决定哪些地方还活在过去。**

若第一项成立，下一项做 Raster Deflection；一个负责时间，一个负责电子空间。再把二者交给现有 Visual Clock、event vector 与 feedback memory，Fusion 才会从“有很多 Glitch 参数”变成“拥有几种真正不同的故障世界观”。

## 15. 主要资料索引

- 时间/缓存：[TouchDesigner Time Machine](https://docs.derivative.ca/Time_Machine_TOP)、[Cache](https://docs.derivative.ca/Cache_TOP)、[Feedback](https://docs.derivative.ca/Feedback_TOP)、[ISF Multi-Pass](https://docs.isf.video/ref_multipass.html)
- 调制/纹理：[Hydra modulation](https://hydra.ojack.xyz/docs/docs/learning/video-synth-basics/modulate/)、[Hydra textures](https://hydra.ojack.xyz/docs/docs/learning/guides/textures/)
- Datamosh：[FFglitch motion vectors](https://ffglitch.org/2020/07/mv.html)、[Datamoshing with Optical Flow](https://yaksoy.github.io/papers/SIGa23p-Datamosh.pdf)、[KinoDatamosh](https://github.com/keijiro/KinoDatamosh)
- 模拟视频：[ntsc-rs](https://ntsc.rs/)、[KinoGlitch](https://github.com/keijiro/KinoGlitch)、[LZX video synthesis](https://lzxindustries.net/getting-started/learn)
- 扫描处理：[Rutt/Etra archive](https://vasulka.org/Kitchen/PDF_Eigenwelt/pdf/p136-139.pdf)、[Abe Video Synthesizer](https://www.ntticc.or.jp/en/archive/works/abe-video-synthesizer/)
- 编码/丢包：[libjpeg-turbo docs](https://libjpeg-turbo.org/Documentation/Documentation)、[NIST H.264 concealment](https://www.nist.gov/publications/hybrid-frame-concealment-algorithm-h264avc)
- 状态场：[MIT Gray–Scott](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/)、[GPU fluid](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)、[Lenia](https://arxiv.org/abs/1812.05433)、[Growing Neural CA](https://distill.pub/2020/growing-ca/)
- 神经生成：[StreamDiffusion](https://github.com/cumulo-autumn/streamdiffusion)、[StreamV2V](https://jeff-liangf.github.io/projects/streamv2v/)、[StreamDiffusionV2](https://streamdiffusionv2.github.io/)
- 理论：[Rosa Menkman, The Glitch Moment(um)](https://networkcultures.org/blog/publication/no-04-the-glitch-momentum-rosa-menkman/)
