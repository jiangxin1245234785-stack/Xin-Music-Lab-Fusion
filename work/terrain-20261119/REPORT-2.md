# 第 2 批报告：车厢 LED 显示模块（2026-11-19）

结论：做好了。`source/scoreview/score-terrain-led.js` 和 `tests/terrain-led.test.cjs` 两个新文件，本地一笔提交，没动任何已有文件。`npm test`（source/scoreview）510 项，509 过，1 跳过（原本就跳过），0 失败；测试被 `tests/*.test.cjs` 的通配自动拾取，不需要登记。

## 接口（也写在文件头）
- `drawHeader(ctx, rect, {title, artist, section, nextSection, time, duration, sections, now}, opts)`：上排 歌名 歌手 | 本站 下一站 | m:ss / m:ss，下排线路条。sections 可以是 `[{name,start,end}]`，也可以是 bundle 里的 `[start,end,name]`。`now` 缺省 = time；section / nextSection 缺省由 sections 和 now 推出，没有下一段显示「终点」。
- `drawLyric(ctx, rect, {line, progress}, opts)`：空行什么都不画（`opts.idle:'dim'` 才画熄灭的灯点）。放得下：居中；放不下：点距缩到下限（max(0.72×基准, 1.9px)），再不行按 progress 滚动（前 10% 停在开头，后 10% 停在结尾）。
- `drawNowTick(ctx, x, yTop, yBottom, opts)`：上箭头尖在 yTop 往下指，下箭头尖在 yBottom 往上指，都画在窗口开口之外（窗框上），`opts.pitch` 默认 3。
- `localizeSection(name)`、`setCanvasFactory`、`clearCaches` 另导出。`opts.dpr` 给高清屏。

## 实现
- 点阵字：系统字体（宋体优先）逐字画到离屏画布采样，按「字体|字号|字」缓存；数字等宽，时钟不抖。没有 OffscreenCanvas 就用 document 画布；都没有就退化成空心方框字、直接画，不抛错。
- 灯点：预渲染精灵（亮三档带光晕，熄灭一档），用 lighter 合成，不用 shadowBlur。底（外壳 + 全部熄灭灯点）和整条屏都按内容缓存。
- 点距随屏高算：header 约 h/37.6，且不小于 w/200 列；歌词条 h/14.6。
- 站名缩写：全称 → 主歌1 → 主歌 → 主 ；20 站时每站一个字，放不下的话只给当前站写名。歌名超长截断加「…」，放不下歌手就不显示；放不下「下一站」就退成只有「本站」，再不行整段去掉。

## 帧耗时（Electron，1123 与 1440 宽，header + 歌词 + 箭头）
- 内容没变（缓存命中）：0.038 ms/帧。
- 每秒一次的重建（时间文字变，字形已缓存）：约 3.7 ms。
- 冷启动第一帧（含全部字形采样）：约 30 ms，一次性。集成时可在载入歌曲时先画一帧热身。

## 图
`work/terrain-20261119/phone-2/`：01 顶部屏（1440 / 1123 / 0:00 / 尾声）；02 放大两倍和箭头；03 最长歌名、2 段、20 段、窄屏；04 歌词条（空 A/B、短、中、长 0/0.5/1、日文、英文）。12 点阵中文在 1123 宽下看得清（站名每字约 25 px 高）。脚本 `work/terrain-20261119/led/`。

## 接进去要做的
1. `<script>` 加载 score-terrain-led.js（全局 `XinScoreTerrainLed`）。
2. 每帧：drawHeader（panel 外壳矩形）、drawLyric（窗台矩形，行和 progress 由歌词数据给）、drawNowTick(现在点 x, 窗口上沿, 窗口下沿)。矩形的比例：header 高约 0.088×宽。
3. 段落名要传已汉化的名字；XML 里段落汉化散在 score-variation.js 的 lexicon（kind → 中文）和 score-presentation.js（中→英），都不是可直接调用的函数。bundle 里的 sections 本来就是中文。模块自带的 `localizeSection` 只处理英文标签，是我加的兜底。
4. 画布用高清倍率时传 `opts.dpr`。

## 最可能露馅的一帧
很长的一句歌词滚动到中途：左边缘会切开半个字（跑马灯式），而且逐帧点阵滚动按整点取整，慢速时会一格一格跳。其次：宋体不在的机器（非 Windows）退到别的字体，12 点阵字会糊。

## 我定了、用户没定过的
- 空歌词默认什么都不画（方案 A）；暗灯点是选项（图 04 两种都在）。
- 歌词滚动时前后各停 10%。
- 歌手放不下就整个不显示；中间「本站 / 下一站」宁可缩减也不压歌名（歌名最少保留 5 个字宽，再不够就去掉下一站）。
- 站数太多时只写当前站名，其余只有灯点。
- 走过的线亮度 2 档、当前段 3 档、前方 1 档。
- 加了 `localizeSection`（见上）。

## 没验证的
- 没接进真窗口，没和山一起合成；没在宋体缺失的机器上看。
- 测试用假画布，字形点阵形状在真浏览器里只看了图，没做像素断言。
