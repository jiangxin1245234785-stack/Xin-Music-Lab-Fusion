# 车窗地貌 · 实时渲染第二轮 · terrain.37

**重天气未稳定提速。两轮实测，主线程绘制回调 7.48 → 7.68 ms/帧（上升 2.7%），整窗平均帧间隔 35.98 → 34.86 ms（下降 3.1%），GPU 进程 CPU 1036 → 1075 ms/s（上升 3.8%）。**

两版各用自己的 XML.exe，Radeon 890M / D3D11，静音离屏、临时档案、私人调试管道、相同单曲分析副本。先测 .36、.37，再反序测 .37、.36。开头数字是两轮各六个重天气格等权平均。每格约 5 秒。逐层账单另用 RTX 5070 Ti Laptop 及 in Silence - in Siren。离屏间隔包含合成与调度，不能据此换算实体屏幕的实测帧率。

| 指标 | 先 .36 后 .37 | 先 .37 后 .36（仍按 .36 → .37 列示） | 两轮均值 |
| --- | --- | --- | --- |
| 主线程绘制 ms/帧 | 7.70 → 7.67 | 7.26 → 7.69 | 7.48 → 7.68 |
| 渲染进程 Task ms/帧 | 9.43 → 9.54 | 8.83 → 9.32 | 9.13 → 9.43 |
| GPU 进程 CPU ms/s | 1090 → 1141 | 981 → 1009 | 1036 → 1075 |
| 平均帧间隔 ms | 36.92 → 34.10 | 35.05 → 35.62 | 35.98 → 34.86 |
| 帧间隔 P95 ms | 47.28 → 47.25 | 47.27 → 50.02 | 47.28 → 48.63 |

以下逐格内存及定位来自第一轮，各格第二次测量见[反序复测明细](round11/native/REPORT-reverse.md)。

[试版 XML.exe](../../releases/0.5.0-dev.terrain.37/XML.exe) · [12 张手机图](phone-11/index.html) · [原生性能与定位明细](round11/native/REPORT.md) · [四天气逐层账单](round11/layers/REPORT.md) · [导出与同帧验证数据](round11/delivery-pixels.json)

| 视口 | 天气 | 绘制回调 ms/帧 | 渲染主线程 Task ms/帧 | GPU 进程 CPU ms/s | 进程私有 MiB |
| --- | --- | --- | --- | --- | --- |
| 1440 | 晴 | 3.10 → 2.99 | 4.60 → 4.43 | 985 → 974 | 1658 → 1618 |
| 2560 | 暴雨 | 9.84 → 9.14 | 11.83 → 10.93 | 1088 → 1140 | 2936 → 2647 |
| 1440 | 沙尘 | 6.40 → 6.33 | 7.80 → 7.71 | 1178 → 1182 | 2724 → 2451 |
| 2560 | 风雪 | 7.89 → 7.37 | 10.55 → 9.95 | 986 → 1002 | 4075 → 3786 |
| 2560 | 晴 | 3.49 → 3.86 | 5.69 → 6.38 | 965 → 963 | 3925 → 3751 |
| 1440 | 暴雨 | 8.33 → 8.73 | 9.60 → 9.95 | 1133 → 1096 | 3055 → 2995 |
| 1440 | 风雪 | 7.64 → 7.52 | 8.88 → 8.84 | 1186 → 1201 | 2951 → 2808 |
| 2560 | 沙尘 | 6.08 → 6.90 | 7.94 → 9.85 | 971 → 1222 | 3771 → 3529 |

### 山间雨、雪、沙

按山体层分发谷间单元，维持原叠画顺序。雨帘只在同一遮罩、同一横纵相位连续出现时复用同一张工作画布；回退到单张画布后，软件栅格的暴雨导出也与 .36 对齐。七种雪帘各预存五个粒子包的静态参数。沙尘保留原径向渐变，逐单元恢复透明度。早期雨脚预合成、沙尘团贴图在 1440 隔离测试中分别达到 4/255、8/255，均已撤回。

| 宽度 | 独立图层 | 均值 .36 → .37 ms | 中位 .36 → .37 ms | 最大 RGBA 单通道差 |
| --- | --- | --- | --- | --- |
| 1440 | 雨 | 0.583 → 0.604 | 0.500 → 0.600 | 0/255 |
| 1440 | 雪 | 0.192 → 0.179 | 0.200 → 0.200 | 0/255 |
| 1440 | 沙 | 0.321 → 0.317 | 0.300 → 0.300 | 0/255 |
| 2560 | 雨 | 0.646 → 0.683 | 0.700 → 0.700 | 0/255 |
| 2560 | 雪 | 0.183 → 0.162 | 0.200 → 0.200 | 0/255 |
| 2560 | 沙 | 0.262 → 0.317 | 0.300 → 0.200 | 0/255 |

同一 Chrome / SwiftShader 会话、八个固定谷间单元、A–B–B–A，每种实现 24 帧。计时含固定底色和画布命令提交。另在 0、71、324、324.5 秒比较 RGBA 并往返定位。真实乐曲中的层成本见下表，0.1 ms 附近的小差值受计时量化影响。[隔离层原始数据与两版源码哈希](round11/valley/final/results.json)

| 视口 | 天气 | 山间天气 .36 → .37 ms/帧 | 山体合成（含山间天气） | 雨玻璃 |
| --- | --- | --- | --- | --- |
| 1440 | 晴 | 0.000 → 0.000 | 0.565 → 0.464 | 0.000 → 0.000 |
| 1440 | 暴雨 | 0.906 → 1.089 | 1.625 → 2.053 | 0.728 → 1.081 |
| 1440 | 风雪 | 0.046 → 0.075 | 0.735 → 1.194 | 0.001 → 0.001 |
| 1440 | 沙尘 | 0.076 → 0.072 | 0.775 → 1.001 | 0.000 → 0.003 |
| 2560 | 晴 | 0.000 → 0.000 | 0.535 → 0.804 | 0.000 → 0.000 |
| 2560 | 暴雨 | 3.396 → 3.510 | 4.417 → 4.592 | 1.074 → 1.121 |
| 2560 | 风雪 | 0.064 → 0.064 | 1.018 → 1.235 | 0.003 → 0.001 |
| 2560 | 沙尘 | 0.067 → 0.103 | 0.889 → 1.188 | 0.001 → 0.004 |

RTX 分层试场中，六个重天气格的无打点整帧绘制中位数等权平均为 4.10 → 5.33 ms。个别层节省时间，总体仍有回退。独立谷间试场也没有显示三种天气普遍加速。

### 山体、雨玻璃、雪雾

山脚边界及四档渐隐几何跟随既有双视口形状缓存，平移时复用计算值。晴天格的山体账单最接近这项改动的独立收益。雨玻璃复用纹理目标帧缓冲，只上传可见水滴实例，并缓存固定碰撞网格的列数。切换尺寸即释放旧目标。测试场交替切换质量档 12 次，同时持有的帧缓冲最多 9 个；原水雾混合顺序和完整导出光学保留。

雪雾最多保留四个 8,192 元素的双精度噪声格点窗口，WebGL 路径跳过未使用的 CPU 光学颜色数组写入。分项实测雪雾均值为 1440 宽 0.472 → 0.415 ms/帧、2560 宽 0.490 → 0.454 ms/帧。山体几何、雪雾、玻璃三张消融图均从同一份 .36 场景只替换被测代码，最大通道差依次为 0、0、0/255。

### 导出帧与三条路径

此前改动 score-presentation.js 与 score-export-ipc.cjs 是为了把预览质量写入导出任务。这样会让普通预览请求低分辨率雨玻璃，改变 .36 的导出行为。最终两个文件及 export-render.js 均与 .36 包逐字节相同；score-export-wiring.cjs 也已还原。

两版各用正式导出按钮生成 1920×1080、30 fps 的三秒短片。截取歌曲 5:23 起的片段，在视频时间 1.000 秒、送入 VideoFrame 前取 PNG，解码为 RGBA。MEGURI 暴雨 5:24 的 2,073,600 个像素全部相同，四通道最大差均为 0。原始 RGBA 的 SHA-256 为 `e05b466bb1b65491e70ff91fb76571ae1a57b9577e4280e5c1f12218a597ec16`。[.36 原帧](round11/native/release-36-high/pre-encode.png) · [.37 原帧](round11/native/release-37-high/pre-encode.png) · [四倍局部和差异图](phone-11/04-export-rgba.jpg)

SwiftShader 同路跨版本共 64 对画面，含四天气、两画幅和 8 组导出帧。跨版本最大通道差 0/255。AMD 正式高清窗口里，两版各自的播放、前后定位完全相同；实窗与各自独立导出窗口仍分别有 982 和 904 个像素不同，最大通道差分别为 10 和 10/255。三路绝对一致这一项未通过。其来源尚未证实。

同一对正式 XML.exe 改用 SwiftShader 后，MEGURI 5:24 的播放、前后定位及编码前原帧在每版内均为零差，两版之间也为零差。AMD D3D11 的实窗与导出差异仍保留在上面的记录中。[.36 软件渲染核验](round11/native/software-36/pixel-comparison.json) · [.37 软件渲染核验](round11/native/software-37/pixel-comparison.json)

### 内存、定位与交付边界

重天气六格平均，主、渲染及 GPU 三进程私有内存合计 3252 → 3036 MiB，工作集 4437 → 4194 MiB，JS 堆 21.9 → 21.8 MiB。每格播放后取一次快照，未测长时间驻留与显卡专用内存。

每格暂停后定位 35 → 324 → 35 秒，记录前八次绘制。重天气 18 次定位中，最慢的首个准确帧 52.2 → 42.2 ms。前八帧绘制均值（各定位等权）7.78 → 8.05 ms/帧。所有逐次样本及 P95 均在原生报告。

没有新增画质开关。最容易辨认差异的位置是暴雨中玻璃与山体交叠的边缘；独立实窗之间出现的小差值以原始像素记录为准。性能结论只覆盖这里的设备、曲目和采样窗口。

仅列未做项：降低玻璃分辨率、雨滴隔帧更新、山脊整层长图、重画电线杆／路牌、改变窗内陈设。没有制作可选的 20 秒并排短片。

正式包清单校验 1,446 项，日常入口仍指向 .36。产品改动为 source/scoreview/score-terrain.js、score-terrain-rain.js，新增 terrain-valley-perf.test.cjs 和 terrain-glass-perf.test.cjs。测量、截图、打包和验收脚本及记录在 round11，图册在 phone-11。[发布清单差异](round11/suites/package-release.json) · [启动及导出回执](round11/native/release-37-high/export.json)

### 三套 npm test 尾部原样

Scoreview 和 XML 退出 0。XLD 在隔离副本退出 1：Windows 拒绝创建测试用目录联接（EPERM）。续跑和短临时路径复核后，midi-delete.cjs、storage.cjs 仍受阻；audit-fix-f2.cjs 在短路径通过。三套全绿尚未达成。[XLD 原始日志](round11/suites/xld-test-final.log) · [逐项续跑](round11/suites/xld-recovery-final.json) · [短路径复核](round11/suites/xld-recheck.json)

**Scoreview · exit 0**

~~~text
✔ winds are spindles with the shapes on (like the strings), and their single lines are linked (34.1536ms)
✔ thickness by pitch reaches winds; simplifying joins them as held notes (not as strikes) (1.3874ms)
✔ several wind instruments apart: one icon each, numbered; together: one lane, one icon (5.798ms)
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (2.0872ms)
ℹ tests 642
ℹ suites 0
ℹ pass 641
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 67171.8994
~~~

**XML · exit 0**

~~~text
✔ input ranges, gaps, shortened last sample and zoom seek share the record timeline (26.3577ms)
✔ readouts use the terrain source window, engine timelines and exact flash boundaries (98.4137ms)
✔ closed is dormant, live values match the engine, all six chart domains seek, and the choice persists (112.223ms)
✔ other styles and tracks without notes, curves, or active selections cannot leak weather or previous data (15.7727ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 765.7892
~~~

**XLD · exit 1**

~~~text
result sweep: ok (fragments discriminate where coverage and segment count do not; unreadable and failed results stay visible; unlisted directories warn)
source hygiene: ok (256 files, no stray control characters)
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{d2fae753-77ae-4d77-9818-130148bc9307}\Temp\r11-fixtures-burpLG\tmp\xld-midi-delete-XkzVVj\outside' -> 'C:\Users\12452\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{d2fae753-77ae-4d77-9818-130148bc9307}\Temp\r11-fixtures-burpLG\tmp\xld-midi-delete-XkzVVj\album\track\midi\strings\b2341350-f022-4dae-be70-cc925d10027b'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async C:\Users\12452\AppData\Local\Temp\r11-src-NFwy1K\source-final\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Packages\\openai.codex_2p2nqsd0c76g0\\AC\\#!sandbox.{d2fae753-77ae-4d77-9818-130148bc9307}\\Temp\\r11-fixtures-burpLG\\tmp\\xld-midi-delete-XkzVVj\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Packages\\openai.codex_2p2nqsd0c76g0\\AC\\#!sandbox.{d2fae753-77ae-4d77-9818-130148bc9307}\\Temp\\r11-fixtures-burpLG\\tmp\\xld-midi-delete-XkzVVj\\album\\track\\midi\\strings\\b2341350-f022-4dae-be70-cc925d10027b'
}
~~~

# 车窗地貌 · 实时渲染性能测量 · terrain.36

**大窗重天气超过 60 Hz 帧预算。** 正式 XML.exe 离屏合成的 2560×1600 暴雨中位数，Radeon 890M 为 43.8 ms，RTX 5070 Ti Laptop 为 38.4 ms。RTX 的谱面回调中位数为 33.4 ms，停掉谱面回调后，窗口其余界面继续运行，测得 16.7 ms。硬件分层显示山体和雨玻璃的成本远高于窗台直射。terrain.22 已有重天气长帧，三版同场景数据可在报告中对照。

[打开性能报告](round10/PERF-REPORT.md) · [浏览 12 张手机图](phone-10/index.html) · [两卡矩阵与历史原始记录](round10/matrix/summary.json) · [逐层账单](round10/layers/REPORT.md)

**甲类通过 0 项，日常入口仍为 terrain.36。** 复用山体渐变在两个软件画幅都耗时增加，合并车厢采光只省约 0.00010–0.00015 ms/帧。仅裁透明下边在四天气、两画幅的 24 帧逐像素零差，正式 XML 两块显卡四种配置中最好的整窗平均间隔仅缩短 0.59%，低于 2% 门槛。没有发布 terrain.37。[候选的收益与逐像素证据](round10/decision.md)

**乙类四项都留在试验副本。** 同时裁山体上下边，通道最多差 4/255；关闭雨窗折射水滴，3.37% 像素改变；近窗风雪每轴缩半，28.86% 像素改变；晴天隔帧更新，绘制调用时间少 2.88 ms/逻辑刷新，但复用帧有 37.89% 像素改变。雨窗和风雪的同步软件测量均未显示总耗时收益。[乙类对照](phone-10/index.html)

**测量边界。** 两首以 1× 实际播到自然结束，逐个长帧标记歌曲时间和同期证据，包含同机测量重叠区间。矩阵使用独立临时窗口逐一运行，并记录离屏合成事件。实体屏幕没有参与。GPU 硬件执行时间未获取，驱动计数器在本执行环境不可用。最不确定的是屏幕实际掉帧、孤立最长帧的成因和跨版本小差额。内存三轮转换只反映短时状态。[MEGURI 全曲长帧](round10/songs/meguri/over-budget.csv) · [in Silence / in Siren 全曲长帧](round10/songs/silence/over-budget.csv) · [GPU 计数器探针](round10/adapter/PDH-REPORT.md)

**改动文件。** 产品源文件和函数改动数均为零。所有采集、统计、候选替换与验收脚本、数据和报告均在 round10，图片与索引在 phone-10，本节追加在 HANDOFF.md 顶部。开工时 SETTING.md 已有修改。原有版本包和启动指针按基线核对。[4,403 项基线](round10/baseline-sha256.json) · [源码与入口差异](round10/changed-files.json) · [交付复核](round10/delivery-check.json)

**三套正式测试。** Scoreview 638 项通过、1 项既有跳过；XML 通过。XLD 因 Windows 创建目录联接返回 EPERM，原命令退出 1；逐条续跑 81 项有 79 项至少在一种临时环境通过，仍被实际 junction 阻住的是 midi-delete.cjs、storage.cjs。[测试详情](round10/suites/README.md)

## scoreview npm test (exit 0)

~~~text
✔ several wind instruments apart: one icon each, numbered; together: one lane, one icon (3.874ms)
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (0.5268ms)
ℹ tests 639
ℹ suites 0
ℹ pass 638
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 26204.807
~~~

## xml npm test (exit 0)

~~~text
✔ closed is dormant, live values match the engine, all six chart domains seek, and the choice persists (25.7821ms)
✔ other styles and tracks without notes, curves, or active selections cannot leak weather or previous data (4.3604ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 175.11
~~~

## xld npm test (exit 1)

~~~text
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\t36-ZfH50G\tmp\xld-midi-delete-1MrJqe\outside' -> 'C:\Users\12452\AppData\Local\Temp\t36-ZfH50G\tmp\xld-midi-delete-1MrJqe\album\track\midi\strings\d59b0073-19da-4e1e-af0b-c6b116e5cb40'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t36-ZfH50G\\tmp\\xld-midi-delete-1MrJqe\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t36-ZfH50G\\tmp\\xld-midi-delete-1MrJqe\\album\\track\\midi\\strings\\d59b0073-19da-4e1e-af0b-c6b116e5cb40'
}
~~~

---


# 车窗地貌 · 阳光进车厢与收音机电平 · terrain.36

**晴天下午的光现在从左上穿过窗洞，落在窗台上。** 收音机的左肩受光，机身、提手和天线的影子向右前方伸出。云遮住太阳时，暖光和投影一起淡出。收音机待机电平保留声部电平和本曲真实鼓点，移除了按时间摆动的正弦项。正式试版已用自己的 XML.exe 启动，实导 1080p 与 4K。日常入口仍是 terrain.35。

[启动 terrain.36 的 XML.exe](../../releases/0.5.0-dev.terrain.36/XML.exe) · [浏览 36 张手机图](phone-9/index.html) · [肖邦 4:29 同帧对照](phone-9/02-chopin-bright.jpg) · [1080p 样片](round9/native/after1080-meguri-export/cabin-1080p.mp4) · [4K 样片](round9/native/after4k-meguri-export/cabin-2160p.mp4)

## 光从哪来

| 画面部分 | terrain.35 | terrain.36 |
|---|---|---|
| 天空 | 低空暖散射原在左，主要光晕在窗宽约 69%–74% 的右上方，横纵坐标都随时间移动。 | 主光晕固定在窗宽 26%、设计高度 254 的左上方。 |
| 丁达尔光束 | 光束长轴由左上向右下。 | 保留原轴向和原有云隙变化。 |
| 山体 | 坡面法线与岩脊明暗都取左侧光源。 | 保留山形、岩层纹理与明暗面。 |
| 电线杆、路边物件、站台 | 左边受光，影子向右、稍朝观者。 | 沿用现有画法。 |
| 窗框与台面 | 右内框和台面已有一片屏幕混合模式的暖光，下面还铺一层宽幅暖色。 | 旧暖光整片撤掉。晴天底色改为弱中性漫光，窗洞的投影落到下窗框与台面。 |
| 窗帘 | 褶皱与接触影已有层次，投影向右下。 | 保留布料原貌。图中可对照布帘和相邻右框，新增受光集中在下框。 |
| 收音机 | 固定的左暖斜带、右侧压暗和投影在天气变化时仍存在。 | 机壳顶面、左肩、右侧压暗和落在台面上的影子共用同一阳光量；脚底接触影与青屏独立。 |
| 轨面反射、玻璃游光和悬浮尘点 | 轨顶反光偏右，游光会移动，尘点的位置偏右上。 | 保留这三种已有的窗外或玻璃效果，避免改动山前和玻璃内部的像素。 |

[冻结版本逐处代码依据和方向说明](round9/directions.md) · [方向对照](phone-9/index.html)

**光量。** 读取天气引擎当帧的 `cloudOpacity = 0.35 + 0.65 × smooth(慢线)`。晴天车内直射量取 `clamp((1 - cloudOpacity) / 0.65, 0, 1)`。没有曲线、或选「原来的办法」而引擎没有云量字段时，沿用草图的晴天默认端点 0.35，直射量为 1。雨、雪和沙尘都为 0，包括首次加载天气素材时。非晴天气沿用原车厢暗度、冷色天光、降雪反光、沙尘弱黄漫光和闪电照亮的瞬间。

