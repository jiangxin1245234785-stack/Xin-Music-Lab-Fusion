# 任务 C：`other` 直接转谱，成为一个声部

日期 2026-11-21。前置：任务 A 已验收（改动在工作区，未提交，本任务在它之上继续）；任务 B 的试听已由用户听完。
任务书 `BRIEF.md` 的第 0 节工作约定、第 4 节"不做的事"和第 5 节"停下来问"的条件继续有效，下面只写新增和变化的部分。

## 0. 用户的结论和已定的口径

- 第一级分轨（BS-RoFormer SW 六轨）不变。bass、piano、guitar、drums、vocals 的链路不变。
- `other` 不再默认交给 Mega 53 拆弦乐、管乐。**默认改为：`other` 分轨直接交给 MuScriptor，不给乐器表，出一个声部。**
- 原来的"拆分"（弦乐 + 管乐）保留为可选走法，代码和已有结果都不删。
- 不做整混转谱路径。

依据（四首歌，Large，关闭 prelude forcing，产品适配器的严格解码）：

| 歌 | 拆分（现状） | 直接转·不给表 | 备注 |
|---|---|---|---|
| you | 5117 个音，17 条轨 | 3208 | |
| MEGURI | 7000 个音，17 条轨 | 5847 | 给 21 个标签的乐器表时严格解码失败，所以不给表 |
| Satan Veludo Children | 1822 个音，17 条轨 | 973 | |
| Xtal（Aphex Twin） | **0 个音** | 1947 | bass / guitar / piano 三轨是静音，Mega 53 的弦乐目标 −89 dB，整首歌没有任何有音高的音被转出来 |

四份"直接转"都完整跑完，没有超过 20 秒的音。文件在 `other-audition/*-free.mid`，生成脚本 `run_other.py`（Xtal 用 `run_xtal.py` 包了一层）。

## 1. 分两段做，中间停一次

- **C1：XLD**。新增声部、档案、一键分析和手动面板的走法选择、融合。交 `REPORT-C1.md` 后停下等验收。
- **C2：XML 和 XLR**。让新声部能显示、能出声。交 `REPORT-C2.md`。

C1 没验收不要开始 C2。

## 2. C1：XLD

### 2.1 新声部 `other`

- 声部名 `other`。它的音频来源是分轨批次里的 `other` 分轨本身，和 bass / piano / guitar 一样是真 stem，**不走** `core/string-source.cjs` 的提取链路。
- `analysis-midi/models.json` 新增两个档案：
  - `other-muscriptor-medium`（一键分析"效率"用）
  - `other-muscriptor-large`（一键分析"质量"用，也是 `defaultFor: "other"` 的选择请按现有 piano / bass 的默认规则对齐）
- 解码选项与 `strings-muscriptor-large` / `strings-muscriptor-medium` 逐项相同（代码版本、精度、batch、cfg、sampling、`preludeForcing: false`），只有三处不同：
  1. **没有 `instruments`**（传 `None`）。
  2. 有 `"oneTrack": {"dedupeMs": 50}`，沿用任务 A 的合并和去重。
  3. 没有弦乐专属的补间（fill）处理。
- `velocityFromStem` 照其他声部一样启用，用 `other` 分轨推力度。
- `analysis-midi/runner.py`：`STEMS` 表加 `other`；`merge_muscriptor_tracks` 的适用范围加上 `other`。

### 2.2 `other` 声部的两条特殊规则

1. **解码器标成鼓的部分直接丢掉**，不并进有音高的轨。运行记录里写明丢了几条鼓轨、多少个音。（任务 B 的试听文件把它们并进去了：you 39、MEGURI 256、Satan 10、Xtal 0 个。）
2. **轨名固定为 `other`**，不用主要乐器命名（不给表时标签不可信，《you》和 Xtal 的主标签都是"原声钢琴"）。`program` 仍取音符最多的那件乐器的，并在运行记录里保留合并前每个标签的音符数。重叠附轨叫 `other / overlap N`。融合 MIDI（`merge.py`）里这个声部的轨名就是 `other`，不加乐器后缀。

### 2.3 严格解码失败

