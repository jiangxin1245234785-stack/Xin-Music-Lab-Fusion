# XLD 音符级 MIDI 修正：可逐轮交付的执行方案

> 接续说明（2026-09-22）：本文 R1–R11 为历史实施范围。R12 起按[统一试听与 MIDI 修正企划书](XLD_PLAYBACK_EDITING_PROJECT_PLAN_20260922.md)执行，先统一播放，再做多轨试听与高频修正；FL Studio/外部 DAW 往返暂缓。

- 版本：v1.0（对应企划书 `XLD_MIDI_EDITING_PROJECT_PLAN_20260920.md` v1.0）
- 日期：2026-09-20
- 基线：release `0.5.0-dev.retire.2`，XLD `0.5.0-dev.core.48`
- 状态：方案；本文档产出过程未修改任何源码

---

## 0. 先说结论：企划书有七处前提与代码不符

功能范围与优先级站得住。但有七条前提经代码与真实文件核实后不成立，**每一条都改变轮次边界或顺序**。

### 1. §7.2.3 不是边界情况，它由主验收样本触发

MEGURI 弦乐当前启用的 run（`00d4b78e`，muscriptor-large）实测：

```
format 1 · 6 MTrk · division 960
  cello 1128 · string ensemble 1014 · contrabass 265 · violin 1123 · viola 1168  = 4698
```

`runner.py:182` 的展平是 `for part in midi.instruments for note in part.notes`，`notes.json` 里**没有任何乐器标签**。任何"从 notes.json 重建 .mid"的保存路径，会在企划书自己点名的样本上把五个弦乐声部塌成一条。

**保存必须以父 `.mid` 为输入，只替换一条乐器的音符表。** 仓库里没有任何 JS MIDI 解析器——`derived-assets.cjs:113` 与 `midi-merge.cjs:34` 都只校验 4 字节 magic。

> **顺带一个发现，值得单独看**：MuScriptor 一直在往 strings 的 `.mid` 里写五条命名乐器轨。你当初想要的 violin / cello 区分，**数据早就在盘上**，只是界面从来没读过。撤回弦乐分件那轮的结论（组不是乐器、真正分件需要链式残差）对**分轨**仍然成立；但在 **MIDI 这一层，分件是现成的**。R2 把它露出来，不需要任何新模型。

### 2. 渲染端的数组下标 ≠ notes.json 的下标

`timeline-controls.js:730`：

```js
for (const lane of lanes) lane.notes.sort((a, b) => a[0] - b[0]);   // role spans walk the notes in order
```

这行不能删（`drawLane` 的 role cursor 单调推进，依赖升序）。而 notes.json 是"每乐器内排序后按乐器顺序拼接"。实测 MEGURI 弦乐有 **4 处 start 逆序，位置 [1128, 2142, 2407, 3530]——恰好是五条乐器轨的累计边界**。

所以"按累计音符数分段 `lane.notes`"会把大多数音符分到错误的乐器，而**"偏移之和等于 noteCount"这种自检抓不到**（排序不改变长度）。

**乐器标识必须在 `desktop/main.cjs` 的 `readMidiNotes` 里、在 payload 离开主进程之前打上，随每个音符一起下发。**

### 3. §8 的"融合读取"不是一行改动

`midi-merge.cjs` 的 `plan()` 容错列表加上 `'midi-string-source-stale'` 之后，弦乐会被**静默跳过**——`parts` 与 `provenance` 都只为被采纳的声部构造，返回值里没有任何字段说明谁被丢了。那正是 §7.2.4 禁止的形状：成功却悄悄少了数据，而 §9.1 第 6 步会在一个**根本不含弦乐的文件**上"通过"。必须同时补 `skipped:[{stem,reason}]` 并一路送到界面。

### 4. 一条企划书没点名的依赖：`activate()` 会校验当前来源

`activate()` 调用 `verify(..., {source: await source(track, stem)})`。换过弦乐来源之后保存一份弦乐修订，会抛出同一个 token，而且是**在 `.mid` 与 `notes.json` 已经落盘之后**抛出，留下一个没有记录、没有指针、`listRuns` 看不见、保留扫描永远跳过的孤儿目录。

**保存必须先校验后写，且先写暂存、`activate()` 成功后再移入 run 目录。**

### 5. §9.1 第 8 步今天结构性不可能通过

`analysis-service.cjs:323` 的缓存命中分支在什么都没算的情况下执行 `await midiAssets.activate(track, cached)`；而 `read(track, stem, engine)` 是按 engine 取的，人工修订不会是它的返回值。于是 `cached.matches` 成立、**平指针被改写回模型稿**。同时 `derived-controls.js` 的 `midiFor` 在 engine 不匹配时回落到 `result.midi[stem]`，批量面板把这个动作标成"复用"。**要在"能保存"之前修好。**

### 6. §7.2.8 的保护今天已经成立，但靠的是巧合

