# Xin's Music Lab：Tack Grammar 接入设计 v1

日期：2026-07-14  
定位：在当前 XML → UnifiedMusicFrame → Generator → 21 Targets → WebGL2 链路中，引入 Tack Tile 的时间语法与反馈因果；不移植原 preset，不建立第二套映射引擎。

## 1. 结论

当前框架已经具备约 80% 的基础能力：

- `xin.music-frame/1` 统一音乐帧；
- runtime source registry；
- 单一 engine clock 与 transport epoch reset；
- continuous/event mapping；
- event envelope、cooldown、retrigger、voice budget；
- NodeGraph `sample-hold`；
- seeded PRNG；
- TargetMixer 七步管线；
- 21 个正式 visual targets；
- WebGL2 ping-pong feedback；
- staged custom GLSL、uniform registry 与编译失败保留旧 pass；
- offline deterministic tests 与 runtime reset tests。

真正缺失的是一个正式的 **Visual Clock / Grammar Control** 层：把一次可信音乐事件推进为 2/4/8/16 周期，并把这些周期作为可观察、可编辑、可保存的派生控制源交给 NodeGraph 与 mapping。

推荐接入链路：

```text
UnifiedMusicFrame
  ↓
RuntimeSourceRegistry（音乐事实）
  ↓
VisualClockRuntime（派生控制，不冒充音乐事实）
  ↓
control.visualPulse / pulse2 / pulse4 / pulse8 / pulse16
  ↓
NodeGraph sample-hold / logic / shaper
  ↓
Continuous + Event Mapping
  ↓
TargetMixer + Safety
  ↓
21 formal targets
  ↓
Built-in feedback renderer
  ↓ 可选第二阶段
Original Polar Feedback custom GLSL
```

## 2. 不应采用的接法

### 不把 Tack Tile preset 直接塞进 XML

它会把 MilkDrop 的隐式 q 状态、beat detector 和 shader 语义带进产品主链，无法被现有 mapping editor 解释，也会形成第二套音频读取与参数系统。

### 不在 mapping 里硬编码 `% 2 / % 4 / % 8`

周期计数具有跨帧状态、seek reset 和 event identity；若藏进 mapping，无法统一重置、调试或保存。

### 不把 `pulse2/pulse4` 加入 UnifiedMusicFrame

它们不是 XLD 或 realtime analyzer 提供的音乐事实，而是 Generator 的艺术控制状态。应保留在 Generator runtime 内，但必须有正式 contract、registry、meta 与调试输出。

### 不重新压成 `beatStrength`

Visual Clock 可以使用一个 master pulse 推进周期，但 `bassPeak`、`onset`、`flux`、低中高频仍分别进入 mapping，决定不同损伤类型和空间尺度。

### 不先写新 shader

当前 renderer 已有 retention、decay、zoom、rotation、block、RGB、signal loss 与 ping-pong history，足以验证“事件时钟 + S&H + 记忆”是否改善作品感。先验证语法，再判断是否需要极坐标反馈 pass。

## 3. 第一项新增能力：VisualClockRuntime

建议新增：

```text
src/runtime/visual-clock.ts
src/runtime/control-source-registry.ts
```

### 3.1 Contract

```ts
interface VisualClockFrame {
  contract: 'xin.visual-clock-frame/1';
  epoch: number;
  basis: 'onset-event' | 'rhythm-phase-wrap' | 'adaptive-fallback' | 'none';
  confidence: number;
  pulseIndex: number;
  eventId: string | null;
  values: {
    'control.visualPulse': number;
    'control.pulse2': number;
    'control.pulse4': number;
    'control.pulse8': number;
    'control.pulse16': number;
    'control.superCycle': number;
  };
}
```

所有 pulse 仅在边界帧为 1，其余帧为 0；`superCycle` 可先定义为每 8 次 `pulse16` 触发一次，对应约 128 个有效 pulse。

### 3.2 Master pulse provider 顺序

