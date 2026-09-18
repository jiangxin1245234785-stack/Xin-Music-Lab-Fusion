# XLD × XML × Glitch Generator 整合框架分析

> 状态：架构分析，不包含运行代码修改  
> 审阅日期：2026-07-03  
> 目标：把 XLD 的离线分析、XML 的播放器与实时分析、Glitch Generator 的映射及渲染能力整合成一个可维护的 Xin's Music Lab 产品。

## 1. 结论

三者应形成明确的主从关系：

- **XML / Xin's Music Lab Fusion 是主程序**：负责播放、外部监听、基础可视化、统一时钟、FX Rack、画布合成和用户日常操作。
- **XLD 是离线分析模块与高级评测台**：负责生成段落、和弦、人工标签等时间线，不负责实时渲染，也不直接控制视觉参数。
- **Glitch Generator 是视觉编排运行时与高级编辑器**：负责把统一音乐特征变成可编辑的 Mapping、TargetMixer 结果和 WebGL2 故障视觉，不负责扫描音乐库或判断当前播放文件。

目标链路为：

```text
XLD music-lab.json ───────┐
                          │
XML Realtime Analyzer ────┼─ MusicFeatureResolver
                          │         │
XML Transport / Clock ────┘         ▼
                               UnifiedMusicFrame
                                      │
                                      ▼
                         Glitch Mapping Runtime
                   Mapping / NodeGraph / TargetMixer
                                      │
                                      ▼
                             Physical Safety
                                      │
                                      ▼
                       Source-aware WebGL2 Renderer
                                      │
                                      ▼
                              XML 最终画面
```

不建议把 XLD 页面或 Glitch Generator Demo 直接嵌入 XML。应当复用数据契约和运行时模块，界面仍按产品角色分层。

---

## 2. 当前实现状态

### 2.1 XLD 已具备的边界

XLD 已经通过 `music-lab.json` 提供正式桥接契约：

- 当前契约：`xld.music-lab/2`
- 基本信息：曲目 ID、路径、标题、艺术家、专辑、时长
- `analyses`：多个段落分析结果
- `harmony`：多个和弦分析结果
- `manualTags`：用户手工标注
- 每个结果保留分析引擎、时间范围、标签和可选置信度

这个文件应继续作为唯一受支持的 XLD 集成边界。XML 和 Glitch Generator 都不应读取 XLD 内部的 MSAF、SongFormer 或 harmony cache 路径。

XLD 当前输出的是结构和和声时间线，并没有标准化的逐帧响度、低中高频、onset 或 flux 曲线。因此，在现有契约下，“Realtime 不可用时使用 XLD 精细能量值”并不存在。第一版只能使用：

1. XLD 段落状态；
2. 可选的段落级粗略先验；
3. neutral default；
4. 或短时间保持最后可信实时值。

不能虚构 XLD 尚未输出的数据。

### 2.2 XML 已经完成的部分

XML 当前已经能够：

- 扫描本地曲库并播放音频；
- 在 Fusion 内调用 XLD 分析运行时；
- 加载 `music-lab.json`；
- 选择段落引擎；
- 对多个和弦引擎做加权共识；
- 依据播放器 `currentTime` 查询当前段落与和弦；
- 将 XLD 时间线写入 `fusionTimelineState`；
- 在外部监听模式运行实时频谱、onset、flux、和弦及启发式段落分析；
- 将当前 Canvas 或 Butterchurn 画面上传至 XML 自己的 WebGL2 后处理器；
- 处理 WebGL context lost、缩放、ping-pong feedback 和最终合成。

因此，XML 已经是实际的宿主程序。

### 2.3 XML 当前的临时融合方式

目前 XML 的 `currentGlitchSignals()`、`buildGlitchFeatureFrame()` 和
`glitch-feature-bus.js` 已形成一条临时特征管线，但存在以下问题：