**几何与缓存。** 下档密封条下方作为光斑的后沿，窗洞下方两个圆角的切点给出左右界；沿台面深度向右推到窗台前沿，左边形成斜切。收音机的外壳、提手、天线按实际机身坐标投到该平面：每单位高度向右 1.72、向车内 0.23。把遮住的部分从暖光中扣除，原有脚底软影负责与台面接触。机壳直射贴图避开整块青屏、扬声器、旋钮和刻度。窗台只缓存下方的一条贴图；缓存区分画幅、DPR 和五档阴影边缘软硬，亮度始终用连续的实际阳光量。机壳漫反射与受光贴图也单独缓存。

**电平。** 十根待机柱仍用各声部的约 0.28 秒电平取样、原来的插值和均值混合。只移除随时间摆动的正弦乘数。保留的鼓点来自本曲鼓轨的 MIDI 转写，沿用原有事件筛选、声部均值门槛和 160 毫秒释放。MEGURI 的底鼓在 323.970 秒发生；相对同帧移除鼓轨，第一根柱在 323.969、323.970、324.000、324.140 秒的增量依次为 0、0.25477、0.22750、0。时间、段名、窄屏收纳和整句歌词沿用 terrain.35。[电平实测](round9/meter.md)

## 实际歌曲、画幅和同帧测量

| 晴天曲目与时刻 | 慢线 | 云量 | 车厢直射量 |
|---|---:|---:|---:|
| 肖邦《降 E 大调夜曲》Op. 9 No. 2，4:29（全曲最大直射） | 0.013445 | 0.350349 | 0.999463 |
| MEGURI，2:00 | 0.305211 | 0.494689 | 0.777402 |
| MEGURI，5:24 | 0.959480 | 0.996885 | 0.004793 |
| in Silence / in Siren，3:25 | 0.466160 | 0.642056 | 0.550682 |

**玻璃和屏幕。** 1440×900 的肖邦 4:29，将 .36 的天空光晕中心临时还原为 .35 坐标，只在隔离验收页操作；玻璃内 756,684 个像素与 .35 完全相同。雨、雪、沙尘的玻璃直接与 .35 比对也为零差异。另有 18 组固定光晕、只关掉 G1 直射的对照，玻璃和 VFD 屏内差异均为零。在肖邦最亮帧，收音机待机屏段名与时间的亮字/暗底对比度为 **4.783:1 → 4.783:1**，取两版共有的 1,861 个亮字及 3,996 个暗底像素的线性亮度中位数。固定同句歌词对照为 **6.436:1 → 6.436:1**。独立 Chrome 的一组 1080p 导出绘制对照在顶屏有微小差异，正式 XML 同时刻导出对照的顶屏差异为零。[测量报告](round9/frames/report.md) · [原始读数](round9/frames/measurements.json)

**画幅和导出。** 核对了 1123×778、1440×778、1440×900、1707×1067、2560×1600、3441×1440；1080p 和 4K 各从正式包实际导出了 90 帧、3 秒的 AVC/AAC 视频。MEGURI 2:00 在 1080p 的播放、向前定位、回拖、编码前画布四种路径间 RGBA 完全相同。播放路径使用实际媒体推进，并在一个正常绘制回调读取固定的 120.000 秒。4K 实时窗口沿用原来的 1080p 内部画布上限，导出独立以 3840×2160 渲染。[1080p 预编码帧](round9/native/after1080-meguri-export/pre-encode.png) · [4K 预编码帧](round9/native/after4k-meguri-export/pre-encode.png) · [实机和缓存记录](round9/native/REPORT.md)

**取舍与边界。** 斜边、软硬程度、暖色浓度由本轮按草图定值；天空方向固定。收音机的提手和折叠天线投影是平面近似，两道细影在小画幅上会靠得很近。电平表沿用 .35 的单位与行数映射；安静段若出现真实鼓事件，仍可短时抬升。本轮的验收数据来自已有歌曲副本，未重新分析曲库。

**帧耗时。** 在同一台 AMD Radeon 890M、ANGLE D3D11、1440×926 实时画布上，两版在同一段 MEGURI 各采样 360 帧。相邻成功轮中，单帧 CPU 绘制中位数从 **2.40 降至 2.30 ms**，P95 从 **3.80 降至 3.40 ms**，渲染主线程任务时间从每次绘制 **3.90 降至 3.58 ms**。此次采样未见绘制变慢。交替顺序为 .35、.36、.36、.35；前两轮在离屏启动后、打开歌曲前超时，均无帧样本，统计取后两轮。数字反映 CPU 绘制，不能外推到其他显卡的 GPU 时间。重复定位到 MEGURI 的 9:28.5 与 5:24 时，稳定段分别连续 16、11 帧复用了同一张台面光影贴图。[原始采样汇总](round9/native/summary.json) · [实机记录](round9/native/REPORT.md)

## 文件与边界

| 文件 | 修改 |
|---|---|
| `source/scoreview/score-terrain.js` | `drawClearSkySun` 固定光晕。`directCabinSun`、`sillSunPatch`、`radioCastMask`、`drawSillSun` 计算并缓存直射贴图。`paintCarriageLighting` 替换旧的固定暖光。`paintRadio`、`radioSunFaces`、`drawVfdDeck` 将机壳材质与直射分开。`draw` 与 `carriage` 传递同一强度。`vfdStandby` 去除正弦乘数。 |
| `source/scoreview/tests/terrain-cabin-sun.test.cjs` | 校验云量、天气、窗台几何、固定阳光方向、投影、缓存、回拖和八种画幅。 |
| `source/scoreview/tests/terrain-vfd-meter.test.cjs` | 校验静态电平、真实鼓点及消退、门槛、镲片和歌词优先。 |

开工 HEAD 为 `0b774021f68ec26a3ad286803633246590021271`。工作区当时已有 `work/terrain-20261119/SETTING.md` 修改及未跟踪工作目录，按实际状态记录了 4,400 个基线指纹。包内产品逻辑差异只有 `scoreview/score-terrain.js`；新目录里的 XML/XLD EXE 版本资源、包元数据及启动配置按发行版编号更新。XLD 和共享分析源码均保持原样。日常入口仍指向 terrain.35，原包清单和启动指针通过哈希校验。实机用私有管道、离屏静音、临时档案与分析副本，避开用户现有窗口和 8777。没有下载、推送或提交。[开工指纹](round9/baseline-sha256.json) · [源码差异](round9/changed-files.json) · [打包回执](round9/suites/package-release.json) · [交付核验](round9/delivery-check.json)

## 三套 npm test 原始尾部

scoreview、XML 的完整命令退出码都是 0。scoreview 为 638 通过、1 个既有用例跳过。XLD 原命令退出码 1，Windows 禁止创建测试所需的 NTFS 目录联接。首次失败后逐条执行尾段 81 项，78 项通过；文件硬链接测试 `midi-export.cjs` 在系统默认临时目录原样复验通过。仍未能越过目录联接夹具、执行后续安全断言的两项为 `midi-delete.cjs` 和 `storage.cjs`。保留了原测试与错误。[尾段复验](round9/suites/xld-recovery.json) · [权限探针](round9/suites/xld-link-probe.json)

[scoreview 完整日志](round9/suites/scoreview-test-final.log)

```text
ℹ tests 639
ℹ suites 0
ℹ pass 638
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 136558.4652
```

[XML 完整日志](round9/suites/xml-test.log)

```text
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 150.3379
```

[XLD 完整日志](round9/suites/xld-test.log)

```text
Result deletion PASS: name closure keeps annotations unreachable, staging survives, Recycle Bin only, silent no-op and partial failure both reported, removed engines' leftovers deletable, traversal and non-file targets refused
result engines: ok (4 registered, 0 retired, 7 removed and only sweepable)
result sweep: ok (fragments discriminate where coverage and segment count do not; unreadable and failed results stay visible; unlisted directories warn)
source hygiene: ok (256 files, no stray control characters)
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\t36-idzCpP\tmp\xld-midi-delete-bQy2Ea\outside' -> 'C:\Users\12452\AppData\Local\Temp\t36-idzCpP\tmp\xld-midi-delete-bQy2Ea\album\track\midi\strings\4b5c7f7c-6329-494c-9743-d345aece351f'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t36-idzCpP\\tmp\\xld-midi-delete-bQy2Ea\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t36-idzCpP\\tmp\\xld-midi-delete-bQy2Ea\\album\\track\\midi\\strings\\4b5c7f7c-6329-494c-9743-d345aece351f'
}
```

---

# 车窗地貌 · 情绪曲线调试台、谱面设置和 XLD 旧谱升级 · terrain.35

2026-11-26。**XML 和 XLD 均已从新试版目录实际启动。** 播放时按 M 可查看情绪曲线与天气；车窗地貌的设置首层收为四项。XLD 清单现在预告实际工作，能独立补曲线，也能给历史 MuScriptor 谱只补后处理。在六首歌的 bass、piano、guitar 共 18 组对照中，CPU 升级与真实 GPU 重转的完整音符和 MIDI 字节均相同。XML、scoreview 两套 npm test 返回 0。XLD 套件有两项目录联接安全测试受当前 Windows 权限限制，未三套全绿。

[打开 XML](../../releases/0.5.0-dev.terrain.35/XML.exe) · [打开 XLD](../../releases/0.5.0-dev.terrain.35/XLD.exe) · [浏览 18 张手机图](round8/preview.html) · [图片原件](phone-8/)

本机可将以下完整路径粘贴到资源管理器地址栏或 Win+R。

`D:\Projects\Xin-Music-Lab-Fusion\releases\0.5.0-dev.terrain.35`

`D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\round8\preview.html`

## XML 情绪曲线调试台

在播放谱面时按 **M**，或在「谱面设置 → 调试」打开「情绪曲线调试台」。M 不抢输入框、组合键或其他快捷键。开关会记住。点图或拖动定位时，播放中的歌继续播放，已暂停的歌保持暂停。读数跟随播放器用于绘制谱面的时钟与对齐补偿，点击图表时反向处理该补偿。

| 读数或图 | 实际来源与读法 |
|---|---|
| 慢线、快线及播放头 | 由当前曲目的 `mood-curve.json` 交给 `XinMoodCurve.at`，定位、暂停和拖动都用同一时刻。整曲图下方按谱面的 `model.sections` 标段名，短段保留位置和悬停文字，播放头所在段另列全名。放大图显示前后各 30 秒，首尾在实际曲长截断。 |
| 降水档 | 按地貌引擎公开的慢线分档。≤0.26 无降水，>0.26 且 <0.52 小，0.52 至 <0.70 中，0.70 至 <0.90 大，≥0.90 暴。图上 0.92 是情绪驱动闪电的门槛；它不能单独决定是否落雷。 |
| 雨／雪／沙、云、潮湿和闪电 | 同一地貌实例的 `XinTerrainWeather.sample`，使用渲染器同一时间窗、选中的天气及驱动。降水强度读 `intensity`，引擎提供时读 `cloudOpacity`，无此字段显示「无此读数」。潮湿／远雨读 `humidity`、`farRain`。前后闪电取真实 `flashes` 的事件时刻；关闭或没有事件分别显示。 |
| 原始分量 | 直接读曲线文件内 `components.lufs`（LUFS）、`band28Dbfs`（2–8 kHz，dBFS）、`logFlatness`（log₁₀，无量纲）。相邻有效采样之间线性插值，静音门造成的缺值留白。 |
| 新旧雨量 | 对同一个渲染时间窗分别取 `terrainWeatherDriver=mood/original` 的引擎 `rainAt(t)`。换为雪、沙或晴天时，对照图仍表示同曲的两条**雨量**，当下实际天气看读数栏。 |

**布局及边界。** 宽于 1000 CSS 像素时画面等比缩小，和右侧抽屉留 6 像素间距。≤1000 像素时改为右侧浮层。其他谱面只留曲线、段名、放大窗和三个原始分量。没有曲线时只显示去 XLD 计算的提示。关闭后解除计时器及观察器。沉浸、隐藏界面和视频导出时收起，返回播放可恢复原先状态。

| 实机固定帧 | 所在段 | 慢线 / 快线 | 档位 | 当前雨量 / 原法雨量 | 上次 / 下次闪电 |
|---|---|---|---|---|---|
| MEGURI 5:24 | 副歌 3 | 0.959 / 0.959 | 暴雨 | 0.991 / 0.944 | 5:21.96 / 5:45.36 |
| in Silence / in Siren 3:25 | 桥段 | 0.466 / 0.472 | 小雨 | 0.190 / 0.254 | 无 / 4:20.31 |

**画面与耗时。** 两首在上述时刻各自与 terrain.34 的 1440 × 1000 整窗 RGBA 差均为 0 像素，打开再关闭也还原。实导 1080p MP4，两版同一时刻的编码前画布差 0 像素，导出文档含 0 个调试台节点。另实测无曲线、无 MIDI 有曲线、窄窗、其他样式、六图定位及拖动、暂停和沉浸。

RTX 5070 Ti Laptop，暂停 XLD 模型队列，串行测试，每组 360 帧。谱面 paint 的中位 / P95，terrain.34 关闭为 **2.10 / 2.80 ms**，terrain.35 关闭为 **2.20 / 2.90 ms**，打开为 **2.30 / 3.40 ms**。关闭态观测到 +0.10 ms；本次测量不能证明耗时绝对相等。用相同画布尺寸比较开关，打开后渲染进程平均多 **0.48 ms/帧**，其中调试台刷新自身折合 **0.087 ms/帧**。这些是主线程测量。[实机数据、导出和逐帧口径](round8/xml-qa/REPORT.md)

## 谱面设置

车窗地貌的第一层从 23 项缩到 4 项。选其他样式时第一层有 3 项。首次打开各组均收起，再次打开或重启会恢复上次展开的一组；可以把它再点一次，记住全部收起。六个组使用原生按钮，支持 Tab、Enter 和空格。每个标题通过 `aria-controls` 指向内容，`aria-expanded` 与内容的 `hidden` 同步。

| 原序号 | 设置 | 现在的位置和出现条件 |
|---|---|---|
| 1 | 为当前曲目导入 MIDI | 导入与字幕。没有选曲时沿用禁用态。导入后的声部分配、音符偏移、MIDI 拍号与小节、应用和恢复仍在同一入口。 |
| 2 | 谱面样式 | 第一层。10 种样式仍在同一个下拉框。 |
| 3 | 指针落下 | 回波雷达的选项。 |
| 4 | 回波淡尽 | 回波雷达的选项。 |
| 5 | 歌词提前 | 回波雷达的选项。 |
| 6 | 天气 | 第一层，仅车窗地貌。 |
| 7 | 天气强弱 | 调试，仅车窗地貌，包括晴天。可切按情绪曲线／原来的办法。 |
| 8 | 玻璃水珠 | 车窗地貌的选项，仅阴到雨。 |
| 9 | 远云闪电 | 车窗地貌的选项，仅阴到雨。 |
| 10 | 路边的东西 | 车窗地貌的选项；四种天气均可设置。 |
| 11 | 段落对照 | 谱面阅读，仅星空谱面和压纹纸。开关和 A/B 选择都服从引擎既有的支持规则。 |
| 12 | 专辑侧栏 | 谱面阅读。10 种样式均实测开启后显示侧栏、关闭后退出侧栏布局。 |
| 13 | 读谱外观 | 谱面阅读。仍选原版／清晰／细读；三个值和原默认值不变。 |
| 14 | 分段小节（试用） | 谱面阅读。英文界面显示 Local meter (trial)。 |
| 15 | 合并同类乐器声部 | 谱面阅读。 |
| 16 | 简化重复与细碎音符 | 谱面阅读。 |
| 17 | 显示歌词 | 第一层。保留 LRCLIB 与同名 .lrc 的来源说明。 |
| 18 | 按乐器画音符 | 音符与光效。 |
| 19 | 音符光效 | 音符与光效。 |
| 20 | 光效跟随起伏 | 音符与光效。 |
| 21 | 星空谱面子页 | 星空谱面的选项／原样的选项 → 星空谱面。保留“击拨与鼓点的余光”和“流星方向”的旧子页及各自的自定义滑块。 |
| 22 | 打开歌曲时自动准备谱面 | 准备与对齐。 |
| 23 | 按录音强弱显示 | 准备与对齐。状态、生成力度副本、取消仍跟随原开关。 |
| 24 | 谱面对齐 | 准备与对齐。保留旧的毫秒值、默认 70 ms、每次调整 10 ms。 |
| 25 | 导出视频 | 第一层。保留码率、分辨率、自定义值、进度、取消与打开目录。 |
| 26 | 手写听歌字幕 | 导入与字幕。保留选句、起止时间、取播放时间、文字、保存和删除。 |
| 新增 | 情绪曲线调试台 | 调试，快捷键 M。每种谱面样式均可开启。 |

第 13 项采用“读谱外观”／“Reading appearance”，另外两个候选是“读谱详略”和“谱面阅读模式”。第一层继续用“谱面样式”指选择画法的控件。这套分组沿用草图对使用频率的判断，用户可以按上表逐项调位。

### 实测与边界

- 私有 Chromium 档案加载了 .34 与候选设置页的副本。对比 41 个原有 input、select、textarea 的默认值，用相同的控件操作写入 18 个原有偏好键，键名和值逐项相同。将上述数据放入另一个新页面后，41 项回读一致。开组、单开、全关、设置页退出再进、跨文档恢复和中英文摘要通过。此测试没有生成视频、导入 MIDI 或写入歌词文件。
- 10 种样式都检查了主天气、天气强弱、专用组、段落对照和专辑侧栏的显示条件。只有雷达、地貌、星空及原样有独立选项组。段落对照与原控制器共享 `supports(style)`，仅星空和压纹纸显示。
- “原样”使用与星空相同的流星绘制路径。以 MEGURI 的真实模型在 800×450 画布分别切换流星偏角 0° → 12° → 0°，1:00、3:25、5:24 分别有 22、56、246 个像素变化，三次还原都逐像素相同。因此“原样”保留原星空设置入口。
- .34 的 in Silence 在 3:25、3:50 均实测“合并同类乐器声部”改变雷达和声雾画面，“简化重复与细碎音符”改变声雾画面，切回后像素复原。其余采样没有视觉变化的组合仍保留。实机窗口证据见 `xml-qa/34-silence-effects/export.json`。
- 实机键盘事件已验证 Enter 展开、空格收起；浏览器无障碍树的 expanded 状态与 `aria-expanded`、组体的 `hidden` 同步。完整重载后恢复原有展开组。
- 读谱外观、分段小节、合并、简化、形状、光效、录音强弱和手写字幕保留在所有样式的相应组。几帧没有像素差异不能证明整首歌或所有输入都无效。此独立测试没有验证所有样式 × 音符类型 × 选项的最终画面。
- 单开使用一个新键 `xin-score-settings-open-group-v1`；只保存组名或空字符串。旧偏好仍由原控件自行读取与写入。复验运行 `node work/terrain-cabin-20261125/round8/settings-check.cjs`，逐项证据见同目录 `settings-check.json`。

### S1 文件及职责

| 文件 | 改动 |
|---|---|
| source/fusion-runtime-baseline/index.html | 重排原有控件、保留 ID，增加六个组按钮及调试台开关，加载分组脚本。 |
| source/fusion-runtime-baseline/score-settings-groups.js | `refresh` 根据样式和语言更新设置，`syncGroups` 同步单开与可访问状态，`summarize` 从当前控件和引擎对齐值生成摘要。 |
| source/fusion-runtime-baseline/score-compare-controls.js | 将原有 `supports` 提升为模块共享判断，供段落对照开关与实际控制器共同使用。 |
| source/fusion-runtime-baseline/shell.css | 设置组、摘要、展开状态、键盘焦点和窄列布局。 |
| source/fusion-runtime-baseline/i18n/catalogs.js | 补齐两种语言的组名、摘要、分段小节及读谱外观名称。 |
| source/fusion-runtime-baseline/tests/score-shapes.cjs、tests/palette-b5.cjs、tests/lyrics-b6.cjs | 对应三项新位置调整旧断言；保留对控件行为和数据的断言。 |
| work/terrain-cabin-20261125/round8/settings-check.cjs、settings-check.json | 独立验证及可复核的结果。 |

## XLD 从哪里操作

在「结果 → 概览 → 一键分析」选择歌曲，就能看到按本次模型、声部来源和已有文件计算的清单。点情绪曲线行的「只算情绪曲线」可单独运行。卡片下方展开「只补算情绪曲线」，选择当前专辑，或选择整个已分析曲库。当前专辑按专辑 ID 包含将要首次分析的歌；整库枚举已有 `track.json` 的曲目，两种入口都只调用原有情绪曲线引擎。已有且输入仍匹配的曲线跳过，音源缺失、失败、取消单列。原时间线按钮也保留。

