# 音符级 MIDI 修正：交接与后续开发计划

- 日期：2026-09-22
- 当前开发包：`releases/0.5.0-dev.export.1`（XLD `0.5.0-dev.core.59` / XML `0.5.0-dev.stems.13`）
- 企划书：`docs/XLD_MIDI_EDITING_PROJECT_PLAN_20260920.md`
- 执行方案（十一轮，逐轮状态都在里面）：`docs/XLD_MIDI_EDITING_EXECUTION_PLAN_20260920.md`
- 本文用途：**接手的人只读这一份就能动手**。要细节再去读对应轮次的 `work/<round>/HANDOFF.md`。

---

> 最新增量：R11 已完成，十一轮工程功能已交付。见 work/midi-export-20260922/HANDOFF.md。已验证原样导出、融合版本、草稿换源恢复及独立进程重开；用户实际修正听评和正式版跨机器验收待进行。以下原计划和 STOP-AND-ASK 保留作历史依据，以各轮交接为准。

## 1. 进度：十一轮工程功能已交付

| 轮次 | 标题 | 状态 | 交接 |
| --- | --- | --- | --- |
| R1 | 融合容错与跳过说明 | **已交付** merge.1 / core.49 | `work/merge-skip-20260920/` |
| R2 | 乐器维度：只读 SMF 读取与音符标识 | **已交付** instrument.1 / core.50 | `work/instrument-lanes-20260920/` |
| R3 | 人工修订记录契约、版本面板与当前版本显示 | **已交付** revision.1 / core.52 | `work/revision-record-20260920/` |
| R4 | 修订写入器与提交路径 | **已交付** writer.1 / core.53 | `work/revision-writer-20260921/` |
| R5 | 单轨 MIDI 试听 | **已交付** audition.1 / core.51 | `work/audition-20260920/` |
| R6 | WAV / MIDI 同钟对照与区间循环 | **已交付** compare.1 / core.54 | work/compare-loop-20260922/ |
| R7 | 修正模式与选择（单选 / 加选 / 框选） | **已交付** selection.1 / core.55 | `work/note-selection-20260922/` |
| R8 | 可编辑渲染 A：视口重绘、不重分配、叠加画布 | **已交付** viewport.1 / core.56 | `work/viewport-render-20260922/` |
| R9 | 可编辑渲染 B：固定行高、纵向滚动、深缩放 | **已交付** pitch.1 / core.57 | `work/pitch-zoom-20260922/` |
| R10 | 编辑词汇、撤销重做与草稿 | **已交付** edit.1 / core.58 | work/midi-editor-20260922/ |
| R11 | 单轨导出、换源行为与 P0 验收 | **已交付** export.1 / core.59；用户听评待进行 | work/midi-export-20260922/ |

**现在能做什么**：一条命令能把「父 runId + 乐器序号 + 音符表」变成一份已保存并已激活的人工修订；
修订是一等版本（可读、可列、可切、可钉、进融合、上时间轴）；时间轴按乐器拆轨；单轨支持 WAV/MIDI 原位对照、区间循环、音符单选/加选/框选及只读属性。
**现在可以编辑**：增删、拖动、调整两端/力度、撤销、草稿恢复、保存修订。**已补齐**：声部完整 MIDI 导出、草稿回找及 P0 工程全链验证。**仍待进行**：真实修正听评；空 MIDI 首个乐器及删除最后音符延后。

---

## 2. 已锁定的约定（不要重新讨论，除非有新证据）

