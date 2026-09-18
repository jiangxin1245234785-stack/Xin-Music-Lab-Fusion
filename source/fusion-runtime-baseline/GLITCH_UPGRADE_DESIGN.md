# 音频反应式 Glitch 可视化器升级设计文档

借鉴 MilkDrop 2 预设与 glitch-art 研究，重点让 **chord（和弦根音/变化/置信度）+ section（段落状态/climax/drop）** 这两类新信号真正去**控制拓扑、颜色与事件**，而不仅是调节后处理强度。

> 来源：本文档由研究工作流（glitch-visual-research）综合产出，引用 geisswerks MilkDrop 授权指南、projectM 的真实 `.milk` 预设源码、lettier posterization 教程、glitchology RGB-split，以及对本仓库 glitch 管线的实读。

---

## 0. 核心判断（先读这段）

我们当前管线的根本缺口：**所有效果都是"后处理叠加 + CSS 滤镜强度调制"，没有逐像素 warp/反馈场，没有拓扑变换。** 这正是 MilkDrop "数字感/glitch 感"的来源——MilkDrop 整个引擎是**帧到帧的纹理反馈循环**，其余所有 glitch 都只是"如何让采样 UV 不连续"或"如何在写回前破坏通道"的选择（geisswerks milkdrop_preset_authoring.html）。

因此本文档的**主轴**：新建一个 **WebGL ping-pong 反馈层（"水族箱/aquarium" 载体）** 作为所有结构性 glitch 的底座；新信号通过一条 **q-variable 总线**注入到 warp/composite 着色器。CSS/Canvas 后处理保留为"快速见效层"。

---

## 1. 技法目录（按价值排序）

### ★★★ T1. 逐像素 warp + 反馈载体（"水族箱"连续反馈层）
- **技法**：渲染到纹理，每帧 `uv' = transform(uv)` 采样上一帧再写回 + 轻微衰减；transform 接近恒等（scale 0.99–1.02、微旋转）。单独看是液态流动/拖尾余像，是后面所有撕裂/datamosh/CA 的 substrate。warp 里做的效果会"baked into the image, persist into next frame"。参考值：Hurricane Nightmare `zoom=1.021087`、disconnected `zoom≈1.0`、matrix `zoom=0.998`、decay≈0.92–1.0。
- **信号驱动**：
  - feedback `zoom` = `1.0 + weightedEnsemble*0.02 + climax*0.03` → 0.99–1.04（满编/高潮吸入推出）
  - `decay` = `0.90 + slowEnvelope*0.08 + drop*0.06` → 0.90–0.99（drop 拉长拖尾=残影坍缩）
  - 旋转角速度 = `weightedSection*0.004 + rhythm*0.002`
  - `dx/dy` 平移：低频用 `lowDrum`，方向用 chord root（见 T3）
- **实现**：新建 WebGL ping-pong feedback layer（两张 FBO 互换），现有 betaCanvas/original-glitch 输出作为注入源，warp 在 fragment shader 完成。**工作量 L，风险中**（新 GL 上下文 + 与 2D canvas 合成；先旁路实验 confirm 60fps，保留 CSS fallback）。这是地基。

### ★★★ T2. q-variable 总线（信号→着色器的统一注入）
- **技法**：MilkDrop 用 q1..q32 把 per_frame 标量带进 warp/composite。它是架构而非视觉——是"flowing"与"sequenced/glitchy"的分水岭。
- **信号驱动**：固定 uniform 块 `uQ`，约定槽位：`root`(0–11，N 时保持)、`rootHue`(=root/12)、`chordChange`、`chordConf`、`climax`、`drop`、`section`(=weightedSection)、`beat`(=weightedBeat)、`acid`(=weightedAcid)、`ens`(=weightedEnsemble)、`beatIdx`((idx+isBeat)%16，sample-and-hold)。
- **实现**：随 T1 做，JS 侧 `buildQBus(signals)` + GL uniform 上传。**S，低**。**退化版（无 WebGL）：把同一组 q 喂给 Canvas 后处理参数，让现有效果改读 q-bus——即使不上 WebGL 也立刻让 chord/section 接管参数。**

