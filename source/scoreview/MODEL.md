# 谱面模型 `xin.score-view/1`

渲染核心 `score-view.js` 只认这一个对象。宿主（阶段一的试听页，阶段二的 XML 场景）负责把它造出来、
提供音频和时钟；核心只做一件事：给定模型和"现在几秒"，画一帧。

来源：`docs/SCORE_VIEW_PROJECT_PLAN_20261110.md` §5。这里是可执行的版本，字段含义以本文件为准。

## 时间

- 一律是**秒**，零点是**分轨的音频零点**（XLD 用 soundfile 解码原曲后的第 0 个采样）。
- 不出现拍、tick、小节号。小节是 `bars` 这一层给的显示信息，不是时间单位。
- 试听页播放的压缩文件如果比这个零点晚，差值写在 `audio.offset`，由宿主的时钟减掉（见下）。

## 必有的三个键

```json
{
  "contract": "xin.score-view/1",
  "track": { "id": "", "title": "", "artist": "", "album": "", "duration": 0 },
  "audio": { "src": "", "offset": 0 },
  "lanes": []
}
```

| 键 | 含义 |
|---|---|
| `contract` | 主版本号必须是 1。核心遇到别的主版本直接拒绝。 |
| `track.duration` | 整首的秒数。`title` / `artist` / `album` 可以是空串，空的就不画。 |
| `audio.src` | 宿主用来播放的文件；核心不读它。 |
| `audio.offset` | 压缩文件比模型晚多少秒：模型里 t 时刻的声音在文件的 t + offset。宿主时钟 = 播放位置 − offset。 |
| `lanes` | 可以是空数组（画面上就只有页眉和播放线）。 |

## 轨 `lanes[]`

三种 `kind`。未知的 `kind` 跳过不画，不报错。

```json
{ "id": "guitar/clean electric guitar", "label": "电吉他", "kind": "pitched",
  "group": "guitar", "groupLabel": "吉他",
  "notes": [[15.88, 0.209, 65, 96]] }

{ "id": "vocals", "label": "人声", "kind": "melody", "group": "vocals",
  "notes": [[0.0, 0.5, 59, 96]],
  "contour": { "hop": 0.01, "start": 0, "midi": [59.1, null] } }

{ "id": "drums", "label": "鼓", "kind": "drums", "group": "drums",
  "rows": ["kick", "snare", "hihat", "openhat", "tom", "crash", "ride"],
  "hits": [[0.0, 0, 110]] }
```

