# Glitch Mapping Generator

Phase 6.5 completes the stabilization phase with explicit preset migration
and compatibility reporting.

## Phase 6 · Step 6.5

- Every entry in the ordered migration registry now carries a human-readable
  label and the fields it resolves.
- Loading an old stored preset preserves the original schema long enough to
  report the complete migration path before applying defaults.
- The Perform/Preset surface shows source and target versions, applied steps,
  defaulted or preserved fields, warnings, and fields that could not be
  migrated with exact reasons.
- Unknown root and nested fields are named explicitly. Known invalid fields
  reuse the exact validation reason and prevent live state replacement.
- Current presets report a no-op path; future schemas are marked incompatible.
- This step adds no persisted Preset fields, so `schemaVersion` remains 14 and
  no empty migration is appended.

Phase 6.4 adds deterministic project autosave and recovery after unexpected
termination without changing the editable preset schema.

## Phase 6 · Step 6.4

- Recovery uses a separate versioned envelope for editor state and Snapshot
  Stack; it does not add fields to `Preset`, so `schemaVersion` remains 14.
- Discrete edits, completed continuous edits, undo/redo and Snapshot Stack
  mutations force a recovery point.
- A five-second fallback cadence uses only unified engine time; it does not use
  wall-clock time and does not write on every rendered frame.
- A normal `beforeunload` marks the current session clean. If that marker is
  still open on the next launch, Advanced shows Restore/Discard before any new
  autosave can overwrite the previous session.
- Recovery applies the existing preset migration/default path and reconfigures
  the physical safety limiter; frequency and absolute brightness caps remain
  mandatory.

Phase 6.3 在可复现 Debug Bundle 之外加入只读的逐阶段性能观测：

`audio features → editable NodeGraph / MappingCards → fixed TargetMixer → WebGL2 modules`

## Phase 6 · Step 6.3

- Advanced 页实时显示 feature extraction、conditioning、NodeGraph、
  TargetMixer + Safety、render setup、built-in/custom/display pass 的
  average / peak / last CPU cost。
- 默认使用 120 帧窗口和 16.7 ms 帧预算；用户可暂停测量、修改阈值或清空窗口。
- 超出预算时按“超预算帧中的平均阶段耗时”确定主瓶颈，避免正常帧掩盖偶发降速。
- Profiler 通过可选 `PerformanceMeasureSink` 接入；关闭时直接执行原操作，
  不改变七层 mixer、seeded PRNG、engine clock 或视觉输出。
- Debug Bundle 的 snapshot state 会附带当前 performance profile。
- 本步没有新增持久化字段，`schemaVersion` 保持 14。

## Phase 6 · Step 6.2

- Advanced 页提供一次点击的 `.zip` 导出，不改变 preset、Snapshot Stack
  或播放状态。
- Bundle 固定包含 manifest、preset、当前 Snapshot 状态、音频特征样本、
  Mapping contributions、最终 targets、Energy Budget、SafetyLimiter、
  shader pass、画布 PNG、console logs、engine seed 与 clock mode。
- ZIP 使用固定文件顺序、固定 DOS 时间和 store 编码；相同输入产生逐字节一致
  的归档，便于自动测试和问题复现。
- console 日志使用有界 ring buffer，时间戳只读取 unified engine clock。
- 本步没有新增持久化字段，`schemaVersion` 保持 14。

## Phase 6 · Step 6.1

- `pnpm test` 先构建，再按稳定文件顺序运行全部核心与视觉回归测试。
- 核心清单锁定 TargetMixer、EventEnvelope、Preset validation、
  NodeGraph cycle、SafetyLimiter、migration、determinism、seeded PRNG
  和 Energy Budget 的覆盖入口。
- 视觉快照使用固定 offline audio buffer、session seed 和 unified
  engine clock，保存可查看的 target timeline PNG 与 renderer/shader
  指纹 JSON。
- 任意 mixer/feature/safety 输出、target registry、pass order 或 shader
  改动都会触发回归失败。只有审核确认后才运行
  `pnpm test:visual:update` 更新基线。