### ★★★ T3. Chord-root → 全局调色 / 调色板查表（让和弦真正"上色"）
- **技法**：(a) chord 根音当主色相驱动整屏 hue；(b) palette/codebook 查表——用画面自身颜色当 UV 采样调色板纹理得"错误查表"假色（disconnected：`ret = tex2D(sampler_rand00, 0.4+0.6*srcColor.xy)*srcColor.z*3`），8-bit 调色板损坏感。
- **信号驱动**（让新信号控制颜色的核心）：
  - 基础色相 = chord root → 12 色相锚点（五度圈排布使相邻和弦平滑：C→0°, G→30°, D→60°…）
  - `chordConfidence` 控色相收敛：高置信→纯色锚定；低置信(<0.4)→hue 抖动/去饱和（"画面不确定"发灰）
  - 大/小调：minor → 饱和 -0.2、明度 -0.1（更暗冷）
  - palette swap：`chordChange>0.5` 触发 LUT 偏移/换图（0.3s 衰减回正），stutter 假色闪变
  - `weightedAcid` 加 LUT 错位/噪声
- **实现**：快速版（**S，低**）：`drawUniversalGlitchPostFx` 的 hue-rotate 改由 chord root 驱动（现有 sepia+hue-rotate 直接接管）。完整版（**M**）：T1 composite 加 1D/2D palette LUT + chordChange 触发偏移。**最高性价比，强烈建议进第一阶段。**

### ★★☆ T4. Posterize / 量化（段落 banding）
- **技法**：`out = floor(color*levels)/levels` 压成硬等高线色块 + 高 gamma 推爆中调（Hurricane Nightmare `fGammaAdj=2.0`；disconnected `bSolarize=1`）。
- **信号驱动**：`levels = round(16 - weightedSection*12)` → 4–16（SPARSE/AFTERGLOW 高=连续；CLIMAX/DROP 低=强 banding）；gamma = `1.0 + weightedAcid*1.0`；solarize gate = `drop>0.3`。
- **实现**：快速版 CSS contrast 近似（**S**）；真量化 composite 一行 `floor(ret*levels)/levels`（**S**）。少数能让**段落切换"观感"而非仅强度**的便宜手段。

### ★★☆ T5. RGB 通道分离 / swap-invert（色差条纹 & 假色翻转）
- **技法**：(a) 三次采样不同 UV 各取一通道（经典色差）；(b) 通道交换+反相 `crisp = lerp(crisp, 1-crisp.zyx, 0.01)`（Tack Tile，每帧微推向假色）；Hurricane Nightmare 用失谐 per-channel 正弦强化分离。
- **信号驱动**：分离量 `d` = `weightedAcid*8px + burstLayer*16px`；**方向**用 chord root（root/12*2π，不同和弦色差指不同方向）；swap-invert 系数 = `drop>0.3 ? 0.04 : 0.005`。
- **实现**：已有 red/cyan 偏移，快速增强（**S**）接 chord root + acid；真三通道 split 放 WebGL composite（**S–M**）。优先级中——主要补"方向由和弦控制"。

### ★★☆ T6. Beat-locked Sample-and-Hold（节拍量化的"数字时序"）
- **技法**：`isBeat ? newValue : held` + 计数器 `idx=(idx+isBeat)%N`，参数两拍间冻结、只在拍点跳变。把"流动"变"机械/sequenced"的关键。例：disconnected `q29=((idx%2)-.5)*2` 每拍翻 ±1。
- **信号驱动**：`isBeat` = weightedBeat 过阈；拍点把 T1 的旋转/zoom snap 到 chord-root 决定的 12 个量化角（"和弦换则构图跳一格"）；`weightedSection` 控 N（满编→跳更碎）。
- **实现**：JS 侧 q-bus 维护计数器与 held（**S，低**）。让 weightedBeat + chord 一起产生"被编排的"跳动。第二阶段。

