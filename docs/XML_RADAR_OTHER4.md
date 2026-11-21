# XML 雷达接续记录 · other.4

2026-11-21。谱面主线在 other.3 的第四路合成声部基础上，合入电传罩、parts.4 六项修复、可更换曲名牌和拍数读窗。后续从当前 `source/` 打包即可继承这些改动。工作目录里的 parts.4 镜像和 other.3 铭牌小样用于历史对照。双击根目录的“启动XML.cmd”会读取 `releases/current-release.cmd`。

| 部位 | 主线行为 | 可复验的位置 |
| --- | --- | --- |
| 电传打印头 | 右罩内击印。40 毫秒的单次走纸中，先停纸接触约 10 毫秒，随后整条纸向左送出。字符及上排电码随纸一起显露；盘面受光固定，六个盘孔随送纸量转动。 | 《Space Oddity》204 秒后的 “Te”；《七里香》“窗外”的“外”及电码 1120。 |
| 电传铭牌 | TELEPRINTER 与双行说明之间固定一块曲名牌。新换的缎面白铜、旧的一字螺钉、右下局部擦亮的底座；长标题与中英混排按两孔之间的宽度排字。 | 《Xtal》《Space Oddity》《七里香》，播放器原尺寸。 |
| PPI 小节点选、加花灯、长音余辉 | 点选使用盘上实际画出的小节。FILL 从达到门槛的那次鼓击开始亮。一个长音的一段连续余辉只在实际起止处收口。 | 《七里香》29.613 秒点盘上 5，跳到 16.700 秒并显示 005·1。第 4 小节的第六击前灯灭，16.500 秒亮度 0.10。 |
| 其余 parts.4 细节 | 供纸盘固定受光，段落灯和 CAUTION 的字膜连续透光，鼓格的 THIS BAR／16 BEATS 标题按原尺寸可读。 | [六项量测记录](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/checks/offline.json) |
| BAR·BEAT 与 TRACK BEAT | 启用分段小节时，全曲有小节网格或候选小节就显示小节及拍位。若只有至少两个清理后的拍点，全曲切为 TRACK BEAT，首拍起从 001 累计。拖动按曲内位置取值，读窗沿用同一单位。拍点不足保留缺数。扫针和鼓格仍用原有播放时钟。 | 回归覆盖首拍前、恰好落拍、跳进跳出、关闭试用及无拍点。两种计数不会在同曲内交替。 |
| 分析结果和兼容表 | 全曲小节不稳定时，分析器保存模型实际输出的候选分组。读取时优先用本曲结果，兼容表只补旧记录。沿用原有试用开关和视频导出规则。 | [31 首既有检测输出回放](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/evidence/candidate-check.json)，7,576 组与旧表一致。对新曲的小节准确率尚无人工标注测量。 |
| other.3 声部路由 | 有直接合成轨时，雷达第四根拨杆选中实际的 other 音轨。 | [Xtal 实机记录](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/0.5.0-dev.other.4-verified/result.json) |

运行实现见[雷达绘制](../source/scoreview/score-radar.js)、[谱面分析器](../source/xld-runtime-baseline/analysis-score/runner.py)、[候选小节兼容读取](../source/fusion-runtime-baseline/desktop/fixture-meter.cjs)。[雷达回归](../source/scoreview/tests/radar-echo-post.test.cjs)随源码保存。[新版播放器点选与读数](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/checks/player/result.json)和[三曲截图](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa)由独立配置和分析副本生成。

实机逐毫秒取 118 帧英文、100 帧中文。击印停纸期间出纸侧的墨迹变化为零。原先用整数像素反推纸张位移时，1120 的重合率为 0.774，原线为 0.780。按实际小数像素位移采样，并对已验收旧帧使用同一方法，新版 e／1120／外得到 0.944／0.836／0.862，旧版为 0.941／0.854／0.863。三项首次显露时间与旧版一致。见[本版逐帧结果](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/ink-check.json)和[同方法的旧版对照](../work/score-depth-20261118/assets-gpt-2/integration-other4/qa/accepted-ink-check.json)。

GUITAR 出针槽、REGISTER 过 C4 的表面层次、左栏壳体刻字仍为待选外观小样。下次调整这三处时，从[原尺寸对比](../work/score-depth-20261118/assets-gpt-2/mechanics-samples/NOTES.md)继续。