- 本步不新增持久化字段，`schemaVersion` 保持 14。

## Phase 1b

- 连续源：`loudness / bass / mid / treble`。
- 六个视觉模块、21 个目标参数：
  - Feedback
  - Block Damage
  - RGB Split
  - Scanline/Grain
  - Signal Loss
  - Color
- Perform / Map / Visual 三页。
- Visual 页区分 `Base Value / Mapped Value / Final Value`。
- Intensity / Response 宏只变换 MappingCard 数据。

## Phase 1c

- 事件源：`onset / bassPeak`。
- EventEnvelope：
  `delay / attack / hold / decay / sustain / release / cooldown`。
- retriggerMode：`restart / ignore-until-release`。
- Mapping 操作：Add / Solo / Bypass / Duplicate / Delete。
- Basic Snapshot capture/restore。
- Basic Preset Save/Load，统一经过 migration chain。

## Feedback ping-pong framebuffer

- Feedback 使用两张 RGBA8 texture 与两个 framebuffer 交替读写。
- 当前帧只读取上一帧纹理，再写入另一张纹理，不发生同纹理读写冲突。
- Feedback.Retention / Decay / Zoom / Rotation 继续由视觉目标参数控制。
- reset、resize 与 dispose 会同步清理两张历史表面。

## Phase 2 · Step 2.1

- Undo / Redo 使用确定性的事务历史。
- 连续滑杆从开始到结束只记录一条事务。
- Add / Solo / Bypass / Duplicate / Delete、选择器修改等离散操作逐项记录。
- Snapshot Restore 作为 `snapshot-restore` 特殊事务，可整体撤销。
- Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z 重做。
- 历史时间戳来自统一 engine clock，不读取系统时间。

## Phase 2 · Step 2.2

- Snapshot Stack 支持连续捕获多个状态，栈只存在于当前会话，不混入 Preset 列表。
- 每张 Snapshot 保存统一 engine clock 时间戳、可选备注、Canvas 缩略图、Preset 与最终目标状态。
- 任意 Snapshot 均可 Restore 或 Delete；Restore 作为 `snapshot-restore` 事务进入 Undo/Redo。
- Promote 会把 Snapshot 转换成独立的 Custom Preset，并持久化到单独的预设库。
- Custom Preset 可从 Preset 选择器加载，但与 Snapshot Stack 的生命周期保持分离。

## Phase 2 · Step 2.3

- 每条 MappingCard 独立保存 A、B 两组参数。
- A/B 包含 `amount / range / curve / attack / fall / threshold / priority`；source、target、kind、envelope 与 enabled 保持为该卡共享属性。
- 切换 A/B 是一次离散 Undo transaction，不做插值或 Morph。
- 编辑只写入当前激活槽位；切换一条 mapping 不会修改其他 mapping。
- Intensity / Response 宏只作用于当前激活参数集的运行时副本，不污染持久化 A/B 数据。

## Phase 2 · Step 2.4

- Event Log 记录 `onset / bassPeak` 的统一 engine clock 时间戳与强度，保持有界会话历史。
- Contribution Breakdown 显示所选 Mapping 的
  `source / normalized / conditioned / contribution / base target / final target`。
- Breakdown 会明确解释 Rack bypass、Mapping bypass、Solo 过滤、缺少路由、等待事件、低于 threshold、零输出、正常贡献，以及目标由其他 Mapping 或后级处理推动等状态。
- Global Energy Budget meter 在本阶段只读；Step 3.4 已将同一层升级为可选的主动限制器。

## Phase 2 · Step 2.5

- Learn v0 从统一 engine clock 记录的代表性片段中读取任意 `sourceId` 的历史值。
- 建议输出仅包含 `threshold / range / attack / fall` 与置信度；不会自动写回 MappingCard。
- 片段过短、静音、动态不足或找不到 source 时返回明确失败代码与原因。
- 特征历史使用通用 `Record<string, number>`，不把实现限制在 Phase 1 的六个 source。
- Learn 历史与建议均为会话状态，不进入 Preset，也不改变固定 TargetMixer 或物理安全链路。