| 约定 | 决定 | 日期 | 代价 / 回头信号 |
| --- | --- | --- | --- |
| 人工修订 identity | **每份修订各有唯一 identity** | 09-20 | 后果：修订**永远** `matches:false` / 状态 `superseded`。回头信号见 §5 |
| engine id | **`manual-revision`**（不是企划书写的 `manual`） | 09-21 | `manual` 已被人工段落 / 和弦标注占用 |
| MANUAL profile 位置 | 进 `PROFILE_LOOKUP`，**不进 `models.json`** | 09-21 | 进了就会出现在模型菜单、被 `ENGINE_IDS` 当成可启动引擎、进 Python runner 的 `--engine` 选项 |
| MANUAL `options` | **必须为空 `{}`** | 09-21 | `profileMismatch()` 先比 profile 声明的 options，任何差异返回 `midi-invalid` → 界面渲染成**「记录损坏」** |
| 缓存命中跳过 activate | **只覆盖「当前启用的是人工修订」** | 09-20 | STOP-AND-ASK 3；真正跑出新结果的模型 run 仍接管指针 |
| 试听音色 | **手写 WebAudio 合成** | 09-20 | 判断不了鼓类别与音色；备选音源 `TimGM6mb.sf2` **全仓无许可记录**，不能进包 |
| 保存时父来源 stale | **拒绝，一个字节不写** | 09-21 | 企划书担心的「挡住 MEGURI 弦乐主验收路径」实测不成立（那条是 `midi-missing` 不是 stale） |
| 空文件加第一个音符 | **R4 先拒绝**，给可读中英文 | 09-21 | program / 轨名 / 通道分配三个设计决定留给 R10 |

---

## 3. 实测推翻过企划书的三处（别照企划书重做）

1. **R4 的校验形状**（最重要）。企划书规定「重读父文件 vs 重读子文件」逐字段比对，并说 `merge.py` 那种内存对比抓不到。
   **两个方向都错**：对未编辑的乐器，库里每个 `.mid` 都是 pretty_midi 自己写的、已是往返不动点（两个分析根共 163 个文件
   全部逐字节重现），而内存对象**就是** source 的解析结果，两种比法**是同一个比较**，结构上不可能失败；
   对被编辑的乐器，重读 vs 重读**无法**校验（父文件里是旧音符），而企划书恰恰把它排除在外。
   **现行实现**：未编辑乐器用**原始 MTrk 块 SHA-256**（影响半径实测恰好一个块，且对 pretty_midi 读取时就丢掉的
   sysex / marker / aftertouch / running status / 通道分配免疫）；被编辑乐器对照**请求的音符**，其 CC / 弯音 / 名称 /
   program 对照父文件。详见 `analysis-midi/revise.py` 顶部注释。
2. **`manual` 这个 id 已被占用**（见 §2）。
3. **MANUAL 必须进 profile 查找**——读者一度主张「必须进 PROFILES」，那是错的；企划书是对的，但理由比它写的更硬。

---

## 4. 接下来每一轮的具体入口

### R6 — WAV / MIDI 同钟对照与区间循环（依赖 R5 ✅，便宜可逆）

**接缝已经留好**：`timeline-controls.js` 有 `setTimeSource(fn | null)`，`updatePlayhead()` 设了就读它、否则读
`audio.currentTime`。R5 的试听已经在用它。R6 要做的是让 WAV 与 MIDI 读同一个时钟，而不是再加一套。

- 关键事实：WebAudio **没有 `timeupdate`**；`<audio>` 暂停时那个事件根本不发。R5 用 rAF 循环推光标。
- 关键事实：`desktop/main.cjs` 设了 `backgroundThrottling`（`XLD_TEST` 时关闭），窗口隐藏时定时器被节流；
  R5 的前瞻窗口是 1.5 s、tick 120 ms，就是为这个。
- 区间循环是**第三种指针模态**：`attachLane` 的 `pointerdown` 在 `!annotating` 时已经占了 scrub，
  Escape 的处理顺序也已经有约定（草稿 → 聚焦）。加循环手势前先读 `timeline-controls.js` 那两处。
- 互斥：`app.js` 里已有「开始试听 → 暂停 `<audio>`」「点录音 → 暂停试听」。R6 要让两者**同时**发声，
  必须重新设计这一对，不能直接删。

### R7 — 修正模式与选择（已交付）

现行入口：单轨视图「选择音符」。稳定键为 instrumentIndex:noteIndex；刷新/换曲/换轨清空。紧凑属性栏、互斥手势、Esc 次序见本轮 HANDOFF。R8 保留这些语义，只改绘制方式。

- 音符标识已经就位：渲染端每个音符是 6 元组 `[start, end, pitch, velocity, instrumentIndex, noteIndex]`，
  `noteIndex` 是它在 `notes.json` 里的原始下标，**排序不会把它和音符分开**。