`midiRetention.sweep` 只有一个调用点且永远传模型 engine，而 `collectRuns` 在 `(engine && engineOf(raw) !== engine)` 处就把人工记录滤掉了。**不需要新机制，需要把这条隐式保护写成显式且能失败的断言**——测试必须以 `engine: null` 驱动 sweep，否则新守卫从未执行也全绿。

keep marker 不能当保护：`keepRun(...,false)` 无任何检查即删标记，版本面板对每一行都渲染无条件的保留按钮。

### 7. 主验收样本演示不了力度，也演示不了空轨

MEGURI 弦乐 4698 个音符**力度全是 100**（muscriptor 常量，实测不同值个数 = 1）。E05 的力度一半与 §9.2 的"明显力度差异"必须换到 piano 或 bass。

另外盘上实测存在两个退化 `.mid`：41 字节（New Order「Ceremony」strings，且是 **active 指针**）与 156 字节（birthday resistance piano）。而空轨在两处被丢弃（`main.cjs:587` 的 `if (!notes.length) continue`、`timeline-controls.js:729` 的 lane 过滤），所以"给空声部补第一个音"今天连轨道都看不到。

### 两条范围修正

- **E04 的多选 / 框选是 P0**，不能下推给 P1——验收要点明写"多选时修改范围明确"，§4 第一条场景就是选中多个碎片。
- **E01 试听从零开始**：XLD 源码树里没有任何 `AudioContext`；今天那个叫"MIDI 试听"的按钮播的是转谱模型吃的那条 **WAV**。

---

## 1. 排序总览

| 轮次 | 标题 | 体量 | 依赖 | 可逆性 | 状态 |
| --- | --- | --- | --- | --- | --- |
| R1 | 融合容错与跳过说明 | medium | — | 便宜可逆 | **已交付 merge.1 / core.49** |
| R2 | 乐器维度：只读 SMF 读取与音符标识 | medium | — | **契约，代价高** | **已交付 instrument.1 / core.50** |
| R3 | 人工修订记录契约、版本面板与当前版本显示 | large | — | **契约，代价高** | **已交付 revision.1 / core.52** |
| R4 | 修订写入器与提交路径（开发命令驱动） | large | R1 R2 R3 | **契约，代价高** | **已交付 writer.1 / core.53** |
| R5 | 单轨 MIDI 试听 | medium | — | 便宜可逆 | **已交付 audition.1 / core.51** |
| R6 | WAV / MIDI 同钟对照与区间循环 | medium | R5 | 便宜可逆 | **已交付 compare.1 / core.54**
| R7 | 修正模式与选择（单选 / 加选 / 框选） | medium | R2 | 便宜可逆 | **已交付 selection.1 / core.55** |
| R8 | 可编辑渲染 A：视口重绘、不重分配、叠加画布 | medium | R7 | 便宜可逆 | **已交付 viewport.1 / core.56** |
| R9 | 可编辑渲染 B：固定行高、纵向滚动、深缩放 | medium | R8 | 便宜可逆 | **已交付 pitch.1 / core.57** |
| R10 | 编辑词汇、撤销重做与草稿 | large | R4 R6 R9 | 中等 | **已交付 edit.1 / core.58** |
| R11 | 单轨导出、换源行为与 P0 验收 | medium | R10 | 便宜可逆 | **已交付 export.1 / core.59，工程通过，用户听评待进行** |

十一轮不是铺量，是三处对抗性检查逼出来的：R1 从 small 涨到 medium（`skipped` 要贯通到界面）；渲染必须拆成 R8/R9（五件互相独立的机制不能同轮）；R4 **由开发命令驱动而不是界面**，否则会先造一个 R10 必须重做的一次性编辑路径。

**每轮都让三条测试链保持全绿，都能单独构建发布。** 一个例外：R4 引入的 Python 往返测试**不进** `npm test`——该链今天是纯 node，加 Python 依赖会让没有 highres 运行时的机器直接红。它作为第四条日志随 R4 及之后每轮的 `artifacts/` 发布；不写进交接清单它就只会绿一次。

**两条贯穿全案的操作规则**（都是这次核对踩到的）：

- 新增的融合断言**不要**放进 `tests/midi-merge.cjs`——它只在 `test:merge` 里跑，不在 `npm test` 链上。放进 `tests/string-midi.cjs` 或 `tests/midi-history.cjs`，或者同轮把它加进 `test` 串。
- 每轮的 `stage.cjs` 以**唯一代码子串**定位，不要用行号；本次核对中多处行号相对探针漂移 1–8 行。

---

## 2. 逐轮方案

### R1 — 融合容错与跳过说明

**交付后能做什么**：换过弦乐来源之后仍能融合，且界面说得清弦乐为什么没进去。今天这条路会把内部 token 抛到中文界面。

**真实窗口里试的那件事**：在隔离夹具里把弦乐来源换成另一个 Mega53 目标，回 MIDI 页点融合。任务完成，状态行读到"已跳过 弦乐：来源已变化"，合并文件含其余声部；旧的 `merged/<fingerprint>` 目录仍在。

