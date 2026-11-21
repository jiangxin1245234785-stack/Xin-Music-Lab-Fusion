# 任务书：XLD 分轨后转谱的两处逻辑调整

日期 2026-11-20。写给 GPT / Codex。仓库 `D:\Projects\Xin-Music-Lab-Fusion`，当前提交 `6ed44a4`，`source/` 下没有未提交的改动。

背景和数据在 `work/muscriptor-fullmix-20261120/SPEC-STEM-LOGIC.md`。本文件是执行说明，两者不一致时以本文件为准。

## 0. 一句话

- **任务 A（写代码）**：MuScriptor 转 bass、piano、guitar 时，每个 stem 只出一条以主要乐器命名的轨，并去掉跨乐器的重复音。
- **任务 B（不改产品代码）**：为 `other` 是否还要拆成弦乐和管乐，做一页三首歌的试听对比。

先做 A，交报告后停下等验收。B 可以在 A 之后做，也只做到试听页为止。

## 1. 为什么改

### 全库普查（`D:\Caches\Xin's Local Deck\Analysis`，只读）

| 声部（MuScriptor Large） | 歌数 | 多轨的歌 | 音符总数 | 被写了两遍的音 |
|---|---|---|---|---|
| bass | 24 | 20 | 19551 | 4705（24.1%） |
| guitar | 30 | 26 | 81358 | 1920（2.4%） |
| piano | 23 | 17 | 11160 | 263（2.4%） |

"写了两遍"：同一声部的不同轨里，同音高、起音相差不超过 50 ms 的音。脚本 `work/muscriptor-fullmix-20261120/library_tracks.py`，明细 `library_tracks.txt`。

- 贝斯是真重复：原声贝斯和电贝斯两轨写的是同一条线。
- 吉他、钢琴的多轨来自乐器标签在 5 秒分段之间摆动，音符本身稳定。

### `other` 的问题

现在的链路是 `other` → Mega 53 提弦乐 → 弦乐剩余里提管乐 → 各自转谱。《you》里 `other` 的能量 99% 被分给了弦乐和管乐（弦乐 −2.4 dB，管乐 −5.6 dB，最后剩余 −19.2 dB）。用户听到的是一层电子模拟的管弦音色被切成了两份。

## 2. 任务 A：每个 stem 一条轨

### 2.1 范围

只影响后端为 `muscriptor`、声部为 bass / piano / guitar 的六个档案（`analysis-midi/models.json`）：

- `muscriptor-medium`、`muscriptor-large`（guitar）
- `piano-muscriptor-medium`、`piano-muscriptor-large`
- `bass-muscriptor-medium`、`bass-muscriptor-large`

strings、winds、drums、vocals 以及其他后端一律不变。

### 2.2 行为

位置：`source/xld-runtime-baseline/analysis-midi/runner.py` 第 179–217 行。现在第 181–184 行让 MuScriptor 每识别出一件乐器就新建一条轨。

改成由档案的选项控制（建议在这六个档案的 `options` 里加 `"oneTrack": {"dedupeMs": 50}`，名字可以按现有命名习惯调整）。有这个选项时：

1. **合并**：该 stem 的全部音符进同一条 `pretty_midi.Instrument`。
2. **命名**：这条轨的 `program` 和 `name` 取合并前音符最多的那件乐器的。音符数相同则取 program 较小的。
3. **去重**：按合并前各乐器的音符数从多到少依次并入。并入一个音时，如果已经保留的音里有一个来自**另一件乐器**、音高相同、起音相差不超过 `dedupeMs` 毫秒，就丢掉这个新音。同一件乐器内部的音不互相去重。`dedupeMs` 为 0 时不去重。
4. **同音高重叠**：合并后同一条轨里可能有同音高、时间重叠的音，这在 MIDI 回读时会出错。沿用 YourMT3 吉他已有的做法，调用 `yourmt3.preserve_overlapping_notes`（它把重叠的音放进 `名字 / overlap N` 的附加轨，不移动任何音）。不要用截短音符的办法。
5. **表情事件**：各乐器的 pitch bend 和 control change 全部保留，按时间排序。
6. **其余不动**：乐器表（`instruments`）、`prelude_forcing=False`、batch、力度推算（`velocityFromStem`）都保持现状。力度推算仍在最后执行。

### 2.3 运行记录

在结果的 `backend` 里增加（字段名可调整，含义要全）：

