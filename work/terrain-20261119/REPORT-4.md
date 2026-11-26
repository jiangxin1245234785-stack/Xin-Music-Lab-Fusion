# 车窗地貌 · 第 4 批报告（接进 XML、打包、真窗口）· 2026-11-19

## 结论
- 提交 **`a8a31a8`**（本地，没推送）。雷达那两个未提交的文件一行没带。
- 包 **`releases/0.5.0-dev.terrain.1`**，从 HEAD 的源码镜像打的，包里的 `score-radar.js` 是 HEAD 的，不是工作区的（包检查 25/25 过）。**入口没切**，还是 radar.13。
- 用隔离方式真的启动了这个包的 `XML.exe` 两次：车窗地貌在真窗口里能选，LED 顶屏、窗台歌词（真实歌词，不是占位句）、「现在」箭头都在；「路边的东西」三档在设置里能切、切了画面跟着变；页面没有报错。
- 先看 `phone-4/01-真窗口-普通-收起侧栏-沉浸.jpg`。

## 改了哪些文件
| 文件 | 改了什么 |
|---|---|
| `source/scoreview/score-view.js` | 缺省值加 `terrainRoadside: 'off'`；白名单收 `off` / `all` / `kick-snare`，别的值丢掉 |
| `source/scoreview/score-presentation.js` | 新函数 `sillLyric`：给窗台的那一句和它唱到哪（`lyricProgress`，0–1）。只在车窗地貌时用，别的款还是原来的 `lyricAt`。frame 里多带 `terrainRoadside` |
| `source/scoreview/export/export-page.html` | 导出页也载入 `score-terrain-led.js` |
| `source/fusion-runtime-baseline/index.html` | 谱面设置加「路边的东西」三选一（`#scoreTerrainOptions`，默认藏着）；载入 `score-terrain-led.js` |
| `source/fusion-runtime-baseline/score-scene.js` | 照雷达设置的做法：localStorage `xin-score-terrain-v1` 记住，只在车窗地貌时显示，打开歌和改动时交给核心；车窗地貌时 stage 加 class `score-led-words`；车窗地貌下换歌不再在画面上写「点一条轨：只听它…」那行提示 |
| `source/fusion-runtime-baseline/score-layout.css` | 有 `score-led-words` 时，收起侧栏 / 按 H 隐藏界面下那条歌词不显示字，画布也不为它让出高度 |
| `source/fusion-runtime-baseline/i18n/catalogs.js` | 设置的中英文词 |
| `source/release-tools/build-local.cjs` | 打包清单加 `score-terrain-led.js` |
| 测试 | 新增 `scoreview/tests/terrain-xml.test.cjs`（4 条）、`fusion-runtime-baseline/tests/score-terrain-settings.cjs`（接进 XML 的 `npm test`） |

## 查到的现状（改之前）和改了什么
XML 自己的歌词浮层（`score-lyrics.js`）在车窗地貌下：

| 场合 | 改之前画什么 | 现在 |
|---|---|---|
| 普通窗口、没开专辑侧栏 | 浮层要找人声轨的位置（问 `view.hit` 哪里是 lane）；车窗地貌没有 lane，找不到就自己藏起来。**本来就不叠在风景上** | 没改 |
| 专辑侧栏展开 | 歌词在左边侧栏里（DOM，不在风景上） | 没改，侧栏里照样有歌词和「早 0.1 秒 / 晚 0.1 秒 / ⋯」（见下「我自己定的」） |
| 侧栏收起 / 按 H | 歌词放进 `#scoreCompactLyrics`，**压在画布下沿、风景上方**，画布还为它缩矮 2.2 行 | 改了：这一款下这条不显示字、画布不缩；`⋯` 菜单按钮（只在收起侧栏时有）留着 |
| 沉浸模式 | CSS 本来就把这些 DOM 歌词全藏了；presentation 对这一款也不画底栏 | 没改 |
| 专辑说明（caption） | 画法款不给 caption，本来就是空的 | 没改 |

另外两处画在画布上的 XML 文字：
- 换歌时那行操作提示「点一条轨…点段落…」：车窗地貌下点不了轨，也不该写在风景上，**这一款下不再写**。
- 谱面层准备状态那一行（例如「正在准备人声线…」「这次没准备成…」）：**没改**，它照旧画在画布顶上，正好压在 LED 顶屏上（见「最可能露馅」）。

**歌词怎么到窗台：** 窗台用的是 XML 歌词菜单同一份歌词快照（`XinScoreLyricsView.snapshot()`，含整首的偏移），所以「显示歌词」关掉时窗台也暗。真窗口里七里香 1:44 窗台是「妳出現在我詩的每一頁」，和侧栏当前句一致。