| 列表状态 | 运行前用来判定的证据 |
|---|---|
| 已有 | 执行器采用的结果仍可读，当前所选的模型身份、输入分轨或分析源匹配。预览会考虑前一步选择的已有分轨，并对照后续实际会使用的输入。 |
| 待运行 | 当前步骤所需产物尚不存在。 |
| 仅需升级 | 仅限有登记的 MuScriptor 旧身份，当前分轨输入一致，旧结果保留恢复原始乐器及时间所需的信息。升级仍算一步实际工作。 |
| 需重转／需更新 | 有旧结果但模型或输入不同，或已有产物不足以安全补做。保留旧版本，列表给出原因；融合则按实际采用的声部版本和输入指纹更新。 |

遇到尚需转谱的声部，产出音符数只有在推理后才知道。融合行会提示条件，顶部合计标为预计，不把这个数写成已经完成。

单曲和整套一键有时会显示不同结论：新曲单算可用当前原混音生成有效曲线。若下一次整套一键先生成分轨，曲线输入源随之改变，整套清单会预告届时需要重算。

**原生 XLD 验收。** 首次启动仍为「效率」，下列三首为便于对照统一切到「质量」预设。Void（新曲）预计 11 跑 / 0 跳。Baibaba Bimba 预计 0 跑 / 11 跳，实点同样为 0 / 11。Plein Soleil 预计 4 步工作、8 步跳过，实跑是 3 路 CPU 升级加 1 次融合；旧 MIDI、notes 和原版本记录的摘要保持。单曲按钮只启动情绪曲线；隔离专辑实点补 1 首、跳 1 首，随后整库 3 首全跳过。额外夹具覆盖同名歌曲跨专辑、缺音源、取消和并发占用。[逐行结果及原生窗口记录](round8/xld-qa/REPORT.md)

### 哪些旧谱可以省掉推理

只对白名单内六对已发布身份启用：bass、piano、guitar 的 MuScriptor Medium/Large。输入分轨 ID、路径、大小、时戳、时长，以及模型、检查点、选项和旧产物摘要都需核对。旧 MIDI 提供原生乐器边界，旧 notes.json 保留每个音符的原始浮点时值。逐轨验证音高、力度和 MIDI tick 后，调用与现行转谱相同的并轨、50 ms 跨乐器去重、分轨力度与写出流程。other 在加入 -onetrack1 的提交中首次出现，未发现可登记的旧身份。缺文件、摘要不符、丢失乐器证据或输入已改变的旧谱，在相应引擎可用时按原规则重转；引擎缺失时清单会说明。手动强制重新转谱仍会启动模型。

| 副本曲目 | 模型 | bass 音符 | piano 音符 | guitar 音符 |
|---|---|---:|---:|---:|
| Plein Soleil | Large | 276 | 483 | 1583 |
| in Silence / in Siren | Large | 179 | 558 | 935 |
| Time Tonight | Large | 204 | 801 | 745 |
| グッドバイ Goodbye　Album Version feat. Toki Asako 土岐麻子 | Medium | 935 | 823 | 2850 |
| MEGURI | Large | 1085 | 122 | 3141 |
| you | Large | 909 | 1573 | 939 |

表内数量为两种方法相同的输出音符数。比较对每个音符保留重复计数，使用未取整的起止时间、音高、力度，另外比对 MIDI 的每个字节。这 18 个旧声部合计 19,565 个音符，两种方法处理后均为 18,141 个。18 路独立 CLI 的 CPU 升级用时合计 **21.8 秒**，GPU 真重转合计 **35 分 16.6 秒**。该数包括启动进程，不能直接外推到整个曲库。以上六首覆盖六种模型身份。Space Oddity 的三路仅作额外 CPU 试验，未计入 18 组。Plein Soleil 贝斯还在 CUDA 被关闭且权重目录不存在时升级成功，未导入推理模型模块。[逐曲验收报告](round8/xld-qa/upgrade/REPORT.md) · [逐声部对照数据](round8/xld-qa/upgrade/results.json) · [离线 CPU 审计](round8/xld-qa/upgrade/without-model/audit.json)

**用户手改的谱。** 与原有规则一致，已有模型结果命中时，当前手改版继续激活。真正生成新的模型版或升级版时，默认切到新版本。手改的 MIDI、notes 和修订记录仍独立保留，可在版本列表切回；修订音符不会自动套用到新模型谱。临时副本中对 Plein Soleil 贝斯做了实际力度编辑，升级前后其三个摘要均相同，手改版和升级版可反复切换。旧版对照用真实 Basic Pitch 经过共享的版本写入与激活路径，新版则用真实 MuScriptor 旧贝斯升级。[旧版执行证据](round8/manual-upgrade/terrain-34.json) · [新版升级证据](round8/manual-upgrade/terrain-35.json)

## 源码与打包核对

下表列修改职责。逐个相对路径和修改前后的 SHA-256 见[源文件差异](round8/changed-files.json)。新文件的基线值为空。独立打包、核验清单及测试夹具都放在 `round8`。

| 范围 | 改动的文件与函数 |
|---|---|
| XML 调试台 | `score-mood-debug.js` 的 `attach/build/render/sync/rawAt/weatherComparison` 负责全曲及放大图、采样、定位和生命周期。`score-mood-debug.css` 管抽屉与等比缩放。`score-scene.js`、`fusion.js` 对接当前曲目、显示时钟、拖动及沉浸/导出状态。`desktop/main.cjs` 的谱面载入在没有 MIDI 时仍传递已有曲线。`index.html`、`i18n/catalogs.js` 挂接控件与中英文字。 |
| 地貌引擎 | `score-terrain.js` 导出同一画面使用的 `weatherWindow`；`score-terrain-weather.js` 导出 `moodThresholds/moodTier`，供调试台读取既有阈值。 |
| XLD 清单 | `core/oneclick-cache.cjs::preview` 只读取得本次分轨、精分、声部、融合和情绪输入；`core/derived-assets.cjs` 的 `midiCacheHit/keepsManualRevision` 同时供执行和清单使用。`core/refinement.cjs`、`midi-merge.cjs`、`mood-curve.cjs` 允许在同一判据上传入预计选用的输入。`core/analysis-service.cjs` 暴露查询并执行任务。`oneclick-plan.js`、`oneclick-controls.js`、`derived-controls.js`、`app.js`、`index.html`、`workspace.css`、`i18n/runtime-messages.js` 负责状态、合计、中文/英文、单曲与专辑刷新。 |
| XLD 限定旧谱升级 | `core/onetrack-upgrade.cjs::createProbe` 注册六对完整旧/新模型身份，预览和执行复用同一组检查。`analysis-midi/onetrack_upgrade.py::restore` 校验原始产物并恢复逐乐器、未量化音符。`analysis-midi/runner.py::upgrade_onetrack/finish_midi` 走同一归并、力度、MIDI/JSON 写出和摘要生成，`analysis-service.cjs` 沿用原有锁、版本激活和旧版保留。 |
| XLD 情绪独立入口 | `core/mood-backfill.cjs::analyzedTracks/createMoodBackfill` 分别负责整库枚举和批量运行。`mood-backfill-controls.js::create` 负责启动/取消与进度。`desktop/main.cjs/preload.cjs` 连接 IPC、专辑索引和关闭时的取消；`app.js` 与概览/时间线共享现有运行状态。 |
| 测试和版本 | 各包的 `package.json` 注册测试。XML 设置控件断言、调试台读数与定位、XLD 缓存和旧谱升级、手改保留、单曲/专辑/整库补曲线等回归的文件名见上方差异清单。 |

<details><summary>全部 44 个源码和测试文件</summary>

**source/fusion-runtime-baseline**　`desktop/main.cjs`、`fusion.js`、`i18n/catalogs.js`、`index.html`、`package.json`、`score-compare-controls.js`、`score-mood-debug.css`、`score-mood-debug.js`、`score-scene.js`、`score-settings-groups.js`、`shell.css`、`tests/lyrics-b6.cjs`、`tests/palette-b5.cjs`、`tests/score-mood-debug.cjs`、`tests/score-shapes.cjs`

**source/scoreview**　`score-terrain-weather.js`、`score-terrain.js`

**source/xld-runtime-baseline**　`analysis-midi/onetrack_upgrade.py`、`analysis-midi/runner.py`、`app.js`、`core/analysis-service.cjs`、`core/derived-assets.cjs`、`core/midi-merge.cjs`、`core/mood-backfill.cjs`、`core/mood-curve.cjs`、`core/oneclick-cache.cjs`、`core/onetrack-upgrade.cjs`、`core/refinement.cjs`、`derived-controls.js`、`desktop/main.cjs`、`desktop/preload.cjs`、`i18n/runtime-messages.js`、`index.html`、`mood-backfill-controls.js`、`oneclick-controls.js`、`oneclick-plan.js`、`package.json`、`tests/midi-revision-record.cjs`、`tests/mood-backfill-ui.cjs`、`tests/mood-backfill.cjs`、`tests/muscriptor-onetrack-upgrade.py`、`tests/oneclick-cache.cjs`、`tests/oneclick-plan.cjs`、`workspace.css`

</details>

从 terrain.34 的发行镜像开始，开工基线记录 4391 个文件，父包清单 SHA-256 为 `ede37e9e68480e08b4ad8e007700756201d1834eee63c3265caa5ba631160bf4`。启动前逐项核对新包 1446 个文件，清单 SHA-256 为 `5df3230dcb6b9fd7118ba49648df86f02d92cfae1c02b68236166667d940120a`。原入口与已有包保留；新程序使用私有管道、离屏静音、独立档案和歌曲副本验收。未操作用户正在运行的 terrain.34 XLD 或其 8777 端口。无下载、推送、提交或真实分析库回写。[基线](round8/baseline-sha256.json) · [打包核验](round8/package-verification.json) · [交付核验](round8/delivery-check.json)

## 三套 npm test 的原始日志尾部

XML 和 scoreview 返回 0；scoreview 原套件 634 项中 633 通过、1 项跳过。XLD 返回 1。原测试需要创建真实 NTFS 目录联接，Node 返回 EPERM，PowerShell 在独立临时夹具中也返回 Win32 错误 5。中断后将余下 81 条原命令逐条执行：78 条通过；MIDI 导出在支持文件硬链接的默认临时目录复验通过。剩下的 midi-delete 与 storage 两项未能执行联接后的安全断言。保留原断言和失败日志。[环境复验](round8/suites/xld-link-environment.md) · [XLD 尾段逐条结果](round8/suites/xld-recovery.json)

**scoreview**　[完整日志](round8/suites/scoreview-test.log)

```text
ℹ tests 634
ℹ suites 0
ℹ pass 633
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 29640.2749
```

**xml**　[完整日志](round8/suites/xml-test.log)

```text
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 166.2178
```

**xld**　[完整日志](round8/suites/xld-test.log)

```text
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\t35-gSKgtW\tmp\xld-midi-delete-Cwofnk\outside' -> 'C:\Users\12452\AppData\Local\Temp\t35-gSKgtW\tmp\xld-midi-delete-Cwofnk\album\track\midi\strings\a2727a10-965f-4c6b-b5b0-42691900b625'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t35-gSKgtW\\tmp\\xld-midi-delete-Cwofnk\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\t35-gSKgtW\\tmp\\xld-midi-delete-Cwofnk\\album\\track\\midi\\strings\\a2727a10-965f-4c6b-b5b0-42691900b625'
}
```

---

# 车窗地貌 · 情绪曲线驱动天气试版 · terrain.34

2026-11-26。新试版把 terrain.33 的车厢、分栏顶屏与 mood.1 的 XLD 情绪曲线装在同一个包里。每首仍用选中的天气，默认由全曲库同一条绝对尺子决定强弱。《in Silence / in Siren》在 2:55、3:25、3:50 的实际雨强是 **0.662 → 0.190 → 0.908**。3:25 的雨帘明显淡下去，地面按此前的降水逐渐变干。肖邦降 E 大调夜曲全曲只有 **10.1 秒小雨**，其余 260.0 秒只有阴天，全曲没有闪电。

[直接运行 XML.exe](../../releases/0.5.0-dev.terrain.34/XML.exe) · [XLD.exe](../../releases/0.5.0-dev.terrain.34/XLD.exe) · [3:25 同帧对照](phone-7/same-frame-rain-silence-205.jpg) · [整曲强弱与落雷](phone-7/intensity-silence.png) · [手机图目录](phone-7/) · [80 秒新旧实录](round7/media/)

## 同一把尺子怎么画天气

| 8 秒慢线 | 雨天画面 | 其他天气 |
| --- | --- | --- |
| [0, 0.26) | 仅阴云，无新降水。此前已经沾湿的表面逐渐干燥 | 低位雪、沙维持既有底色与薄雾 |
| [0.26, 0.52) | 小雨，从零连续起量，玻璃上逐渐出现零散雨滴 | 飘雪或扬沙逐渐可见 |
| [0.52, 0.70) | 中雨；雨帘随位置和强度显现 | 雪幕、沙粒增密 |
| [0.70, 0.90) | 大雨，雨帘增厚，能见度下降 | 大雪或浓沙，仍保留山体轮廓 |
| [0.90, 1.00] | 暴雨，接近 1 时全开；达到 0.92 才可能闪电 | 暴风雪或沙暴，各自沿用原遮挡上限 |
| 晴天，覆盖全尺 | 晴天不降水、不闪电。原有云带的不透明度从 35% 连续增至 100% | 太阳位置与车厢光照沿用 terrain.33 |

0.26 为降水连续起点，精确等于 0.26 时雨量仍为零。表中各档是读图用的标签。把慢线从 [0.26, 1] 映射到 [0, 1]，两端夹紧后按 `u²(3−2u)` 求雨雪沙基础量。0、0.2、0.4、0.6、0.8、1 六阶在快慢相等时，基础量分别为 **0、0、0.094、0.439、0.820、1**。云压随慢线变化，雨和雪的 0、0.2 两张实渲帧相同，两档都还没有降水。湿地、积雪、积沙保留原有积累和消退时间。雨帘与粒子用 2 秒快线作小幅调制，风随这部分偏差起伏。离最近的档界越近，快线能加减的幅度就越小，到边界归零。玻璃湿度与地面沉积仍由慢线决定。

闪电仅发生在雨天。沿歌曲时间每 6 秒用序号哈希确定一个候选时刻；整段 0.56 秒双脉冲都需满足慢线 ≥ 0.92。原有 22 秒冷却、每 65 秒约一次且整曲最多 5 次的数量上限继续生效。新模式完全去掉鼓击 `kindBoost`、四类入场事件、按曲归一的响度、分轨活动及和弦张力。原有谷地雨帘的摆放仍依地形找位置。山形、路边鼓点物件、车厢屏幕仍读各自原先的数据。

[晴天六阶](phone-7/ladder-clear.jpg) · [雨天六阶](phone-7/ladder-rain.jpg) · [雪天六阶](phone-7/ladder-snow.jpg) · [沙尘六阶](phone-7/ladder-sandstorm.jpg)

## 四段实听锚点

| 曲目与时段 | 慢线或画面实测 |
| --- | --- |
| MEGURI，5:00–5:22 / 5:28–6:00 | 慢线中位 0.835 / 0.957。前段末尾已经短时越过雷线，第一次闪电是 5:21.96。后段失真墙形成持续暴雨。 |
| in Silence / in Siren，2:40–3:10 / 3:10–3:40 / 3:40–4:00 | 三段慢线中位 0.695 / 0.466 / 0.859。3:25 另经试版自己的窗口证实，慢线 0.46616、雨强 0.18976。 |
| 肖邦降 E 大调夜曲 | 慢线峰值 0.349，96.26% 时间无降水。旧引擎排了两次闪电，新引擎零次。同帧截图按三秒 LUFS 取出最响与最轻处。 |
| 七里香 | 已听评的主歌/副歌区间中位 0.570 / 0.726。同用全库尺子，流行人声可能显得偏强。 |

## 全部 39 首

「无降水」统计此刻有没有新雨，曲中短暂转阴时玻璃或地面仍可能有水。全曲都达不到降雨的是 **FLAG、Void**。每首所用曲线的 SHA-256、各档秒数和未取整的闪电时间在 [逐曲 JSON](round7/stats/weather-39.json)。[五首新旧强度的原始记录](round7/stats/weather-comparisons.json)


天气档位按同一条全库绝对慢线划分。低于 0.26 无降水，0.26 起小雨，0.52 起中雨，0.70 起大雨，0.90 起暴雨。每首按曲线完整时长统计，在相邻半秒记录之间线性插值，并按阈值交点分配秒数。

慢线达到 0.92 的时长列在「闪电门限」；「实际闪电」读取引擎的雨景计划，并在起闪后 30 毫秒验证脉冲。连续闪电间隔至少 22 秒，每首最多 5 次。

全曲没有暴雨的有 20 首。全曲至少九成时间是暴雨的有 0 首。暴雨占比最高的是 Same Trupy（45.38%）。

实际闪电共 49 次，分布于 18 首。