## Phase 3 · Step 3.1

- 新增连续源：
  `dynamicRange / spectralDensity / buildEnergy / sectionDrive / rhythmPhase / flux / flatness / sharpness`。
- 低风险频谱统计由单帧 FFT 生成；时间特征由有状态 `ContinuousFeatureExtractor` 在统一 engine clock 上生成。
- `buildEnergy / sectionDrive / rhythmPhase` 是启发式视觉控制信号，不宣称权威音乐结构识别。
- `ContinuousFeatureExtractor` 提供可选 window / sensitivity 参数，为后续结构源复用，但本步不加入结构事件或状态。
- Phase 3.1 校验音频完全离线、确定性，并使用 seeded PRNG 生成宽带校验段。
- `Build Retention Lab` 通过可编辑 MappingCard 演示
  `audio.buildEnergy → feedback.retention`；渲染器中没有写死该关系。
- Learn v0 可直接读取全部新增 source。

## Phase 3 · Step 3.2

- 瞬时事件：
  `sectionBoundary / dropEnter / climaxEnter`。
- 持续状态：
  `inBuild / inDrop / inClimax`；enter 事件与 state source 保持独立。
- 所有结构输出均明确为 heuristic control signals，并提供独立
  confidence / availability。
- 检测器提供 sensitivity、hold duration、unavailable fallback 和 manual override。
- MappingCard 新增可选 `gateSourceId / gateThreshold`，默认分别为空字符串和 0.5。
- Gate 仍位于固定 TargetMixer 第六层；关闭时把 winner target 恢复到 Replace 前状态，不重排管线。
- `Structure Gate Lab` 通过 MappingCard 数据演示结构事件与 state Gate，没有在渲染器中写死关系。
- Debug Event Log 记录 audio 与 structure events，并明确解释 `GATE_CLOSED`。

## Phase 3 · Step 3.3

- MappingCard 新增可选字段：
  `polarity / replaceMode / safetyClamp / probability`。
- 默认值分别为：
  `normal / replace / true / 1`，保持旧预设行为不变。
- `replaceMode` 复用固定管线中的
  `Multiply / Add / Max / Min / Replace` 层，不建立第二套 mixer。
- `polarity = inverted` 反转归一化控制方向。
- `probability` 在连续源的每次新 excursion、事件源的每次 trigger 上采样；
  随机数只来自注入的 seeded PRNG。
- `safetyClamp` 控制卡片所在 mixer 层是否提前限制到目标范围；
  最终不可关闭的物理安全 cap 始终生效。
- EventEnvelope 的 `retriggerMode` 新增 `accumulate`，
  允许尚未结束的事件包络叠加。
- Gate 对所有 replaceMode 生效，关闭时以开放贡献重新合成既有层。
- Energy Budget 的执行顺序仍保持不变，由 Step 3.4 填充。

## Phase 3 · Step 3.4

- Global Energy Budget 使用可编辑 `budget / weights` 计算加权总量，超预算时按同一比例衰减所有目标相对 base 的偏移。
- `eventVoiceLimit` 限制同时存在的事件包络声部；默认策略
  `drop-low-priority` 按 priority 与 stable mapping id 确定性裁决。
- `queue` 是实验策略，只有 `globalEventPolicy = queue` 且
  `experimentalQueueEnabled = true` 时才启用，默认关闭。
- 默认 `enabled = false`，旧预设保持原先的 pass-through 行为。
- UI 可启用预算、调整总额、声部上限、策略和每个视觉目标的权重，并观察衰减与事件声部状态。

## Phase 3 · Step 3.5

- 可关闭的软保护包括 whiteout、blackout 与 feedback runaway。
- 关闭任一软保护后状态显示为 Unsafe，但绝对亮度上限、flash strength 上限、最高 3 Hz 频闪与亮度 slew limit 仍不可关闭。
- SafetyLimiter 对所有模式使用同一最终物理安全路径，并逐帧报告实际介入项。