1. 首选新的 `event.onset`，以 `eventId + epoch` 去重；
2. 若 onset 不可用，但 `audio.rhythmPhase` 可用且置信度达标，检测 phase wrap；
3. 两者都不可用时，允许启用 Tack 风格 adaptive fallback：`max(bass, mid, treble)` 越过动态 `avg + peak`，并具有 100 ms refractory；
4. fallback 必须报告 `basis = adaptive-fallback` 和较低 confidence，不能标成可靠 beat/downbeat。

建议 UI 中文使用“视觉脉冲”，暂时不叫“节拍”。待正式 beat/downbeat provider 进入 UnifiedMusicFrame 后，VisualClock 可以更换 provider，preset 与 mappings 不需要重写。

### 3.3 Counter 规则

```text
有效 master pulse：pulseIndex += 1
pulse2：pulseIndex % 2 == 0
pulse4：pulseIndex % 4 == 0
pulse8：pulseIndex % 8 == 0
pulse16：pulseIndex % 16 == 0
superCycle：pulseIndex % 128 == 0
```

首个事件是否计为 index 0 必须固定并测试，不能由实现细节决定。建议第一个有效事件为 `pulseIndex = 1`，第一次 `pulse2` 在第二个事件发生。

### 3.4 Reset 规则

- runtime manual reset：归零；
- preset change：归零并重新建立 seed stream；
- transport epoch change：在求值前归零；
- seek/loop：由 epoch 保证重新开始；
- pause：保持 counter，不生成新 pulse；
- stopped/track change：epoch 变化后归零；
- section boundary：默认不归零，可由 preset 的 optional config 决定是否对齐新段落。

`GeneratorRuntimeFacade.resetCore()` 必须同时 reset VisualClock，保持与 mixer、NodeGraph、safety、PRNG 一致。

## 4. Source Registry 接入

当前 runtime 在：

```text
adaptUnifiedMusicFrameToSources
→ nodeGraph.evaluate
→ mixer.mixFrame
```

之间插入 VisualClock：

```ts
const musicSources = adaptUnifiedMusicFrameToSources(frame);
const visualClock = this.visualClock.evaluate(frame, clock);
const primarySources = mergeGeneratorControlSources(
  musicSources,
  visualClock
);
```

### 必须同步的 registry

- runtime known source IDs；
- mapping validation known sources；
- NodeGraph edge validation；
- UI source descriptors；
- semantic coverage test；
- runtime frame report。

建议将映射可用源定义成一个联合 registry：

```text
GENERATOR_MAPPING_SOURCE_IDS
  = RUNTIME_MUSIC_SOURCE_IDS
  + VISUAL_CLOCK_SOURCE_IDS
```

不要在 `minimal-mapper.ts`、UI 和 runtime 各维护一份手写数组。

UI 中新增 source group：

```text
音乐连续量 / 状态 / 事件 / 置信度 / 和声 / 派生控制
```

派生控制项必须显示 basis、confidence、pulseIndex、epoch 和最后触发时间。

## 5. Preset schema

VisualClock 的行为应进入 preset data，而不是代码常量。

建议 optional 字段：

```ts
interface VisualClockConfig {
  enabled?: boolean;
  mode?: 'auto' | 'onset' | 'rhythm-phase' | 'adaptive';
  minimumConfidence?: number;
  refractoryMs?: number;
  divisions?: readonly number[];
  resetOnSectionBoundary?: boolean;
  sectionBoundaryConfidence?: number;
}
```

默认：

```json
{
  "enabled": false,
  "mode": "auto",
  "minimumConfidence": 0.5,
  "refractoryMs": 100,
  "divisions": [2, 4, 8, 16],
  "resetOnSectionBoundary": false,
  "sectionBoundaryConfidence": 0.7
}
```

因为 preset 新增正式字段，应将 `schemaVersion` 从 15 提升到 16，并添加 15 → 16 migration；旧 preset 默认 `enabled = false`，加载结果与当前版本完全一致。

## 6. 利用现有 NodeGraph 实现 Tack 的 Sample-and-Hold

当前 NodeGraph 已经支持：

- `sample-hold`；
- `sampleMode: random | input`；
- rising-edge trigger；
- seeded node PRNG；
- reset；
- preset persistence。

因此不需要新增随机节点。首批节点建议：