1. 实时段落和 XLD 段落通过 `max()` 或条件分支混合，来源优先级没有形成正式契约。
2. 大量特征没有 provider、confidence、availability 或 fallback reason。
3. `sectionSignals(label)` 使用中文及英文关键词，把标签直接猜成 build、drop、climax。
4. MSAF 的 A/B/C 聚类标签不带语义，却可能被后续逻辑误当成具有情绪含义的段落。
5. 事件使用衰减数值表示，缺少稳定 event ID、transport epoch 和 seek 语义。
6. XML 同时保留旧 `glitch-engine.js`、特征总线和专用 WebGL renderer；Generator 又有一套正式 Mapping、Mixer 和 Renderer，职责重叠。
7. 目前的特征总线适合做过渡适配器，但不能继续扩展成第三套 Mapping Engine。

### 2.4 Glitch Generator 已具备的能力

Glitch Generator 已经是一个可构建的 TypeScript 包，公开入口为
`dist/index.js`，主要能力包括：

- 统一 Engine Clock；
- 连续和事件特征提取；
- MappingCard；
- EventEnvelope；
- A/B 参数；
- NodeGraph；
- 固定七层 TargetMixer；
- Energy Budget；
- seeded PRNG；
- Preset schema、migration、validation；
- Snapshot、Undo/Redo、Recovery；
- Physical Safety；
- WebGL2 ping-pong framebuffer；
- GLSL 扩展层；
- 性能分析与 Debug Bundle；
- 确定性及视觉回归测试。

它应成为未来唯一的 Glitch 映射、混合、安全与预设核心。

### 2.5 Generator 当前不能直接替换 XML Renderer

这是当前最重要的技术缺口。

XML 的 `glitch-webgl.js` 是一个真正的后处理器：

```text
当前 Canvas / Butterchurn Canvas
        → 上传纹理
        → feedback
        → damage
        → composite
```

Generator 的 `MinimalWebglRenderer` 当前只读取自己的上一帧 feedback texture，
没有正式的 `sourceCanvas`、`sourceTexture` 或 `TexImageSource` 输入接口。

因此，Generator 虽然拥有更成熟的参数、Mixer 和安全逻辑，但还不是 XML 当前画面的即插即用后处理器。直接替换会导致基础频谱、现代场景或 MilkDrop 画面无法进入 Generator 的反馈链。

---

## 3. 目标模块划分

### 3.1 XLD：Offline Analysis Provider

XLD 只负责：

- 曲库扫描与高级分析；
- 段落边界、段落身份、可选语义标签；
- 和弦时间线及置信度；
- 人工标签；
- 生成和更新 `music-lab.json`；
- 高级分析对比、修正和删除。

XLD 不负责：

- 实时 FFT；
- XML 的播放状态；
- 视觉参数；
- Glitch preset；
- Mapping；
- WebGL 渲染。

### 3.2 XML：Host、Transport 与 Resolver

XML 负责：

- 播放内部音源或监听外部音源；
- 维护当前 track identity；
- 提供媒体播放位置；
- 运行 Realtime Analyzer；
- 加载 XLD 时间线；
- 运行 `MusicFeatureResolver`；
- 驱动唯一的渲染循环；
- 决定 FX 开关、总强度、渲染质量和当前视觉源；
- 展示来源及置信度诊断；
- 管理 Glitch Runtime 的生命周期。

`MusicFeatureResolver` 应属于 XML 的 integration 层，而不是 XLD，也不是
Generator 的视觉核心。因为只有 XML 同时知道播放状态、音源模式、实时分析状态和 XLD 时间线。

### 3.3 Glitch Generator：Runtime 与 Editor

Generator 分成两个产品面：

#### Runtime

不依赖 Demo DOM，提供：

- 输入 `UnifiedMusicFrame`；
- 载入和校验 preset；
- 执行 NodeGraph、Mapping、Envelope、TargetMixer；
- 执行 Energy Budget 和不可关闭的物理安全限制；
- 渲染 source-aware WebGL2 后处理；
- reset、resize、dispose、context restore；
- 输出诊断快照和性能数据。

#### Editor / Demo

继续作为独立工具：