保持严格模式，不放宽。某一段到 token 上限仍未结束时，这个声部按失败处理并给出看得懂的原因，不写出残缺的 MIDI。不要为此加重试或降级逻辑。

### 2.4 走法选择：直接转 / 拆分

每首歌的 `other` 有两种走法，由用户选：

| 走法 | 产生的声部 | 默认 |
|---|---|---|
| 直接转 | `other` | 新的一键分析默认选这个 |
| 拆分 | `strings`（+ `winds`） | 手动可选 |

- 一键分析（`oneclick-plan.js`、`oneclick-controls.js`）：增加这一项选择。选"直接转"时不排 Mega 53 的提取步骤，也不排 strings / winds 的转谱步骤；选"拆分"时和现在完全一样，不排 `other`。
- 手动面板（`derived-controls.js` 的声部列表等）：`other` 作为一个普通声部出现，可以单独转、切换版本、删除，行为与 piano 一致。
- **一份融合 MIDI 里不能同时有 `other` 和 strings / winds。** 两边都有活动结果的歌（库里已有弦乐、之后又跑了直接转），以用户当前选的走法为准，另一边的结果保留在磁盘上但不进融合。这个"当前走法"存在哪里，请按项目里现有的同类选择的存法来做，在报告里写明。
- 已有的歌不自动改走法、不标成过期、不重跑。没有做过选择的老歌，融合结果必须和现在逐字节一致。

如果实现"当前走法"需要改已有记录的格式或做迁移，先停下来问。

### 2.5 不动的东西

Mega 53 的提取代码、`string-source.cjs`、strings / winds 的档案和转谱、它们已有的结果；bass / piano / guitar / drums / vocals；XML 和 XLR 的任何文件（留给 C2）。

### 2.6 测试

- 新增：`other` 声部合并成一条轨、轨名固定、鼓轨被丢弃且有计数、去重生效、其余音符不变。
- 新增：一键分析计划在两种走法下排出的步骤各自正确；融合在"两边都有结果"时只取当前走法。
- 既有的 XLD 测试全过；钉住声部清单的测试按需放宽，并在报告里列出改了哪些断言。

### 2.7 验收用的实测

在临时分析根上（不写 `D:\Caches\Xin's Local Deck\Analysis`），对 you、MEGURI、Satan Veludo Children、Xtal 四首用 `other-muscriptor-large` 各跑一次：

- **与 `other-audition/<歌>-free.mid` 逐音对照**：去掉试听文件里来自鼓轨的音之后，两边的（音高，起音，结束）应当完全相同。力度允许不同（试听文件没有重算力度）。每首报：音符数、去掉的鼓音数、只在一边出现的音符数（应为 0）。
- 四首都没有超过 20 秒的音（`work/muscriptor-fullmix-20261120/long_notes.py`）。
- `other-muscriptor-medium` 至少在 Xtal 上跑通一次，报音符数和耗时。
- 一首老歌（例如 Satan Veludo Children）在没有做过走法选择时，融合 MIDI 与库里现有的逐字节相同。
- 打一个开发版（版本名先确认 `releases/` 和 `%APPDATA%\XinMusicDevelopment` 下都没有同名的旧目录），用它自己的 exe 在临时分析根上对 Xtal 跑一次"质量"一键分析，截图：计划里没有 Mega 53 步骤，结果里有 `other` 声部和音符。

### 2.8 交付

`REPORT-C1.md`：改了哪些文件、每条规则对应的代码位置、2.7 的数字、测试结果、开发版路径、"当前走法"的存法、没做到或拿不准的地方。不提交，不切换本机入口，不删旧版本。

## 3. C2：XML 和 XLR

目标：一首走"直接转"的歌，`other` 声部在 XML 里能看到谱线，在 XLR 里能出声。走"拆分"的歌两边都和现在一样。

### 3.1 XML（`source/fusion-runtime-baseline`、`source/scoreview`）