**文件**：`core/midi-merge.cjs`（`plan()` 容错列表 + `skipped`，`read()` 与 `generate()` 透传；**`fingerprint` 哈希输入不变**，已有 merged 目录仍解析得到）、`core/analysis-service.cjs` 的 `readMidiMerge`、`desktop/main.cjs` 的 `assets:read`、`derived-controls.js` 融合状态行、`i18n/*`、`package.json`。

**新增测试**：`tests/string-midi.cjs` 追加——构造 stale 的 strings 记录加两个健康声部，断言 `plan()` 不抛、`parts` 不含 strings、`skipped` 含 `{stem:'strings',reason:'midi-string-source-stale'}`、该文案键中英都在。`tests/muscriptor-string-cache.cjs` 已能制造这个状态，复用其 setup。

**受影响的既有测试**：`tests/string-midi.cjs` 现有的 `!plan().ok` 断言——**行为变更**：仍成立，但理由从"抛出"变成"声部不足"，注释必须改，否则这条测试在说谎。

**验收（含必须没变的）**：跳过原因到达渲染字符串，内部 token 永不出现在界面；没有 strings 的曲目其融合 fingerprint 逐字节不变；`analysis-*/` 整棵树、IPC 通道集合不变。

**主要风险**：容错把一次响亮的失败换成一次安静的缺失。**先写"跳过原因到达状态行"这条断言，再写"融合成功"**——只断言 `plan()` 返回 ok 的单向测试，对一个永远丢掉弦乐的融合同样成立。

**覆盖**：§8 启动前置；解锁 §9.1 第 6 步。

---

### R2 — 乐器维度：只读 SMF 读取与音符标识

**交付后能做什么**：时间轴不再对多乐器声部说谎。MEGURI 弦乐显示为 cello / string ensemble / contrabass / violin / viola 五条子轨，每个音符知道自己属于哪条。空声部第一次能被看到。

**真实窗口里试的那件事**：聚焦 MEGURI 弦乐，五条命名子轨各带音符数；再聚焦 New Order「Ceremony」的弦乐（41 字节零乐器），看到一条空的卷帘而不是没有轨道。

**文件**
- 新增 `core/midi-read.cjs`：**只读** SMF 解析器，只覆盖全库实际用到的 8 种事件（note_on 含 velocity 0 作 note-off、pitchwheel、control_change、program_change、set_tempo、time_signature、track_name、end_of_track），按 pretty_midi 的 `(program, channel, track)` 分组顺序给出每组音符数。写入永远留在 Python。
- `desktop/main.cjs` 的 `readMidiNotes`：按累计数分段**原始 notes.json 数组**（此处位置仍有意义），每音符下发 6 元组 `[start,end,pitch,velocity,instrumentIndex,noteIndex]`；lane 带 `instruments:[{index,name,program,isDrum,noteCount}]`；删掉 `if (!notes.length) continue`。**失败闭合**：解析失败或分组数不能还原 noteCount → `instrumentIndex` 全为 `null` 且 lane 标 `editable:false`，**绝不猜**。
- `timeline-controls.js`：去掉空 lane 过滤；**保留** `:730` 的排序（标识随元组走，不再被排序破坏）；`laneLayout` 与聚焦支持子轨；轨头渲染乐器名与音符数。

**新增测试**：`tests/midi-read.cjs`——format 0 / 1、running status、velocity-0 note-off、SysEx 跳过、畸形块拒绝、分组顺序与 pretty_midi 一致（用真实文件的已知计数当夹具）。

**验收**：MEGURI 弦乐五条子轨计数为 1128/1014/265/1123/1168；解析失败的声部标 `editable:false` 而不是乱分；`core/` 其余、`analysis-*/` 逐字节不变。

**主要风险**：分段错了看起来完全正常。**对齐检查必须用"每乐器内 start 单调不减"，不能用"偏移之和等于 noteCount"**——后者对排序错位完全无效。

**覆盖**：§7.2.2（稳定音符标识）、§7.2.3 的读取一半、E18 的前置。

> **已交付 instrument.1 / core.50（2026-09-20）**，交接 `work/instrument-lanes-20260920/HANDOFF.md`。
> 包内新增 1 个文件、改动 4 个，`analysis-*/` 与 `core/` 其余逐字节不变，IPC 通道未变，XML 侧 0 处改动。
> 打包窗口实测 MEGURI：guitar 拆 3 条、strings 拆 5 条，计数与企划书一致；聚焦作用于单件而不是整个声部。
> 全库只读实测 124/124 解析吻合、0 处组内时间倒退。
> **与企划书的两处出入**：(1) `editable` 改成空文件也为真——原设计只在 `notes.length > 0` 时可能为真，会把盘上唯一的
> 空结果（New Order「Ceremony」strings，41 字节，真实 active 指针）标成不可读，等于让最需要「加第一个音符」的声部
> 成为唯一加不了的那个；这是契约字段，发布后再改要迁移。(2) 新测试 `tests/midi-read.cjs` 用**全合成字节**而不是
> 「真实文件的已知计数当夹具」——曲库会在测试脚下变动，全库那次实测记在交接里和 `verification.json` 里。
> **一处未在窗口里验证**：空声部的可见性只在渲染层测试与发布包解析器两端钉住，隔离夹具里没有空结果。