| 曲目 | 无降水 | 小雨 | 中雨 | 大雨 | 暴雨 | 闪电门限 | 实际闪电 |
|---|---:|---:|---:|---:|---:|---:|---|
| in Silence / in Siren | 37.75% | 15.28% | 15.46% | 16.57% | 14.93% | 9.09% | 4:20.3、4:47.6 |
| Girl | 9.76% | 27.54% | 25.10% | 24.42% | 13.19% | 7.09% | 6:10.9、6:52.1 |
| Angel Ache | 31.95% | 30.57% | 37.48% | 0.00% | 0.00% | 0.00% | 0 次 |
| IN THE NAME OF LOVE | 12.49% | 6.81% | 10.89% | 46.60% | 23.20% | 19.72% | 2:44.6、3:09.7、5:26.3、5:58.4、6:29.4 |
| 周杰伦 - 七里香 | 6.72% | 11.90% | 30.54% | 50.85% | 0.00% | 0.00% | 0 次 |
| Xtal | 8.24% | 84.34% | 7.42% | 0.00% | 0.00% | 0.00% | 0 次 |
| MEGURI | 8.67% | 28.80% | 9.58% | 23.50% | 29.44% | 27.13% | 5:22、5:45.4、6:10.9、6:33.2、8:34.5 |
| The Big Spin | 8.24% | 19.17% | 38.05% | 34.54% | 0.00% | 0.00% | 0 次 |
| Scorpius Circus | 29.71% | 22.14% | 17.28% | 23.49% | 7.37% | 6.47% | 7:58.9、8:22.7 |
| birthday resistance / 誕生日抵抗日 | 16.54% | 18.72% | 34.87% | 16.37% | 13.50% | 9.38% | 4:05.1、4:28 |
| Time Tonight | 29.23% | 64.12% | 6.64% | 0.00% | 0.00% | 0.00% | 0 次 |
| you | 32.12% | 23.66% | 19.31% | 19.27% | 5.65% | 4.53% | 11:59.6、12:21.6 |
| Typewrite Lesson | 14.26% | 36.32% | 34.89% | 14.52% | 0.00% | 0.00% | 0 次 |
| Same Trupy | 22.13% | 3.61% | 4.18% | 24.70% | 45.38% | 37.45% | 8:09.9、8:34.5、8:58.3、10:23.5、10:53.7 |
| Les Enfants du Paradis | 1.61% | 2.71% | 9.44% | 60.62% | 25.62% | 16.04% | 3:44.2、5:35.6、5:58.4 |
| Mirrors | 1.05% | 4.59% | 37.94% | 54.71% | 1.72% | 0.00% | 0 次 |
| グッドバイ Goodbye　Album Version feat. Toki Asako 土岐麻子 | 27.58% | 18.24% | 15.25% | 33.67% | 5.25% | 1.28% | 6:14.2 |
| Besties | 3.18% | 14.84% | 44.48% | 37.50% | 0.00% | 0.00% | 0 次 |
| Radioactive Spell Wave | 27.74% | 25.22% | 16.19% | 23.30% | 7.55% | 7.02% | 8:58.3、9:21.5 |
| 100 years of choke / 百年の窒息 | 21.95% | 30.36% | 26.50% | 8.92% | 12.28% | 7.96% | 11:09.7、11:53.3、12:21.6、13:27.1 |
| Flowers of Romance | 27.19% | 17.80% | 15.36% | 25.31% | 14.34% | 12.91% | 10:45、11:09.7、11:35.8、11:59.6、12:21.6 |
| FLAG | 100.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0 次 |
| Plein Soleil | 25.97% | 34.38% | 3.26% | 29.95% | 6.45% | 5.75% | 6:04.1 |
| LAST BLINK | 17.97% | 67.94% | 14.09% | 0.00% | 0.00% | 0.00% | 0 次 |
| Baibaba Bimba (2022 Remaster) | 4.06% | 92.19% | 3.74% | 0.00% | 0.00% | 0.00% | 0 次 |
| Nocturnes, Op. 9: No. 2 in E-Flat Major | 96.26% | 3.74% | 0.00% | 0.00% | 0.00% | 0.00% | 0 次 |
| Void | 100.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0 次 |
| Space Oddity | 14.45% | 16.82% | 45.50% | 23.23% | 0.00% | 0.00% | 0 次 |
| LAST WALTZ | 19.46% | 7.92% | 35.81% | 36.82% | 0.00% | 0.00% | 0 次 |
| Everything That Is Difficult Will Come to an End | 29.46% | 31.38% | 39.16% | 0.00% | 0.00% | 0.00% | 0 次 |
| Eve (feat. Smany) | 27.14% | 38.17% | 21.86% | 12.83% | 0.00% | 0.00% | 0 次 |
| nemesis | 68.01% | 6.36% | 13.42% | 6.91% | 5.29% | 4.94% | 3:51 |
| Nancy Tries to Take the Night | 22.23% | 48.50% | 11.31% | 17.96% | 0.00% | 0.00% | 0 次 |
| Satan Veludo Children | 35.28% | 12.60% | 17.71% | 28.07% | 6.34% | 1.91% | 6:41.7 |
| Forever Howlong | 18.81% | 75.88% | 5.32% | 0.00% | 0.00% | 0.00% | 0 次 |
| Ceremony (12' Version with Gillian Gilbert) | 4.83% | 55.09% | 40.07% | 0.00% | 0.00% | 0.00% | 0 次 |
| Ego | 20.07% | 30.02% | 2.95% | 16.89% | 30.07% | 29.78% | 7:04.4、7:28.9、7:58.9、8:22.7、8:51.8 |
| Crystal Chrysalis | 57.10% | 33.96% | 4.96% | 3.98% | 0.00% | 0.00% | 0 次 |
| himitsu (feat. Smany) | 25.67% | 31.50% | 25.85% | 15.23% | 1.75% | 1.35% | 7:28.9 |
| **全库（按时长加权）** | 25.87% | 26.06% | 18.02% | 20.02% | 10.03% | 8.03% | 49 次 |

## XML、发行包与验收

XML 打开曲目时，从当前曲目分析目录读取 `mood-curve.json`，把记录随谱面交给播放与导出。只接受 schema 1、引擎 1、`mood-direct-1`、`mood-scale-1`，并调用共享模块的 `valid`、`at`。缺文件、未知版本、非法数据或慢线有空点时，整首回到旧引擎；快线局部缺点只取消该处的短时调制。喂入的 39 份正式记录都通过了检查。设置里的「天气强弱」可在「按情绪曲线」与「原来的办法」间切换，保存后供下次继续使用。手动选旧时不提示缺曲线。

在 XML 车厢左下角，缺曲线时提示「请在 XLD 计算情绪曲线。」；同时缺段落时合并为「请在 XLD 分析段落和情绪曲线。」。按歌曲和缺项各记一次，8 秒消失。沉浸播放及视频导出不画这行。使用副本、临时独立档案和私有调试管道，从发行目录里的 XML.exe 实际启动。在窗口中操作新旧开关，并在 3:25 实际画到新办法的小雨。去掉验收副本的曲线后看到了回退提示，同一秒的 1920 × 1080 画布 PNG 与 terrain.33 完全相同。[原包实启动记录](round7/native/34-mood-settings/export.json) · [缺曲线实机记录](round7/native/34-mood-missing/export.json)

以 terrain.33 为底合并，覆盖的 178 个 XLD / 共享运行时文件与 mood.1 逐一比对，再加入本轮 10 个生产文件。新包校验了 1438 个文件，manifest SHA-256 为 `ede37e9e68480e08b4ad8e007700756201d1834eee63c3265caa5ba631160bf4`。开工前已查发行目录和开发档案，两处 .34 均空闲；收工与 4389 个基线指纹比较，原有发布 manifest 和入口一致。[基线](round7/baseline-sha256.json) · [源码变化](round7/changed-files.json) · [双父版本与合包校验](round7/package/package-verification.json)

| 生产文件（相对于 source） | 修改部位 |
| --- | --- |
| scoreview/score-terrain-weather.js | `moodReader` 核对尺子；`buildMoodTimeline`、`sampleMood`、`gustLevel`、`moodLightning` 算天气；`sample` 选引擎；将旧地面采样抽成 `groundSampler`，`groundResponse` 接收可选阵风。 |
| scoreview/score-terrain.js | `draw` 传驱动选项，晴天只调既有云带透明度；`valleyRain` 接受整条线路的雨帘覆盖区。 |
| scoreview/score-view.js、scoreview/score-presentation.js | 默认选项、选项校验、`artFrame` 传递当前选择。 |
| scoreview/export/export-page.html、fusion-runtime-baseline/index.html | 导出页和播放页都载入同一个共享曲线读取器；设置页加上强弱开关。 |
| fusion-runtime-baseline/desktop/refresh-track.cjs、desktop/main.cjs | `readMoodCurve` 只读当前分析目录，`scoreModelFor` 的常规与导入 MIDI 路径都向界面报告曲线是否可用。 |
| fusion-runtime-baseline/score-scene.js、i18n/catalogs.js | 保存开关偏好，传递给现场视图和导出，`terrainNotice` 管理一次性提醒；中英文案。 |

新增或更新的测试在 `scoreview/tests/terrain-weather-mood.test.cjs` 以及 `fusion-runtime-baseline/tests/{refresh-track,score-export-wiring,score-terrain-settings}.cjs`。XLD 引擎、冻结公式及共享结果格式沿用 mood.1。本轮分档门限、闪电门限和候选间距、晴天云量范围是试版选择，尚待实际听评。39 首来自同一位听众校准的曲库，统计只能说明这批曲目的分布；既有玻璃、地面积累有余效，在快速转弱时仍可能看见留水。


## 同帧、短片与帧耗时

手机图共 25 张。四张阶梯在同一时刻使用常量曲线，其余新旧同帧图共 20 对，涵盖指定的四首雨天及晴、雪、沙各三个强弱位置。五首强弱图分别调用 terrain.33 和新引擎的实际雨强，标出各自计划的落雷。手机同帧图由 1440 × 900 原帧排版；两版统一使用同一首谱面、同一张封面和同一秒，七里香沿用无封面的实际输入。曲线来自指定的 round4 副本。对副本缺失的谱面文件，优先复用 work 下已冻结的真实模型，其余从原库只读复制到本轮工作目录后再使用。实机短片使用同一份补全的 MIDI / 谱层副本，两段的山形一致。[实帧与哈希](round7/figures/report.json) · [模型来源](round7/fixtures/provenance.json) · [开关](phone-7/24-xml-weather-setting.jpg) · [提醒](phone-7/25-xml-missing-mood-curve.jpg)

两段《in Silence / in Siren》均覆盖原曲 2:40–4:00，1920 × 1080、20 fps、1600 帧、画面 80 秒。旧片使用 .33，曲线片使用 .34；在各自临时工作副本中限定导出区间和帧率。两段解码后的立体声音频哈希相同，AAC 末尾有约 16 毫秒填充。[曲线片](round7/media/in-silence-0240-0400-mood-34-1080p.mp4) · [原法片](round7/media/in-silence-0240-0400-original-33-1080p.mp4) · [媒体核验](round7/native/clip-verification.json)

在正式包上逐通道比较 10 个 1440 × 900 时刻，覆盖三首歌、四种天气，包含 MEGURI 5:21.99 的闪电帧，以及读数升降段的播放、跨位置拖动返回和导出。新办法同曲同秒的稳态画面逐像素相同，缺曲线回退与 .33 相同。为获取可重复读回的像素，精确比对使用软件 2D 最终合成，天气仍用 GPU 着色。保留一个老画法的例外：肖邦 1:39，雨玻璃第一次冷绘与随后重复绘制相差 1809 像素，单通道最大差 2/255；两版本冷首帧互比、稳定帧互比均为零差。原包窗口另在 1920 × 1080 的 3:25 对照中取得相同 PNG 哈希。[同帧记录](round7/performance/pixels-packaged.json) · [冷首帧复测](round7/performance/pixels-packaged-profile-chopin-rain-99.json) · [计时及逐像素验收报告](round7/performance/REPORT.md)

RTX 5070 Ti Laptop，D3D11，同一时刻两版本交错绘制，每组预热 72 帧、采 320 帧；下表为成包反向复测，单位 ms，格式为中位数 / P95。配对差是逐帧作差后的中位数。**新旧都选原法时，九组配对耗时中位差均为 0.0 ms。选曲线时，MEGURI 5:40 画出的雪和雨更重，未达到所有场景都与 .33 等耗时的要求。** 强雪配对多 0.8 ms，1080p 强雨多 0.4 ms。分函数计时将雪天的增量定位到暴风雪绘制，雨天主要是空中与山谷雨帘。连续曲线采样本身在重雪组每千次用时为 0.20 ms，原引擎为 0.26 ms。

| 曲目、时刻、天气 | 画幅 | .33 原法 | .34 曲线 | 配对差 |
| --- | --- | ---: | ---: | ---: |
| MEGURI 5:24，雨 | 1440 × 900 | 3.4 / 5.5 | 3.5 / 5.4 | +0.1 |
| MEGURI 5:24，雨 | 1123 × 778 | 3.5 / 6.0 | 3.6 / 6.1 | +0.1 |
| MEGURI 5:40，雨 | 1920 × 1080 | 3.3 / 6.0 | 3.6 / 6.6 | +0.4 |
| MEGURI 5:40，雪 | 1440 × 900 | 3.3 / 4.9 | 4.2 / 6.3 | +0.8 |
| MEGURI 5:40，沙尘 | 1440 × 900 | 2.2 / 3.8 | 2.2 / 3.8 | 0.0 |
| MEGURI 5:40，晴 | 1440 × 900 | 1.2 / 1.9 | 1.2 / 2.0 | 0.0 |
| in Silence 2:55，雨 | 1440 × 900 | 3.2 / 5.1 | 2.7 / 4.6 | -0.4 |
| in Silence 3:25，雨 | 1440 × 900 | 2.0 / 3.9 | 2.1 / 3.7 | 0.0 |
| in Silence 3:50，雨 | 1440 × 900 | 3.4 / 5.1 | 3.4 / 5.5 | 0.0 |

[成包正反摆位中的反向轮](round7/performance/performance-packaged-reverse.json) · [正向轮](round7/performance/performance-source.json) · [两边都选原法](round7/performance/performance-packaged-original-control.json)

## 三套 npm test

XML 与 Scoreview 退出 0。Scoreview 632 项通过，1 项因历史测试素材缺失按原有条件跳过。XLD 的情绪曲线测试通过，但完整套件退出 1。Windows 拒绝测试夹具创建目录联接（`EPERM`）；换用短临时目录并逐项补跑后，`midi-delete.cjs`、`storage.cjs` 仍受限。因此本轮没有“三套全绿”的结论。[补跑记录](round7/suites/xld-recovery.json) · [短目录复核](round7/suites/xld-recheck.json)

[Scoreview 原日志](round7/suites/scoreview-test.log)

```text
ℹ tests 633
ℹ suites 0
ℹ pass 632
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 59555.995
```

[XML 原日志](round7/suites/xml-test.log)

```text
ℹ duration_ms 132.1459
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (defaults and migration, live switch, export snapshot, combined and once-per-song notices)
```

[XLD 原日志](round7/suites/xld-test.log)

```text
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{66d62bde-df9a-439b-ad81-c3f3ab44701d}\Temp\terrain34-suite-rkMnlf\tmp\xld-midi-delete-tRVutS\outside' -> 'C:\Users\12452\AppData\Local\Packages\openai.codex_2p2nqsd0c76g0\AC\#!sandbox.{66d62bde-df9a-439b-ad81-c3f3ab44701d}\Temp\terrain34-suite-rkMnlf\tmp\xld-midi-delete-tRVutS\album\track\midi\strings\a7a5014c-0e6a-4fba-9788-98c9b39dcef7'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Packages\\openai.codex_2p2nqsd0c76g0\\AC\\#!sandbox.{66d62bde-df9a-439b-ad81-c3f3ab44701d}\\Temp\\terrain34-suite-rkMnlf\\tmp\\xld-midi-delete-tRVutS\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Packages\\openai.codex_2p2nqsd0c76g0\\AC\\#!sandbox.{66d62bde-df9a-439b-ad81-c3f3ab44701d}\\Temp\\terrain34-suite-rkMnlf\\tmp\\xld-midi-delete-tRVutS\\album\\track\\midi\\strings\\a7a5014c-0e6a-4fba-9788-98c9b39dcef7'
}
```

---

# 车窗地貌 · 分栏顶屏 H1 与暴风雪山脊修正 · terrain.33

2026-11-26。MEGURI 雨天 5:24，顶屏左边读曲名与艺人，中间是 **NEXT VERSE 4 / IN 0:36**，右边是 **3.1 / 5.5 MI** 和 **5:24 / 9:28**。1440 × 900 下，有亮点的 8 × 8 格由 38.7% 升至 56.0%。暴风雪中贴着山脊的白光已去除。

[试版 XML.exe](../../releases/0.5.0-dev.terrain.33/XML.exe) · [实机同帧对照](phone-6/01-same-frame.jpg) · [暴风雪山脊实机对照](phone-6/22-snow-ridges.jpg) · [全部 22 张手机图](phone-6/)

## 栏宽与亮度

曲名使用现有 16 点字形；艺人用 12 点，含全宽字时用 13 点。加载歌曲时，左栏量曲名和艺人的字宽，中栏量全曲最长站名和最长站间倒计时，右栏按全程里程与时长留足数字位。常规下一站名优先用 18 点，里程用 16 点；空间紧时降为 16 / 14 点。满足内容后，约 22% 的余宽给左栏，26% 给右栏，其余给中栏。换站、计时和拖动只更换内容。

曲名放不进左栏时独占第一行。第二行安排艺人、下一站、倒计时、里程，省去重复的播放时钟。若艺人仍放不下，艺人独占第二行，曲名、下一站与里程放在上行。曲名和艺人始终分行，超出各自容积的文字按歌曲时间逐整字往返，两端停留。实际曲库所有画幅都能完整静置艺人和站名。

曲名、站名和读数用最高亮度；艺人和次行时钟低一级；NEXT、IN、MI 和斜线再低一级；隔栏虚线用最暗点。全屏 50 行，线路在第 36 行点阵处（从 1 起算），R2 的站名、灯形、亮度和进度逻辑沿用 terrain.32。

| MEGURI 5:24，414 列 | 两根分隔线的列号（从 0 起算） | 点亮 | 有字格 |
| --- | --- | --- | --- |
| terrain.32 | 无 | 7.4% | 38.7% |
| 48% / 78% 为栏起点，按可读下限夹紧 | 192 / 315 | 10.6% | 56.0% |
| 按标签与整曲站名留宽，默认 | 153 / 300 | 10.6% | 56.0% |
| 左右仅分少量余宽，中栏最宽 | 140 / 311 | 10.6% | 55.5% |

默认把第一条线比固定方案左移 39 列，艺人完整，中间的站名靠近曲名。再把线左移 13 列主要是增加中栏空隙。统计口径与 mock13 一致，按整屏 20,700 个点和 364 个 8 × 8 格计（边缘不足 8 点的格照计）。terrain.32 有 1,534 个亮点、141 个有字格，新版 2,185 个、204 格。mock13 的 H1 草图为 9.9% / 55%。[三种分法实绘](phone-6/09-column-rules.jpg)

## 曲库与画幅

按 XML 自己的扫描逻辑枚举原曲库 36 张专辑目录、371 首，读取原始曲名与艺人标签。段落取可用谱面，必要时回读本地分析清单中的有效段；缺失的时长用本机 ffprobe 读取歌曲容器。34 首有段落，共 383 段；337 首无段落，其中 327 首未关联到分析目录，另 10 首有关联目录但缺少段落。逐曲身份、每档版式及每首缺段歌曲均列在附件。[337 首缺段名单，按专辑](round6/missing-sections.md) · [371 首逐曲版式 CSV](round6/library-layout.csv)

| 窗口或导出 | 点列数 | 屏高 px | 常规三栏 | 曲名整行 | 艺人整行 | 曲名滚动 | 艺人滚动 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1123 × 778 | 414 | 128.7 | 302 | 65 | 4 | 12 | 0 |
| 1440 × 778 | 486 | 142.7 | 344 | 27 | 0 | 7 | 0 |
| 1440 × 900 | 414 | 165.1 | 302 | 65 | 4 | 12 | 0 |
| 1707 × 1067 | 414 | 195.7 | 302 | 65 | 4 | 12 | 0 |
| 2560 × 1600 | 414 | 293.5 | 302 | 65 | 4 | 12 | 0 |
| 3441 × 1440 | 641 | 264.1 | 363 | 8 | 0 | 2 | 0 |
| 1920 × 1080 | 465 | 198.1 | 331 | 39 | 1 | 9 | 0 |
| 3840 × 2160 | 465 | 396.2 | 331 | 39 | 1 | 9 | 0 |

“滚动”计入对应版式，前三种版式之和每行均为 371。1123 × 778 和 1440 × 900 的点列数相同，因为顶屏按车厢的短边比例缩放。中文实库样本《七里香》从「周杰伦 - 七里香 / Unknown Artist」拆为「七里香 / 周杰伦」。长中文验字用同库 Rubinstein 演奏的肖邦降 E 大调夜曲，在隔离的无损 FLAC 副本里将 TITLE 写成中文，并通过 XML 导入这首录音的钢琴 MIDI；实库原标签为英文，统计仍按英文原名。两首的分栏及艺人均可读。[七里香](phone-6/04-qilixiang.jpg) · [长中文实机与点阵](phone-6/05-long-chinese.jpg) · [长英文](phone-6/03-long.jpg)

## 过站、终点与缺段提醒

以歌曲时间选择严格晚于当前时刻的第一站，倒计时向下取整。MEGURI 在 360.354 秒显示 VERSE 4 / 0:00，360.364 秒到站即显示 BREAK 3 / 0:38。达到最后一段后显示 END 并倒数到曲终。没有段落的歌曲也倒数到终点，第三行全暗。段名和栏宽无切换动画或最低停留，保留真实边界。本库最短相邻边界 5.64 秒，单测额外覆盖 0.4 秒连续过站。实际四种点列宽度每种检查 1,831 个歌曲时刻，逐点与 .32 比较第三行；四档的布局、边界和 R2 检查均为零差错。[连续五帧](phone-6/10-station-transition.jpg) · [最后一段](phone-6/06-terminus.jpg) · [缺段的顶屏](phone-6/07-no-sections.jpg)

XML 阅读界面沿用车厢左下角已有的小字分析状态行。中文为「这首歌还没有段落，请去 XLD 分析段落。」英文为「No song sections yet. Analyze sections in XLD.」两种语言均在真机窗口触发，8 秒后消失，刷新同一首未再出现。沉浸布局、导出保持和独立导出渲染器均不绘制这条提示。准备队列和失败重试消息优先。没有音符的歌曲沿用原有空状态，再按曲库确认的缺段信息显示提醒。[XML 中英实机截图](phone-6/08-xml-notice.jpg)

## 暴风雪山脊

雪天原先在雪山表面之外又叠了两道效果：按坡向描山脊，以及把亮雾逐列铺在前山轮廓背后。现已从缓存瓦片及直接绘制两条路径移除。山体立体积雪、裸岩、谷地风雪、玻璃结霜及远近雪粒照常绘制。

MEGURI 同帧双实机验证了雪天阴云期 2:00 与暴风雪期 8:36。顶屏下方分别有 112,256 和 88,758 个像素变化，差异包围盒分别为 86, 354, 1354, 645 和 86, 325, 1354, 616（1440 × 900，左、上、右、下）。另在 5:24 对四种天气作整帧对照，晴 / 雨 / 沙尘的 y ≥ 172 区域均为 0 像素变化，雪天有 130,442 个。[山脊实机放大](phone-6/22-snow-ridges.jpg) · [四天气差分](round6/weather-diff.json)

## 实机、导出与耗时

从 terrain.32 已校验的包复制到新的暂存目录，用五个产品源文件替换对应文件；写入版本资料、重打可执行文件版本资源，逐文件核验后安装到空闲的 terrain.33 路径。清单含 1433 个文件，SHA-256 为 `08ab5868400b9b51d16a6212cc43c971db53b78599065272418e0abcbad2cf55`。父包清单 `8fe529b1631c063df06b4e0d7ed7361c2632eaffcc6cb5c04b335f69bb8cfdb5`。首次 1440 × 900 启动 PID 54104，真进程路径为 `releases/0.5.0-dev.terrain.33/XML.exe`，零延迟定位到 324.000 秒，静音离屏、私有调试管道、独立档案、只读来源的分析副本，退出码 0。窗外至窗台，以及 R2 线路所在的 y ≥ 113 区域，.32 和 .33 实机雨天完全同像素。[启动回执](round6/media/33-window-1440/export.json) · [包核验](round6/package/package-verification.json)

导出验证在隔离的试版副本中走 XML 的标准 1080p 和 4K 导出流程，三个测试接点用于选择 323–326 秒、自动保存、截取编码前帧。两个视频各为 90 帧、30 fps，含 3 秒原曲音频。两种分辨率在 324 秒的真包窗口与编码前图逐像素相等。H.264 解码后的 RGB 平均绝对误差分别为 4.8966 / 3.9237（0–255）。独立渲染测试另对四天气的 1440 × 900、雨天 1080p、晴天 4K 核对连播到达、跳时返回、重建和导出画布，六组差异均为 0 像素。[1080p 解码帧](phone-6/20-export-1080.jpg) · [4K 解码帧](phone-6/21-export-2160.jpg) · [逐像素核对](round6/media/comparison.json)

相同本机 GPU、同一页面中配对绘制两个版本，逐帧交替先后顺序，再交换位置与曲序复测。每种场景两轮各 320 对，合计 3,840 对；高画质，统计 draw() 的主线程耗时。表内为毫秒，P50 / P95 合并两轮计算。六种场景的配对差值中位数均为 0.0 ms。分开汇总每个版本时，两档雨天窗口的 P50 高 0.1 ms；P95 最大增加 0.2 ms。结论限于这两首的实测片段及这块 GPU。[正序原始帧](round6/performance/paired.json) · [反序原始帧](round6/performance/paired-reverse.json)

| 歌曲与天气 | 尺寸 | .32 P50 / P95 | .33 P50 / P95 | 配对 P50 差 |
| --- | --- | ---: | ---: | ---: |
| MEGURI · 雨 | 1440 × 900 | 3.5 / 6.7 | 3.6 / 6.9 | 0.0 |
| MEGURI · 雨 | 1123 × 778 | 2.6 / 4.2 | 2.7 / 4.1 | 0.0 |
| MEGURI · 雨 | 1920 × 1080 | 3.2 / 8.3 | 3.2 / 8.3 | 0.0 |
| Flowers of Romance · 晴 | 1440 × 900 | 1.4 / 2.5 | 1.4 / 2.5 | 0.0 |
| Flowers of Romance · 晴 | 1123 × 778 | 1.1 / 1.9 | 1.1 / 2.0 | 0.0 |
| Flowers of Romance · 晴 | 1920 × 1080 | 1.6 / 2.8 | 1.6 / 2.8 | 0.0 |

## 文件、测试与边界

| 相对 .32 的源文件 | 本轮变化 |
| --- | --- |
| `source/fusion-runtime-baseline/fusion.js` | 将选中曲目在库中的 hasStructure 提供给 scoreScene，供无音符场景判断段落。 |
| `source/fusion-runtime-baseline/i18n/catalogs.js` | 中英两份词条 score.noTerrainSections。 |
| `source/fusion-runtime-baseline/score-scene.js` | sectionNotice、prepText、paint、load、reset 在阅读界面沿用 statusLine，处理切歌、刷新、无音符、沉浸和导出状态。 |
| `source/fusion-runtime-baseline/tests/score-layers-state-contract.js` | 更新状态行调用断言，保留暂停绘制、帮助与沉浸模式的条件。 |
| `source/scoreview/score-terrain-led.js` | prepareRoute、normSections、headerParts、boardLayout、textLine、headerLines、headerModel、drawHeader、clearCaches。测量整曲、绘制分隔与读数、复用点阵缓存。 |
| `source/scoreview/score-terrain.js` | carriage 对无段落也提供里程。paintRange、paintDetails、makeTile、layTiles、paintTiled 和直接绘制的回退路径去掉雪天山脊描线及轮廓雾，并删除相应取样与着色函数。 |
| `source/scoreview/tests/terrain-led.test.cjs` | 三栏/两种整行、整字滚动、亮度、无段落、站点两侧、极短段和缓存测试。 |
| `source/scoreview/tests/terrain.test.cjs` | 四种天气，缓存与逐帧两条路径，均检测不到沿山脊的描线或光带。 |

基线记录 4,388 个文件指纹。上述五个产品文件及三个测试文件是源树的全部差异。源树中 XLD 的 297 个和 shared-analysis 的 8 个基线文件校验一致。原有 releases 清单和入口指针复核一致；真实分析库只读。新增包除五个产品文件外，仅 README、使用说明、两份 package.json、runtime.json、两个 exe 的版本/品牌资源及新清单有差异。[开工指纹](round6/baseline-sha256.json) · [源文件前后 SHA-256](round6/changed-files.json)

ScoreView 和 XML 的 npm test 均成功退出。ScoreView 627 通过，1 个依赖旧归档夹具的用例按原条件跳过。XLD 的完整 npm test 执行到 midi-delete.cjs 时，Windows 拒绝创建测试用目录联接（EPERM）。从该处继续按原命令逐项补跑，storage.cjs 在相同系统调用处也被拒绝；114 条脚本命令中的其余 112 条通过。两项均使用未改动的 XLD 测试与真实文件系统调用。当前环境未验证这两项成功，因此三套全绿这一条未达到。[ScoreView 原始日志](round6/scoreview-test.log) · [XML 原始日志](round6/xml-test.log) · [XLD 原始日志](round6/xld-test.log) · [XLD 续跑结果](round6/remaining.json)

**scoreview · npm test · 退出 0**

```text
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (0.4831ms)
ℹ tests 628
ℹ suites 0
ℹ pass 627
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 51605.58
```
**xml · npm test · 退出 0**

```text
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 143.6006
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
```
**xld · npm test · 退出 1**

```text
source hygiene: ok (247 files, no stray control characters)
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\mc-oOyU7Y\xld-midi-delete-2hhRri\outside' -> 'C:\Users\12452\AppData\Local\Temp\mc-oOyU7Y\xld-midi-delete-2hhRri\album\track\midi\strings\99849ccc-f0d8-4165-a4ca-d96ccd8aa5d9'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\mc-oOyU7Y\\xld-midi-delete-2hhRri\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\mc-oOyU7Y\\xld-midi-delete-2hhRri\\album\\track\\midi\\strings\\99849ccc-f0d8-4165-a4ca-d96ccd8aa5d9'
}
```

暴风雪对照使用本地 MEGURI 的两个标明时刻，用户截图未提供曲名或时间。手机图高分辨率点阵局部使用包内绘制函数重绘；实机前后、缺段提示、长中文、雪山局部和导出解码帧均标明来源。两种非默认栏宽只在验收页渲染。

---

# 车窗地貌 · 窗台便携收音机 L2a · terrain.32

奶油色收音机放在原来的木窗台中央。包内 XML.exe 已打开《in Silence / in Siren》，晴天 3:46 显示电平、BREAK 2 和 3:46。1440 × 900 下仍能原字高放下 12 个汉字，实库需要滚动的歌词由 86 句降到 81 句。两档视频均已实际导出。XLD 的 Windows 文件链接测试仍有权限阻塞。

[试版 XML.exe](../../releases/0.5.0-dev.terrain.32/XML.exe) · [与 .31 同帧对照](phone-5/01-same-frame.jpg) · [三种屏幕状态](phone-5/02-lyrics-states.jpg) · [收音机构造特写](phone-5/03-radio-detail.jpg) · [全部 16 张手机图](phone-5/)

## 外形与用色

圆喇叭放在左端，网罩边圈压住交错孔阵。镀铬提手用两侧耳轴连接，中央握把放低。细天线横卧在机顶，可见根部转轴、伸缩接缝和卡扣。屏下刻度只画长短线和一根砖红指针，右侧两个滚花旋钮分高低。前后壳接缝、角部擦痕、两个深色脚垫、落到木面的投影与接触影均画进机壳缓存。构造参考了馆藏实物，自绘外形未使用实物照片或商标。[Powerhouse 馆藏收音机](https://collection.powerhouse.com.au/object/137884)

试过奶油米白、灰鼠尾草绿、赭黄褐。默认用米白，晴天的左上斜光和右下背光都能读出来，色相也能与木头分开。原青色、默认灰青绿、更暗灰绿在同一机壳上对照。默认降低点阵峰值和辉光，保留暗点、黑底与整句字形。旧屏和候选色只用于对照图。[机壳三色](phone-5/04-case-finishes.jpg) · [荧光屏三色](phone-5/05-vfd-colours.jpg)

## 尺寸与歌词

表中尺寸为渲染逻辑像素。宽高包括提手和脚垫，间距按玻璃下缘到最高点、最低脚垫到木台前缘测量。字高取 12 行点阵的排版高度，依次为常规句和实库最紧排字。两版常规高度相同，逐句比对也没有一条字变小。“汉字”列按全宽字“国”重复、原字高且留原屏边距实测。

| 画幅 | 整机宽 × 高 | 玻璃间距 | 前沿间距 | 字高（常规 / 最紧） | 常规列数 .31 → .32 | 汉字 | 滚动句 .31 → .32 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1123 × 778 | 464.8 × 66.3 | 11.3 | 5.0 | 26.9 / 22.8 | 151 → 156 | 12 | 110/441（24.9%） → 107/441（24.3%） |
| 1440 × 778 | 515.2 × 73.5 | 12.5 | 5.5 | 29.8 / 22.8 | 151 → 156 | 12 | 91/441（20.6%） → 89/441（20.2%） |
| 1440 × 900 | 596.0 × 85.0 | 14.5 | 6.4 | 34.5 / 24.9 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |
| 1707 × 1067 | 706.5 × 100.8 | 17.2 | 7.6 | 40.9 / 29.5 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |
| 2560 × 1600 | 1059.6 × 151.1 | 25.8 | 11.4 | 61.4 / 44.2 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |
| 3441 × 1440 | 953.6 × 136.0 | 23.2 | 10.2 | 55.2 / 39.8 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |
| 1920 × 1080 | 715.2 × 102.0 | 17.4 | 7.7 | 41.4 / 29.8 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |
| 3840 × 2160 | 1430.4 × 204.0 | 34.8 | 15.4 | 82.8 / 59.7 | 151 → 156 | 12 | 86/441（19.5%） → 81/441（18.4%） |

曲库扫描了 36 个专辑分组、371 首歌。本机可解析同步歌词的 13 首共 441 个非空时间行，含重复副歌，去重后 349 行。自动缓存 8 首，用户选定的 LRCLIB 3 首、网易云 2 首。扫描沿用包内 XML 的音轨标识、标签、时长和本地歌词选择顺序，读取音乐库、分析清单和歌词缓存副本。两版分别在同一浏览器用包内 lyricPlan 逐行排字。没有在本机找到同步文本的歌曲不进分母。[逐曲计数与排字结果](round5/lyrics.json)

原屏在基准画幅为 446 × 42，现为 460 × 42。歌词仍整句点亮，稍长先使用原有紧排，超长才随句内进度平移。无词状态保留电平、完整英文段落名、时间。中英文手机图使用固定试读句，两版同帧和导出照片均关闭歌词以展示待机电平。[1123 × 778](phone-5/10-window-1123x778.jpg) · [1440 × 778](phone-5/11-window-1440x778.jpg) · [1707 × 1067](phone-5/12-window-1707x1067.jpg) · [2560 × 1600](phone-5/13-window-2560x1600.jpg) · [3441 × 1440](phone-5/14-window-3441x1440.jpg)

## 天气与窗外

同一时刻取喇叭和屏幕之间一小块正面塑料。亮度为 0–255 的 sRGB 加权值。窗外列为窗内中央区域第 95 百分位，用于说明机壳在全景里所处的亮度。雨、雪、沙尘中的机壳均比晴天暗，晴天到雨天的红蓝通道差从 54 降到 16。

| 天气 | 机壳 RGB | 机壳亮度 | 窗外亮度 P95 |
| --- | --- | --- | --- |
| 晴天 | 188.9、169.9、135 | 171.5 | 210.8 |
| 雨天 | 119.1、116.1、103.1 | 115.8 | 133.5 |
| 雪天 | 156、146、126 | 146.7 | 220.7 |
| 沙尘 | 145、132、109 | 133.1 | 154.6 |

[晴天](phone-5/06-clear.jpg) · [雨天](phone-5/07-rain.jpg) · [雪天](phone-5/08-snow.jpg) · [沙尘](phone-5/09-sandstorm.jpg)

两版分别从新页面在同尺寸直接绘制晴天 3:46，变化的 51,368 个像素均落在窗台上的机壳和投影内，差异外框（含边界）为 x=422–1040、y=806–898。玻璃及其上方变化为 0 像素。不同尺寸连续切换会影响既有场景的边缘栅格化，这张验收对照使用相同窗口历史。[像素核对](round5/phone-check.json)

## 实机、导出与回放

两次直接从 releases/0.5.0-dev.terrain.32/XML.exe 启动，实际进程号 45464 与 45468。两次均从该包载入 XML 页面，进入车窗地貌高画质，取得 1920 × 1080、3840 × 2160 的播放画布，并正常退出（退出码 0）。测试使用独立临时用户目录和独立调试管道。只读复制一首歌的 32 份分析文件到测试目录。[1080p 实机记录](round5/media/window-high/export.json) · [4K 实机记录](round5/media/window-4k/export.json)

另从同一版本的临时副本，用产品正常导出按钮分别生成 H.264 / AAC 短片。取样范围为 3:45–3:48，每档 30 fps、90 帧。测试只在副本调整启动记录、运行时配置和导出取样以截取这三秒并抓取编码前帧。EXE 与地貌、点阵渲染代码均来自交付包。两档第 31 帧（3:46）的编码前画面与相同尺寸的原包窗口比较，差异分别为 0 / 2,073,600 和 0 / 8,294,400 像素。手机上的导出图来自成片解码。H.264 的有损误差 MAE 分别为 4.93、3.70 个通道级。[1080p 成片](round5/media/clear-clip/cabin-1080p.mp4) · [4K 成片](round5/media/clear-4k/cabin-2160p.mp4) · [1080p 导出帧](phone-5/15-export-1080p.jpg) · [4K 导出帧](phone-5/16-export-4k.jpg)

另测晴天 1440 × 900、雨天 1123 × 778、雪天 1440 × 778、沙尘 1123 × 778、晴天 1920 × 1080。每组连续绘制 13 帧，再从 4:40 跳回 3:46、重建同曲模型、切换导出画布分别重画。五组的三项全帧 RGB 比较都得到 0 个差异像素。[逐组回放结果](round5/capture/report.json)

## 帧耗时

NVIDIA GeForce RTX 5070 Ti Laptop GPU，D3D11，高画质。两份正式包在同一浏览器成对绘制同一音频时刻。每组先预热，再采 320 对帧，第二轮交换左右位置、先画版本及曲序。下表每行 640 对，单位毫秒，记录每次同步 draw 的返回耗时。最后一列取逐对 .32 减 .31 的中位数。

| 曲目 | 画幅 | terrain.31 P50 / P95 | terrain.32 P50 / P95 | 配对差值 P50 |
| --- | --- | --- | --- | --- |
| in Silence / in Siren | 1440 × 900 | 2.0 / 3.0 | 2.0 / 2.9 | -0.0 |
| in Silence / in Siren | 1123 × 778 | 1.8 / 2.5 | 1.8 / 2.5 | -0.1 |
| in Silence / in Siren | 1920 × 1080 | 2.9 / 4.0 | 2.9 / 3.9 | -0.0 |
| Flowers of Romance | 1440 × 900 | 1.8 / 2.8 | 1.8 / 2.8 | 0.0 |
| Flowers of Romance | 1123 × 778 | 1.7 / 2.4 | 1.6 / 2.4 | -0.0 |
| Flowers of Romance | 1920 × 1080 | 2.6 / 3.6 | 2.5 / 3.5 | -0.0 |

合并 3,840 对帧，.31 的 P50 / P95 为 2.1 / 3.4 ms，.32 为 2.0 / 3.4 ms。第一轮单看 1123 × 778，两首的 P95 分别高 0.1、0.4 ms。合并第二轮后，两首窄窗 P95 分别为 2.5、2.4 ms，两版相同。该计时覆盖高画质的同步绘制提交，显示器呈现延迟、冷启动和其他显卡没有计时。[第一轮原始数据](round5/performance/paired.json) · [换序复测](round5/performance/paired-reverse.json)

## 文件、基线与素材

改动前指纹覆盖 4388 个路径。交付前复核，旧发行清单、.31 的 EXE 与渲染文件、本机入口及启动脚本均保留原指纹。当前入口仍指向 terrain.22，上一个入口指向 terrain.13。正式包共 1433 个清单文件，父清单 SHA-256 为 b976402dcaa9e5139f2106727b9b7bebbeead79a26bf80c3b82aeae29196676f，新清单为 8fe529b1631c063df06b4e0d7ed7361c2632eaffcc6cb5c04b335f69bb8cfdb5。[开工前指纹](round5/baseline-sha256.json) · [工作树差异清单](round5/changed-files.json) · [包校验及 PE 版本](round5/package/package-verification.json)

| 位置 | 本轮改动 |
| --- | --- |
| source/scoreview/score-terrain.js | layout 更新机壳、屏幕和上下边界。新增 RADIO、RADIO_PLASTIC，radioSpeaker、radioKnob、radioHandle、radioAerial、radioScale 以及基础绘制函数 radioStroke、radioPatch、radioBox、radioDisc，统一由 paintRadio 绘制。drawVfdDeck 缓存尺寸、像素密度、天气和阴暗档位对应的整机，最多 16 项。carriage 将旧 paintVfdSpill 合入缓存绘制。 |
| source/scoreview/score-terrain-led.js | 仅调整 THEMES.vfd 的点阵四级色、暗点、玻璃底色和辉光。lyricPlan、drawLyric、vfdStandby 以及琥珀顶屏沿用 .31。vfdStandby 定义在 score-terrain.js。 |
| source/scoreview/tests/terrain-window.test.cjs | 更新放置几何断言，检查提手、脚垫、屏幕、12 个汉字的常规容量和中英文样句逐句字高。 |
| releases/0.5.0-dev.terrain.32/ | 包内除上述两个渲染文件外，更新 XML.exe、XLD.exe 的版本资源，两个 package.json、runtime.json、使用说明.html、README.md 和发行清单。 |
| work/terrain-cabin-20261125/ | phone-5 为 16 张 1080 像素宽的黄标题手机图。round5 留下原帧、视频、脚本、指标与原始测试日志。本节追加在原交接之前。 |

新增机壳图片素材 0 份、0 KB。全部零件和投影由 Canvas 生成一次后随静态缓存复用。最小窗口的喇叭、提手和双钮可以分辨，天线的卡扣及细划痕主要在局部放大图可见。机身为保字高做得较长而低。手机图已按 1080 像素宽解码验看，未在实体手机屏上校色。实际编码覆盖这两段三秒样片。

## 三套 npm test

Scoreview 退出 0，626 项通过、0 项失败。1 项沿用既有的跳过条件。以下为本轮日志尾部原文。[Scoreview 完整日志](round5/scoreview-test.log)

~~~text
ℹ tests 627
ℹ suites 0
ℹ pass 626
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 46422.1403
~~~

XML 退出 0。末尾汇总数字属于最后一个独立测试段。[XML 完整日志](round5/xml-test.log)

~~~text
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 100.2903
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
~~~

XLD 退出 1。项目临时目录和 Windows 临时目录的完整 npm test 均在 midi-delete.cjs:29 创建目录联接时收到 EPERM。随后按原命令逐项运行剩余 80 项，在短临时路径有 78 项通过，storage.cjs 的目录联接及 midi-export.cjs 的硬链接收到 EPERM。midi-export 在默认隔离临时目录独立复跑通过。midi-delete 和 storage 的目录联接用例仍未通过，三套全绿这一项未达成。[完整测试第一次](round5/xld-test.log) · [短路径整套复测](round5/xld-test-short.log) · [后续 80 项](round5/xld-rest.log) · [硬链接独立复测](round5/xld-hardlink.log)

~~~text
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\xld-mWkr7E\xld-midi-delete-ZJzNNs\outside' -> 'C:\Users\12452\AppData\Local\Temp\xld-mWkr7E\xld-midi-delete-ZJzNNs\album\track\midi\strings\41aa9851-3f19-4b3a-9f59-815b91b6149a'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\xld-mWkr7E\\xld-midi-delete-ZJzNNs\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\xld-mWkr7E\\xld-midi-delete-ZJzNNs\\album\\track\\midi\\strings\\41aa9851-3f19-4b3a-9f59-815b91b6149a'
}
~~~

---


# 车窗地貌 · 线路图站名 R2 · terrain.31

顶屏第三行现在每站都写缩写。实库 32 首有段落的歌、352 个站位，三种画幅均无截断或不足 2 列的间隔。最密的《Flowers of Romance》在两个窗口最少留 8 列，1080p 导出最少留 9 列。独立试版已用包内 XML.exe 打开这首歌。工程验收还差 XLD 的三个 Windows 文件链接用例。

[试版 XML.exe](../../releases/0.5.0-dev.terrain.31/XML.exe) · [晴天 3:46 同帧对照](phone-4/01-same-frame.jpg) · [22 站双画幅](phone-4/08-flowers-two-sizes.jpg) · [1080p 视频解码帧](phone-4/11-decoded-1080p.jpg)

## 线路图读法

| 段落 | 未编号 | 有编号示例 |
|---|---|---|
| 引子 / INTRO | IN | IN2 |
| 主歌 / VERSE | V | V2 |
| 导歌 / PRE | PR | PR2 |
| 副歌 / CHORUS | C | C2 |
| 间奏 / BREAK，1–18 站 | BK | BK2 |
| 间奏 / BREAK，19 站及以上 | B | B2 |
| 桥段 / BRIDGE | BR | BR2 |
| 独奏 / SOLO | S | S2 |
| 器乐段 / INST | IS | IS2 |
| 尾奏 / OUTRO | OUT | OUT2 |

以整首的有效站数决定间奏写法。切换窗口、当前站或导出档位都沿用同一套字。未知名称取前两个拉丁字母与末尾编号，全角字符先归一，带重音字母按分解后的拉丁字母取码。没有可用字母时用 X 加末尾编号，缺编号就用从 1 开始的站序。纯数字保留至三位，含前导零。超过三位的数字串按站序显示。例子包括全角 ００７ → X007、夜行 12 → X12、第四站「こもれび」→ X4、超长 Moonlight… 27 → MO27。[特殊名字实拍与逐项对照](phone-4/09-custom-names.jpg)

| 位置 | 乘客看到的内容 |
|---|---|
| 顶屏第三行 | 每个方灯下都有缩写。已过站亮度 2，本站 4、带方框，下一站文字 3、方灯按歌曲时间每秒前半秒亮，后续站文字 1。 |
| 窗外站牌 | 仍显示完整英文段名，例如 CHORUS 4。实际站牌出现的时刻和筛选规则沿用 .30。 |
| 窗台歌词机 | 有词时显示歌词。无词待机显示 VU 表、时间和完整英文段名，缺段名时显示 INSTRUMENTAL。 |

## 全曲库间距

从本机分析目录只读装载 39 首可构建的曲目。对 32 首含段落的歌，按歌的每一站轮流取其段中时间，在三个真实布局共检查 1,056 帧。用包内 12 点字形逐点重建第三行，逐站核对字形、亮度和边界。间隔按相邻字最右和最左亮点之间完整的空列计。

| 画幅 | 点阵列数 | 歌曲 | 不足 2 列 | 间隔 ≤ 8 列 | 截断 | 最小空列 |
|---|---|---|---|---|---|---|
| 1440 × 900 | 414 | 32 | 0 | 1 | 0 | 8 |
| 1123 × 778 | 414 | 32 | 0 | 1 | 0 | 8 |
| 1920 × 1080 | 465 | 32 | 0 | 0 | 0 | 9 |

两个窗口中，只有 22 站的《Flowers of Romance》达到 8 列。它的 22 个完整站名共占 240 个亮点包围列，如果 21 对邻站都要留 9 列，总共需要 429 列。窗口有 414 列。1080p 下，《Flowers of Romance》《Radioactive Spell Wave》和《Scorpius Circus》并列最小 9 列。[32 首逐曲表](round4/route-spacing.csv) · [逐曲、逐站取帧与点阵核对](round4/audit.json)

灯仍按（总列数 − 4）÷ 站数均分。文字先取灯下原位置，只有文字或屏幕边缘需要空间时才平移完整字形。两种窗口中相对原位置的最大位移为 6 列，导出为 1 列。实库 1,056 帧中，顶屏前两行、进度线和所有站灯相对 .30 逐点零差。

| 手机实图 | 站数 | 取帧时间 | 本站 | 窗口最小空列 | 1080p 最小空列 |
|---|---|---|---|---|---|
| [in Silence / in Siren](phone-4/02-in-silence.jpg) | 13 | 3:52.25 | BK2 | 14 | 19 |
| [Ceremony](phone-4/03-ceremony.jpg) | 7 | 2:20.25 | BK2 | 42 | 49 |
| [七里香](phone-4/04-qilixiang.jpg) | 9 | 2:57.25 | C2 | 34 | 39 |
| [Flowers of Romance](phone-4/05-flowers.jpg) | 22 | 7:20.25 | C4 | 8 | 9 |
| [Typewrite Lesson](phone-4/06-typewrite.jpg) | 10 | 2:30.25 | C2 | 29 | 34 |
| [Mirrors](phone-4/07-mirrors.jpg) | 15 | 3:26.25 | V4 | 10 | 13 |

## 实窗、视频与同帧核对

实际运行 releases/0.5.0-dev.terrain.31/XML.exe，PID 43788，通过私有管道连接。以独立测试资料和分析副本打开《Flowers of Romance》，原生窗口画布为 1920 × 1080。歌曲 7:20.25 时，包内实际绘制回调报出 465 列、22 个缩写、第 12 站 C4，完整段名 CHORUS 4。进程退出码为 0。曲库读取器为这首歌构建 16 轨，桌面包加载 11 轨，顶屏 22 个站名逐项吻合。[实窗启动及站名记录](round4/media/window-high/export.json)

从桌面导出的 1080p 选项制作 439.25–442.25 秒的三秒样片。在隔离副本中指定保存路径、音频区间并取编码前帧，两份 XML.exe 的指纹一致。视频为 1920 × 1080、30 fps、90 帧 H.264，带 AAC 音轨。解码片内 1.000 秒的第 30 帧（从 0 计）制成手机图。原包高画质实窗与编码前 RGB 完全相同，共 2,073,600 像素。H.264 解码与编码前平均 RGB 绝对误差为 4.95 / 255。[MP4 样片](round4/media/flowers-clip/cabin-1080p.mp4) · [导出记录](round4/media/flowers-clip/export.json) · [逐像素比较](round4/media/flowers-clip/comparison.json)

晴天《in Silence / in Siren》3:46 的 1440 × 900 同帧中，.30 与 .31 相差 20,119 个像素，全部落在第三行站名内（x = 106–1239，y = 127–163）。另验收连续播放 13 帧、从别处拖回以及导出模式直达同一时刻。《in Silence / in Siren》3:46 和《Flowers of Romance》7:20.25、431.166 秒换站边界，全窗 RGBA 差异均为零。[1123 × 778 完整车窗](phone-4/10-window-1123.jpg) · [同帧比较](round4/phone-check.json)

附加测试用新建的歌曲对象重建整幅风景。《Flowers of Romance》两个时刻分别有 47,281、1,615 个窗外像素变化，顶屏零差。.30 在同一输入、同一坐标范围重现了相同结果。这个额外重建场景的整窗像素一致性仍有限。[.30 记录](round4/capture/capture-30.json) · [.31 记录](round4/capture/capture-31.json)

## 重绘与帧耗时

在 Radeon 890M / D3D11、晴天、高画质下，两版反转首跑顺序，各做八轮、每轮 96 帧。下表为《in Silence / in Siren》整窗正常绘制耗时及浏览器帧间隔，单位 ms，数字为 P50 / P95。

| 画幅 | .30 绘制 | .31 绘制 | .30 帧间隔 | .31 帧间隔 |
|---|---|---|---|---|
| 1440 × 900 | 2.6 / 3.3 | 2.6 / 3.3 | 8.4 / 8.5 | 8.4 / 8.5 |
| 1123 × 778 | 2.4 / 3.0 | 2.4 / 3.1 | 8.4 / 8.5 | 8.4 / 8.5 |
| 1920 × 1080 | 3.5 / 5.3 | 3.7 / 5.7 | 8.4 / 8.5 | 8.4 / 8.5 |

另外逐帧配对，用两版轮换先后绘制同一歌曲时间。两首歌 × 三种画幅，每组 320 对。配对绘制耗时的中位差为 −0.1 到 0.0 ms。独立窗口帧间隔相同，部分条件下 .31 的绘制 P95 高出 0.1–0.4 ms，本轮没有证实每个画幅的尾部耗时都持平。[计时汇总](round4/performance/summary.json) · [逐帧配对原始记录](round4/performance/paired.json)

只测顶屏时，每站取 12 帧。两首歌、三种尺寸、每种六轮的缓存命中、局部重绘及整屏重绘次数在两版完全相同。以 1440 × 900 为例，13 站每轮为 111 / 32 / 13，22 站为 208 / 34 / 22。13 站每帧平均耗时的轮次中位数从 5.58 降至 5.06 ms，22 站从 5.12 到 5.15 ms。[顶屏专测原始记录](round4/performance/header.json)

## 改动范围与指纹

开工共记录 2091 个源文件、入口与既有包的指纹，.30 清单 SHA-256 为 `1e71af956e0c9e3a87e223bc6b5c84a338b86c5855d94377932462dd584d5320`。.31 以该包为父版，清单 SHA-256 为 `b976402dcaa9e5139f2106727b9b7bebbeead79a26bf80c3b82aeae29196676f`，1433 项逐项校验通过。既有包均保留，日常入口仍指向 terrain.22。真实分析目录只读，本轮未下载或推送。[开工指纹](round4/baseline-sha256.json) · [改动文件及前后指纹](round4/changed-files.json) · [发布包核对](round4/package/package-verification.json)

| 改动文件 | 具体变动 |
|---|---|
| source/scoreview/score-terrain-led.js | prepareRoute 统一产生站名，routeLabelPositions 用实际字形确定位置。headerParts、headerModel 与 drawHeader 使用同一线路数据和缓存键。warm、clearCaches 和导出接口相应调整，移除旧的 nameCandidates。 |
| source/scoreview/score-terrain.js | stationsOf 在已有排序、去重之后保留供顶屏使用的原始段名，carriage 传给顶屏。stationName、englishSection、routeLamps 和 vfdStandby 的实现均沿用 .30。 |
| source/scoreview/tests/terrain-led-english.test.cjs、terrain-led.test.cjs、terrain-stations.test.cjs | 覆盖全部缩写、编号、18/19 站边界、逐站间隔、未知输入、拥挤时站站有字，以及同一时刻的顶屏缩写、窗外站牌和歌词机全名。 |
| 独立包内的版本文件 | 同步 XML.exe、XLD.exe 版本资源、两个 package.json、runtime.json、README.md、使用说明.html 和发布清单。包内产品代码变化为上述两个渲染文件。 |

## 三套测试

ScoreView 的 npm test 退出 0，626 项通过、1 项沿用原有跳过。XML 退出 0。XLD 退出 1，Windows 对测试临时目录里的 NTFS 联接和硬链接返回 EPERM，自动审批拒绝提高该次测试的权限。主序列停在 midi-delete，余下 80 条另行逐条执行，78 条通过，storage 与 midi-export 遇到同一权限限制。三个文件链接测试均保留原断言。

ScoreView 原始尾段。[完整日志](round4/scoreview-test.log)

```text
ℹ tests 627
ℹ suites 0
ℹ pass 626
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 30422.2855
```

XML 原始尾段。[完整日志](round4/xml-test.log)

```text
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 71.1101
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
```

XLD 原始尾段。[完整日志](round4/xld-test.log) · [剩余命令日志](round4/xld-rest.log)

```text
Error: EPERM: operation not permitted, symlink 'C:\Users\12452\AppData\Local\Temp\r2-JdgNEv\xld-midi-delete-7EAhdr\outside' -> 'C:\Users\12452\AppData\Local\Temp\r2-JdgNEv\xld-midi-delete-7EAhdr\album\track\midi\strings\221f9727-1667-44f5-a1d7-65c4679184b4'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'C:\\Users\\12452\\AppData\\Local\\Temp\\r2-JdgNEv\\xld-midi-delete-7EAhdr\\outside',
  dest: 'C:\\Users\\12452\\AppData\\Local\\Temp\\r2-JdgNEv\\xld-midi-delete-7EAhdr\\album\\track\\midi\\strings\\221f9727-1667-44f5-a1d7-65c4679184b4'
}
```

```text
Continuation only. 78/80 succeeded, 2 failed.
```

# 车窗地貌 · 三行顶屏 T3 · terrain.30

歌名独占 16 点大字的第一行，歌手和读数共用第二行，线路图在第三行。六首实曲在 1440×900、1123×778 和 1920×1080 上都有五首能在任意静帧同时读全歌名和歌手。只有 toe 的《グッドバイ》完整版本名仍需滚动。1440×900 的窗洞上沿下移 47.07 px，可见风景比 .29 少 7.19%。独立包已用自己的 XML.exe 启动并验证。工程验收还差 XLD 的三个 Windows 文件链接用例。

[晴天 3:46 同帧对照](phone-3/01-same-frame.jpg) · [六首实曲顶屏](phone-3/02-six-tracks.jpg) · [试版 XML.exe](../../releases/0.5.0-dev.terrain.30/XML.exe)

## 顶屏字号与间距

35 行点阵增至 **50 行**。从 0 开始计行，歌名字框占 0–15 行，亮度 4。英文歌手用 12 点，含中日文的歌手用 13 点，亮度 3。读数用 14 点，当前值沿用亮度 4，总量沿用亮度 1。第二行的字面基线都在第 29 行。线路中心在 35 行，当前站方灯上沿在 33 行，12 点站名从 38 行起。六首实拍中，前两行可见字面之间留 2–4 行暗点。带线路图的五首，第二行最后一排亮点到线路中心隔 4–5 行暗点，到方灯上沿隔 2–3 行。相同站点、进度、闪灯相位下，687 组新旧线路点阵逐点相同。[点阵核验](round3/led-audit.json)

在 1123×778 并排看「周杰伦」「青葉市子」和片假名，12 点时密笔画最容易并在一起，13 点已能辨清，14 点更宽。歌名与歌手放不下时，各用自己的字宽和歌曲时钟往返，首尾均停顿。里程 12 点在整窗中偏小，16 点更抢眼，默认选中间的 14 点。无歌手时第二行左侧留空。有段落时默认显示里程，无段落时右侧显示时间，第三行留暗点阵。三个场景共用同一屏高。字号对照里的中日文组合是专用试字。[歌手 12 / 13 / 14 点](phone-3/03-artist-sizes.jpg) · [读数 12 / 14 / 16 点](phone-3/04-counter-sizes.jpg) · [无歌手整窗](phone-3/11-no-artist.jpg) · [无段落整窗](phone-3/12-no-sections.jpg)

## 窗洞与风景

每版都用成包渲染器生成玻璃与前景遮挡蒙版。相同画幅、时刻和画质逐像素配对，沿用 .29 的 50% 透明度门槛。下表覆盖高、自动、省电三档及歌曲 226、280 秒。损失分母分别为 .29、.27 的实际可见像素。末列单独测第 50 行的代价，用 49 行窗洞和 50 行窗洞的高画质 226 秒像素数作差，再除以 .29 可见像素数。1440×900 多这一行花 3.14 px，另少 3,818 个可见像素，合 0.47 个百分点。

| 画幅 | 屏高 .29 → .30（px） | 窗上沿下移（px） | 点距（px） | 风景损失（相对 .29） | 风景损失（相对 .27） | 第 50 行额外代价（百分点） |
|---|---:|---:|---:|---:|---:|---:|
| 1440×900 | 118.00 → 165.07 | 47.07 | 3.14 | 7.19% | 10.23–10.25% | 0.47 |
| 1123×778 | 92.02 → 128.74 | 36.71 | 2.45 | 6.27% | 6.60–6.62% | 0.35 |
| 1440×778 | 102.00 → 142.70 | 40.69 | 2.71 | 7.42% | 11.04–11.06% | 0.54 |
| 1707×1067 | 139.88 → 195.68 | 55.80 | 3.72 | 7.21–7.37% | 10.25–10.30% | 0.39 |
| 2560×1600 | 209.78 → 293.47 | 83.69 | 5.58 | 7.23–7.30% | 10.32–10.49% | 0.44 |
| 3441×1440 | 188.80 → 264.12 | 75.32 | 5.02 | 7.32–7.39% | 11.60–11.70% | 0.49 |
| 1920×1080 | 141.60 → 198.09 | 56.49 | 3.77 | 7.42% | 10.93–10.95% | 0.52 |
| 3840×2160 | 283.20 → 396.18 | 112.98 | 7.53 | 7.35% | 10.76–10.78% | 0.46 |

1440×900 的玻璃从 y=193.72 延伸到 792.00。安装壳下缘和 4 px 木压条之间留出一条壁板暗缝。窗洞左、上、右、下净宽分别为 11.50、11.90、19.75、17.00 px。雨天四面中段亮度中位数依次为 53.23、44.16、78.54、90.14（0–255）。帘肩随窗上沿下移，左右收腰分别下移 18.59 和 19.77 px，帘脚仍落在同一台面。两帘在肩、腰、脚的宽度分别为 78.75 / 31 / 91 和 74.75 / 33 / 88 px。[雨天整窗](phone-3/10-rain.jpg) · [取样区域](round3/phone-check.json)

保留横档上方至少 18 px（按 1440×900 折算）的玻璃。为此，山、道床和轨共用同一纵向映射，投影上端从 136.00 移到 156.65 px，下端仍为 795.50 px。两条轨头只下移 0.53 和 0.22 px，台面和歌词机尺寸、位置均与 .29 相同。八种画幅共 48 次检测，37% 竖线与事件入窗列扣除横档后的额外遮挡均为 0 行。[各画幅几何](round3/geometry.json) · [.30 像素蒙版](round3/terrain30-masks.json) · [.29](round3/terrain29-masks.json) · [.27](round3/terrain27-masks.json) · [49 行对照](round3/terrain49rows-masks.json)

## 任意静帧读全歌名 / 歌手的时间占比

每格先写歌名，再写歌手。按实测字宽、歌曲时长内的读数宽度和可用列数计算。名字一旦宽过整行，任意单帧都无法容纳全文，滚动可以分时读完。六首均取自真实分析目录。《birthday resistance》目前只有分轨强度数据，段落数为零。《七里香》的原始标签为 Unknown Artist，程序从「周杰伦 - 七里香」拆出两项。

| 歌名（完整标签） | 歌手 | 段落 | 1440×900 | 1123×778 | 1920×1080 |
|---|---|---:|---:|---:|---:|
| in Silence / in Siren | world's end girlfriend | 13 | 100% / 100% | 100% / 100% | 100% / 100% |
| MEGURI | world's end girlfriend | 13 | 100% / 100% | 100% / 100% | 100% / 100% |
| birthday resistance / 誕生日抵抗日 | world's end girlfriend | 0 | 100% / 100% | 100% / 100% | 100% / 100% |
| グッドバイ Goodbye　Album Version feat. Toki Asako 土岐麻子 | toe | 10 | 0% / 100% | 0% / 100% | 0% / 100% |
| Ceremony (12' Version with Gillian Gilbert) | New Order | 7 | 100% / 100% | 100% / 100% | 100% / 100% |
| 七里香 | 周杰伦 | 9 | 100% / 100% | 100% / 100% | 100% / 100% |

《グッドバイ》的版本名需要 472 列。两种窗口可供歌名使用的净宽都是 411 列，1080p 导出为 462 列。其余五首中最长的是《Ceremony》，占 344 列。[逐曲字号、列数、取帧时刻和数据来源](round3/capture/songs.json)

## 实际启动与导出

从 .29 构建，清单 1,433 项逐项核验，新清单 SHA-256 为 `1e71af956e0c9e3a87e223bc6b5c84a338b86c5855d94377932462dd584d5320`。直接运行发布目录自己的 XML.exe，使用临时档案、只读输入的本地副本、离屏窗口、静音和独立调试管道。打开《in Silence / in Siren》，读到 12 条轨，延迟补偿为 0，在 226.000 秒取得 1920×1080 实际窗口帧，进程正常退出。日常入口仍指向 .22。[发行核验](round3/package/package-verification.json) · [原包高画质运行记录](round3/media/window-high/export.json)

成包渲染器和真实曲目在晴天、雨天及标题与歌手同时滚动三种场景，顺播 13 帧后与拖回、重建和导出目标比较，9 项逐像素相同。另用同包的隔离副本驱动 XML 的 1080p 导出按钮，自动选存盘位置、截取歌曲 225–228 秒并保留编码前帧。FFprobe 确认视频为 1920×1080、H.264、30 fps、90 帧，有 AAC 音轨。第 30 帧对应歌曲 226 秒。**原包高画质播放画布与编码前帧完全一致，2,073,600 个像素中差异为 0。** 自动档播放启用较低成本的雨玻璃效果，与导出的整窗 RGB 均差为 0.105/255，顶屏仍逐像素一致。编码前与视频解码后的均差为 5.29/255。手机图用解码帧。[实际导出帧](phone-3/13-decoded-1080p.jpg) · [3 秒样片](round3/media/rain-clip/cabin-1080p.mp4) · [视频与像素核对](round3/media/rain-clip/comparison.json) · [顺播、拖动与重建核对](round3/capture/frames.json)

整窗原画幅另见 [1123×778](phone-3/05-window-1123x778.jpg)、[1440×778](phone-3/06-window-1440x778.jpg)、[1707×1067](phone-3/07-window-1707x1067.jpg)、[2560×1600](phone-3/08-window-2560x1600.jpg)、[3441×1440](phone-3/09-window-3441x1440.jpg) 和 [1440×900](phone-3/14-clear.jpg)。14 张手机图均为宽 1080 的成图。超长的日文歌名仍会被静帧截断，超宽整窗缩到手机宽时歌手行最难看清。物理手机上的亮度、屏幕缩放，以及整首歌曲的导出没有实测。

## 帧耗时

Radeon 890M / D3D11，同机 Chrome 158，两个版本均从各自发行包加载。八种画幅，高画质，每个天气和版本各取四轮 96 帧，AB / BA 交替，共 12,288 帧。绘制计时到调用返回，整帧间隔取相邻动画回调。每格为 P50 / P95，单位 ms。按 0.1 ms 精度，16 种条件中有 16 种整帧中位间隔相同，整帧 P95 最多增加 0.1 ms。个别尺寸的绘制调用用时更长，例如 2560×1600 雨天首测从 8.3 升至 9.4 ms。

| 画幅 | 天气 | .29 绘制 | .30 绘制 | .29 帧间隔 | .30 帧间隔 |
|---|---|---:|---:|---:|---:|
| [1440×900](round3/performance/1440x900.json) | 晴 | 1.6 / 2.4 | 1.6 / 2.2 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1440×900](round3/performance/1440x900.json) | 雨 | 6.7 / 10.3 | 6.7 / 10.2 | 8.4 / 8.6 | 8.4 / 8.6 |
| [1123×778](round3/performance/1123x778.json) | 晴 | 1.8 / 2.8 | 1.9 / 2.8 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1123×778](round3/performance/1123x778.json) | 雨 | 4.6 / 6.1 | 5.2 / 8.9 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1440×778](round3/performance/1440x778.json) | 晴 | 2.0 / 2.7 | 2.0 / 3.0 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1440×778](round3/performance/1440x778.json) | 雨 | 7.1 / 9.4 | 7.1 / 8.8 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1707×1067](round3/performance/1707x1067.json) | 晴 | 2.7 / 4.4 | 2.9 / 4.7 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1707×1067](round3/performance/1707x1067.json) | 雨 | 7.2 / 10.5 | 7.4 / 11.7 | 8.4 / 16.8 | 8.4 / 16.8 |
| [2560×1600](round3/performance/2560x1600.json) | 晴 | 3.7 / 5.8 | 3.6 / 5.4 | 16.7 / 16.8 | 16.7 / 16.9 |
| [2560×1600](round3/performance/2560x1600.json) | 雨 | 8.3 / 10.7 | 9.4 / 12.7 | 25.0 / 25.2 | 25.0 / 25.2 |
| [3441×1440](round3/performance/3441x1440.json) | 晴 | 4.8 / 7.1 | 4.7 / 7.2 | 16.7 / 17.0 | 16.7 / 17.1 |
| [3441×1440](round3/performance/3441x1440.json) | 雨 | 10.2 / 13.6 | 9.7 / 12.0 | 25.1 / 33.5 | 25.1 / 33.4 |
| [1920×1080](round3/performance/1920x1080.json) | 晴 | 3.1 / 4.6 | 3.4 / 5.1 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1920×1080](round3/performance/1920x1080.json) | 雨 | 7.8 / 12.4 | 8.7 / 11.8 | 8.5 / 16.8 | 8.5 / 16.8 |
| [3840×2160](round3/performance/3840x2160.json) | 晴 | 4.0 / 6.1 | 3.9 / 5.5 | 25.2 / 33.6 | 25.2 / 33.5 |
| [3840×2160](round3/performance/3840x2160.json) | 雨 | 8.5 / 10.8 | 9.0 / 12.3 | 41.8 / 42.6 | 41.8 / 42.6 |