| 字段 | 含义 |
|---|---|
| `id` | 唯一。转谱把一个分轨拆成几条音色轨时是 `<分轨>/<音色>`，否则就是分轨名。 |
| `label` | 屏幕上的轨名。 |
| `kind` | `pitched` 普通音符轨；`melody` 主旋律（画得更粗，带音名，A3 起叠音高曲线）；`drums` 鼓；`texture` 没有音符的声音（见下面的 `level`）。 |
| `group` / `groupLabel` | 同一个分轨的音色轨共用一个 `group`。"音色轨合并"按它归并。缺省取 `id` 斜杠前的部分。 |
| `notes` | `[起点秒, 时长秒, MIDI 音高, 力度 1–127]`，按起点排序。 |
| `contour` | 只有 `melody` 轨可以带。第 k 帧在 `start + k × hop` 秒，值是带小数的 MIDI 音高，没有音高的帧是 `null`。 |
| `rows` | 鼓的类别名，下标就是 `hits` 里的行号。顺序固定为 memesynth 的 `DRUM_ROUTES`。 |
| `hits` | `[时刻秒, 行号, 力度]`。没有击打的行不占屏幕高度。 |
| `meta` | 来源记录（引擎、力度是模型给的还是按分轨能量现算的）。核心不读。 |
| `roles` | 可缺（0.15.0 起）。只有 `kind: 'pitched'` 的轨带：和 `notes` **等长**，每个音符一个 `1`（主）或 `0`（伴）。由 `adapter/roles.cjs` 判断（适配器在字幕之前调一次；规则见 `work/score-roles-20261114/REPORT.md`）。人声轨、贝斯、鼓、`texture` 轨不带。**缺了就是「不知道」**：核心照现在的样子画这条轨，不当伴奏；长度不对或有 0、1 以外的值，整个字段当作缺。判断抛异常时所有轨都不写，`health.roles` 写原因。只在核心的 `showRoles: true` 时画出来。 |
| `leadLines` | 可缺（0.15.0 起），和 `roles` 一起出现：`[[起, 止], …]` 秒，这条轨的主音线段。0.16.0 起核心在 `showRoles` 时用它把同一线段里的主音连成线；只在这条轨的 `roles` 可用时才读。 |
| `level` | 只有 `kind: 'texture'` 的轨带（0.13.0 起）：`{hop, db: [...]}`，没有音符。适配器**只取分离出来的 `other` 分轨**（2026-11-14 验收后改：别的分轨不管有没有音符都不并进来，没有人声曲线的主唱仍是主唱，不是「其它」）：`{id: 'texture', kind: 'texture', group: 'other', label: '其它' / 'Other', members: ['other'], level}`，`hop` 和 `db` 取自 `levels.groups.other`；没有 `levels` 层、里面没有 `other`、或者 `other` 整首都在 −50 dB 以下（0.14.0 起，`health.texture` 写原因），就不出这条轨。核心把它和普通轨分开：不进 `lanes()`、不参与轨高分配和标注，只在 `showTexture: true` 时画成最下面一条很矮的带子（`textureAt` 缺省鼓下 `below`，XML 和试听页都用它；`above` 留在核心里）。低于 `TEXTURE.floor`（−50 dB）不画；门槛以上的厚度和亮度按这首歌 `other` 自己响着时的分布：第 10 百分位最细（满厚的 15%），第 98 百分位最粗，中间走 1.5 次方的弧线，范围不足 6 dB 时向中间收。亮度连跟随起伏在内最高 0.3。鼓下时所有特效截在鼓轨下沿，碰不到带子。多条这样的轨按各自的 `hop` 取帧、按功率合成一条。旧核心不认识这种 `kind`，把它记进 `skippedLanes`，照常画别的。`work/score-dynamics-20261114/SPEC-REST.md`、`SPEC-FIX.md`。 |

## 可缺的层

**下面每个键都可以不存在，不存在的那一层就不画。** 类型不对的层同样当作不存在。这是阶段二
"任意一首歌都能进"的前提：库里大多数歌只有 `lanes`。

```json
"chords":     [[0.0, 4.2, "D#m", 0.78]],
"chordTones": { "D#m": [3, 6, 10] },
"sections":   [[0.0, 21.0, "引子", "songformer", "intro"]],
"bars":       { "beatsPerBar": 4, "bpm": 71.1, "beats": [], "downbeats": [], "steady": true },
"captions":   [[143.0, 149.0, "再回到主歌，先听人声和吉他重新接上。", "manual"]],
"energy":     { "hop": 0.1, "db": [] },
"levels":     { "hop": 1, "groups": { "guitar": [], "bass": [] } },
"cover":      { "src": "data:image/jpeg;base64,…", "width": 480, "height": 480 }
```

