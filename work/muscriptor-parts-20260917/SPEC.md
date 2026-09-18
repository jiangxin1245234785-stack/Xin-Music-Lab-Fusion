# MuScriptor 弦乐与鼓试听开发版
1. 输入：现有基础 drums WAV / 已选 Mega 整曲 strings WAV；保持母曲时间。
2. 增加两类声部的 Medium / Large 备选，YourMT3+ / ADTOF 默认保留。
3. 不更改已验收吉他、piano、bass参数和缓存；不加入其他模型或依赖。
4. 每声部/模型/音源独立缓存；沿用单轨、一键、融合、目录、回收站。
5. 弦乐按来源目标约束乐器组；输出沿用来源弦乐音色；鼓保留GM鼓键/通道10，导出100ms击打音符并在同键下次击打前截断。
6. Medium batch4 / Large batch1；新弦乐/鼓Large采用官方float16权重加载（CPU仍float32），吉他保持原状；greedy CFG1 no-prelude，失败取消保留已有结果。
7. GUI沿用紧凑模型卡片，默认/备选；增加清晰的速度/质量说明。
8. 复用现有Windows Electron壳与独立Python/权重附件，无新增打包依赖。
9. 真实MEGURI短段三模型对比与完整流程检查；听感由用户判断。
10. 交付新本机开发版并附试听页，旧版本/用户原始数据保留；不宣称干净VM发行验收。
11. v2 backlog：OaF鼓力度模型、默认模型变更、额外训练/后处理。