### ★★☆ T7. 不连续 UV 撕裂（tan/frac 撕裂 + kaleido 平铺）
- **技法**：`uv += tan(uv*K)*amp` 撕裂脊；`uv = frac(uv*N)` 硬 N×N 平铺接缝；`clamp(tan)` 碎片高原（Tack Tile `h=tan(uv*texsize*.08)`；disconnected `clamp(tan(radial)*d)` 同心硬环）；kaleido = 旋转拷贝 + frac 平铺 + max 合成。
- **信号驱动**：撕裂频率 K = `weightedAcid*0.1`；方向用 S&H 的 q29（拍点翻转）；kaleido 份数 = `3 + round(weightedEnsemble*5)`；**仅 climax>0.5 开 kaleido**（高潮才万花筒）。
- **实现**：WebGL warp（**M，中**，tan 需 clamp 防 NaN）。结构性拓扑效果，第三阶段。

### ★★☆ T8. Datamosh / 梯度重采样漂移 + 帧回声
- **技法**：沿自身亮度梯度推 UV `g=gradient(blur(prev)); uv-=g*amp; ret=sample(prev,uv)`——亮区拖拽邻域，poor-man's optical-flow=datamosh 涂抹；加噪声抖动得爬行颗粒；`abs(blurHi-sharp)` 得描边（what is the matrix / Hurricane Möbius Mix）。我们的 temporal feedback 是它的弱 2D 版。
- **信号驱动**：漂移 `amp` = `drop*0.006 + transient*0.004`；噪声爬行复用 `noiseLayer`；描边 = `weightedAcid`。
- **实现**：WebGL warp（**M**）。退化：增强现有 `drawTemporalFeedback`——history slot 8→16、capture interval 调密（针对 gap #2），drop 驱动 scale/alpha（**S**，可先做）。

### ★☆☆ T9. Pixel-sort（行内按亮度排序的拉丝）
- **技法**：沿行/列按亮度排序得"被拉长"的色带。我们已有 `sort` fragment 近似。
- **信号驱动**：触发 = weightedAcid 峰 + abrasionTransient；方向 = chord root（major 水平/minor 垂直）；长度 = `tension`。
- **实现**：真排序 GPU 较贵；保留现有 fragment 近似（**S**），方向接 chord、长度接 tension。优先级低。

### ★★☆ T10. Cellular Automaton（Conway Life，最"数字"的像素栅格）
- **技法**：warp shader 跑 Game of Life（邻居累加 → floor 整数化 → `saturate(1-abs(n-k))` 无分支 B3/S23），清晰 on/off 细胞 + Möbius/spiral 扭曲（what is the matrix）。最不可伪造的"计算感"。
- **信号驱动**：撒种密度 = `climax`/`chordChange`；规则/zoom = `weightedSection`；细胞着色 = chord-root hue。
- **实现**：独立 WebGL 反馈 pass（**L，中**）。招牌效果，后期作为**可被 director 在特定段落切入的预设**。

---

## 2. 分阶段路线图（quick wins 优先）

**阶段 0 — 让新信号立刻接管（无需 WebGL，~1 周）**
- T2 退化版：建 q-bus（JS），汇总 chord root/change/conf、climax、drop、weightedSection 为统一参数对象。
- T3 快速版：chord-root → CSS hue-rotate 主色相；chordConfidence → 饱和/抖动；minor → 暗冷。**（让"和弦看得见"——最高性价比）**
- T4 快速版 + T8 退化版：section 驱动 contrast 近似 banding；history slot 8→16、drop 驱动 temporal feedback。
- 全部落在 `drawUniversalGlitchPostFx` / original-glitch 内，风险低。