---

### R3 — 人工修订记录契约、版本面板与当前版本显示

**交付后能做什么**：人工修订成为一等版本——`read` / `listRuns` / 时间轴 / 融合都认它，版本面板列出它，状态行不再把"正在使用人工修订"说成"无结果"或"生成 MIDI"。此时还没有编辑界面，修订由夹具手工拼出。

**文件**
- `core/derived-assets.cjs`：新增 `MANUAL = {id:'manual', name:'人工修订', stems:STEMS, model:'manual-revision-v1', options:{}}`，`profileFor`/`profileForResult` 认它，但**不进 `analysis-midi/models.json`**（`PROFILES` 喂 `runnerFor`、`isMidi` 判定与 `midiEngines()`，进了就会出现在模型菜单并被误击）。每个修订的 identity 带 `options:{revision:<内容摘要>, parentRunId}`。
- `core/midi-retention.cjs`：candidates 条件追加 `&& run.engine!==MANUAL_ENGINE`（把巧合变成守卫）。
- `core/analysis-service.cjs`：缓存命中分支，平指针当前记录 engine 为 `manual` 时**跳过 `activate()`**，如实报 `{cached:true, activated:false, keptActive:<runId>}`。**仅限这一种情况**（见 STOP-AND-ASK 3）。
- `desktop/main.cjs`：`assets:run` 在闸门之前显式拒绝 `engine==='manual'`；`assets:midi-runs` 接受它。
- `derived-controls.js`：`renderVersions` 前置一行**始终拉取**的 `engine:'manual'` 行；`switchVersion` 不把 `manual` 写进 `localStorage`；状态行在 `midiFor` 的模型查找之前加人工分支。

**新增测试**：`tests/midi-revision-record.cjs`——`activate()` 接受人工记录；`identityOf(MANUAL)` 与 `PROFILES` 任何一项不碰撞；**双向测试：必须以 `sweep(track, stem, null, ...)` 驱动**（同时放一个未被指、未钉住的人工修订和一个未被指的旧模型 run，断言只有模型 run 被回收），并静态钉住唯一调用点仍是 engine 作用域。

**受影响**：`tests/midi-history.cjs` 的唯一性断言——**扩展**（纳入 MANUAL）；`tests/midi-delete.cjs` 的后继搜索——**行为需重新确认**（同引擎作用域，删一个模型 run 不应落到人工修订上）。

**主要风险**：一旦任何一处把 `status==='superseded'` 当成"过期废稿"，人工修订就会被灰掉或标成"旧版本"。**在 status 为 superseded 的同时**把 `read()`、融合、`readMidiNotes`、版本面板四处都验明白。

**可逆性**：**本方案最贵的一条约定。** identity 是否按 engine 归并，是迁移用户已保存工作的分界。日常"人工修订永远显示成 superseded"若需要在多处打补丁才顺，就是走错了（见 STOP-AND-ASK 2）——而这个信号只在**第一份真实修订出现之前**廉价。

> **已交付 revision.1 / core.52 / XML stems.13（2026-09-20）**，交接 `work/revision-record-20260920/HANDOFF.md`。
> **与本条计划的四处出入，都来自动手前那轮并行精读**：
> 1. **engine id 是 `manual-revision`，不是本文写的 `manual`。** `app.js` 里人工段落 / 和弦标注的引擎 id 就叫 `manual`，
>    XML 适配器还有 `manual-tags`。盘上 497 条 MIDI 记录无一占用，现在改零成本，以后改要迁移。
> 2. **多改一个文件：XML 的 `fusion:midi-run`。** 本文的文件清单里没有它。它自己挑引擎，渲染端 `force` 恒为真，
>    所以工作台那条保护修订的缓存分支走不到——**在任何一种 MANUAL 形态下，它的转谱按钮都会把模型结果盖在人工修订上**。
>    这是本轮唯一一条真正的数据丢失路径，已在挑引擎之前拒绝，按钮同步禁用。
> 3. **`options` 必须为空的理由比本文更硬**：`profileMismatch()` 先比 profile 声明的 options，任何差异返回 `midi-invalid`
>    而不是 `midi-model-invalid`，前者在界面上是**「记录损坏」**。声明 options 等于把每份修订展示成坏文件。
> 4. **顺带修了一个既有缺陷**：把融合测试跑起来后发现，未分轨的曲目会让 `midi-merge.plan()` 抛异常而不是返回拒绝。
>    该测试需要夹具、不在 `npm test` 里，所以这个缺陷一直没人撞上。
>
> **回收守卫已用行为证明承重**：把修订排在回收范围正中间、用 `sweep(track, stem, null, ...)` 驱动，
> 去掉守卫那一次 sweep 回收两个 run——多余的模型 run **和用户的人工修订**。
>
> **回头信号的当前读数**：实际改了五处（记录层、回收、缓存分支、版本面板、状态行）**加上** XML 那条转谱路径。
> 本文写的阈值是「四处以上就该改成共用 MANUAL identity」——**已经贴着线**。R4 写入器落地时要重新数一次。
>
> **未做**：engine 卡片与一键生成的计划仍按模型口径描述持有修订的声部（不破坏数据，本文也把它们放在 R3 范围外）。