- 编辑 Mapping；
- 编辑 NodeGraph；
- A/B；
- GLSL 专家层；
- Snapshot；
- Learn；
- Debug Bundle；
- 离线确定性验收。

XML 日常界面不应复制整个 Generator 编辑器，只保留：

- FX On/Off；
- Master Intensity；
- preset 选择；
- 质量档；
- 来源检查器；
- “打开高级 Generator”入口。

---

## 4. UnifiedMusicFrame 契约

### 4.1 设计原则

`UnifiedMusicFrame` 是 XML 与 Generator 之间唯一允许的音乐输入。

Generator 的 Mapping、NodeGraph 和 Renderer 不得直接读取：

- XLD manifest；
- DOM audio element；
- Realtime AnalyserNode；
- `fusionTimelineState`；
- `SmokeResonanceFeatures`；
- `performance.now()`；
- XML 内部全局变量。

建议逻辑结构：

```ts
interface UnifiedMusicFrame {
  schemaVersion: number;
  clock: {
    frameIndex: number;
    engineTimeMs: number;
    deltaMs: number;
  };
  transport: {
    mode: 'internal' | 'external' | 'offline-test';
    state: 'playing' | 'paused' | 'seeking' | 'stopped';
    trackId: string | null;
    mediaTimeMs: number | null;
    durationMs: number | null;
    epoch: number;
  };
  continuous: Record<string, number>;
  states: Record<string, number>;
  events: Record<string, ResolvedEvent>;
  labels: {
    sectionId: string | null;
    sectionLabel: string | null;
    chord: string | null;
  };
  meta: Record<string, FeatureMeta>;
}
```

这是架构示意，不是当前实现承诺。

### 4.2 特征类别

#### 连续特征

- loudness
- bass
- mid
- treble
- dynamicRange
- spectralDensity
- flux
- flatness
- sharpness
- buildEnergy
- sectionDrive
- rhythmPhase
- chordConfidence

#### 状态特征

- silence
- inBuild
- inDrop
- inClimax

#### 事件特征

- onset
- bassPeak
- sectionBoundary
- dropEnter
- climaxEnter
- chordChange

#### 标签

- sectionId
- sectionLabel
- chord

标签不是普通数值，不能塞入数值 Mapping。若视觉需要使用和弦根音，可由一个明确、可测试的 Harmony Adapter 产生 `chordHue` 等派生数值，并保留来源信息。

### 4.3 FeatureMeta

每个 resolved feature 必须有：

```ts
interface FeatureMeta {
  sourceProvider:
    | 'xld.manual'
    | 'xld.songformer'
    | 'xld.msaf'
    | 'xld.harmony'
    | 'realtime.core'
    | 'realtime.heuristic'
    | 'held-last'
    | 'neutral';
  confidence: number | null;
  available: boolean;
  ageMs: number;
  fallbackReason: string | null;
}
```

`confidence: null` 表示上游没有提供可解释的置信度。不能为了满足数据类型而伪造一个精确百分比。Mapping Gate 可将 `null` 按 0 处理，但诊断面板必须显示为 UNKNOWN，而不是 0%。

### 4.4 事件结构

事件不能只用一个连续衰减值表达。建议至少包含：

```ts
interface ResolvedEvent {
  eventId: string;
  strength: number;
  engineTimeMs: number;
  mediaTimeMs: number | null;
  epoch: number;
}
```

规则：

- 正常连续播放跨过段落边界时触发一次；
- seek 不得把跨过的所有边界一起触发；
- seek 后递增 `transport.epoch`；
- loop 重播时可以重新触发，但 event ID 必须包含新 epoch；
- pause 时清除瞬时事件，保留当前段落和和弦状态；
- 切歌时 reset 所有 envelope、feedback 和 last-event state。

---

## 5. Provider 选择规则

### 5.1 不能简单平均

两个 provider 的含义和时间尺度不同，平均会制造不存在的信号。

推荐选择表：