- lane 身份是 `laneId`（如 `strings#3`），不是 `stem`。`timeline-controls.js` 有 `laneFor(id)`。
- **回头信号**（企划书 §5）：8 分下点不中的比例高到需要加大容差来遮盖，说明渲染模型错了——
  **这一刻发现比在 R8/R9 之后便宜得多**。

### R8 / R9 — 可编辑渲染（均已交付）

R9 当前接缝：固定 18px 的 `noteRect()`、`surface.pitchTop`、`setPitchTop()` 和视口内原生滚动条。绘制与命中仍用整曲 x 坐标、内容 y 坐标；R10 不要把屏幕 y 当作音高。深缩放最大 128×，倍率按钮一键回到全曲。

R8 已交付：`surfaces` 按 laneId 保留底层/选择层；`queuePaint()` 合并滚动帧；坐标仍用整曲秒数，只裁剪绘制范围。R9 从这套渲染继续，不恢复全曲宽位图。现状已改为横向视口绘制，下面关于全量绘制的描述是原方案背景。

企划书把渲染拆成两轮是对的：五件互相独立的机制（视口重绘、不重分配、叠加画布、固定行高、纵向滚动、深缩放）
不能同轮。现状是 canvas 全量重绘，单曲可超万音符。

### R10 — 编辑词汇、撤销重做与草稿（依赖 R4 ✅ R6 R9）

**写入器已经就绪，R10 只需要接两个口子**：

- `assets:inspect-midi-run` → `{instruments:[{index,name,program,isDrum,noteCount,controlChanges,pitchBends,notes[]}], chunks[], resolution}`
- `assets:save-midi-revision` → `{stem, parentRunId, instrument, notes[]}`，返回 `{ok, runId, parentRunId, active, writer:{...}}`

`notes` 是**替换后该乐器的完整音符表**，不是 diff。Node 侧会把超界值钳进 `(0, duration]` 与力度 1–127；
**六类音符写前即拒**（空列表、力度 0、零/负长度、短于一个 tick、同音高重叠、无改动），错误码形如
`revision-overlapping-notes`，界面必须按名渲染，**不能把 traceback 丢出来**。

R10 还欠一个决定：**草稿只活在会话内，还是重开应用仍要在**（STOP-AND-ASK 7）。持久化要
`midi/<stem>/drafts/<id>.json`（`kind:'midi-draft'`，与 `kept/` 同样的目录手法），且**不能**进 run 目录——
`midi-delete` 只删「恰好两个文件」的 run 目录。

### R11 — 单轨导出、换源行为与 P0 验收

---

## 5. 原始未决清单（R10 已落实默认，见顶部增量）

| # | 问题 | 为什么要现在问 |
| --- | --- | --- |
| 7 | R10 草稿是否跨会话持久化 | 决定要不要新增 `drafts/` 目录契约 |
| 8 | §9.1 的力度验收换曲目还是从 P0 删掉 | MEGURI 弦乐 4698 个音符**力度全是 100**（muscriptor 常量），演示不了力度；piano / bass 可以 |
| — | **identity 归并的回头信号** | 企划书说「人工修订永远显示成 superseded 若要在四处以上打补丁才顺，就该改成共用 MANUAL identity」。**实际已改五处**（记录层、回收、缓存分支、版本面板、状态行）**加上** XML 那条转谱路径——**已经贴着线**。R10 落地前要重新数一次，这是全案最贵的一条约定，第一份真实修订之后再改就要迁移用户已保存的工作 |

---

## 6. 明确欠着的债（不影响数据，但会误导）

- **engine 卡片与一键生成的计划文案**（`derived-controls.js` 的 `renderModels` 与 `renderBatch`）仍按模型口径
  描述一个持有人工修订的声部。不破坏数据（修订在盘上、有指针、可切回），企划书也把它们放在 R3 范围外，
  但文案误导，**R10 之前值得收掉**。
- **已解决（R6）**：重复的 timelineZoomLabel 已拆分为音符时间轴的 noteTimelineZoomLabel 与段落比较标签；定位光标同时接入试听时钟。
- **`interface-policy.cjs` 的扩展名黑名单没有 `.sf2 / .sf3 / .dls`**，也没有体积上限——
  一个音源文件今天可以直接进包。项目立场是「不镜像受限权重」，但这条没被规则挡住。