---

### R4 — 修订写入器与提交路径（开发命令驱动）

**交付后能做什么**：一条命令把「父 runId + 乐器序号 + 音符表」变成一份已保存并已激活的人工修订，并自带校验：被编辑乐器的音符之外，**文件里什么都没变**。刻意不含编辑界面——编辑词汇只在 R10 落地一次。

**文件**
- 新增 `analysis-midi/revise.py`：`--inspect` 与 `--write`（job JSON `{source, instrument, notes, output}`）。`PrettyMIDI(source)` → 替换 `instruments[i].notes` → 写出 → **重读，验证被替换乐器之外的"重读的文件"对"重读的原件"**逐字段 1 ms 容差比对 notes / control_changes / pitch_bends，并比对 `get_tempo_changes()`、time_signature 与 resolution。直接照 `merge.py` 的"写前内存对象 vs 写后重读"是**不够**的。
- 新增 `core/midi-revision.cjs`：**提交顺序固定为**——重读父记录 → 对当前来源 `verify()` → 不通过即带错误回执拒绝（**一个字节都不写**）→ 写暂存 → 校验 → 移入 `midi/<stem>/<新 runId>/` → `activate()` → 失败则删整目录。`sourceRunId`/`source`/`duration`/`sourceTarget`/`program` 从父记录照抄；写入前每个音符钳到 `(0, duration]`、力度钳到 1–127。
- `desktop/main.cjs`：新增 `assets:save-midi-revision`，与 `assets:activate-midi-run` 同一道 `analysis-busy` + `midiSourceChanging` 闸门。
- `check-runtime.cjs`：`XLD_MIDI_PYTHON` 探针补一条 `pretty_midi` 断言。

**验收**：往返后被编辑乐器之外逐字段相同（**含 piano run `7c71caec` 的 14 个 CC64 全程在场**）；`activate()` 失败时磁盘上不留任何目录；上个 run 的两个文件 sha256 与执行前相同。

**主要风险**：往返把某些事件悄悄丢掉而校验通过。**"重读 vs 重读"是唯一能抓住它的形状**，`merge.py` 现在那种内存对比抓不到。

> **已交付 writer.1 / core.53（2026-09-21）**，交接 `work/revision-writer-20260921/HANDOFF.md`。
> **上面那条「主要风险」与它规定的校验形状，实测两个方向都是错的**，本轮按倒过来的设计实现：
> 1. **对未编辑的乐器，那个检查结构上不可能失败。** 库里每个 `.mid` 都是 pretty_midi 自己写的，已经是往返的不动点
>    （两个分析根共 163 个文件，116 + 47，全部逐字节重现）；且内存对象**就是** source 的解析结果、`write()` 不改动它，
>    所以「内存 vs 重读」与「重读 vs 重读」**是同一个比较**。不可能失败的检查会永远绿着并被当成有效证据。
> 2. **对被编辑的乐器，本文正好反了。** 重读 vs 重读在那里**无法**校验（父文件里是旧音符，只能报"数量变了"，
>    而那正是编辑本身），而本文把它排除在校验之外——那是唯一真会出错的地方。实测同音高重叠：数量 / 音高 / 力度
>    全不变，**结束时间早 1000 ms**。
>
> 改为：未编辑乐器用**原始 MTrk 块 SHA-256**（影响半径实测恰好一个块，且对 pretty_midi 读取时就丢掉的
> sysex / marker / aftertouch / running status / 通道分配免疫）；被编辑乐器对照**请求的音符**，其 CC / 弯音 /
> 名称 / program 对照父文件。子文件与一个 **control 文件**（父文件原样写回）比，而不是与父文件字节比。
>
> **对抗性检查逼出一条真漏洞**：被编辑乐器自己的 CC 就在允许变动的那一块里，擦掉 646 个延音踏板事件曾能通过。
> **容差改为一个 tick 而不是一毫秒**——这里一毫秒接近两个 tick，`merge.py` 现在的 `> 0.001` 放得过一次实测截断。
> **六类音符写前即拒**（实测阈值：0.26 ms 消失、0.40 ms 存活）。
> **一条 R3 的后果**：`pythonFor('manual-revision')` 会落到没有 pretty_midi 的 MSAF 解释器，写入器显式解析
> `XLD_MIDI_PYTHON`，并给 `check-runtime.cjs` 补了一条做真实往返的探针。