| 特征 | 首选来源 | 回退来源 | 无来源时 |
|---|---|---|---|
| loudness / bass / mid / treble | Realtime | XLD 未来的粗包络 | 0 |
| onset / bassPeak / flux | Realtime | 无 | 0 |
| sectionBoundary / sectionId | XLD | Realtime heuristic | unknown / 0 |
| chord / chordConfidence | XLD harmony | Realtime chord | N / 0 |
| chordChange | 当前选中的 chord provider | 无 | 0 |
| silence | Realtime + transport | XLD 明确静音标签 | true when stopped |
| build / drop / climax | XLD 明确语义或 manual tag | Realtime heuristic | 0 |

### 5.2 “XLD authoritative”需要限定范围

XLD 对以下内容具有权威性：

- 分段边界；
- 相同段落的聚类身份；
- 具体引擎输出的标签；
- 人工标签；
- 离线和弦分析。

XLD 不天然对以下内容具有权威性：

- A/B/C 分别代表主歌、副歌或高潮；
- 任意 MSAF 聚类标签的情绪含义；
- 逐帧响度和瞬态；
- 没有出现在 JSON 中的 build/drop/climax。

因此：

- `manualTags` 中的“高潮”“抽空”等语义可以作为高可信状态；
- SongFormer 等声明语义词汇的引擎可以提供有条件的语义状态；
- MSAF A/B/C 只能产生 `sectionId` 和 `sectionBoundary`；
- 不允许仅凭字母标签生成高潮；
- `sectionSignals(label)` 应逐步退役，换成显式的 label vocabulary adapter。

### 5.3 Provider 切换

Provider 消失时不应逐帧在两个来源间抖动：

1. 设置 freshness / TTL；
2. 短时中断可 hold-last；
3. TTL 到期后切换到 fallback；
4. 输出 `fallbackReason`；
5. 连续值切换可做短包络过渡；
6. 事件不插值，也不补发历史事件。

这种过渡只解决信号连续性，不是对两个 provider 做平均。

---

## 6. 双时间轴模型

整合后必须明确存在两个不同时间概念。

### 6.1 Engine Time

单调递增，用于：

- Mapping attack/fall；
- EventEnvelope；
- LFO；
- Sample-and-Hold；
- seeded mutation；
- feedback；
- render timing；
- performance profiling。

所有 Generator 核心逻辑只读取统一 `EngineClockFrame`。

### 6.2 Media Time

可暂停、seek、loop、换曲，用于：

- 查询 XLD section；
- 查询 XLD chord；
- 显示播放器进度；
- 生成 track-local boundary crossing。

不能把 `audio.currentTime` 直接当 Generator Engine Time，也不能让 seek 导致 LFO 和 feedback 时间倒退。

### 6.3 XML Clock Adapter

XML 当前渲染循环使用 RAF 时间，Fusion 时间线使用 `audio.currentTime`。整合时应新增 Clock Adapter：

- 每帧只生成一个 `EngineClockFrame`；
- 同一帧 Resolver、Mapping、Mixer、Safety、Renderer 共用它；
- `mediaTimeMs` 作为 transport 数据独立传入；
- 禁止各模块再次读取 `performance.now()` 或 `Date.now()`；
- 离线测试使用 fixed-step clock。

---

## 7. Glitch Runtime 接口

Generator 需要一个正式的高层 runtime facade，而不是要求 XML 自己拼装十几个底层类。

建议能力：

```ts
interface GlitchRuntime {
  setEnabled(enabled: boolean): void;
  setPreset(preset: Preset): ValidationReport;
  setMasterIntensity(value: number): void;
  render(input: {
    source: TexImageSource;
    frame: UnifiedMusicFrame;
    clock: EngineClockFrame;
  }): RuntimeFrameReport;
  resize(width: number, height: number, dpr: number, scale: number): void;
  reset(reason: 'track-change' | 'seek' | 'preset-change' | 'manual'): void;
  dispose(): void;
}
```

`render()` 内部顺序固定为：

```text
UnifiedMusicFrame
→ Source Registry
→ NodeGraph
→ Mapping Cards
→ Event Envelopes
→ 7-step TargetMixer
→ Energy Budget
→ Physical Safety
→ WebGL2 Passes
```