雨天另将新版放在第一轮先测，六轮、每轮 144 帧，四种画幅共 6,912 帧。原生 4K 高画质雨天两版均超过 30 fps 的 33.3 ms 预算。点击画幅可查看逐帧采样。[耗时汇总](round3/performance/summary.json)

| 画幅 | 天气 | .29 绘制 | .30 绘制 | .29 帧间隔 | .30 帧间隔 |
|---|---|---:|---:|---:|---:|
| [1123×778](round3/performance/1123x778-recheck.json) | 雨 | 4.5 / 6.0 | 4.4 / 6.0 | 8.4 / 8.5 | 8.4 / 8.5 |
| [1920×1080](round3/performance/1920x1080-recheck.json) | 雨 | 7.6 / 11.3 | 7.1 / 9.6 | 8.5 / 16.8 | 8.4 / 16.8 |
| [2560×1600](round3/performance/2560x1600-recheck.json) | 雨 | 8.3 / 12.3 | 8.3 / 12.0 | 25.0 / 25.2 | 25.0 / 25.2 |
| [3840×2160](round3/performance/3840x2160-recheck.json) | 雨 | 8.9 / 13.6 | 8.7 / 11.9 | 41.9 / 50.2 | 41.8 / 50.2 |

## 相对 .29 的变更