---

### R5 — 单轨 MIDI 试听

**交付后能做什么**：在应用内听到当前选定 MIDI 版本，与 WAV 对照核对音高、起音、音长。**独立于任何编辑能力**，本身就有用。

**要点**：XLD 里没有任何 `AudioContext`，从零开始。第一版用 WebAudio 合成（见 STOP-AND-ASK 6），只求足够判断音高/起音/时长/粗力度，不求音色像录音。暂停、跳转、切轨必须清干净调度，不留挂音。

> **已交付 audition.1 / core.51（2026-09-20）**，交接 `work/audition-20260920/HANDOFF.md`。
> 用户已拍板：手写合成；入口在工具条、作用于聚焦轨。纯渲染端——`core/`、`analysis-*/`、`desktop/` 逐字节未变，
> 无新 IPC，XML 侧 0 处改动，包里没有任何音频或音源文件。
> **三个参数来自全库实测而不是一首曲子**：复音上限 64（最密的一条轨同时发声 43，夹具单曲只会说 15）、
> 可听下限 30 ms（4.2% 的音符短于 50 ms，最短 0.6 ms；下限还必须小，否则相距 10 ms 的两个碎片会听起来连着）、
> 鼓完全不用音符时长（库里每个鼓音符恰好 0.100 s，是适配器写的固定值）。
> **比企划书多做的一件事**：`timeline-controls.js` 加了可选时间源。WebAudio 没有 `timeupdate`，不加光标不动；
> 而这道缝正是 R6「同钟对照」要换的地方，现在建好可以直接复用。
> 停止路径实际是五条（企划书写了三条）：加上「切 MIDI 版本」与「清理存储」——后者的既有实现是
> `querySelectorAll('audio')`，扫不到 WebAudio 图。
> **仍然未决**：鼓类别听不出来（STOP-AND-ASK 6 早已写明），音色是否够用要等真实听评。

---

### R6 — WAV / MIDI 同钟对照与区间循环

> 2026-09-22 已交付，交接 work/compare-loop-20260922/HANDOFF.md。A/B 原位切换与循环，不含同时混播。

**交付后能做什么**：同一时间位置在 WAV 与 MIDI 之间切换而不从头播放、不改变速度；圈选一段循环十遍。这是**用耳朵验证眼睛**的回路，企划书 §4 每一条场景都要用它。

**注意**：循环是**第三种手势模态**——`attachLane` 的 pointerdown 在 `!annotating` 时已经抢去做 scrub，需要自己的 Escape 层级。

---

### R7 — 修正模式与选择

> **已交付 selection.1 / core.55（2026-09-22）**，见 `work/note-selection-20260922/HANDOFF.md`。
> 单选、Ctrl/⌘ 加选/取消、拖动框选与只读属性栏完成；选择不移动音符或播放位置。标识沿用六元组原始 instrumentIndex/noteIndex。
> 自动窗口检查了 MEGURI 的 24 个音符中心在 8× 的命中，不扩大跨半音容差。人手细选的舒适度仍待 R9 固定行高/深缩放改善。

**交付后能做什么**：进入「修正」模式，单选 / 加选 / 框选音符，读到精确音高、起止与力度。**还不能改**。

**要点**：`blockAt` 命中测试要扩展到音符；8 分缩放下半音行高只有 1.0–1.6 px，命中需要垂直容差——那一刻发现的问题，比在 R8/R9 把渲染改完之后才发现便宜得多。

---

### R8 / R9 — 可编辑渲染

> **R9 已交付 pitch.1 / core.57（2026-09-22）**，见 `work/pitch-zoom-20260922/HANDOFF.md`。
> 单轨每半音/鼓键固定 18px，纵向滚动，最多 128× 时间缩放与倍率按钮回到全曲；细刻度显示毫秒。R8 以下交付说明是当时状态，R9 已接续完成。

> **R8 已交付 viewport.1 / core.56（2026-09-22）**，见 `work/viewport-render-20260922/HANDOFF.md`。
> 视口裁剪保留跨边界延音；同轨复用位图；选择只重画叠加层。五链与真实窗口通过。R9 固定行高/纵向滚动/深缩放尚未实现。

R8：视口重绘、不重分配、叠加画布（选中态不重画整轨）。R9：固定行高、纵向滚动、深缩放。

拆两轮的理由：五件互相独立的机制（视口裁剪、缓冲复用、叠加层、行高模型、滚动）放一轮，任何一处出问题都要整轮回滚。

---

### R10 — 编辑词汇、撤销重做与草稿

> 已交付 edit.1 / core.58（2026-09-22）；现行范围、限制、自动保留草稿默认及验证见 work/midi-editor-20260922/HANDOFF.md。以下原计划保留。