```text
control.pulse2  → sample-hold(direction)
control.pulse4  → sample-hold(rgb-angle)
control.pulse8  → sample-hold(feedback-drift)
control.pulse16 → sample-hold(damage-scale)
```

Node 输出仍为 0–1，mapping 的 target range 负责转换为负角度、正负位移或实际尺寸：

```text
node:direction-hold
  → blockDamage.displacementX range [-0.38, 0.38]

node:rgb-angle-hold
  → rgbSplit.angle range [-π, π]

node:feedback-drift-hold
  → feedback.rotation range [-0.045, 0.045]

node:damage-scale-hold
  → blockDamage.blockSize range [0.05, 0.22]
```

位移方向可以长期保持，但真正的 block 只由 event mapping 提高 spawn probability；这样安静时不会因为方向值非零而持续损坏。

## 7. 第一版 Tack Grammar preset

建议新增只读内置实验 preset：

```text
id: tack-grammar-probe
name: Quantized Memory / 量化记忆
category: experimental
```

不要在产品名称中使用 Tack Tile，以免把参考作品外观当作本项目身份。

### 7.1 Stable Carrier：连续秩序

| Source | Target | 建议范围 | 行为 |
|---|---|---:|---|
| `audio.loudness` | `color.brightness` | 0.48–0.78 | 慢 attack/fall，不形成频闪 |
| `audio.spectralDensity` | `color.saturation` | 0.82–1.28 | 表示画面材质饱满度 |
| `audio.sectionDrive` | `feedback.retention` | 0.76–0.91 | 段落推进时增加历史重量 |
| `audio.buildEnergy` | `feedback.decay` | 0.90–0.975 | build 中让损伤更难消失 |

Retention 与 decay 同时偏高时必须经过 energy budget 与 runaway protection。

### 7.2 Discrete Damage：事件损伤

| Source | Target | Envelope 意图 |
|---|---|---|
| `event.bassPeak` | `blockDamage.spawnProbability` | 快 attack、短 hold、约 250 ms release |
| `event.bassPeak` | `feedback.zoom` | 轻微冲击，建议约 1.00–1.08 |
| `event.onset` | `rgbSplit.distance` | 约 20–180 ms 的短促色散 |
| `event.onset` | `signalLoss.whiteTearBrightness` | 低概率、严格能量预算 |
| `audio.flux` | `scanlineGrain.grainContrast` | 作为损伤质地，不直接触发大尺度位移 |

### 7.3 Quantized Motif：周期构图

| 周期 | Held state | 视觉职责 |
|---|---|---|
| 2 pulse | direction | 横向损伤与轻微 feedback 漂移方向 |
| 4 pulse | RGB angle | 色散方向变化 |
| 8 pulse | feedback drift | 历史画面的缓慢旋转偏向 |
| 16 pulse | damage scale | 从小切片切换到较大结构块 |
| section boundary | optional regime change | 只改变约束/基线，不做一次巨大闪烁 |

### 7.4 Memory：损伤历史

第一版只使用现有正式 targets：

- `feedback.retention`：历史参与程度；
- `feedback.decay`：历史衰减；
- `feedback.zoom`：历史搬运；
- `feedback.rotation`：历史方向；
- `blockDamage.lifetime`：局部损伤持续时间；
- `rgbSplit.decay`：色散残留。

## 8. RuntimeFrameReport 必须新增的可观察信息

```ts
visualClock: {
  contract,
  basis,
  confidence,
  pulseIndex,
  eventId,
  values,
  resetReason
}
```

调试 UI 至少显示：

- 当前 pulse index；
- 2/4/8/16 哪个边界刚发生；
- master pulse 来自 onset、rhythm phase 还是 fallback；
- confidence；
- 四个 S&H 当前 held 值；
- 每个 target 的 base、mapping contribution、mixer result 与 safety result。

没有这些观察量，最终只能凭画面猜测时钟是否工作。

## 9. 第二阶段：原创 Polar Feedback pass

现有 built-in feedback 只做一次 zoom/rotation 历史采样，再与当前帧 `max` 混合。它能够验证“记忆”，但无法完整产生 Tack Tile 的极坐标折返、多方向复制和 phase 错位。