XML 不得绕开 TargetMixer 直接写 shader uniform。否则用户在 Generator 中编辑的 Mapping 与 XML 实际画面会再次分裂。

---

## 8. 渲染整合策略

### 8.1 不建议：嵌入 Generator 页面

问题：

- 第二套 DOM；
- 第二个渲染循环；
- 第二套状态和 preset；
- 音频输入重复；
- 无法自然取得 XML 当前 source canvas；
- 调试和打包复杂；
- CSS 与快捷键冲突。

### 8.2 不建议：立即删除 XML 旧 WebGL

XML 当前 WebGL 已能可靠后处理 Canvas/Butterchurn，并处理 context lost。Generator renderer 尚无 source 输入。立即替换风险过高。

### 8.3 推荐：两阶段迁移

#### 阶段 A：Shadow Runtime

- XML 创建 UnifiedMusicFrame；
- Generator Mapping Runtime 在后台计算最终 targets；
- 暂不改变正式画面；
- FX Rack 显示 Resolver 来源和 Generator target 结果；
- 与旧 `currentGlitchSignals()` 输出并行对照；
- 验证时钟、事件、fallback 和性能。

#### 阶段 B：Source-aware Renderer

升级 Generator Renderer：

- 接受 `HTMLCanvasElement`、`OffscreenCanvas` 或其他 `TexImageSource`；
- 第一 pass 读取 XML 当前视觉源；
- 之后执行 feedback、block damage、RGB split、grain、signal loss、color；
- 最终输出到 Generator canvas；
- XML 的基础 Canvas/Butterchurn 仍负责产生“干净画面”；
- Generator 负责统一后处理。

#### 阶段 C：切换主渲染路径

- FX Rack 提供 Legacy / Generator A/B；
- Generator 通过视觉和性能验收后成为默认；
- 旧 `glitch-engine.js`、`glitch-feature-bus.js`、`glitch-webgl.js` 保留一个版本作为 fallback；
- 达到功能等价后再删除旧路径。

### 8.4 单一渲染循环

XML 必须拥有唯一 RAF：

```text
update transport
→ realtime analysis
→ timeline lookup
→ resolve feature frame
→ render base scene
→ run glitch runtime
→ render overlays
→ update low-frequency UI diagnostics
```

Generator 不应自行启动第二个 RAF。

---

## 9. Mapping 与置信度

记录 provider 和 confidence 只有在 Mapping 能利用它时才有价值。

建议每个 Mapping 后续增加可选字段：

- `minSourceConfidence`
- `unavailableBehavior`
  - `zero`
  - `hold`
  - `bypass`

这些字段若进入 Preset：

- 必须 optional；
- 必须有 default；
- 必须 bump schemaVersion；
- 必须增加 migration；
- 必须补 deterministic tests。

在字段正式进入 schema 前，可以先把 confidence 暴露为独立 source，例如：

- `confidence.sectionBoundary`
- `confidence.chord`
- `confidence.climax`

然后使用现有 Gate 数据表达置信度门槛，避免临时写死规则。

---

## 10. UI 归属

### 10.1 XML 主界面

保留：

- 本地曲库 / 外部监听；
- 播放器；
- 当前段落及和弦；
- 视觉场景选择；
- FX On/Off；
- FX Master；
- Generator preset 选择；
- 画质；
- 来源检查器；
- 打开 XLD 高级评测台；
- 打开 Generator 高级编辑器。

### 10.2 XLD

保留：

- 分析队列；
- 多引擎结果比较；
- 删除、重算、人工标注；
- 和弦分析比较；
- 时间轴放大及定位；
- `music-lab.json` 管理。

### 10.3 Generator Editor

保留：

- Perform / Map / Visual / Advanced；
- NodeGraph；
- GLSL；
- Mapping 调试；
- Snapshot；
- Learn；
- Debug Bundle；
- preset migration report。

### 10.4 来源检查器

XML 的 FX Rack 应提供类似：