- **时间轴不标注「旧模型版本」**：`matches` 在 payload 里，但轨头不显示。
- **批量计划不区分版本**；`assets:read` 的 per-run 维度未做；`activate()` 不是事务性的。
- `tests/open-request.cjs` 曾观察到一次 `2 !== 1` 失败，无法复现。

---

## 7. 操作规则（硬约束，别踩）

1. **只改 `source/`**，产出新的 `releases/<version>` 目录。`D:/Program Files/xins-music-lab-fusion` 只读。
2. **永远不要写入真实分析根**：`artifacts/refinement-three-20260915/analysis`（116 个 .mid，**正在使用**，
   历史命名不代表可丢）与 `D:/Caches/Xin's Local Deck/Analysis`（47 个）。隔离夹具放 `D:/Caches/codex/`。
3. **永远不要删用户的 WAV / MIDI / 结果。**
4. **删任何 `releases/` 目录前先查进程**，而且**检查结果要真正决定是否继续**——曾经打印了 RUNNING 却照删。
5. **断言不变量，不要断言计数**：用户会在你跑的时候改曲库。发布前对源码做哈希核对。
6. **不改已被听评接受的默认**，除非用户自己给出听评结论。新引擎先作为备选。
7. **包里不放无许可的权重 / 音源。**
8. **Bash heredoc 会吃掉一层反斜杠**——凡是带转义的文件改动一律用编辑工具落盘。
   `tests/source-hygiene.cjs` 会扫全树的杂散控制字符。
9. **每轮的发布流水线**：`work/<round>/` 下 `stage.cjs → build.cjs → verify.cjs → run-ui.cjs → publish.cjs`，
   证据进 `artifacts/<round>`。从最近一轮复制脚本改版本号即可。
10. **构建只重写两个文件**：`index.html`（发布 UI 注入）与 `desktop/preload.cjs`（XinRelease contextBridge 那一行）。

### 测试链

| 链 | 命令 | 是否在 `npm test` |
| --- | --- | --- |
| XLD | `source/xld-runtime-baseline` → `npm test` | 是（36 条） |
| XML | `source/fusion-runtime-baseline` → `npm test` | 是（15 条） |
| release-tools | 逐个 `node test-*.cjs` | 无 package.json，手动跑四个 |
| 融合 | `XLD_MERGE_TEST_ROOT=<含 fixture.json 的目录> npm run test:merge` | **否**——需要夹具 |
| Python 往返 | `XLD_REVISION_TEST_ROOT=<含 fixture.json 的目录> npm run test:revision` | **否**——需要 MIDI 运行时 |

后两条**不进链是有意的**（那条链是纯 Node，加 Python 依赖会让没有运行时的机器无端变红），
但**每轮都要跑并把日志随 `artifacts/` 发布**——不写进清单它就只会绿一次。
`tests/midi-merge.cjs` 就是这么静静坏掉过的：它期望值写死了三个声部，夹具后来多了鼓。

---

## 8. 给接手 agent 的两条经验

- **先量，再按企划书做。** 这个会话里企划书被实测推翻了三次，其中 R4 那次如果照做，会产出一个
  **结构上不可能失败**的校验，并且**恰好不检查唯一会出错的地方**。
- **成本**：真正烧账户额度的是**并行调研工作流**（本会话两轮分别约 88 万 / 57 万 subagent token），
  本地测试链、构建、打包窗口检查几乎不花额度。额度紧张时就别开工作流，本地验证照做。

---

## 9. 本会话的完整记录

`DEVELOPMENT_LOG.md` 有五轮的逐轮条目（2026-09-20 / 09-21），`SOURCE_OF_TRUTH.md` 顶部是当前状态，
`CLAUDE_HANDOFF.md` 第 5 条是按时间倒序的交接索引。调研工作流的原始结果在
`.claude/projects/.../subagents/workflows/wf_cd0eafbb-1d3`（R3）与 `wf_e90bffdd-da3`（R4）的 `journal.jsonl`。