**交付后能做什么**：增删改音符、拖动与数值输入两条路径、撤销重做、草稿保存与恢复原稿。**P0 的核心，也是唯一需要一次性做对的编辑词汇。**

**要点**：一次拖动算一次操作；草稿位置见 STOP-AND-ASK 7；禁止负时长等无效结果。

---

### R11 — 单轨导出、换源行为与 P0 验收

> 已交付 export.1 / core.59。导出为整个已存声部文件，保留其中全部乐器。八步工程证据与剩余人工听评见 work/midi-export-20260922/HANDOFF.md，不能把自动验证写成听评完成。

**交付后能做什么**：导出单轨 MIDI（**逐字节等于当前 run 的 `.mid`**，不重新合成）；换源后旧修订保留并显示来源已变；跑完 §9.1 全部八步。

---

## 3. 需要你拍板（STOP-AND-ASK）

每条挂在需要它的那一轮，写成"选哪个 + 代价是什么"。

1. **R1 — 换过弦乐来源时，融合应该跳过弦乐并说明，还是拒绝并要求你重新转谱？**
  跳过给你一个立即可用的合并文件并明确说明；拒绝在你没注意到细节状态时更安全。**跳过是我的建议**，但代价是你可能拿到一个缺弦乐的文件。

2. **R3 — 每个人工修订各有唯一 identity，还是所有人工修订共用一个 MANUAL identity？** ✅ **用户已拍板（2026-09-20）：每份唯一。**
  R3 按此实现。随之而来的代价是明知的：每份修订 `matches:false`、状态 superseded，需要按 `engine` 单独渲染标签。
  **回头信号**：如果「人工修订永远显示成 superseded」要在四处以上打补丁才顺，就是走错了，应改成共用 MANUAL identity；
  这个信号只在第一份真实修订出现之前廉价，即 R4 完成之前必须判断完。
  **唯一（建议）**：与模型 identity 结构上不可能碰撞，同版本硬删与保留 pass A 永远够不到它；代价是每份修订都 `matches:false` / status `superseded`，四处要按 `engine` 渲染标签。**共用**：状态更顺，但删除、保留、pass A 一旦认那个 identity 就会**硬删**（`fs.rm`，不进回收站）掉另一份修订。

3. **R3 — 缓存命中跳过只覆盖"当前启用的是人工修订"，还是顺带修掉"回退到旧版本之后仍被自动回正"？**
  只修人工修订改动面窄；顺带修掉那条是企划书第一节写过的毛病，但它被 `tests/midi-models.cjs` / `tests/derived-flow.cjs` 从两个角度钉住，要写进同一轮就是另一件事。

4. **R4 / R10 — 对一个空文件（41 字节）添加第一个音符，是创建乐器还是拒绝？** ✅ **用户已拍板（2026-09-21）：R4 先拒绝。**
  理由：R4 是命令行写入器，没有编辑界面，这个场景触发不了；把 program / 轨名 / 通道分配三个真正的设计决定留给 R10。
  R4 必须给一句可读的中英文拒绝，**不是 traceback**。**
  创建就要定 program、track name 与通道分配（注意 `merge.py` 拒绝任何带 CC 的输入）；拒绝就要一句可读的中英解释而不是 traceback。**它是真实的 active 指针，不是假想。**

5. **R4 — 保存时父记录的来源已 stale，是拒绝、还是照存并标记来源已变？** ✅ **用户已拍板（2026-09-21）：拒绝，且一个字节不写。**
  本条原本担心「会挡住 MEGURI 弦乐这条主验收路径」——**实测不成立**：真实曲库里 MEGURI 弦乐是 `midi-missing`
  （根本没有弦乐 MIDI），不是 stale。那个状态目前不是活的，所以拒绝的代价比本文假设的低。**
  拒绝最简单且与 `activate()` 现有行为一致，但**MEGURI 弦乐这条主验收路径会被挡住**；照存需要在 `verify` 之外再开一条提交路径。

6. **R5 — 试听音色：手写合成，还是引入一个有明确分发许可的音源？** ✅ **用户已拍板（2026-09-20）：手写合成。**
  顺带查清了备选路线的代价：项目里唯一的音源是 `TimGM6mb.sf2`（5.7 MB，在 pretty_midi 的 wheel 里），
  **全仓没有任何它的许可记录**——pretty_midi 自己的 MIT 只覆盖 Raffel 的 Python 代码，不给捆绑的采样数据重新授权。
  按 `MODEL-SETUP.md:11`「不代为接受条款，不镜像受限权重」它不能进包，真要用得走 `runtime/addons/` 的自配路线。
  另有一条未挡住的缝：`interface-policy.cjs:10` 的扩展名黑名单里没有 `.sf2 / .sf3 / .dls`，也没有体积上限。
  手写合成无依赖、可打包，够判断音高/起音/时长，但**E11 的鼓类别无法靠它判断**；引入音源要过许可审查与 `interface-policy.cjs` 的排除规则，可能拖慢 E01。