**阶段 1 — WebGL 反馈地基（2–3 周）**
- T1 ping-pong feedback layer（旁路实验→替换主链路，保留 CSS fallback）+ T2 完整 q-bus uniform + T3 完整 palette LUT + T4 真量化。
- 结束时：**chord 控颜色、section 控 banding、ensemble/climax 控 zoom/decay**，已是质变。

**阶段 2 — 节奏化与结构性 glitch（~2 周）**
- T6 sample-and-hold（chord 决定离散跳变角）+ T5 三通道 split（chord 控方向）+ T7 tan/frac 撕裂 + kaleido（climax gate）。

**阶段 3 — 招牌特效与按段落切预设（按需）**
- T10 Conway CA 可注入预设 + T8 完整 datamosh + T9 排序绑 chord/tension；接 butterchurn：用 section/climax/drop 状态机**切换预设**而非仅调强度（针对 gap #6）。

---

## 3. 信号→拓扑/颜色/事件 映射速查（强调"控制"而非"调强度"）

| 新信号 | 控制的是 | 不再只是 |
|---|---|---|
| chord root | 主色相锚点（12 锚点/五度圈）、撕裂/split 方向、CA 细胞色、量化跳变角 | — |
| minor/major | 饱和 -0.2 + 明度 -0.1（冷暗 vs 亮暖） | — |
| chordChange | palette LUT 偏移闪变（gate）、撕裂重播种 | 仅 transient 强度 |
| chordConfidence | 色相收敛 vs 抖动去饱和（"确不确定"） | 未使用 |
| weightedSection | posterize levels(4–16)、kaleido 份数、S&H 的 N、zoom | 仅整体强度 |
| climax | kaleido gate、CA 播种、zoom 推入 | 仅 burst 强度 |
| drop | decay 拉长（残影坍缩）、solarize 反相、datamosh amp | 仅 drop veil |
| weightedBeat | isBeat → sample-and-hold 计数器（量化时序） | 仅 fragment 触发 |
| weightedAcid | 撕裂频率 K、gamma、split 量、LUT 脏乱度 | 仅 noise 强度 |
| weightedEnsemble | feedback zoom、kaleido 份数 | 仅密度 |

**落地起点**：阶段 0 全部改动落在 `drawUniversalGlitchPostFx()` 与 `OriginalGlitchRenderer`（q-bus + chord hue + section banding + history 扩容）；阶段 1+ 新增独立 WebGL ping-pong 模块作反馈载体，原 Canvas 输出作注入源、CSS 链路作 fallback。

---

## 附：本仓库现有信号 / 效果 / 缺口（来自代码实读）

**已有信号**：weightedSection / weightedBeat / weightedAcid / weightedEnsemble / rhythm / climax / drop / chord / chordChange / chordConfidence / liveChord / lowDrum·midDrum·highDrum / dissonance / abrasionTransient / drive / freePulse / slow·fast·transient·tension(glitch engine) / arousal·tension·novelty·orchestrationSurge·impact·charge·sectionScores(mapping engine)。

**已有效果**：tear/block/sort/dropout 碎片、chromatic aberration(red/cyan)、CSS brightness/contrast/saturate 滤镜、scan-line、noise-line glyphs、burst flash、drop veil、betaRhythmPostFx；original-glitch 的 radial bg / bass rings / mid prism petals / string ribbons / high spectrum bars / temporal feedback / fragment spray / chromatic memory / noise layer / event spawn；butterchurn beta-glitch profiles(horizontal/chroma/tiles/scan/datamosh/rgb/codec/loss)。

**关键缺口**：①无逐像素 warp/反馈场（全是后处理）②帧历史仅 8 槽 62% ③只改强度不改拓扑 ④和弦未做谐波共振滤波 ⑤无音高类加权的频谱掩蔽 ⑥不随段落自动切渲染器/预设。