## Phase 3 · Step 3.6

- Preset validation 检查未知 source/target、非法 range、非法 envelope、缺少事件 envelope、重复 id、版本冲突、Unsafe 配置与不可用 source 降级。
- 每条问题包含 severity、code、精确字段 path 和原因；例如
  `mappings[2].envelopeId`。
- 旧 schema 自动沿 migration registry 升级并报告 `SCHEMA_MIGRATED`；
  新于当前版本的 schema 明确拒绝。
- 已知但当前不可用的 source 保持预设有效，并明确报告运行时 fallback。
- Preset Save/Load 与 Custom Preset 持久化入口均经过校验。

## Phase 4 · Step 4.1

- 新增 Bus、Math、Shaper、Logic、LFO、Sample-and-Hold 六类节点。
- NodeGraph 使用 DAG-only 数据模型；合法连线写入 live graph，成环请求在写入前拒绝并返回 cycle path。
- 节点与边均使用稳定 ID，拓扑排序按稳定 node id 确定性裁决。
- LFO 只读取统一 engine clock；Sample-and-Hold 只在 trigger 上升沿调用注入的 seeded PRNG，核心链路不使用 `Math.random()`。
- NodeGraph 在每个音频帧求值，但 Step 4.1 尚不把 `node:<id>` 接入 Mapping source。
- Map 页提供最小节点创建、删除、连接、断开入口；被拒绝的连线以红色状态显示且不污染 live graph。
- 节点操作沿用 Phase 2.1 离散 Undo transaction；NodeGraph 随 Preset/Snapshot 保存与恢复。
- 本步不加入 node probe 或二阶调制。

## Phase 4 · Step 4.2

- Map 页可在 Card View 与 Graph View 间切换；切换只改变呈现方式，不创建第二份 MappingCard 或 NodeGraph 状态。
- Graph View 将 source、NodeGraph core node、MappingCard 与 visual target 投影为四列节点；MappingCard 以折叠节点显示当前 A/B、amount、range、模式与启用状态。
- Card View 中的参数编辑会在下一次投影时反映到 Graph View；Graph View 的 Bypass、Enable、Delete 与 Edit Card 操作直接修改同一份 `mappings` / `nodeGraph` 数据。
- `projectGraphView()` 是无副作用的确定性投影；重复切换视图不会复制、丢失或持久化额外数据。
- 本步没有新增持久化字段，`schemaVersion` 保持 12，不追加空 migration。
- 本步不把 `node:<id>` 接入 Mapping source，不加入 node probe、二阶调制或 NodeGraph 调制连接。

## Phase 4 · Step 4.3

- 每个 NodeGraph 节点输出以稳定的 `node:<id>` 注册为 Mapping source。
- 每帧先由 NodeGraph 使用核心音频 source 求值，再把节点输出合并进同一份
  Mapping source values；没有建立第二套 TargetMixer。
- `Bass + Flux Node Source Lab` 使用可编辑 NodeGraph 和 MappingCard 数据演示
  `audio.bass + audio.flux → node:bass-flux-bus → blockDamage.spawnProbability`。
- Map 页 source 选择器会动态列出当前节点输出；节点删除后保留引用并标为
  Missing，避免静默改写 MappingCard。
- 每个节点提供实时数值和最近 96 帧的波形 probe；采样时间只来自统一
  engine clock，probe 为会话级调试状态，不写入 Preset。
- 离线确定性回放与实时演示使用相同的“NodeGraph 先于 Mapping”求值顺序；
  Sample-and-Hold 继续使用独立 seeded PRNG stream。
- 本步没有新增持久化字段，`schemaVersion` 保持 12，不追加空 migration。
- 本步不加入节点参数调制或二阶调制。

## Phase 4 · Step 4.4

- 每张 MappingCard 可保存零个或多个 `modulations`，由已有 source 或
  `node:<id>` 调制 `amount / threshold / fallMs / probability`。