开工前记录 2,090 项指纹。工作树中改了两个产品文件和三个测试文件。发行包另更新版本资源、说明及清单。[基线](round3/baseline-sha256.json) · [逐文件指纹](round3/changed-files.json)

| 文件 | 函数或测试 |
|---|---|
| `source/scoreview/score-terrain-led.js` | `headerRows`、`headerParts`、`headerModel`、`drawHeader`、`overlay`、`clearCaches`。原合排的 `titleRow` 拆成 `textLine`、`headerLines`、`paintLine`。`routeLamps` 共用线路灯逻辑，`clearRegion` 取代全屏逐点遮罩。静止文字进底板，滚动文字、时间区、线路区各自复用缓存。 |
| `source/scoreview/score-terrain.js` | `layout` 设定屏高、窗洞与统一投影。`paintCabinShell` 调整安装壳和压条。`carriage` 使用新框高，并在无段落时显示时钟。现有四面与窗帘绘制函数从新窗洞坐标取值。 |
| `source/scoreview/tests/terrain-led.test.cjs` | 行位、亮度、两组独立滚动与端点停留、静态歌名、缺失字段、六首歌的宽度表、局部重绘与缓存复用。 |
| `source/scoreview/tests/terrain-window.test.cjs` | .29 的可见面积预算、固定下沿、上方玻璃和两条轨头。 |
| `source/scoreview/tests/terrain.test.cjs` | 顶屏和歌词机的避让断言改用可见窗洞边界，保留横向时距和世界坐标断言。 |