- 合并前每件乐器的名字、program、音符数
- 去掉的重复音数量
- 最终轨数和 overlap 附加轨数
- `programMode` 写明这是合并后的单轨

### 2.4 模型标识

这六个档案的 `model` 字符串加后缀区分新旧结果（参照之前加 `-stemvel1` 的做法），`adapterVersion` 相应加一。

要求：**已有的旧结果仍然可读、可选用，不被删除，不被改写。** 如果改标识会让界面把旧结果标成过期，在报告里写明实际表现，不要为此再加逻辑。

### 2.5 融合 MIDI 的轨名

位置：`analysis-midi/merge.py` 第 91 行。现在一个声部只有一件乐器时，融合后的轨名就是 `<stem>`。

XLR（音色工作台）按轨名选音色，有 14 套音色定义了 `guitar/distorted electric guitar`、1 套定义了 `guitar/acoustic guitar`。所以要求：

- 对经过任务 A 合并的声部，融合后的轨名是 `<stem> / <主要乐器名>`（例如 `guitar / distorted electric guitar`）。
- 其他声部的命名规则完全不变：Transkun 钢琴仍是 `piano`，单乐器的弦乐仍是 `strings`，被折叠的管乐仍是 `winds`。
- 怎么让 `merge.py` 知道一个声部是合并过的，由你决定（例如看轨名是否等于 stem 名，或者由 `core/midi-merge.cjs` 在任务里带标记）。选最小的改法，在报告里说明。

### 2.6 可以改的文件

- `source/xld-runtime-baseline/analysis-midi/runner.py`
- `source/xld-runtime-baseline/analysis-midi/merge.py`
- `source/xld-runtime-baseline/analysis-midi/models.json`
- `source/xld-runtime-baseline/core/midi-merge.cjs`（仅当 2.5 需要）
- `source/xld-runtime-baseline/tests/` 下：新增测试，以及因为模型标识变化而必须更新的既有断言
- `source/xld-runtime-baseline/package.json`：仅在 `test` 脚本里登记新的 `.cjs` 测试

如果发现必须改这个清单以外的文件才能完成，停下来，在报告里写明是哪个文件、为什么，不要直接改。

### 2.7 测试

新增（Python 测试放 `tests/*.py`，`scripts/run-python-tests.cjs` 会自动收集）：

1. 两件乐器写同一条线：合并成一条轨，重复的音只留一份，留的是音符多的那件乐器的版本。
2. 两件乐器写不同的音：合并成一条轨，一个音都不少。
3. 起音相差 51 ms 的同音高音：两个都保留。
4. 同一件乐器内部的近邻同音高音：不去重。
5. 轨名和 program 取音符最多的乐器；数量相同取 program 小的。
6. 合并后出现同音高重叠：落到 overlap 附加轨，音符总数不变，起止时间不变。
7. `dedupeMs` 为 0：只合并不去重。
8. strings、winds 档案的行为与修改前逐字节一致（同一输入得到同一 MIDI）。
9. 融合：合并过的 guitar 声部轨名是 `guitar / <乐器名>`；Transkun 钢琴仍是 `piano`；折叠的 winds 仍是 `winds`。

全部既有测试必须通过：

- `source/xld-runtime-baseline`：`npm test`
- `source/fusion-runtime-baseline`：`npm test`
- `source/scoreview` 的测试
- `source/memesynth` 的测试（`studio/tests`、`tests`）

### 2.8 在真实数据上验证

**绝对不要写入 `D:\Caches\Xin's Local Deck\Analysis`。** 把下面两首歌的分析文件夹复制到 `work/stem-logic-20261120/root/` 下的临时分析根再跑。复制时注意：MIDI 记录绑定的是 stem 的绝对路径和修改时间，要改写路径并保留 mtime。

- `world's end girlfriend - farewell kingdom/07 you__3b88fbf3be`
- `world's end girlfriend - Resistance & The Blessing/04 MEGURI__185c26ddfa`

对每首歌的 bass、piano、guitar 用 Large 档案重新转谱，然后报告：

| 检查项 | 期望 |
|---|---|
| 每个声部的具名轨数 | 1（另列 overlap 附加轨数） |
| `library_tracks.py` 在临时根上报告的"写了两遍" | 0 |
| 新结果的音符集合 | 等于旧结果各轨的并集减去被去重的音（旧结果就是库里现有的同档案结果，MuScriptor 是确定性解码） |
| 《you》6:40–7:00（400–420 秒） | 旧结果里贝斯 94 个音（两轨）合并去重后应为 54 个左右；吉他 106 个、钢琴 43 个保持不变 |
| 融合 MIDI 的轨名 | `bass / …`、`piano / …`、`guitar / …` 各一组 |