| 层 | 形状 | 说明 | 从哪个工作包开始画 |
|---|---|---|---|
| `chords` | `[起, 止, 标签, 置信度]` | 标签照引擎的写法（`Eb`、`F#m`、`Abmaj7`），核心不改写。没有和弦的时间段就是空档，不写 `N`。置信度可以是 `null`。 | A2（已画） |
| `chordTones` | `{ 标签: [音级…] }` | 每个标签包含的音级（0–11），根音在前，由 XLD 自己的标签解析器给出。核心据此从根音拼出音名（`Cm` 是 C、Eb、G）。缺了这张表，或某个标签不在表里，就只显示和弦名、不显示内音。 | A2（已画） |
| `sections` | `[起, 止, 名称, 来源, 原始标签, 原始标签们]` | 名称是屏幕上的字，由 XLD 的 `core/sections.cjs` 整理后给出（引子 / 主歌 / 导歌 / 副歌 / 间奏 / 桥段 / 尾奏，英文界面是 Intro / Verse / Pre-chorus / Chorus / Interlude / Bridge / Outro；同名出现两次以上才编号）；XLD 自己的画面和它写给 XML 的桥接清单用的是同一个模块。一段可能是几段原始结果合成的：第 5 项是其中**第一段**的原始标签（颜色按它取），第 6 项按时间顺序列出全部原始标签；第 6 项只有语义引擎（`songformer`）才有，核心不读它。来源是 `songformer` 或 `manual` 时名称有含义；其它来源（`msaf` 等）只会聚类，名称是一个字母，按宿主的 `plainSections` 选项显示。原始标签相同的段落同色。相邻段之间可以有空档。 | A2（已画） |
| `bars` | 见上 | `steady` 为假，或 `downbeats` 为空时，**不画小节线**，退回秒刻度（决策 D4）。`beats` 仍然可以给，和弦防抖的"一拍"用它的中位间隔。 | A3 |
| `captions` | `[起, 止, 文字, 来源, 标注]` | 来源是 `manual` 或 `rule`。前四项不变；第 5 项只有「对象 · 事件」标注（`adapter/cues.cjs`，`captionStyle: 'mark'`）才有：`{object, word, at, preview, score, was?}`。`object` 是轨的 `group` 或 `all`（全体）；`word` 是 `first` 首现（全曲第一次）、`leave` 退出、`back` 重进（离开一段时间后回来，轨道和全体都用它）、`rest` 休止、`swell` 渐强、`surge` 骤强、`drop` 骤弱、`peak` 最高点、`only`（仅 · X）、`lead`（主旋律 → X，`was` 是换手前的分组）；`at` 是事件发生的秒；`preview` 为真时第 1 项比 `at` 早约 2 秒（预告），为假时第 1 项就是 `at`；第 2 项是退场。第 3 项文字按 `lang` 由封闭词表拼成。没有第 5 项的行照旧当句子画。 | A4 |
| `energy` | `hop` 秒一帧的响度（dB） | 第 k 帧覆盖 `[k × hop, (k+1) × hop)`。背景的亮度用它，按这首歌自己的第 10 到第 95 百分位归一。 | A5（已画） |
| `levels` | `hop` 秒一帧，`groups` 里每条分轨一列 K 计权响度（dB） | 键是轨的 `group`。「轨高跟响度」用它：每个段落算一次各分轨的平均功率。缺了这一层，或者所有分轨都是静音，`laneHeights: 'loudness'` 等同于固定。 | A5（已画） |
| `cover` | `src` 是图片地址（试点里是缩到 480 像素的 data URI），`width`、`height` 是它的像素尺寸 | 核心不加载图片：宿主把图载好，用 `view.setCover(image)` 交给核心，`backdrop: 'cover'` 时画。没有封面的歌退回段落色。 | 闸门五之后（已画） |

模型里出现本文件没有列出的键，核心一律忽略。

## 核心怎么用它

```js
const view = XinScoreView.create(canvas, model, clock, options);
view.start();                       // 自己跑 requestAnimationFrame；也可以由宿主每帧调 view.draw()
```