```text
LOUDNESS   0.72   realtime.core       96%
ONSET      pulse  realtime.core       92%
SECTION    B      xld.msaf             ?
BOUNDARY   pulse  xld.msaf             ?
CHORD      C#m7   xld.harmony         81%
CLIMAX     0.00   neutral              0%
```

它是整合验收的核心，不是可有可无的开发面板。

---

## 11. Preset 与文件存储

当前 Generator Demo 和 XML 是不同运行环境，不能假设双方 localStorage 自动共享。

建议分阶段：

### 第一阶段

- XML 随包内置一组已验证 preset；
- Generator 支持导出 JSON；
- XML 支持导入 JSON；
- XML 只保存当前 preset ID、FX master 和用户偏好。

### 成熟阶段

建立共享的文件型 Preset Repository：

- Generator Editor 写入；
- XML 只读或受控写入；
- 原子保存；
- preset schema migration；
- 明确 built-in / user / recovered 三类；
- 不把 XLD 分析 JSON 与 Glitch preset 混在同一目录。

`.webgl-opt/glitch-generator` 与 Fusion 内嵌的 `glitch-generator` 当前内容一致，但长期复制会形成双源漂移。后续应确定唯一源码目录，并通过 build/copy/package 步骤向 XML 发布 `dist`，不要人工同时编辑两份源码。

---

## 12. 性能与安全

### 12.1 性能预算

整合后应避免：

- XML 和 Generator 重复 FFT；
- 两套结构启发式同时常驻；
- 两个 RAF；
- 每帧分配大型对象；
- 每帧刷新来源检查器 DOM；
- 额外 2D canvas 中转后再上传纹理；
- 同时运行 Legacy 和 Generator 全分辨率渲染。

建议：

- 音频特征计算 30–60 Hz；
- XLD 时间线查询 10–30 Hz，边界附近可提高；
- UI 诊断 5–10 Hz；
- 渲染跟随唯一 RAF；
- WebGL 分辨率继续由 High/Eco/Auto 控制；
- Shadow mode 只计算 Mapping，不执行第二套 WebGL。

### 12.2 安全

Generator 的以下安全底线必须位于最终渲染前，XML 不得绕过：

- absolute brightness cap；
- flash strength cap；
- 最高频闪频率；
- brightness slew limit。

FX Master 可以降低效果，但不能关闭物理安全底线。

FX Off 应：

- 输出干净 source；
- 停止新事件 envelope；
- 清空或冻结 feedback；
- 再次开启时不得突然显示很久以前的残留帧。

---

## 13. 失败与降级矩阵

| 场景 | 结构/和弦 | 能量/瞬态 | 视觉行为 |
|---|---|---|---|
| 本地播放 + XLD 完整 | XLD | Realtime | 完整 Hybrid |
| 本地播放 + 无 XLD | Realtime heuristic / unknown | Realtime | Live fallback |
| 外部监听 | low-confidence realtime | Realtime | Live only |
| Realtime 暂时失效 | 保留 XLD | hold 后归零 | 结构保留，运动渐停 |
| XLD contract 不兼容 | 拒绝 XLD | Realtime | 明确告警，不猜字段 |
| 曲目 ID/时长不匹配 | 拒绝时间线 | Realtime | 防止串歌 |
| WebGL2 不可用 | 仍可分析 | 仍可分析 | Canvas passthrough |
| WebGL context lost | 仍可分析 | 仍可分析 | 暂停 FX，恢复后 reset |
| 无任何音源 | unknown | 0 | 安全静止 |

---

## 14. 推荐实施阶段

### Phase I：契约冻结

1. 定义 `UnifiedMusicFrame v1`。
2. 定义 Provider、Meta、Event、Transport。
3. 定义 XLD label vocabulary 的语义边界。
4. 定义 Engine Time 与 Media Time。
5. 用固定测试数据完成 schema 和 resolver 单元测试。

交付物：无视觉变化，但契约可测试。

### Phase II：Resolver Shadow Mode

