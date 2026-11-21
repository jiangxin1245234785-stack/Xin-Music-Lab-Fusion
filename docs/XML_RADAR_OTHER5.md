# XML 雷达曲名牌 · other.5

2026-11-21。用户选定 other.4 对比图右列。正式实现已并入 `source/`，今后从主线打包。项目根目录的 `启动XML.cmd` 和 `启动XLD.cmd` 共读 `releases/current-release.cmd`。本次切到 `0.5.0-dev.other.5`，上一入口为 `0.5.0-dev.other.4`。既有仪器行为见 [other.4 接续记录](XML_RADAR_OTHER4.md)。

## 铭牌的排字和操作

- 电传机的白铜牌固定在两个原有螺钉之间。牌高 29 个设计单位。单行优先同时刻曲名和艺人，空间紧时优先保全曲名。长曲名改用窄体分两行，尽量在词或版本说明的边界换行。两个基线相隔 14 个设计单位，给上下行的字母留出空隙。
- 两行仍放不下时，牌面保留容得下的开头。多行铭牌以及省去部分署名的铭牌都可以点。详情一次显示曲目标签里的完整曲名和艺人，选择或复制文字均可。再次点铭牌、按 Esc 或点外面可收起。原尺寸和窄窗口都以实际画出来的铭牌定位，切歌或离开雷达会收起详情。
- 排字和铭牌位置由 [雷达画面](../source/scoreview/score-radar.js) 的 `fitPlateTitle` 和 `teleTitle` 管理。画面把实际铭牌边框交给 [谱面交互](../source/fusion-runtime-baseline/score-scene.js)。[播放器页面](../source/fusion-runtime-baseline/index.html) 提供原生按钮和非模态弹层，[样式](../source/fusion-runtime-baseline/score-layout.css) 让详情贴在铭牌上方。导出渲染与播放器共用铭牌画法，点击详情属于播放器界面。
- 详情从当前曲目原字段读取，禁止从两行短文反拼。点开和关闭详情时使用独立按钮，点画布收起时也要避免触发雷达的跳拍和声部独奏。接手改曲名牌时保留这两条交互约束。

## 实机验收

| 检查 | 结果 |
| --- | --- |
| 全库排版 | 正式包在标准 16∶10 画布上逐首绘制 371 条曲目。335 首一行显示完整曲名，35 首两行显示完整曲名，1 首显示两行开头。宽屏尺寸会改变两孔之间的可用宽度。 |
| 最长曲名 | Ciśnienie 的《My childhood was a period of waiting for the moment when I could send everyone and everything connected with it to hell》。在 1440 × 852 窗口中，点铭牌显示完整题名及艺人。详情位于铭牌上方，相距 7 像素，两者右沿对齐。800 × 620 下再点，详情仍在窗内。 |
| 播放连续 | 播放源为该曲原始 FLAC。连续执行打开、再次点铭牌收起、Esc 收起以及点雷达收起，进度从 0.545 秒走到 2.633 秒，音源和 1 倍速保持，暂停与跳转事件均为 0。暂停后重试，进度保持在 2.643 秒。切到地貌后铭牌按钮和详情均收起。 |
| 验收数据 | 这首歌在实机验收时使用独立分析目录，内含一枚测试钢琴音符以启用雷达。音频和署名都来自真实曲库。这枚音符只用于测试交互。 |
| 开发检查 | 谱面测试 577 项通过，1 项依赖分析目录的测试按原设置跳过。播放器原有测试命令通过。新旧包逐项比对 1,395 个文件，11 项变化，含 4 个界面实现文件及打包版本信息。 |

[完整播放器截图](../work/score-depth-20261118/assets-gpt-2/title-other5/qa/player-full.png) · [铭牌与详情原尺寸局部](../work/score-depth-20261118/assets-gpt-2/title-other5/qa/title-detail.png) · [交互及曲库实测](../work/score-depth-20261118/assets-gpt-2/title-other5/qa/result.json) · [两只程序的实启记录](../work/score-depth-20261118/assets-gpt-2/title-other5/qa/startup-verified.json) · [包差异](../work/score-depth-20261118/assets-gpt-2/title-other5/package-diff.json)