- `clock`：`{ now() }` 或一个函数，返回模型时间（秒）。宿主负责减掉 `audio.offset`。
- `options`（缺省值是历次闸门定下来的，见 `XinScoreView.DEFAULTS`）：
  - `windowSeconds` 一屏几秒（16）、`playhead` 播放线在宽度的几分之几（0.35）
  - `simplify` 简化画法（开）、`mergeTimbres` 同一分轨的音色轨并成一条（开）
  - `hidden` 不显示的轨 id 列表
  - `offsetSeconds` 在时钟上再加的秒数，试听页的延迟补偿用它
  - `chordSmoothing` 和弦防抖：`raw` 原样、`half` 并掉短于 0.5 秒的、`beat` 短于这首歌一拍的（需要节拍网格）、`second` 短于 1 秒的
  - `plainSections` 只有字母的段落怎么显示：`letters` 字母、`numbered` 第几段、`hidden` 不显示文字
  - `showContour` 人声音高曲线（开）、`showCaptions` 导赏字幕（开）、`showBackdrop` 背景（开）
  - `captionStyle`（0.10.0 起）：`mark`（0.11.0 起的缺省，gate10 定的）或 `sentence`（0.11.0 之前的缺省，明说时和 0.9.2 逐帧相同，测试守着）。`mark`：带第 5 项的字幕行画成「对象 · 事件」标注——预告型提前约 2 秒以 0.42 的亮度出现，下面一条细线走到事件时刻，
    到点亮到 0.94，退场前 0.3 秒淡出；意外型到点直接亮。`laneLabels: 'icon'` 时对象画成轨道图标（轨道色），否则写轨道名（轨道色），「全体」写字。到点起 1.2 秒内被点名那条轨的图标 / 轨名加同色光晕并提亮。
    特效关时没有淡入淡出、细线和光晕。没有第 5 项的行照句子画。每帧返回值 `mark` 写着这一帧的标注（`state`：`preview` / `on` / `out`），`labels` 里被点名那条带 `flash`。方向见 `work/score-cues-20261113/SPEC.md`。
  - `backdropLevel`（0.11.0 起）：`loudness`（缺省）背景亮度跟响度走；`steady` 一直取中间亮度（封面 0.24），视频导出用它——每帧都变的整屏图片最费码率（`work/score-export-20261114/REPORT-A.md`）。
  - `backdrop` 背景画什么：`section` 段落色、`cover`（缺省，背景复看定的；宿主没给图时就是段落色）专辑封面铺满画面、调淡（14% 到 34%，跟响度走），上面盖一层减半的段落色；各轨后面再压暗 55%（上下各 28 像素渐变），曲名与和弦一带不压
  - `laneHeights` 轨高：`loudness` 跟每条分轨在这一段里的响度走，换段时 2 秒滑过去（缺省，闸门五定的）、`fixed` 固定
  - `focusGroup` 正在单独听的分轨（轨的 `group`），别的轨压暗；屏幕上没有这个分轨时什么都不压
  - `loop` `[起, 止]` 秒：宿主正在循环的一段，在段落条上描框。循环本身由宿主做，核心只画
  - `effects` 特效总档位：`off`（和 0.7.0 逐帧相同，测试守着）、`light`（缺省）、`strong`。分开的开关 `fxHit`（S1 过线光晕）、
    `fxAfterglow`（S2 余晖和长音流光）、`fxPlayline`（S3 播放线光柱、强拍轻跳，只在有稳定小节线时跳）、`fxDrums`（S4 底鼓呼吸——0.11.0 起只提亮轨道区，顶部字幕区和段落条不跟着变、军鼓短闪、镲片火花），缺省都开。
    特效只用模型数据、跟歌曲时间走（暂停和拖动看到的就是播放时那一帧）；`draw()` 的返回值里 `fx` 写着这一帧每样特效做了什么，`off` 时是 `null`。
    方向和验收见 `work/score-fx-20261113/SPEC.md`。
  - `fxPreset` 特效搭配（0.9.0 起）：`clear` 清亮（缺省）、`keys` 琴键灯、`ink` 墨迹、`stage` 舞台、`strong` 浓、`off` 素。名字到量的表是 `XinScoreView.FX_PRESETS`。
    `effects` 是三套搭配的别名：`light` = `clear`、`strong` = `strong`、`off` = `off`，三个值画的和 0.8.0 逐帧相同（测试守着）。
    设 `effects` 会把 `fxPreset` 设成它的别名；设 `fxPreset` 时 `effects` 跟着变，不是三档之一的搭配读出来是 `light`（意思是开着）。同时给时以 `fxPreset` 为准。
    `fx.preset` 写着这一帧用的搭配。方向见 `work/score-fx-20261113/PRESETS-SPEC.md`。
  - `fxDynamics`（0.12.0 起）：`off`（核心缺省，和 0.11.0 逐帧相同）或 `song`：当前搭配的亮度和范围跟着整首歌的「起伏」走，
    安静处收向 `SWELL_QUIET` 给的比例，高潮处放到「浓」的分量为止，起伏 0.5 时就是搭配原样；时长不变，`off` 搭配仍全关。
    起伏从 `energy` 算一次（`SWELL`：前后各 1 秒取均值，上升 1.5 秒、回落 4 秒到九成；按这首歌有声部分三点归一：第 10 百分位 0、中位数 0.5、第 95 百分位 1，两段各自直线；
    中位数到第 95 百分位不足 1.5 dB 上半段按比例收窄；然后往中间收：x = |2e − 1| 变成 x²，0、0.5、1 不动（0.14.0 起；0.13.0 曾往两头推，多数歌一半以上时间贴在两头，收回）；
    最后整首范围不足 6 dB 的整体按比例收窄），只是时间的函数。安静端（`SWELL_QUIET`）：持续类（余晖、流光、光柱、照亮、强拍、火花）收到接近没有；瞬时反馈（光晕和碰线火星、底鼓呼吸、军鼓闪）不低于搭配原值的 40%（`INSTANT_FLOOR`），每一下都看得见
    （2026-11-14 用户在 gate11 说幅度太小后加大，复验后收回一部分，`work/score-dynamics-20261114/SPEC-FIX.md` 第 7、8 条）；
    特效照亮的区域（光晕、军鼓闪、火花、光柱）一律截在段落条上沿（0.12.0 起，所有搭配，不管跟不跟随）；
    没有 `energy` 时恒为 0.5，画得和 `off` 一样。`fx.swell` / `fx.amounts` 写着这一帧的起伏和用到的量；`view.swellAt(t)`、`view.swell()` 给宿主画曲线。
    XML 谱面场景传 `song`（设置里「特效跟随起伏」，缺省开）。方向见 `work/score-dynamics-20261114/SPEC.md`。
  - `showRoles`（0.15.0 起；0.16.0 起改用形状）：`false`（核心缺省，和 0.15.0 逐帧相同，模型里有没有 `roles` 都一样，测试在记全绘图状态的假画布上守着）或 `true`：带 `roles` 的轨里，**主伴不靠亮度或颜色分，靠形状**。① 伴奏收成块：彼此重叠或相隔不到 `ROLES.gap`（0.1 秒）的伴奏音连成一串，至少 `ROLES.blockMin`（2）个音成块，不到的照普通音符画；块的轮廓逐段取此刻最低到最高的伴奏音（台阶形），填充用这条轨的颜色、为同状态（已弹 / 未弹，按播放线分左右）音符亮度的 `ROLES.fill`（0.35），上下沿和每个起音一道竖纹用同状态音符的亮度；起音后 `ROLES.flashLife`（0.15 秒）内那道竖纹用亮色闪一下（最多 `ROLES.flash` 0.9）；块里的音不再一根根画，也没有自己的光晕等特效。② 主音照原样画，同一条主音线段（`leadLines`）里相邻两个主音之间一条连线（上一个音的尾到下一个音的头，音高中线到中线，轨色，`ROLES.link` 1.3 像素，已弹 / 未弹亮度同音符），不同线段之间不连。③ 顺序：块、连线、音符（主音在块上面）。④ 聚焦这条轨（`focusGroup`）时不收块、逐音画，连线保留。块和连线在显示建好时一次算好，每帧只画。人声、贝斯、鼓、带子和没有 `roles` 的轨照原样；人声轨即使带了 `roles` 也不收。每帧返回值在打开时多 `blocks`（画了几块）、`blocked`（块里的音数）、`links`（连线段数）。XML 和导出不传它（`tests/host-guard.test.cjs` 守着）。`work/score-roles-20261114/SPEC-3.md`（第二段的「淡一半、细 0.55」已撤）。
  - `showShapes`（0.17.0 起；另一档梭状见 `shapeSet`）：`false`（核心缺省，和 0.16.0 逐帧相同，测试在记全绘图状态的假画布上守着）或 `true`：音符按乐器的发声方式有三种样子，**颜色、亮度、位置、特效都不变**。类别只看轨的 `group`（和选图标用的是同一份信息），表是 `XinScoreView.SHAPE_BY_GROUP`：`piano`、`guitar` → 敲 / 拨（`struck`）；`bass` → 敲 / 拨且粗一档（`bass`）；`strings`、`violin` → 持续（`held`，就是现在的等粗圆角条）；表里没有的组（`vocals`、`drums`、`other`、带子、认不出的组）一律照原样，不猜。敲 / 拨的画法（`XinScoreView.SHAPES`）：起音处一个方头，高 = 音符粗细 × `head`（2），但最多比音符本身高 `headCap`（2）个半音，宽和高一样，在音符中线上；身子从起音处的满粗细直线收到尾 = 粗细 × `tail`（0.3，不细于 `tailMin` 1 像素），在前 `taper`（0.6）秒收完，之后保持尾的粗细到音尾；比头还短的音只剩一个头。贝斯的粗细 = 原粗细 × `bass`（1.35），最多比原来粗 `bassCap`（1.1）个半音，头和尾都按这个粗细算。未弹 / 已弹 / 正在响三个桶各一条路径、一次填充（和原来的填充次数、顺序、颜色、阴影完全相同）。聚焦某条轨时照样有形状；简化、合并碎片之后才定形状。与 `showRoles` 同时为真时的样子未定义（主 / 伴已停用）。XML 和导出不传它（`tests/host-guard.test.cjs` 守着）。每帧返回值在打开时多 `shaped`（这一帧按敲 / 拨画的音数）。`work/score-shapes-20261114/SPEC.md`。
  - `shapeSet`（0.18.0 起；0.19.0 起改成两档，只在 `showShapes: true` 时起作用）：`two`（缺省，就是上面的两类，和 0.17.0 逐帧相同）或 `spindle`；别的值（包括 0.18.0 的 `three`，那一套连同它的表、数值和画法已在 0.19.0 删掉）都按 `two`。`spindle`：拨击类（钢琴、吉他、贝斯）和 `two` 完全一样；`XinScoreView.SPINDLE_GROUPS`（`strings`、`violin`）画成**梭状**——两头尖、中间鼓：每一头的收放占音长的 `share` 0.4，最长 `rampMax` 1 秒（长音是一根完整的梭子，中间一段等粗；短音是小橄榄，中间只有一小段等粗）；满粗 = 音符粗细 × `swell` 2.2，但不超过轨里 `room` 2 个半音的高度，且无论如何至少比音符粗 `lift` 1.5 像素（整屏时一条弦乐轨大约 1 像素一个半音，音符本身已有两个半音粗，按半音封顶就鼓不起来，所以这 1.5 像素的底优先——最密的和声里相邻几个音会连成较宽的带子，但两头的尖仍把一个个音分开）；起音处和音尾 = 满粗 × `tip` 0.15（不细于 `tipMin` 1 像素）；每段收放是一段二次曲线，控制点在收放段正中、满粗的高度上。颜色、亮度、特效（仍以音符中线为准）、每桶一次填充、聚焦时照旧、简化之后再定形状，都和两类一样；不用透明度渐变。梭状单独成块（`SPINDLE_GROUPS`、`SPINDLE`、`fillSpindles`），用户选定后好删。XML 和导出不传它（`tests/host-guard.test.cjs` 守着）。`work/score-shapes-20261114/SPEC-3.md`。
  - `laneLabels` 左边的轨名：`icon`（0.11.0 起的缺省，gate9 定的）或 `text`（写名字，明说时和 0.8.0 逐帧相同）。`icon`（画乐器图标：人声、钢琴、吉他、贝斯、小提琴、弦乐、鼓、其它各一个，24 格线条、单色、轨色）。
    分组表里没有图标的轨、同一分组在屏上不止一条（音色轨分开时）的轨仍写名字。名字用 `hit(x, y)` 取（`{kind: 'lane', label}`）。
    （0.9.1 起）所有图标同一个大小（字号 × 1.7，不跟轨高变），中心在名字栏正中的同一条竖线上、各自轨道的垂直正中；
    图标模式下每条轨至少「图标高 + 上下各 3 像素」，矮轨多出来的高度从高的轨里按比例匀出，总高度不变（`text` 时高度分配不变）；连这样都放不下时高度不动、放不下的那条不画图标。
    图标的亮度跟这条轨此刻的响度份额走（模型的 `levels`，段落之间 2 秒滑过去），最轻 0.5、份额到平均就是全亮。
    每帧返回值 `labels` 写着每条轨画的是什么（`icon` / `text` / `none`）和大小。
  - `sectionStyle` 段落条：`line`（0.11.0 起的缺省）或 `block`（色块，明说时和 0.8.0 逐帧相同）。`line`（每段一条细色线，名字写在线下，放不下整个不写；正在播的一段线粗、名字亮且一定写）。
    条的高度、点段落跳转和循环框的位置不变。每帧返回值 `sectionNames` 是这一帧写出来的段名（只在 `line` 时有）。
- `view.setCover(image)`：交给核心一张已经载好的图（`drawImage` 收的都行），`null` 拿掉。返回收没收下。
- `view.layers()` 报告模型带了哪些层、当前版本画了哪些，宿主据此显示"这首歌有什么"。
- `view.hit(x, y)` 说画布上这一点是什么。段落条回答 `{kind: 'section', time, end, index, …}`（`time` 是段首）或 `{kind: 'bar', time}`（段落之间），
  轨回答 `{kind: 'lane', id, group, label}`。宿主拿它去跳转、循环、独奏。
- `view.chordCounts()` 报告每一档防抖剩下多少段和弦。

## 两首试点的模型

由 `tools/build_bundle.py <试点名>` 生成，在 `work/scoreview-20261110/data/<试点名>/bundle.json`，
旁边的 `health.json` 是体检表。分析根只读；分析根里没有的层由 `tools/make_layers.py` 生成到同一个目录。