- 二阶调制先按稳定 modulation id 求和，再进入既有 MappingCard 处理；
  `threshold / probability` 限制为 `0..1`，`fallMs` 不低于 0。
- `In Drop → BassPeak → BlockDisplacement amount` 与
  `LFO → RGBSplit.Angle amount` 均由可编辑数据表达，没有写入渲染器。
- Graph View 中主信号连接为实线，调制连接为虚线；Card View 提供新增、删除、
  source、目标参数、depth 与启用状态编辑。
- 固定 TargetMixer 七层顺序、Replace 裁决规则、统一 engine clock 与物理安全上限保持不变。

## Phase 5 · Step 5.1

- Shader 页支持上传或粘贴完整 WebGL2 fragment GLSL pass。
- 候选 pass 先创建独立 shader/program 并完成 compile + link；只有成功候选才原子替换 live pass。
- 编译或链接失败返回完整错误日志，live program、live revision 与反馈画面均保持上一版有效状态。
- 内置 Valid Sample / Broken Sample 用于直接验收成功替换与失败回退。
- 上传内容、候选源码与 live revision 在本步均为会话级状态；不写入 Preset，
  因此 `schemaVersion` 保持 13，不追加空 migration。
- 本步不加入 uniform metadata/target registry、pass order、framebuffer preview 或 Raw JSON。

## Phase 5 · Step 5.2

- Shader 页可声明自定义 Uniform 的
  `name / type / range / default / label / impactWeight / impactCategory`。
- `high / medium / low` 三类 impact category 分别提供系统默认权重；
  用户可覆盖，低于该类别建议下限时显示风险警告但不静默改值。
- 合法声明注册为稳定的 `glsl:<uniformName>` target，模块名为
  `Custom(GLSL)`，并进入同一 Map target 选择器、Graph View 与 Visual 表格。
- Uniform 注册表是会话级状态；本步不把声明写入 Preset，
  因此 `schemaVersion` 保持 13，不追加空 migration。
- 本步不进行运行时 uniform location 绑定、逐帧写值、impact budget 合并、
  pass order、framebuffer preview 或 Raw JSON；这些仍属于后续 step。

## Phase 5 · Step 5.3

- 任意核心 source 或 `node:<id>` 可通过同一份 MappingCard 数据驱动
  `glsl:<uniformName>`，没有建立第二套 mixer。
- Custom(GLSL) target 参与现有 Mapping Macro、固定七层 TargetMixer、
  GlobalEnergyBudget、最终 target range clamp 与 SafetyLimiter。
- GlobalEnergyBudget 使用
  `用户 target weight × uniform impactWeight × normalized impact`
  计算自定义 Uniform 的能量成本。
- WebGL2 renderer 按声明类型使用 `uniform1f` 或 `uniform1i` 写入 live pass；
  float、int、bool 会在提交前按 target range 进行确定性转换。
- Uniform 卡片显示 `GLSL BOUND / NOT IN LIVE SHADER / WAITING FOR FRAME`，
  可直接判断当前 shader 是否真正声明并使用该 Uniform。
- Valid Shader Sample 声明并使用 `u_corruptionAmount`，可配合
  `audio.flux → glsl:u_corruptionAmount` MappingCard 验收。
- 引擎管理的 Uniform 名称禁止重新注册，避免覆盖时间、反馈纹理和物理安全参数。
- Uniform 与注册表仍为会话状态，`schemaVersion` 保持 13；
  pass order、Raw JSON 与持久化仍未进入本步。

## 不变量

- TargetMixer 顺序固定：
  `base → Multiply → Add → Max/Min → Replace → Gate → EnergyBudget → Clamp`。
- Replace 冲突裁决：
  `priority → effective magnitude → stable mapping id`。
- 所有 audio-to-visual 关系均是可编辑 MappingCard 数据。
- 核心链路禁止 `Math.random()`，使用 seeded PRNG。
- mapping、event envelope 与 render 使用统一 engine clock。
- 绝对亮度、频闪与亮度变化速率安全限制不可关闭。

## Schema

