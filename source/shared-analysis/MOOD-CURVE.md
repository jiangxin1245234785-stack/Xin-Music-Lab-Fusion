# 情绪曲线文件与读取接口

XLD 在所选曲目的分析目录写入 `mood-curve.json`，与 `score-layers.json` 同级。文件内容为 UTF-8 JSON。一首歌独立计算，不依赖其他歌的分析结果。

| 字段 | 含义 |
| --- | --- |
| `kind`、`schemaVersion` | `mood-curve`、`1`。未知格式按不可读处理。 |
| `formulaVersion`、`scaleVersion`、`engineVersion` | 本版依次为 `mood-direct-1`、`mood-scale-1`、`1`。比较不同歌曲的绝对浓度时应使用同一公式和同一尺子。 |
| `identity`、`source` | 引擎版本和冻结参数表的 SHA-256。`source` 记录歌曲 ID、原曲路径、大小、纳秒修改时间，以及当前分轨 runId 和每条分轨的相对路径、大小、纳秒修改时间、增益。 |
| `duration`、`step` | 实际解码的采样帧数除以采样率得到真实时长，单位秒。步长 0.5 秒。共 `ceil(duration/step)+1` 个点，第 i 点位于 `min(i*step,duration)`。末段可以短于 0.5 秒。 |
| `fast`、`slow` | 0–1 的正式浓度。拟合分在居中的 2 秒、8 秒时间窗内按实际覆盖时长平均，再映射到固定分位表。 |
| `shape.fast`、`shape.slow` | 本曲拟合分先按 P5–P99 归一并在高位软压缩，再按相同时间窗平滑，仅表示本曲内的起伏。 |
| `loudnessMode` | `half` 表示整曲与伴奏各自 3 秒 LUFS 的算术平均。伴奏为当前所有非人声分轨乘各自增益后的逐通道音频和。没有伴奏轨时用 `mix`。有活动分轨清单但文件损坏时任务报错。 |
| `components` | 三个数组与正式线共用时间轴。`lufs` 是参与拟合的响度档，`band28Dbfs` 是混音实测 2 ≤ f < 8 kHz 电平，`logFlatness` 是混音频谱平坦度的常用对数。 |
| `belowFlatnessGate` | 半秒窗口中全体频谱帧都实测低于 −72 dBFS 的采样点下标。此时原始平坦度存 `null`。第三轮拟合对这种已测得的低电平有固定贡献，等价于拟合参数中的平坦度下界 −7。真正缺失的观测保持为空。 |

Node 用 `require('./mood-curve.js')`。浏览器加载同一文件后使用 `globalThis.XinMoodCurve`。两个入口只处理内存中的对象，调用方负责打开文件。`valid(record)` 在载入时核对格式。`at(record, seconds)` 以常数时间返回 `{fast, slow}`。

```js
const curve = require('./mood-curve.js');
const intensity = curve.at(record, 190.25);
```

恰好落在采样点时返回该点本身。位于两点之间时对每条线分别线性插值，有一个端点为空就返回 `null`。超出首尾、无效时间、缺文件或未知格式均返回 `{fast:null, slow:null}`。数值 0 是有效浓度。