## 第 2b 批图里「引子里窗台不亮」那格（任务第 4 条）
**是真的亮了，不是拼图的问题。** 原因：那张图喂的是一句从 0:00 开始的占位歌词，而七里香第一个段落从 0:03 才开始；0:00–0:03 不在任何段落里，原来的规则只认「引子 / 间奏 / 尾奏」这几个名字，段落外的时刻就漏过去了。七里香的真歌词第一句在 0:27，所以真歌不会这样，但规则确实有洞。
修法（只用于车窗地貌的 `sillLyric`）：第一个段落之前、最后一个段落之后都暗；段落的 kind 是 intro / inst / interlude / outro / solo，或名字是引子 / 前奏 / 间奏 / 尾奏 / 尾声 / 器乐（段）/ 独奏，也暗。原来的规则还会让「器乐段」里亮着上一句（2:18–2:44），这次一并补上。别的款的 `lyricAt` 没动。
真窗口验证：七里香 0:00 和 2:30（器乐段）窗台都暗（`phone-4/04`）。

## 截图逐张（`phone-4/`，原图在 `work/terrain-20261119/batch4/checks/`）
| 图 | 一句话 |
|---|---|
| `01-真窗口-普通-收起侧栏-沉浸.jpg` | 1440×852、DPR 2。侧栏展开时画布 1123×778；收起后 1440×778，风景上没有字，歌词只在窗台；沉浸模式整窗，窗台亮着 0:35 那句。 |
| `02-路边的东西-三档.jpg` | 七里香 1:44：关 / 全部（电线杆、围栏、里程桩）/ 只留底鼓和军鼓；最后一张是谱面设置抽屉，「路边的东西」紧跟在谱面样式下面。 |
| `03-窗台LED-真实歌词.jpg` | 七里香 0:35、1:04 的真歌词；收起侧栏时歌词只在窗台；FLAG 1:00 日文歌词「まざりあう」也点得出来。 |
| `04-窗台不亮的时候.jpg` | 七里香 0:00（段落之前）、2:30 器乐段、MEGURI 8:20（没有歌词，路边全部，有一架风车）。 |
| `05-没有段落的歌.jpg` | FLAG 2:30、100 years of choke 12:21：顶屏只有歌名歌手和时间，线路条那一行全暗。 |
| `06-最密的鼓-choke.jpg` | 曲库鼓最密处 choke 12:21，全部 vs 只留底鼓和军鼓（照实出的，「全部」很密）。 |
| `07-导出视频-抽帧.jpg` | 用这个包自带的导出模块导的 1080p：0:00、0:35、1:44、最后一秒，顶屏、窗台、路边都在。 |

## 测试尾部（原样）
`source/scoreview` `npm test`：
```
ℹ tests 533
ℹ suites 0
ℹ pass 532
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 19002.1048
```
`source/fusion-runtime-baseline` `npm test`（退出码 0），最后两行：
```
score radar wait: PASS (holds the last frame until the radar is ready, two seconds at most; other looks at once)
score terrain settings: PASS (shown only with 车窗地貌, off by default, kept per viewer, reaches the core; words off the scenery)
```
`source/xld-runtime-baseline` `npm test`（退出码 0），最后一行：
```
score vocals: PASS (current by stem identity and stored split, stale on stem change, service cache / rerun / refusal, missing add-on said, vocals-rmvpe refused without a current line and fed the judged bytes, no singing = no run, vocals a part in the 转谱 panel and the one-click plan, vocals row = MIDI run else read-only line, lead + backing rows)
```
（scoreview 那套是在工作区跑的，带着雷达未提交的改动；它们本来就在工作区里。）

## 导出和播放器一致
- **逐调用对照（保留原做法，加了车窗地貌一条）**：`terrain-xml.test.cjs` 最后一条，用真的 terrain 和真的 LED 模块，同一首、同一刻、同样选项（路边全部、歌词、−0.125 s 偏移），沉浸模式 1920×1080 和导出视图 1920×1080：交给这一款的 frame 完全相同，画布收到的每一个调用（含绘图状态、LED 每个灯点）逐个相同。通过。
  - 比法是把每个调用序列化后比（渐变对象每帧是新的闭包，直接 `deepEqual` 比不了），所以颜色、坐标、渐变的停点都比到了。