- 当前 `schemaVersion = 13`。
- `3 → 4` migration 添加 Phase 1c event 字段。
- `4 → 5` migration 登记 Phase 2.2 Snapshot Stack 的可选快照字段。
- `5 → 6` migration 登记 Phase 2.3 MappingCard A/B 可选字段。
- `6 → 7` migration 登记 Phase 3.1 可选 AudioFeatureFrame 字段。
- `7 → 8` migration 登记 Phase 3.2 可选结构信号与 Mapping Gate 字段。
- `8 → 9` migration 登记 Phase 3.3 完整 MappingCard 字段与
  `accumulate` retrigger 枚举扩展。
- `9 → 10` migration 登记 Step 3.4 可选 `energyBudget` 配置。
- `10 → 11` migration 登记 Step 3.5 可选 `safety` 配置。
- `11 → 12` migration 登记 Step 4.1 可选 `nodeGraph`、nodes 与 edges。
- `12 → 13` migration 登记 Step 4.4 可选 `MappingCard.modulations`。
- 新持久化字段均 optional 且有默认值。
- Step 2.1 的事务历史不写入 Preset，因此没有新增持久化字段、无需 schema bump。
- Step 2.2 为 Snapshot 增加 `schemaVersion / note / thumbnail` 可选字段，默认值分别为当前 schema、空字符串、空字符串。
- Step 2.3 为 MappingCard 增加可选 `ab`，默认 A/B 均从原有顶层参数初始化，默认激活 A。
- Step 2.4 只增加会话级只读诊断状态，不写入 Preset，因此 `schemaVersion` 保持 6，不追加空 migration。
- Step 2.5 只增加会话级特征历史与只读建议结果，不写入 Preset，因此 `schemaVersion` 保持 6，不追加空 migration。
- Step 3.1 的八个 AudioFeatureFrame 字段全部 optional 且默认值为 0；按横切契约将 schema bump 至 7，并登记 `6 → 7` migration。
- Step 3.2 的结构字段全部 optional，并有数值 0 / 布尔 false 默认值；Mapping Gate 字段同样 optional 且有默认值。
- Step 3.3 的 MappingCard 字段全部 optional 且有默认值；旧卡片加载后继续使用
  `normal + replace + safetyClamp + probability 1`。
- Step 3.4 的 EnergyBudget 字段全部 optional；默认关闭、预算 1、空权重表、
  四个事件声部、drop-low-priority、实验队列关闭。
- Step 3.5 的 Safety 字段全部 optional，三项软保护默认开启。
- Step 3.6 不新增持久化字段，因此不追加空 migration。
- Step 4.1 的 NodeGraph、Node 与 Edge 字段全部 optional 且有默认值；
  旧预设迁移后得到空 DAG，不改变原有渲染输出。
- Step 4.2 只增加由现有 `mappings` 与 `nodeGraph` 派生的会话级视图模型，
  不新增持久化字段，因此 `schemaVersion` 保持 12，不追加空 migration。
- Step 4.3 复用现有 MappingCard `sourceId` 字段；动态 source 注册和 probe
  均不新增持久化字段，因此 `schemaVersion` 保持 12，不追加空 migration。
- Step 4.4 的 modulation 字段全部 optional；默认空列表，单条 modulation 默认关闭实际影响
  （`depth = 0`），并通过 `12 → 13` migration 补齐。
- Step 5.1 仅增加会话级 staged shader program，不新增持久化字段，因此
  `schemaVersion` 保持 13，不追加空 migration。

## 运行

```text
pnpm run demo
```

打开 `http://127.0.0.1:4173/demo/`。

Windows 也可以直接双击项目根目录的
`启动-Glitch-Generator.cmd`。启动器会自动寻找系统 Node.js 或 Codex
自带的 Node.js，检测已有服务并打开默认浏览器。服务运行期间需要保持命令窗口开启。

## 本阶段未包含

- Uniform metadata / Custom(GLSL) target registry
- Uniform 完整 mapping / budget / safety 链
- Pass order 与 framebuffer preview
- Raw JSON editor