- 声部表加 `other`：`scoreview/adapter/track-model.cjs` 的 `STEMS`（现在是 vocals / guitar / piano / strings / winds / bass / drums）。屏幕上的名字用"合成"，位置在弦乐、管乐所在的那一格（一首歌里它和弦乐、管乐不会同时出现）。
- 其他写死的声部清单同步：`desktop/score-dynamics.cjs` 第 32 行的循环、`desktop/main.cjs` 第 802 行附近（`other` 是真 stem，它的音频就是分轨里的 `other`，不需要走 `dug` 那条路，请确认独奏能响）、`stem-controls.js`。
- **各个观感**（`score-radar*.js`、`score-mood.js`、`score-terrain.js`、`score-view.js` 等按声部绑定位置的地方）：`other` 声部一律占用**弦乐**的位置、通道和颜色，不新增通道、不改任何观感的布局和画法。雷达的七个通道数量不变。
- XML 现在已经有一条 `other` 的"质感"谱线（只有响度，没有音符）。**当这首歌有 `other` 音符声部时，质感谱线不再单独显示**；没有时照旧。
- 钉住声部清单的测试（`tests/winds-score.cjs`、`scoreview/tests/track-model.test.cjs` 等）相应放宽。

如果某个观感里"占用弦乐的位置"做不到、必须改画法，先停下来问，不要自己设计。

### 3.2 XLR（`source/memesynth`）

- `memesynth/score.py` 第 40 行和 `studio/engine.js` 第 26 行的 `STEMS` 加 `other`。
- 音色：`other` 声部借用该套件的**弦乐**音色（参照 `memesynth/kit.py` 第 73 行管乐借用人声的写法）。套件没有弦乐音色时的退路与弦乐相同。不新增、不修改任何音色套件。
- "管弦分轨"抽屉只认弦乐和管乐，`other` 不进抽屉，按一条普通的轨处理。
- `tests/test_memesynth.py` 第 140 行附近钉的声部集合放宽。

### 3.3 验收

- XML、scoreview、memesynth（含 studio）的测试全过。
- 用 C1 的临时分析根：Xtal 在 XML 里有一条"合成"谱线，独奏能响，雷达观感里它出现在弦乐通道；Satan Veludo Children（拆分）在 XML 里和现在一样。各截一张图。
- Xtal 的融合 MIDI 在 XLR 里载入后，`other` 轨有声音（测试端口用 8791，不要动 8777，也不要关用户开着的窗口）。
- 打一个包含 C1 和 C2 的开发版，用它自己的 exe 启动一次。

### 3.4 交付

`REPORT-C2.md`：改了哪些文件、每个观感里 `other` 落在哪、截图路径、测试结果、没做到或拿不准的地方。不提交，不切换本机入口。

## 4. 本任务允许修改的范围

- C1：`source/xld-runtime-baseline/` 下与声部、档案、一键分析、手动面板、融合有关的文件及其测试。
- C2：`source/fusion-runtime-baseline/`、`source/scoreview/`、`source/memesynth/` 下 3.1、3.2 列出的文件及其测试。
- 工作文件一律放在 `work/stem-logic-20261120/task-c/`。
- 不改 `work/muscriptor-fullmix-20261120/` 和 `other-audition/` 里已有的文件。

## 5. 追加的"停下来问"

- "当前走法"需要迁移已有记录。
- 2.7 的逐音对照不为 0，且原因不是鼓音或力度。
- 某个观感必须改画法才能放下 `other`。
- 任何一步需要写曲库、提交、切换入口或删除旧版本。

## 6. C1 验收结论（2026-11-21 追加）

C1 已验收通过，用户同意开始 C2。按第 3 节执行，范围和停下来问的条件不变。补充三点：

- C2 在 C1 的工作区之上继续，C1 的文件不要再改；如果 C2 必须回头改 XLD 的文件，先停下来问。
- 验收用的 Xtal 数据直接用 `task-c/packaged-root`（已是"直接转"，融合里有 drums 和 other）。拆分对照用 Satan Veludo Children 的隔离副本。
- 本机复跑测试的环境说明：XLD 的 Python 测试需要 `XLD_MUSCRIPTOR_ROOT=runtime/addons/muscriptor-v1`，解释器路径用绝对路径。三项链接测试在本机非沙盒环境下是通过的，沙盒里的 `EPERM` 照实写进报告即可，不用绕。