**工程测试为两套通过、一套受限。** ScoreView 共 624 项，通过 623，原有的历史素材用例跳过 1 项。XML 完整退出码为 0。XLD 完整 `npm test` 在 `midi-delete.cjs` 建立 NTFS 目录联接时收到 EPERM。继续运行后续 80 条命令，78 条通过，`storage.cjs` 的目录联接和 `midi-export.cjs` 的硬链接同样收到 EPERM。自动审批拒绝在正常 Windows 权限下重跑 XLD。三个用例仍待该权限环境核验。[ScoreView](round3/scoreview-test.log) · [XML](round3/xml-test.log) · [XLD 完整运行](round3/xld-test.log) · [XLD 后续逐项记录](round3/xld-rest-short-temp.log)

### ScoreView 日志尾部

```text
✔ several wind instruments apart: one icon each, numbered; together: one lane, one icon (3.8613ms)
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (0.4868ms)
ℹ tests 624
ℹ suites 0
ℹ pass 623
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 27087.1726
```

### XML 日志尾部

```text
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61.7913
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
```

### XLD 日志尾部

```text
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\round3\scratch\test-xld\xld-midi-delete-DgU7oC\outside' -> 'D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\round3\scratch\test-xld\xld-midi-delete-DgU7oC\album\track\midi\strings\a69b3931-db49-484b-98d6-3e90c64c4625'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'D:\\Projects\\Xin-Music-Lab-Fusion\\work\\terrain-cabin-20261125\\round3\\scratch\\test-xld\\xld-midi-delete-DgU7oC\\outside',
  dest: 'D:\\Projects\\Xin-Music-Lab-Fusion\\work\\terrain-cabin-20261125\\round3\\scratch\\test-xld\\xld-midi-delete-DgU7oC\\album\\track\\midi\\strings\\a69b3931-db49-484b-98d6-3e90c64c4625'
}
```

---

# 车窗地貌 · 车厢 A 返工 · terrain.29

车窗现在有四个可见的内侧面。1440×900 的右侧和下侧分别露出 19.75、17.00 px，左侧和上侧露出 11.50、11.90 px。晴天右下偏暖，左上压暗，圆角处能看到墙面折入窗洞的棱。两幅帘肩挂回墙侧，侧边往布绑处弯，过了布绑再向台面展开。歌词机回到 terrain.27 的尺寸，机身、按键和脚垫都在木台面上。

**先看[三版晴天同帧](phone-2/01-three-versions.jpg)，再看[雨天整窗](phone-2/03-rain.jpg)和[歌词机局部](phone-2/15-lyric-machine.jpg)。** 独立试版可从 [XML.exe](../../releases/0.5.0-dev.terrain.29/XML.exe) 启动。[全部 16 张手机图](phone-2/)

## 可见风景、四边宽度和歌词机

相对 terrain.27，1440×900 减少了 3.27%–3.30% 的可见风景。其余画幅的最大损失为 4.69%，出现在 3441×1440。面积使用固定歌曲数据在实际画布逐像素比较，玻璃和前景的透明度阈值均为 50%。三档画质各测两个时点，226 秒给歌词机输入文字，280 秒留空。下方手机图另用实曲播放画面。在八种画幅的 48 次测量里，37% 竖线扣除横档后均有 0 行结构遮挡。[完整像素计数](round2/metrics/terrain29.json) · [.27 对照](round2/metrics/terrain27.json)

下表的可见像素取高画质 226 秒。损失范围和帘＋横档遮挡上限覆盖两时点、三档画质。四边宽度取窗洞直边中段从墙棱到胶条之间的可用绘制宽度，以画布逻辑像素记。圆角和布帘遮住的部分另计在实帧图中。

| 画幅 | .27 → .29 高画质可见像素 | 风景损失 | 帘＋横档占玻璃上限 | 左 / 上 / 右 / 下净宽（px） | 歌词机比例 |
|---|---:|---:|---:|---:|---:|
| 1440×900 | 838,658 → 811,007 | 3.27–3.30% | 0.78% | 11.50 / 11.90 / 19.75 / 17.00 | 100% |
| 1123×778 | 570,536 → 568,360 | 0.36–0.38% | 0.69% | 8.97 / 9.28 / 15.40 / 13.26 | 100% |
| 1440×778 | 742,287 → 713,063 | 3.92–3.94% | 0.72% | 9.94 / 10.29 / 17.07 / 14.70 | 100% |
| 1707×1067 | 1,178,838 → 1,141,561 | 3.14–3.30% | 0.65% | 13.63 / 14.11 / 23.41 / 20.15 | 100% |
| 2560×1600 | 2,652,976 → 2,565,759 | 3.26–3.44% | 0.75% | 20.44 / 21.16 / 35.11 / 30.22 | 100% |
| 3441×1440 | 3,400,511 → 3,242,948 | 4.57–4.69% | 0.75% | 18.40 / 19.04 / 31.60 / 27.20 | 100% |
| 1920×1080 | 1,366,301 → 1,314,181 | 3.79–3.81% | 0.65% | 13.80 / 14.28 / 23.70 / 20.40 | 100% |
| 3840×2160 | 5,468,656 → 5,266,453 | 3.68–3.70% | 0.71% | 27.60 / 28.56 / 47.40 / 40.80 | 100% |

1440×900 下，台面从 y=815.00 延伸到 897.90，按键描边最高处为 815.50，脚垫最低处为 896.15。先把台面前沿以下的留边从 6.5 px 压到 2.1 px，再将玻璃下沿从 827 px 移到 792 px。窗外垂直投影随窗洞收短，山、道床与铁轨共用同一个纵向变换。横向投影和歌曲时间到横坐标的换算沿用 .27。两条轨头位于 y=778.73 和 788.39，近轨距玻璃下沿 3.61 px。[各画幅机脚、轨头和窗台坐标](round2/geometry.json)

## 整窗与局部

| 类别 | 图片 |
|---|---|
| 同帧对照 | [.27 / .28 / .29，晴天 3:46](phone-2/01-three-versions.jpg) |
| 整窗天气 | [晴天](phone-2/02-clear.jpg) · [雨天](phone-2/03-rain.jpg) · [雪天](phone-2/04-snow.jpg) · [沙尘](phone-2/05-sandstorm.jpg) |
| 整窗画幅 | [1123×778](phone-2/06-window-1123x778.jpg) · [1440×778](phone-2/07-window-1440x778.jpg) · [1707×1067](phone-2/08-window-1707x1067.jpg) · [2560×1600](phone-2/09-window-2560x1600.jpg) · [3441×1440](phone-2/10-window-3441x1440.jpg) |
| 结构局部 | [窗洞右下角](phone-2/11-lower-right.jpg) · [窗洞左上角](phone-2/12-upper-left.jpg) · [左帘](phone-2/13-left-curtain.jpg) · [右帘](phone-2/14-right-curtain.jpg) · [歌词机](phone-2/15-lyric-machine.jpg) |
| 视频导出 | [1080p 导出解码帧](phone-2/16-decoded-1080p.jpg) |

窗帘沿用 .27 的左右两张布面原画。绘制时沿各自的弧形轮廓重新铺布，在上下两段另画有宽窄差的明暗褶面，布绑斜绕过束腰。1440×900 下，左帘在上沿、布绑、下摆的宽度为 78.75、31、91 px，右帘为 74.75、33、88 px。帘布、墙上投影和帘脚接触影在静态画布生成时画一次。反光强度沿用 0.065，右上高光的位置跟随新的玻璃边界。壁板接缝维持原有画法。

把整张 1440×900 画面缩到宽 1080 后，晴天仍能一眼分出上沿的暗面和下沿的亮面。雨天的下沿转冷，右肩贴帘处的侧面和贴近道床的两道轨头最容易看淡。左右帘的布绑和下摆仍可辨认。图 13、14 同时保留全幅帘形与收腰局部。

在同一歌曲时刻，取四个内侧面裸露直段的像素测量亮度。下表为 8 位 sRGB 的 Y′ 中位数（0–255）。四种天气里，右、下两面分别都比左、上亮。晴天的最小明暗差为 37.83，雨天仍有 21.42。[取样坐标、截图指纹和整窗观察](round2/capture/phone-evidence.json)

| 天气 | 上 | 左 | 右 | 下 |
|---|---:|---:|---:|---:|
| 晴 | 56.51 | 77.72 | 115.55 | 139.32 |
| 雨 | 43.09 | 55.37 | 76.79 | 90.14 |
| 雪 | 52.37 | 70.37 | 99.89 | 125.00 |
| 沙尘 | 52.37 | 67.51 | 93.00 | 109.54 |

四种天气另做了时间一致性验收。用同一真实曲目顺播 13 帧到 226 秒，再从 280 秒拖回、重建画布、在导出绘制目标上重画。每项与顺播末帧逐像素对照，四种天气共 12 项，每项均为 0 / 324,000 像素变化。截图用打包后的成品脚本和素材，顺播对照尺寸为 720×450。[逐项绘制记录](round2/capture/final/report.json)

## 独立包、播放和导出

从 .28 的 1,433 项文件清单构建 .29。新版清单 SHA-256 为 `1db3149ef565a2c8323c47e85f2c4e15377553a783abe0c515c34534207509fe`。源码、成包脚本及面积验收使用的渲染器 SHA-256 都是 `cf044e287e00077bea1d01a11600030a9f50a322d674ab44548362a8f4a498eb`。交付前再次核对 .27、.28、.29，每版清单中的 1,433 项均通过，目录内多余文件为 0。日常启动指针为 terrain.22。[包清单与程序版本核验](round2/package/package-verification.json) · [三版交付时文件核验](round2/verified-releases.json)

发布目录自己的 `XML.exe` 以临时档案、离屏和静音启动，独立调试管道无需占用 TCP 端口。打开《in Silence / in Siren》后返回 12 条轨道，雨天在 226.000 秒暂停，延迟补偿为 0，画布为 1920×1080。首次直接观察导出窗口时，调试管道在订阅事件时超时。当时已取得原包窗口和画布，程序随后以 0 退出。[原包启动记录](round2/media/rain-window/export.json) · [真实窗口](round2/media/rain-window/XML-window.png)

导出沿用上一轮的隔离验证方法。从同一成包复制临时运行目录，自动填写存盘位置、将验收区间限为歌曲 225–228 秒，并记录编码前的帧。车厢渲染器与发布版指纹相同，两次运行的播放画布逐像素相同。点击 XML 的 1080p 导出按钮，写出了 1920×1080、H.264 / AAC、30 fps 的 90 帧样片。FFprobe 定位到视频时间 1.000000 秒，即从 0 起算的第 30 帧，对应歌曲 226 秒。播放画布与编码前帧的 RGB 平均绝对误差为 0.114/255。编码前与视频解码后的均差为 5.337/255，PSNR 30.84 dB。手机图 16 用这张视频解码原图制作。这里实际导出的区间为 3 秒。[1080p 样片](round2/media/rain-clip/cabin-1080p.mp4) · [解码原图](round2/media/rain-clip/decoded.png) · [逐像素比较和视频参数](round2/media/rain-clip/comparison.json)

## 帧耗时

同机 Radeon 890M / D3D11，比较 .28 与 .29 的发布版脚本。八种画幅、三档画质，分别测晴天 226 秒和雨天 280 秒。每种条件用两对相反顺序采样，每次 96 帧，共 18,432 帧。下表单位为毫秒，每格依次列 P50 / P95。绘制调用计到函数返回，整帧间隔按同一轮相邻动画回调的时间差计算。[完整 48 组对照](round2/performance/RESULTS.md)

| 播放条件 | .28 绘制 | .29 绘制 | .28 帧间隔 | .29 帧间隔 |
|---|---:|---:|---:|---:|
| 1440×900，高，晴 | 2.5 / 3.7 | 2.6 / 3.8 | 9.6 / 10.2 | 9.5 / 10.1 |
| 1440×900，高，雨 | 6.9 / 8.2 | 6.9 / 8.7 | 9.8 / 10.3 | 9.7 / 10.3 |
| 3840×2160，高，晴 | 5.4 / 6.9 | 5.1 / 5.9 | 29.6 / 30.8 | 29.2 / 30.5 |
| 3840×2160，高，雨 | 12.6 / 14.9 | 13.2 / 15.9 | 40.3 / 50.1 | 39.8 / 49.6 |

按 0.1 ms 精度，整帧中位间隔有 19 组缩短、18 组持平、11 组变长，差值为 −0.5 至 +0.4 ms。整帧 P95 最多增加 0.2 ms。单次绘制 P50 有 28 组增加，48 组的中位差为 +0.1 ms。此次采样未发现整帧持续变慢，个别条件的绘制尾部增加。

结束其他截图和编码后，对四组雨天条件反转首测版本，分别加测四对，每次 144 帧。超宽高画质的帧间隔 P95 两版都是 41.8 ms，绘制 P95 从 15.7 升至 18.5 ms。原生 4K 高画质雨天的帧间隔中位数为 50.5 → 50.3 ms，两版都超过 30 fps 对应的 33.3 ms。4K 自动档按相同画质预算实际绘制 1920×1080。下表各行链接保留本次独立复测的逐帧数据。

| 雨天复测 | .28 绘制 | .29 绘制 | .28 帧间隔 | .29 帧间隔 |
|---|---:|---:|---:|---:|
| [1123×778，自动](round2/performance/recheck-1123x778-auto-rain.md) | 7.4 / 10.6 | 7.0 / 10.0 | 8.4 / 16.8 | 8.4 / 16.7 |
| [3441×1440，高](round2/performance/recheck-3441x1440-high-rain.md) | 9.0 / 15.7 | 9.4 / 18.5 | 33.5 / 41.8 | 33.4 / 41.8 |
| [3840×2160，自动](round2/performance/recheck-3840x2160-auto-rain.md) | 11.8 / 16.5 | 12.1 / 16.2 | 16.8 / 25.0 | 16.7 / 24.8 |
| [3840×2160，高](round2/performance/recheck-3840x2160-high-rain.md) | 12.4 / 16.7 | 12.0 / 16.3 | 50.5 / 59.1 | 50.3 / 58.9 |

## 源码范围与验收边界

基线覆盖 2,080 个文件，包含开工时另行记录的两项日常启动脚本。与 .28 对照，产品工作树只有下表两项发生变化。成包中的另一组差异是版本说明、元数据以及两个可执行文件的版本资源。新增图片、字体与纹理为 0 字节。[基线指纹](round2/baseline-sha256.json) · [修改清单](round2/changed-files.json)

