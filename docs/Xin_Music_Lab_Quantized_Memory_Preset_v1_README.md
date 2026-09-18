# Quantized Memory / 量化记忆 v1

这是一版只验证时间语法的实验预设，没有新增极坐标折叠 shader。

## 时间层级

- 每个有效 onset 推进一次视觉脉冲。
- 每 2 次脉冲重新抽取方块位移方向。
- 每 4 次脉冲重新抽取 RGB 分离角度。
- 每 8 次脉冲重新抽取反馈旋转偏向。
- 每 16 次脉冲重新抽取损伤块尺度。
- 每 128 次产生一个长周期 `superCycle`，本版暂未直接映射到强效果。

所有保持状态都使用 preset seed 和 NodeGraph sample-and-hold，可复现。

## 音乐职责

- `bassPeak`：方块生成与轻微反馈冲击。
- `onset`：短促 RGB 分离；18% 概率产生白色撕裂。
- `flux`：颗粒对比度。
- `flatness`：颗粒密度。
- `sectionDrive` / `buildEnergy`：反馈记忆量与衰减速度。

这些音乐信号没有被压成一个通用 beat strength。

## 试看片判断

先观察三件事：

1. 破坏方向是否形成可记忆的短动机，而不是每帧乱跳。
2. 第 8/16 次脉冲附近是否能感到结构层级。
3. 高 retention/decay 是否让事件留下后果，同时不把画面糊满。

如果时间逻辑成立但空间形态仍单薄，下一步再加入原创 Polar Feedback pass。

## 当前状态

- 源码内置预设 ID：`quantized-memory`
- Preset schema：16
- 完整测试：315/315 通过
- 可见本地预览：通过，浏览器控制台 0 error
- 正式安装目录：未部署