只有在 Grammar Probe 的 A/B 证明时间语法有效后，再使用现有 `custom-glsl` staged pass 增加原创空间语法。

建议自定义 uniforms：

```text
glsl:u_polarFoldCount    int   1..12
glsl:u_polarDrift       float -2..2
glsl:u_phaseOffset      float  0..1
glsl:u_historySpread    float  0..0.08
glsl:u_historyMix       float  0..1
```

处理逻辑：

1. 将 `vUv` 转换为 angle/radius；
2. 按 fold count 折叠角度；
3. 用 phase offset 错开 3–4 个历史采样；
4. 用小范围多 tap 近似 blur spread；
5. 用 history mix 与当前 built-in feedback 结果合成；
6. 不复制原 Tack shader 的常数、命名或图形外观。

建议保持 pass 顺序：

```text
builtin-feedback → custom-glsl
```

若 custom shader 编译失败，`StagedShaderPass` 会保留旧资源；Generator failure 仍由 XML legacy fallback 接管。

## 10. A/B 试验设计

同一离线 buffer、seed、engine clock、target defaults：

```text
A：当前 direct mapping
B：A + VisualClock event gate
C：B + 2/4/8/16 Sample-and-Hold
D：C + 高 retention/decay 的 Memory grammar
E：D + Original Polar Feedback custom pass
```

每组保存：

- preset JSON；
- per-frame source/control/target trace；
- event/pulse timeline；
- safety intervention count；
- GPU frame time；
- 30–60 秒视频；
- 主观评分：因果、层级、记忆、留白、爆发。

先比较 A–D；E 属于独立 shader 艺术化，不与时钟工程混在同一验收步骤。

## 11. 测试与验收

### VisualClock unit tests

- 一个 eventId 在同一 epoch 只计数一次；
- pulse2/4/8/16 边界精确；
- 128-pulse super cycle 精确；
- pause 不推进；
- epoch change 清零；
- rhythmPhase wrap 不重复触发；
- adaptive fallback 遵守 refractory；
- unavailable/confidence 不足时输出 neutral。

### Determinism

- 相同 buffer + preset + seed + clock 输出完全相同；
- runtime reset 后 S&H held values 与 targets 可复现；
- seek/loop 新 epoch 不继承旧 section 的 counter 与 held state；
- 禁止 `Math.random()`。

### Compatibility

- schema 15 preset 经 migration 后画面 target trace 不变；
- VisualClock disabled 时 runtime 与当前版本逐帧一致；
- 21 formal target bindings 数量不变；
- TargetMixer 七步顺序不变；
- FX OFF、Generator failure、custom pass failure 都能回到现有 bypass/fallback。

### Runtime/visual

- Node/contract/full test suite；
- minimal WebGL contract；
- Electron mapping diagnostics smoke；
- WebGL tolerance 与 visible acceptance；
- 真实音乐 A/B 后再决定是否进入 Polar Feedback。

## 12. 推荐实施顺序

### TG-0：VisualClock contract 与纯逻辑测试

只生成 control frame，不进入 mapping，不改变画面。

### TG-1：Runtime source integration + shadow trace

在 RuntimeFrameReport 中显示 pulse2/4/8/16；仍不接管 targets。

### TG-2：Tack Grammar Probe preset

复用现有 NodeGraph、event mapping、21 targets 和 safety；开始 A–D 对比。

### TG-3：Mapping UI

把派生控制源、held state、clock basis 和 confidence 暴露给用户。

### TG-4：Original Polar Feedback

仅在 TG-2 主观与确定性验收通过后加入自定义 pass。

### TG-5：XML 部署验收

staging 构建、测试、备份、SHA-256、部署、可见 Electron smoke、FX bypass/fallback 验证。

## 13. 最终判断

在当前框架下，Tack Tile 最合理的接法不是“新增一个效果按钮”，而是新增一层正式的 **Visual Clock + Sample-and-Hold grammar**，再用它驱动现有 mappings、targets 与 feedback memory。

这条路径最大限度复用现有架构，同时把 Tack Tile 的真正优点保留下来：

> 音乐事件决定何时改变；周期状态决定改变哪一层；随机决定被保持；历史反馈让改变留下后果。