| 文件 | 改动 |
|---|---|
| `source/scoreview/score-terrain.js` | `layout`、`summary`、`makeRasters`、`transomOf`、`draw` 统一使用新的垂直映射。`cabinFaces`、`paintCabinShell`、`paintCarriageLighting` 画四面、棱线和天气返光。`drawVfdDeck` 与布局共用实体按键/脚垫边界。`curtainShapes`、`curtainSilhouette`、`makeCabinDrapes`、`paintCabinDrape`、`paintDrapeTexture`、`paintClothTie`、`cloth`、`paintDrapeFolds` 和 `drapeCurve` 更新两幅帘的轮廓、纹理、束带与投影。 |
| `source/scoreview/tests/terrain-window.test.cjs` | 现有窗洞、横档、轨头和台面断言跟随真实投影，新增四面净宽和明暗、各画幅整机/显示区尺寸、两幅帘束腰比上沿和下摆窄三项回归测试。 |

本轮自行定下的是四边的具体宽度、两侧不相同的布绑高度和布褶曲线、支撑整机所需的台面深度。所有画幅都放下了 100% 的歌词机。最紧的是近轨和台面前沿。1440×900 的近轨距玻璃仅 3.61 px，机脚到台面前沿仅 1.75 px，缩小整窗会先丢失这两道细缝。手机验收使用了宽 1080 的成图，尚未在物理手机屏幕上评估压缩和亮度。

## 工程测试

三套 `npm test` 均以 0 退出。ScoreView 的 620 项里有 619 项通过，1 项依赖历史分析素材的用例按原条件跳过。XLD 用 Windows 正常权限创建临时 NTFS 联接，上一轮未跑通的两个测试随整套通过。XML 与 ScoreView 并发运行的一次，旧动态缓存回退测试读取到空结果。单独复查 6 项全过，再跑完整 XML 套件也通过。该项不涉及车厢源码。[ScoreView 全日志](round2/scoreview-test.log) · [XML 全日志](round2/xml-test.log) · [XLD 全日志](round2/xld-test.log) · [XML 并发运行记录](round2/xml-concurrent-test.log)

### ScoreView 日志尾部

```text
✔ several wind instruments apart: one icon each, numbered; together: one lane, one icon (8.2917ms)
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (1.2305ms)
ℹ tests 620
ℹ suites 0
ℹ pass 619
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 32609.5259
```

### XML 日志尾部

```text
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 63.8194
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
```

### XLD 日志尾部

```text
multi MIDI: PASS (92 concurrent notes, one clock, parent/child M/S union, smooth gain, focus stability, loops, drafts and version invalidation)
hybrid audio: PASS (PCM, stale identity, complementary replacement, no overlap, shared clock, fractional loops, cancellation, bounded long-song cache, underrun stops)
hybrid mix: PASS (union, unique parent WAV, MIDI substitution, same position, presets, M/S, stop)
note shape: PASS (read-only preview, selection rules, overlaps, split minimum, identities, stale preview, single undo/redo)
track layout: PASS (view-only order, group/child identity, folding, restoration and missing rows)
PASS: strings 50 ms default/raw identities, legacy cache invalidation without damage, old-version activation and kept history
PASS: optional tempo MIDI read/digest, exact export, protected destinations, path rejection, safe deletion/retention and source/default preservation
score layers: service run through a stand-in interpreter is checked on POSIX only (spawn cannot start a .cmd); the rest runs here
score layers: PASS (startable engines, own result files, cache on unchanged stems, no buttons in XLD)
score vocals: PASS (current by stem identity and stored split, stale on stem change, service cache / rerun / refusal, missing add-on said, vocals-rmvpe refused without a current line and fed the judged bytes, no singing = no run, vocals a part in the 转谱 panel and the one-click plan, vocals row = MIDI run else read-only line, lead + backing rows)
```

---

# 车窗地貌 · 车厢 A · terrain.28

正视窗已做成有进深的圆角窗洞。晴天下可以顺着右侧受光面看到木窗台和道口下方的两条铁轨，歌词机的按键、机身、脚垫全部落在玻璃以下。1440×900 的可见风景比 terrain.27 增加约 0.9%，八种画幅中损失最多的是 3441×1440，约 0.17%。

本机的 48 组播放对照中，帧间隔中位数有 19 组缩短、29 组持平。4K 高画质暴雨从 75.3 降到 41.9 毫秒，依然超过 30 fps 帧预算。XLD 的 Windows 目录联接测试是当前完整验收的阻塞项。[逐组帧耗时](performance/RESULTS.md)

Windows 下按 **Win + R**，贴入对应的一行并回车即可打开。

| 用途 | 本机路径 |
|---|---|
| 看新旧同帧、局部和视频解码图 | `D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\review.html` |
| 直接启动独立试版 | `D:\Projects\Xin-Music-Lab-Fusion\releases\0.5.0-dev.terrain.28\XML.exe` |
| 手机图原文件 | `D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\phone-1` |

## 美术取舍

- 壁板采用偏灰的暖色，木压条下沿和壁板接缝分别给出水平与竖直参照。顶屏沿用原有琥珀色点阵和排版，深色安装壳贴着窗楣落影。
- 窗洞上下左右有独立的受光面。上边和左边压暗，晴天斜阳在右壁和下沿形成有明确边界的光斑。雨天转为冷灰反光，雪天反光偏蓝白，沙尘天偏赭。布帘绘在照亮的台面之上，帘脚挡光，墙和台面分别接住它的影子。
- 保留原水粉纹理，两侧使用不同的收腰、布褶与下摆，布绳绕过褶子。绑好的帘子静止。窗台由木顶面、金属前沿和暗面组成。
- 歌词机居中，整机等比缩至旧版的 68%。保留青色荧光、硬件与原来的显示逻辑。机底向右投出短影，两只脚各有接触影。在 1440×900 下，玻璃下沿为 827 px，台面从 836.5 到 893.5 px，轨头在 814.3 和 824.5 px。第一稿玻璃止于 806 px，实帧检查发现会截去铁轨，最终按轨头位置返工。
- 玻璃为对侧顶饰留了一道淡反光。默认强度为 0.065，淡光集中在右上窗格。图 13 对照同帧默认值和零强度。现有玻璃尘纹和雨滴由各自的渲染层绘制。

## 逐像素验收

按相同画质、大小和歌曲时刻比较两版。以实际物理像素计数，玻璃边界与结构遮挡都采用 50% 透明度阈值。分别合成窗洞、横档、帘和带脚垫的歌词机，再计算玻璃内的可见面积。取 226 秒和 280 秒，覆盖原版帘摆的两个相位以及歌词机的歌词、待机两种显示状态。面积模型固定歌曲数据，四天气美术图另用实曲。下表负的损失率表示新版可见面积增加。

| 画幅 | .27 高画质可见像素，226／280 秒 | .28 高画质可见像素 | 三档两时点的损失率 | 新版帘＋横档占玻璃上限 |
|---|---:|---:|---:|---:|
| 1440×900 | 838,658／838,435 | 846,307 | −0.939% 至 −0.912% | 1.000% |
| 1123×778 | 570,536／570,401 | 587,510 | −2.999% 至 −2.975% | 1.089% |
| 1440×778 | 742,287／742,150 | 744,334 | −0.294% 至 −0.276% | 1.061% |
| 1707×1067 | 1,178,838／1,178,526 | 1,188,836 | −0.875% 至 −0.746% | 1.008% |
| 2560×1600 | 2,652,976／2,652,277 | 2,674,519 | −0.839% 至 −0.745% | 0.964% |
| 3441×1440 | 3,400,511／3,399,912 | 3,394,884 | +0.020% 至 +0.165% | 0.904% |
| 1920×1080 导出 | 1,366,301／1,365,950 | 1,372,339 | −0.468% 至 −0.442% | 0.975% |
| 3840×2160 导出 | 5,468,656／5,467,411 | 5,499,459 | −0.586% 至 −0.563% | 0.905% |

8 种画幅 × 3 种画质 × 2 个时点，画宽 37% 的玻璃内部在扣除横档后均有 **0 行实物遮挡**。也独立核对了原播放器用于山脉与沿线事件的入场列。节能和自动档按产品的实际光栅测量，完整像素数、抗锯齿边界、光栅尺寸和阈值见 `metrics/README.md`、`metrics/terrain27.json`、`metrics/cabin-a.json`。

## 文件、素材与独立试版

开工前记录了 2,074 个文件的 SHA-256。工作树原有的天气渲染器与正式 .27 的地貌主脚本一致，SHA-256 为 `613ec0361944527076d48a6fd7bccd561b9764f99a1f550d5e5b99749a66f29b`。本批工作树对照见 `baseline-sha256.json` 和 `changed-files.json`。

| 本批源码 | 涉及内容 |
|---|---|
| `source/scoreview/score-terrain.js` | `layout`、`scene`、`timeAt` 区分真实玻璃与旧外景投影。外景仍沿用 `refCurtainPlace / refCurtainEntry / refCurtainShapes`。 `makeRasters`、`makeCabinReflection`、`paintCabinShell`、`paintCarriageLighting`、`makeCabinDrapes / drawCabinDrapes`、`curtainShapes`、`paintCabinCurtains`、`cloth`、`paintClothTie`、`drawCabinSunMotes` 和 `draw` 实现分层及天气光。 `drawVfdDeck / paintVfdSpill` 调整台面支承与接触影。 |
| `source/scoreview/tests/terrain-window.test.cjs` | 覆盖 .27 风景面积下限、外景坐标、两条轨头、横档、玻璃中两条验收列，以及歌词机按键描边和脚垫都在台面内。 |

新增车厢图片、字体、纹理共 **0 字节**。已有水粉帘布、墙板、帘杆和胶片纹理继续由原有整套加载器提供。窗洞与接缝、材料干刷、帘褶、布绑和反光在本地光栅化。唯一变动的已发行业务脚本从 253,833 减至 253,188 字节。成包另更新版本元数据、可执行文件的版本标识与说明。

包清单校验 1,433 项，清单 SHA-256 为 `349e37e48216d56b7f5668b7dfc366b2dbd189722fbe2edc0e902c1108e307a4`。包内地貌脚本为 `5725ca22e689b776c5f2f46abb724d7773e95758cb9ea218b7faa6b471d11cd0`，与完成验收的源码相同。发布入口仍指向 terrain.22。真实分析数据用于读取，独立试版的离屏、静音验证使用隔离档案及数据副本。

## 同帧、拖动与冷启动

手机图 01–04 用《in Silence / in Siren》3 分 46 秒道口画面，同天气并列 .27 和 .28。05–09 是五种实际窗口画幅，10–12 放大窗角、布绑和歌词机，13 是玻璃反光开关。原始分辨率截图与逐图指纹在 `phone-qa`。

在 720×450 上逐像素比对最后连续 13 帧走到 226 秒、跳到 280 秒再拖回、重建乐曲及画布，以及设定相同光学画质的导出目标。四天气各组均为 **0／324,000** 像素差。另启干净浏览器时，晴、雪、沙尘的 PNG 指纹与顺播完全相同。雨天有 333 个像素只差 1 个通道级，集中在窗外左侧；同法测 .27 为 337 个。单独关闭雨玻璃后仍有 311 个，差异来自窗外底图或大气合成。车壁、窗框、两块屏和歌词机均逐像素一致。

强度 0.065 的反光在 1440×900 只影响右上玻璃的 3,197 个像素，最大单通道变化 7／255。小屏上直接看整图很难辨出这道反光，图 13 给出了同一块玻璃的开关放大。窄窗口的竖向接缝主要露在窗楣两端和布绑周边，歌词机的文字也随整机缩小。第一轮美术验收建议同时看图 01 和图 10–12。

## 真窗口与 1080p 视频

独立运行 .28 自带的 `XML.exe`，实曲进入 12 轨模型，关闭播放延迟，在 1920×1080 的雨天窗口定位到 226.000 秒。另用同版本的隔离 QA 副本走产品导出按钮、WebCodecs 和封装链。副本自动回答保存对话框、截取歌曲 225–228 秒并留存编码前的目标帧。它生成了 90 帧、30 fps 的 H.264 视频和 AAC 音轨。

图 14 左侧是真窗口，右侧是从 MP4 按 PTS 30,000／30,000 秒解码出的第 31 帧，对应歌曲 3 分 46 秒。编码前到解码后的 RGB 平均绝对误差为 5.49／255，PSNR 为 30.57 dB。视频文件为 `release-qa/0.5.0-dev.terrain.28/rain-clip/cabin-1080p.mp4`。

真窗口和编码前帧也分别做了比较。车壁／窗台区 407,578 像素、顶屏区 249,006 像素、歌词机区 28,800 像素，三个区域均为 **0 差异**。窗口与导出页的整幅雨景仍有细微差异，RGB 平均绝对误差为 0.118／255、最大 43；其中 449,563 个差异像素在玻璃的风景和降雨区域，横档占 227 个且每通道最多差 1。相同渲染条件下的顺播／拖动结果与上述真实导出链分别记录。细分见 `qa/window-export-regions.json` 和 `release-qa/0.5.0-dev.terrain.28/rain-clip/comparison.json`。

四组 .27／.28 同帧图还独立检查了横跨 37% 竖线的一块山景。四组均在零位移处吻合。雨、雪、沙尘的 93,096 个比对像素完全一致，晴天有 154 个像素相差 1 个通道级。Windows Edge 已直接从本地打开 `review.html`，验证了导出对照页及 14 张图片的文件名、解码尺寸。结果见 `qa/delivery-check.json`。

## 播放帧耗时

在本机 Radeon 890M 上使用 Edge 的 D3D11 后端，分别加载 `.27` 和 `.28` 试版包里的播放器脚本。《in Silence / in Siren》的晴天取 3:46，暴雨取 4:40，每段沿相同的 96 个歌曲时刻推进。播放使用原曲的能量和分轨电平，打开玻璃雨滴效果，路侧打击装饰关闭，歌词机处于待机状态。

每种画幅、画质和天气按 `.27 → .28 → .28 → .27` 的顺序对照。每轮先预热 12 帧，再记录每次 `draw()` 返回的耗时，以及两次浏览器动画回调之间的间隔。前者包含脚本及绘图调用可能遇到的等待，后者还受合成与刷新节奏影响。试版视频的编码速度单独于这组播放数据。自动和省电档以播放器实际分配的像素数计算，大窗口的实际画布可小于窗口标称尺寸。

8 种画幅 × 3 档画质 × 2 种天气，共 **48 组、18,432 帧**。按 0.1 毫秒比较，播放帧间隔中位数有 19 组缩短、29 组持平。第 95 百分位有 30 组缩短、16 组持平、2 组增加 0.1 毫秒。单独看绘制调用，37 组中位数缩短、3 组持平、8 组增加，最大增幅 1.3 毫秒。下表均为高画质。完整表含每组实际画布尺寸及两轮相对差异。[全部 48 组](performance/RESULTS.md) · [逐帧数据](performance/comparison.json)

| 画幅及天气 | 绘制中位数 .27 → .28，毫秒 | 帧间隔中位数 .27 → .28，毫秒 | 帧间隔 P95 .27 → .28，毫秒 |
|---|---:|---:|---:|
| 1440×900 晴 | 2.1 → 1.9 | 8.4 → 8.4 | 8.5 → 8.5 |
| 1440×900 暴雨 | 8.2 → 6.5 | 16.7 → 8.4 | 16.9 → 8.5 |
| 1920×1080 暴雨 | 10.8 → 7.5 | 25.0 → 8.5 | 25.3 → 16.9 |
| 3441×1440 暴雨 | 10.8 → 10.5 | 48.9 → 25.2 | 50.4 → 33.6 |
| 3840×2160 晴 | 4.2 → 3.9 | 33.4 → 33.1 | 33.9 → 33.6 |
| 3840×2160 暴雨 | 9.9 → 8.3 | 75.3 → 41.9 | 83.4 → 50.2 |

原生 4K 暴雨改善最大，.28 的帧间隔中位数仍高于 30 fps 对应的 33.3 毫秒。同样的 4K 窗口切为自动档，播放器实际绘制 1920×1080，这一段的中位数为 8.5 毫秒。另取 3441×1440 高画质，先跑新版再跑旧版，4:40 的雪段和沙尘段从 .27 的 41.9、41.8 毫秒降到 .28 的 25.0、24.8 毫秒。[雪与沙尘逐帧数据](performance/verify-snow-sand.json)

晴天的绘制耗时对轮次较敏感。1707×1067 高画质主测的中位差为 +1.3 毫秒，先跑新版、每版改测四轮 144 帧后为 −0.3 毫秒。1080p 高画质在先期对照、主测和四轮反序复测中分别为 +0.7、−0.2 和 −0.3 毫秒，三次的帧间隔中位数均为两版 8.4 毫秒。主测中仅有的两项帧间隔 P95 增幅出现在 1080p 晴天自动和省电档，各为 0.1 毫秒。反序复测分别为 +0.1 和 0.0 毫秒。[1707 复测](performance/verify-1707-clear.json) · [1080p 高画质先期测量](performance/gpu-1920.json) · [高画质复测](performance/verify-1080-clear.json) · [自动及省电复测](performance/verify-1080-tails.json)

在仓库根目录运行 `node work/terrain-cabin-20261125/performance/matrix.cjs` 会补算缺项、检查两个试版的脚本指纹与采样条件，并汇合完整记录。`node work/terrain-cabin-20261125/performance/summarize.cjs` 可由逐帧数据重新生成统计表。

## 工程测试

本轮重新运行三套 `npm test`。ScoreView 退出码为 0，共 617 项，616 项通过，依赖历史分析数据的 1 项按既有条件跳过。XML 退出码为 0。成包清单的 1,433 项重新校验通过，14 张对照图的宽度与四种天气的山景配准也复核通过。[ScoreView 日志](qa/recheck-scoreview.log) · [XML 日志](qa/recheck-xml.log) · [包校验](release-qa/package-verification.json)

**XLD 全套退出码为 1。** `midi-delete.cjs:29` 与 `storage.cjs:37` 都在创建测试用的 NTFS 目录联接时收到 Windows 的 `EPERM`。系统默认临时目录和项目内的临时目录均可复现。XLD 共 113 条测试及语法检查命令，32 条在首个阻塞前通过，后续 80 条中有 79 条通过独立复核。文件硬链接测试 `midi-export.cjs` 首次在项目临时目录受限，使用系统默认临时目录后通过原断言。余下两项目录联接测试仍待在有相应权限的 Windows 环境验证。[XLD 全套日志](qa/recheck-xld.log) · [后续 80 条命令](qa/recheck-xld-rest.log) · [MIDI 导出复核](qa/recheck-midi-export.log) · [MIDI 删除复核](qa/recheck-default-midi-delete.log) · [存储复核](qa/recheck-default-storage.log)

### ScoreView 原样尾部

```text
✔ several wind instruments apart: one icon each, numbered; together: one lane, one icon (20.4555ms)
✔ the adapter names wind instruments: by GM program, by MuScriptor name, else the stem with the raw name (0.7519ms)
ℹ tests 617
ℹ suites 0
ℹ pass 616
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 30052.35
```

### XML 原样尾部

```text
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 89.0793
score radar wait: PASS (holds the last frame until the radar / the terrain pictures are ready, two seconds at most; other looks at once)
score terrain settings: PASS (terrain-only, defaults, storage migration, track changes and the export snapshot)
```

### XLD 原样尾部

```text
result sweep: ok (fragments discriminate where coverage and segment count do not; unreadable and failed results stay visible; unlisted directories warn)
source hygiene: ok (243 files, no stray control characters)
MuScriptor strings PASS: three independent caches, target invalidation, source restore, baseline activation
Error: EPERM: operation not permitted, symlink 'D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\qa\tmp-xld\xld-midi-delete-sWvKWM\outside' -> 'D:\Projects\Xin-Music-Lab-Fusion\work\terrain-cabin-20261125\qa\tmp-xld\xld-midi-delete-sWvKWM\album\track\midi\strings\09a24ba1-11a2-4c0d-a4a7-cd14a8677ac9'
    at async Object.symlink (node:internal/fs/promises:1059:10)
    at async D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline\tests\midi-delete.cjs:29:164 {
  errno: -4048,
  code: 'EPERM',
  syscall: 'symlink',
  path: 'D:\\Projects\\Xin-Music-Lab-Fusion\\work\\terrain-cabin-20261125\\qa\\tmp-xld\\xld-midi-delete-sWvKWM\\outside',
  dest: 'D:\\Projects\\Xin-Music-Lab-Fusion\\work\\terrain-cabin-20261125\\qa\\tmp-xld\\xld-midi-delete-sWvKWM\\album\\track\\midi\\strings\\09a24ba1-11a2-4c0d-a4a7-cd14a8677ac9'
}
```