7. **R10 — 草稿只活在会话内，还是重开应用仍要在？**
  会话内最省；持久化要 `midi/<stem>/drafts/<id>.json`（`kind:'midi-draft'`，与 `kept/` 同样的目录手法），且**不能**进 run 目录。

8. **R10 / §9.1 — 力度验收换曲目，还是从 P0 删掉？**
  MEGURI 弦乐力度全是 100。换到 piano（`7c71caec`，41 个不同力度 + 14 个 CC64）或 bass；或者把力度从 P0 验收里删掉，但**要在企划书和验收脚本里同时写"不测"**。

9. **R9 — 是否接受 8 分缩放上限。** piano / guitar / drums 很可能被编辑，但 8 分下半音行高 1.0–1.6 px；若不接受，编辑其实只对 bass 与 strings 可用。

10. **R11 — 导出逐字节等于当前 run 的 `.mid`（不重新合成），确认？** 这是在 §7.2.3 内导出最干净的唯一办法。

---

## 4. 明确不在本方案里的

- 草稿跨应用重启的持久化（见 STOP-AND-ASK 7）。
- XML 侧任何改动（§7.3 已规定）。
- §6.3 模型菜单精简、任何模型退役 / 环境卸载 / 历史结果删除——已在上一轮独立完成，不与本方案混线。
- 音频级编辑（§3.2 已列为后置）。
- 右侧常驻属性面板（R7 用轨头与中缝窄面板替代；等编辑词汇稳定后再看是否需要）。
- 鼓轨专用编辑（E11）默认继承"够不够听"的结论。

**P1 / P2 的挂载点**

| 项目 | 挂在 | 说明 |
| --- | --- | --- |
| E09 连接与拆分 | R10 之后 | 复用同一撤销栈与草稿 |
| E10 批量编辑 | R10 之后 | 选择模型来自 R7 |
| E11 鼓轨专用编辑 | R10 之后 | 受试听音源结论影响 |
| E12 多轨试听 | R6 之后 | 扩展同一张 AudioContext 图 |
| E13 原稿与修订差异 | R11 之后 | 记录里的 `parentRunId` 已够用 |
| E14 模型结果对照 | R3 之后 | 版本面板已能并列多版本 |
| **E15 批量与版本协调** | **提前到 R3** | 缓存命中路径就是它的有效工作 |
| E16 外部往返 | R11 之后 | 导入方向复用 R4 的写入器 |
| E17 演奏表现编辑 | R4 之后 | 全库只有 8 种事件类型；CC64/CC67 只见于 piano-highres 与 piano-transkun，pitchwheel 只见于 basic-pitch |
| E18 声部整理 | R10 之后 | 需要乐器维度（R2） |
| E19 辅助纠错 | R10 之后 | 阈值必须按乐器类型分，`core/result-sweep.cjs` 的 `FRAGMENT_SECONDS` 已经为"一个共享阈值会埋掉结论"付过一次学费 |
| E20 / E21 | R10 之后 | — |

---

## 5. 怎么知道走错了

每一轮写下"什么信号意味着该回头"，而不只是"什么信号意味着有 bug"。

- **R2（乐器拆轨）**：如果拆出来的五条整体看图变得不可读，那是**真的可用性问题**，不是显示细节。补救是把 R2 的**渲染**一半回退、**标识**一半（6 元组）留下——R4 之后所有保存都依赖它。发布时分成两个可独立回退的改动。
- **R3（identity 决策）**：如果"人工修订永远显示成 superseded"要在四处以上打补丁才顺，就是走错了，应该改成共用 MANUAL identity。**这个信号只在第一份真实修订出现之前廉价**，也就是 R4 完成之前。
- **R4（提交路径）**：如果为了让某个畸形文件通过往返验证，而放宽容差或跳过 §7.2.4 的限制声明——**明确禁止**。该拒绝就拒绝。
- **R5（试听）**：如果听感与实际音频差到你无法判断 §4 第一条那种"这几个碎片是不是本来就是分开的"，试听方案就选错了，此时 R6 还没建在上面。
- **R7（选择命中）**：8 分下点不中的比例高到需要加大容差来遮盖，说明渲染模型错了——这一刻发现比在 R8/R9 之后便宜得多。
- **R10（一次性编辑词汇）**：如果你在真实使用里撤回整个功能，通常不是交互问题，是**概念问题**（编辑单位选错、修订与原稿关系不对）。要看的是你有没有真的用它修好过一段。

---

## 6. 建议的第一步

**R1 与 R2 都不依赖任何决策，可以立刻开工；R1 更小，且解锁主验收路径。**

在开 R3 之前，需要你先回答 **STOP-AND-ASK 2**（identity 归并方式）——那是全案唯一一条"越晚改越贵"的约定，而回答它不需要先写任何代码。
