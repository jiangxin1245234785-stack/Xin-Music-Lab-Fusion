# 谱面视图（scoreview）

播放一首已分析的歌时，一张跟着音乐走的多轨谱面：音符从右向左流过一条固定的播放线。
企划与拆分见 `docs/SCORE_VIEW_PROJECT_PLAN_20261110.md`；数据契约见 `MODEL.md`。

现在在**阶段一**（试听页上把画面验收下来）：闸门一到五已过（决策 D1：进 XML）。闸门五之后用户要试专辑封面当背景，已做，
背景定为专辑封面，音符后面压暗 55%（背景复看二：正好）。
**阶段一做完了。阶段二：B1（XML 里的「谱面」场景）和 B2（点轨独奏、点段落跳转、双击循环）已做，能从源码跑，也打进了开发版 `releases/0.5.0-dev.score.3`；B0 已做：XLD 新引擎 `score-layers`（`xld-runtime-baseline/analysis-score/runner.py`）写小节线、响度、分轨响度，
从 XML 谱面里的按钮触发。导赏字幕由 `adapter/captions.cjs` 现做（和 `tools/make_captions.py` 是一对，测试把两边绑在一起）。人声曲线来自 XLD 的 `score-vocals` 引擎（主唱分离 + RMVPE + 八度保护）。**
适配器在 `adapter/track-model.cjs`，XML 里的场景本体是 `fusion-runtime-baseline/score-scene.js`，
实跑脚本是 `tests/xml-scene-smoke.cjs`（用 Electron 跑，见文件头）。阶段一不改 XLD、不改 XML、不写分析根；本目录之外只往 `work/scoreview-20261110/` 写。
每个闸门的结论存在 `work/scoreview-20261110/gates/`。

## 三样东西

| 文件 | 是什么 |
|---|---|
| `score-view.js` | **渲染核心**。`XinScoreView.create(canvas, model, clock, options)`。纯 Canvas 2D，UMD，无依赖，无构建步骤，不知道自己被谁加载。阶段二原样挂进 XML。 |
| `media-clock.js` | 宿主用的小工具：把 `<audio>` 的 `currentTime` 变成逐帧平滑的时钟。有自己播放器的宿主（XML）不需要它。 |
| `audition/page.html` | **宿主**：试听页模板。控件、验收问题、存结论都在这里，不在核心里。 |
| `audition/page.json` | 试听页当前在哪个闸门、之前定了什么、每首试点的说明和建议先看的时间点。 |
| `section-names.json` | 只给第一阶段的打包台（`tools/build_bundle.py`）用的旧对照表，不再更新。屏幕上的段落名字由 XLD 的 `core/sections.cjs` 给出，XLD、XML 和适配器都读它。 |

核心现在画：页眉、音符轨、鼓轨、播放线、和弦面板、段落条、小节标尺、人声音高曲线、导赏字幕（`XinScoreView.DRAWN_LAYERS`）。
模型里的响度已经带着，但要等后面的工作包才画；`view.layers()` 会如实说哪些有、哪些画了。

## 重新生成

解释器都在 `runtime/0.5.0/envs/`。下面的 `py` 指 `runtime/0.5.0/envs/basic/python.exe -X utf8`。

```
py source/scoreview/tools/census.py                 # 全库清点：每首歌有哪些层
py source/scoreview/tools/make_layers.py qilixiang  # 补这首试点缺的层（段落、和弦、节拍、人声、响度、压缩音频）
py source/scoreview/tools/make_layers.py meguri
py source/scoreview/tools/make_layers.py qilixiang plain-sections   # 只有字母的段落（MSAF），试听页对照用
py source/scoreview/tools/build_bundle.py qilixiang # 分析根 + 补的层 → 谱面模型 bundle.json + 体检表 health.json
py source/scoreview/tools/build_bundle.py meguri
py source/scoreview/tools/make_captions.py qilixiang   # 按规则生成导赏字幕（之后要再跑一次 build_bundle）
py source/scoreview/tools/build_page.py             # 模板 + 核心 + 两个模型 → work/scoreview-20261110/page/index.html
py source/scoreview/tools/measure_sync.py onsets qilixiang   # 每条轨的音符比它的分轨早还是晚
```

`make_layers.py` 里已有的层默认跳过，加 `--force` 重做。它调用 XLD 自己的 SongFormer、和弦、节拍分析，
但把工作目录和缓存都指到 `work/scoreview-20261110/`，不在分析根和运行时目录里留东西。

本地看页面：预览服务 `scoreview-page`（`.claude/launch.json`，`tools/serve_page.py`，端口 8771）。
它比标准库的文件服务多了字节范围请求（`<audio>` 拖动需要）和发布时的页面外壳。

## 测试

```
node --test "source/scoreview/tests/*.test.cjs"     # 核心、时钟、两首试点的模型
node source/scoreview/tests/mutations.cjs           # 故意改坏 137 处，看测试抓不抓得到
py source/scoreview/tests/test_build_bundle.py      # 构建器，用临时造的曲目目录
```

测试过了不等于画面对。每个工作包以试听页的一个新版本结束，由眼睛和耳朵验收；发布前在浏览器里真的播放一遍。

## 复用了什么（都是只读导入或调用，没有改它们）

- 和弦共识：`source/fusion-runtime-baseline/xld-timeline-provider-adapter.js`（`tools/chord_consensus.cjs`）
- 和弦内音：`source/xld-runtime-baseline/timeline-controls.js` 的 `chordTones`（同一个脚本里，照 XLD 自己的测试那样在沙盒里加载）
- 鼓的七类：`source/memesynth/memesynth/score.py` 的 `DRUM_CLASSES` / `DRUM_ROUTES`
- 节拍网格：`source/xld-runtime-baseline/analysis-midi/tempo.py` 的 `analyze`
- 力度：`analysis-midi/velocity.py` 的 `apply`（MuScriptor 和 ADTOF 的轨力度是平的，按分轨能量现算）
- 人声：voiceswap 的主唱分离 + 带八度保护的 RMVPE 轮廓；切音符用 `analysis-midi/vocals.py` 的 `segment`