- **真导出**：`batch4/export/七里香-车窗地貌-terrain1-1080p.mp4`，67.9 MB，303.7 s，9111 帧，1920×1080，四边黑带 0。导出用时 404.7 s（雷达 radar.8 同一首是 85 s），平均每帧画 6.2 ms，最慢一帧 188 ms。
- **没做的**：导出视频和真窗口截图没有逐像素比。导出用的是 bench 的七里香数据（`work/scoreview-20261110/data/qilixiang`：歌名标签、没封面、段落名「器乐段」、歌词是旧 json），真窗口用的是分析副本（歌名「周杰伦 - 七里香」、有封面、歌词偏移不同），两边数据不同，比了也不说明问题。

## 包检查（`batch4/pkg-check.json`，25/25）
四个目录每个文件和镜像（`git archive` HEAD + ADTOF 权重）逐字节相同，只差打包注入的四处；`score-radar.js` 等于 HEAD、不等于工作区（雷达改动没进包）；清单里的文件都在；新设置、LED 载入顺序、导出页、样式、词条都在；入口没切。工作区里没进包的改动记在 `batch4/uncommitted-not-packaged.txt`（就是雷达那两个文件）。构建自带的启动检查（临时档案）也过了。

## 真窗口怎么启动的
- 脚本 `batch4/xml-terrain-check.cjs`、`batch4/xml-terrain-check-2.cjs`，库 `batch4/lib.cjs`（抄自 pkg-radar9，加了「启动前往临时档案里放文件」）。
- 临时档案（系统临时目录，结束删掉）；`XIN_RELEASE_TEST_ROOT` / `XLD_TEST` / `XML_TEST`，离屏、静音、`--disable-gpu`、另开调试端口；启动前确认没有别的 XML / XLD 在跑，结束只关自己起的那个进程。
- 临时分析根 `batch4/launch/analysis`：七里香、MEGURI、Forever Howlong、FLAG、100 years of choke 五首，从真实分析根**只读拷贝**（实拷，不是硬链接），MIDI 记录改指到副本。真实分析根没写。
- 歌词：把开发档案的歌词缓存（`%APPDATA%/XinMusicDevelopment/Lyrics Cache`，57 个文件）拷一份放进临时档案，免得去 LRCLIB 查。

## 没验证的
- **没听声音**（静音启动），没试真的双击（真档案那条路）。
- 歌词是不是全部命中了拷进去的缓存、有没有向 LRCLIB 发请求，没核对。侧栏显示「歌词来自 LRCLIB」——缓存的来源本来就记作 lrclib，分不出来。
- **Forever Howlong 在副本里打开是「这首歌还没有转写出来的音符」**。副本的 MIDI 路径改对了；是这首自己的数据问题还是 XML 读它的问题，没查。换成 FLAG 和 choke 做「没有段落的歌」。
- 播放中的连续画面没在真窗口里看（截图都是暂停后拖到那一刻）；真窗口里的帧耗时没量。
- 高分屏：真窗口是 DPR 2 截的，LED 点阵看着正常；DPR 1 没在真窗口看。
- 导出慢了约 5 倍（404 s vs 雷达 85 s），原因没查。

## 我自己定的（用户没定过）
1. 侧栏展开时，侧栏里的歌词（三行 + 早晚 0.1 秒 + 菜单）**留着**：它不在风景上，而且对齐歌词的按钮只在那里。结果是侧栏和窗台各有一份同一句。要不要这一款下侧栏也不显示歌词，等用户看图定。
2. 收起侧栏时右下角的 `⋯` 歌词菜单按钮留着（为了还能改歌词），字不显示。
3. 「显示歌词」关掉时窗台也暗。
4. 窗台在「器乐段」也暗（原规则会亮着上一句）；段落名或 kind 写着独奏 / solo 的也暗。
5. 最后一句唱到哪 = 到它所在段落结束为止（没有下一句可参照）。
6. 换歌时的操作提示在这一款下不写。
7. 设置里三个选项的名字：关 / 全部 / 只留底鼓和军鼓；英文 Off / All drums / Kick and snare only。

## 这一版最可能露馅的地方
- **谱面层准备状态那一行压在 LED 顶屏中间**（`01` 的侧栏图、`03` 的 FLAG、`06` 的 choke 都能看到「正在准备…」「这次没准备成…」）。真曲库里大多数歌准备好了不会出现，但刚分析完的歌会。要不要挪位置、这一款下改成别的样子，等主持会话定。
- 七里香在这份副本里的歌名是「周杰伦 - 七里香」、歌手空（标签问题），顶屏上歌名被截成「周杰伦 - 七…」。真曲库读的是同一个音频文件，应当也是这样，但没在真曲库的窗口里看。
- Forever Howlong 这种「有分轨、有歌词，但 XML 说没有音符」的歌，这一款画不出来（只有 XML 的提示字）。
- choke 12:21 开「全部」时很密，就是用户担心的那种。