再检查两个下游显示（只看不改）：

- **XLD 时间线**：这三个声部各显示为一条轨。
- **XML 谱面**：这三个声部各一条谱线。XML 在一个 stem 有多件乐器时会拆成多条谱线（`source/scoreview/adapter/track-model.cjs` 第 129–136 行），overlap 附加轨有可能被当成另一件乐器。把"合并同类乐器声部"开关开和关两种情况下各看到几条谱线如实写进报告。如果关掉时多于一条，**不要改 XML**，写明现象即可。

### 2.9 打包和启动

- 用项目的开发版打包流程打一个 XLD 开发版，版本名建议 `0.5.0-dev.onetrack.1`。打包前检查这个名字在 `releases/` 和 `%APPDATA%\XinMusicDevelopment` 里都没有被占用，被占用就换下一个序号。
- 用这个版本自己的 exe 启动一次，指向临时分析根，对《you》跑一遍一键分析的"质量"档，确认 bass、piano、guitar 和融合都跑通。
- **不要切换本机入口**（`启动XLD.cmd` 指向的版本不动），不要删除 `releases/` 下任何已有版本，不要关闭用户正在运行的任何窗口。

### 2.10 交付

写在 `work/stem-logic-20261120/` 下：

- `REPORT-A.md`：改了哪些文件、每处改了什么；2.8 的表格填上实测数字；2.7 的测试清单和结果；2.4、2.5 的实际做法；所有偏离本任务书的地方和原因；没做成或没验证的事单独列出。
- 测试日志。
- 复现命令。

**不要提交 git。** 改动留在工作区，等 Claude 这边检查后再提交。

## 3. 任务 B：`other` 的试听对比页

目的是让用户用耳朵决定：对合成器、电子模拟音色为主的歌，`other` 不拆弦管、直接转成一个声部，是否比现在的拆分好。**这一步不改任何产品代码，不新增声部。**

### 3.1 三首歌

| 歌 | 分析文件夹 | 说明 |
|---|---|---|
| you | `world's end girlfriend - farewell kingdom/07 you__3b88fbf3be` | 电子模拟管弦，用户指出 6:40–7:00 有连续的管弦音色 |
| MEGURI | `world's end girlfriend - Resistance & The Blessing/04 MEGURI__185c26ddfa` | glitch 很多 |
| Satan Veludo Children | `world's end girlfriend - The Lie Lay Land/03 Satan Veludo Children__dbd64ea7f9` | 当初验收管乐声部用的歌，作为"拆分应该有效"的对照 |

### 3.2 每首歌三个候选

| 候选 | 内容 |
|---|---|
| 拆分（现状） | 库里现有的 strings 结果加 winds 结果，原样复制，不重跑 |
| 合并 · 不给乐器表 | `other` stem 直接用 MuScriptor Large 转，`instruments=None` |
| 合并 · 给乐器表 | 同上，乐器表为 `violin,viola,cello,contrabass,string_ensemble,trumpet,trombone,tuba,french_horn,brass_section,soprano_and_alto_sax,tenor_sax,baritone_sax,oboe,english_horn,bassoon,clarinet,flutes,organ,synth_lead,synth_pad` |

两个"合并"候选的设置：

- 权重、代码版本、精度与产品里 `strings-muscriptor-large` 档案一致（`upstream-4c03cafc`，fp16）。
- **`prelude_forcing=False`**。开着它在 `other` 上会失控：我们实测 6119 个音里有 1074 个持续 20–445 秒。
- 转完后合并成一条轨（可以直接用任务 A 的合并逻辑，`dedupeMs=50`）。
- 通过产品的适配器（`analysis-midi/muscriptor_backend.py`）加一份临时档案字典来跑，不要往 `models.json` 里加东西。
- `other` stem 从库里只读。输出全部写到 `work/stem-logic-20261120/other-audition/`。

每个候选生成后先跑 `work/muscriptor-fullmix-20261120/long_notes.py`：超过 20 秒的音必须是 0，否则这个候选作废并在报告里写明。

### 3.3 试听页

用现成的工具，不用新写页面：