1. 包装 Realtime Provider。
2. 包装 XLD Timeline Provider。
3. 实现 MusicFeatureResolver。
4. 增加 FX Rack 来源检查器。
5. 与旧特征总线并行观察，不接管画面。

交付物：可以证明每项特征来自哪里。

### Phase III：Generator Runtime 接入

1. 建立无 DOM 的 Runtime facade。
2. XML 使用 Generator preset、NodeGraph、Mapping、TargetMixer 和 Safety。
3. 先只观察 final targets。
4. 增加 Legacy / Generator A/B 选择。

交付物：新旧 Mapping 可对照。

### Phase IV：Source-aware WebGL2

1. Generator Renderer 接收 XML source canvas。
2. 把 21 个正式 visual target 接入 shader。
3. 接入 context lost、Auto/Eco/High。
4. 保证只有一个 RAF。
5. 完成视觉与性能回归。

交付物：Generator 正式后处理 XML 当前画面。

### Phase V：产品化

1. XML preset 选择和导入；
2. 高级 Generator 启动入口；
3. 文件型 preset repository；
4. 打包路径；
5. 故障恢复；
6. 旧 Glitch 管线退役。

---

## 15. 验收标准

### 数据

- Generator 核心不直接读取 XLD、DOM audio 或 Realtime Analyzer。
- 每个 feature 都可追溯 provider。
- 无上游 confidence 时显示 unknown，不伪造百分比。
- MSAF A/B/C 不被自动解释为高潮。
- manual tag 可以覆盖自动结构，但不覆盖实时能量。

### 时间

- 正常跨边界只触发一次。
- seek 不触发跨越区间内的所有事件。
- pause 不继续产生 onset/drop。
- loop 可以在新 epoch 中重新触发。
- 切歌后无上一曲 feedback、section 或 chord 残留。

### 视觉

- Generator FX 可作用于 Canvas、现代场景和 Butterchurn。
- FX Off 为真正 passthrough。
- 相同 preset、seed、fixed audio buffer 和 engine clock 输出确定。
- Safety cap 不可关闭。

### 性能

- 只有一个 RAF。
- 不重复运行相同 FFT。
- Eco/Auto 可以降低 WebGL 分辨率。
- UI 诊断不逐帧重排 DOM。
- context lost 后可以恢复。

### 产品

- XLD、XML、Generator 独立运行仍然可用。
- XML 没有 XLD 时仍可 Live。
- Generator 没有 XML 时仍可离线确定性演示。
- XLD 不依赖 Generator。

---

## 16. 进入实现前需要拍板的决策

1. **第一版是否保留 Legacy / Generator A/B 开关？**  
   建议保留，直到视觉及性能达到等价。

2. **XLD 的段落标签语义从哪里来？**  
   建议 manual tag 最高；语义引擎其次；MSAF 聚类只提供身份和边界。

3. **Generator preset 如何在两个程序间共享？**  
   建议先 JSON 导入导出，后文件型 repository。

4. **第一版是否把和弦映射进颜色？**  
   可以，但必须是可编辑 mapping，不应在 Resolver 写死。

5. **Glitch Generator 源码的唯一位置在哪里？**  
   建议以 `.webgl-opt/glitch-generator` 为源码，Fusion 只接收构建产物。

6. **XML 当前旧 Glitch 何时删除？**  
   建议 Phase IV 完整验收后再进入退役，不在接入初期删除。

---

## 17. 推荐的第一项实际工作

下一步不应直接改 shader，而应先完成：

> `UnifiedMusicFrame v1 + MusicFeatureResolver + FX Rack 来源检查器`

原因：

- 它能先证明 XLD 与 Realtime 的来源裁决是否正确；
- 不会破坏当前好用的 XML 视觉；
- 可以暴露 seek、pause、外部监听和低置信 fallback 问题；
- Generator Runtime 后续只需要接受一种稳定输入；
- 避免把新的正式 Generator 建在当前临时特征混合逻辑上。

当来源检查器能够稳定说明“这个值来自哪里、是否可信、为什么回退”以后，再接入 Generator Mapping Runtime 和 source-aware WebGL2，风险最低。