- `work/muscriptor-fullmix-20261120/build_compare.py`：参数是 `<标题> <音频文件名> <输出 html 名> 标签=路径.mid …`，生成带钢琴卷帘、差异叠加和原声播放的单文件页面。模板是同目录的 `compare.template.html`。
- `work/muscriptor-fullmix-20261120/make_audio.py`：把音频转成页面用的 Ogg（本机没有 ffmpeg，它用 soundfile 写）。
- 页面播放的音频用**该歌的 `other` stem**，不要用整混，这样用户听到的就是三个候选共同的输入。
- 标签用：`拆分（现状）`、`合并·不给表`、`合并·给表`。
- 这两个脚本和模板复制到 `work/stem-logic-20261120/other-audition/` 里再用，不要改原目录里的文件。

每首歌一页，共三页，另附九个 MIDI 文件。

### 3.4 附带的数字

每首歌一张表：三个候选各自的音符数、轨数、乐器标签分布；两两之间的重合率（同音高、起音 ±50 ms、一对一配对，`work/muscriptor-fullmix-20261120/match.py` 可以直接用）。

只报数字，**不要下"哪个更好"的结论**。这由用户听过之后定。

### 3.5 交付

`work/stem-logic-20261120/REPORT-B.md`：三页的路径、九个 MIDI、3.4 的表、每个候选的转谱耗时、作废的候选和原因。

## 4. 明确不做的事

- 不新增 `other` 声部，不改一键分析和手动面板的选项。这要等用户听完任务 B 再定。
- 不改 XML（`source/fusion-runtime-baseline`、`source/scoreview`）和 XLR（`source/memesynth`）的任何文件。
- 不换分离模型，不动 Mega 53 的链路，不动 strings / winds / drums / vocals 的转谱。
- 不给 stem 开 prelude forcing，不引入整混转谱。
- 不写"自动判断该不该拆弦管"的规则。
- 不改写、不删除、不标记库里已有的任何结果。
- 不切换本机入口，不删旧版本，不提交 git。

## 5. 需要你判断但不要自己定的事

遇到下面的情况，写进报告等回复，不要自行处理：

- 完成任务需要改 2.6 清单以外的文件。
- 合并后的 overlap 附加轨让 XLD 或 XML 显示出不止一条轨。
- 去重在某首歌上去掉的音明显多于普查的比例（贝斯约 24%，吉他和钢琴约 2.4%）。
- 新旧结果的音符集合对不上，而且不是去重造成的。

## 6. 参考数字的来源

本任务书里的数字都来自 `work/muscriptor-fullmix-20261120/` 下的脚本和输出：

- `library_tracks.py` / `library_tracks.txt`：全库多轨和重复普查
- `match.py`：两份 MIDI 的一对一重合率
- `window_tracks.py`：某个时间窗里各轨之间的对应关系
- `long_notes.py`：超长音检查
- `chain_levels.py`：`other` 在弦乐、管乐、剩余之间的能量分配
- `SPEC-STEM-LOGIC.md`：完整方案和对 XML、XLR 的影响分析

## 6. 任务 B 收尾（2026-11-21 验收后追加）

验收结论：三张试听页、八个 MIDI 和统计数字通过。用户决定 **MEGURI 的"合并·给表"按作废处理，不再重跑**（包括放宽结束条件的诊断重跑）。

只剩文档和页面文字要收尾，不跑任何转谱：

1. `REPORT-B.md` 重写为终稿：
   - 去掉指向 `other-audition/meguri-list.mid` 的链接，该格写"作废"。
   - 写明作废原因：产品适配器严格解码在 490 秒片段达到 2000 token 上限未输出 EOS，日志 `other-audition/diagnostics/meguri-list-strict-eos.log`。
   - 并入或链接 `other-audition/STATISTICS-B.md` 的表，补上每个候选的转谱耗时。
   - 写明不给表的候选把解码器的鼓音并进了有音高的轨（you 39、MEGURI 256、Satan 10）。
   - 仍然不下"哪个更好"的结论。
2. `meguri.html` 页面上的"诊断待归档"改成"已作废"，重建该页并重跑页面检查。
3. 删掉 02:01 那次中断重跑留下的 `other-audition/meguri-list.log`，或移到 `diagnostics/` 并标明是中断的运行。`meguri-pending-page-check.log` 同样处理。
4. 不改产品代码，不写曲库，不动另外两页和八个 MIDI。
