# Mega 53 整曲开发版

范围：XLD 0.5.0-dev.core.12 / 独立包 0.5.0-dev.mega1。默认 Mega / strings / full / auto，Bowed 与 AudioSep 保留 preview。只有 Mega 接受 full；仍从 other 提取单目标，不重新训练、同时输出 53 轨或进入 MIDI。

接口：run/read/keep/reveal 携带 scope。预览身份保持 version2/selected-head-v1，整曲身份额外带 scope=full；整曲起点与时长来自父 other，忽略隐藏的预览输入。旧 schema2 无 scope 视为 preview。新结果带 scope 与 playback，校验路径、长度、增益、峰值，整曲必须存在安全试听数据。

声音：原始 original/target/residual 为 FLOAT；计算全曲三路最大峰值，统一 gain=min(1,.95/maxPeak)。必要时生成 listen- 三路副本，read 返回其 urls，同时提供 rawUrls。原始文件未缩放或裁切；应用说明两类文件。不能把目标与残差再次叠加原 other，独立乐器目标也不能直接相加。

实测：Flowers of Romance 的完整 other，36,335,856 帧/44100 Hz/双声道，823.9423 秒。Mega 推理含加载 200.51 秒，完整任务约 217 秒，PyTorch 显存分配峰值 1410.9 MiB，无 OOM。三路 raw 峰值 1.1475/0.8460/1.0625，试听共用增益 .82786699，最高 .95。

验证：真实整曲逐块扫描，帧数/对齐/有限数值/重建/试听增益均通过。检查 164 个重叠边界，导出最大数值跳变三处的 8 秒对照，听感未自动判定。恒等模型经过实际拼接路径最大误差 1.2e-7（超短/非整块/多个分块长度）。真实另目标 CPU 子进程取消，未提交结果清理，原整曲/旧预览/cache/keep 保留均通过。XLD 全套 npm test、范围隔离、路径攻击/错误范围、控制器默认/切范围/切模型/取消/目录/试听/切歌逻辑通过。

界面测试为 DOM 控制器契约测试，不等同真实浏览器/桌面视觉验收。此前本地试听 HTML 自动浏览器访问被策略阻止，本轮不尝试绕过；交付程序与文件由用户正常打开验收。使用现有 Electron 发布工具，无新增依赖或权重；新包独立偏好，分析目录沿用之前的开发目录，旧版本不覆盖。

文件：analysis-refine/runner.py、profiles.json；core/refinement.cjs、analysis-service.cjs；desktop/main.cjs；refinement-controls.js/index.html/style.css/i18n；tests/refinement*.cjs。测试与试听材料位于 artifacts/mega-full-20260916。

未解决：第一轮分轨误归到其他声部的弦乐无法从 other 找回；其他乐器语义质量未普遍验收；更长文件的 RAM/磁盘用量随时长增长，当前目标是用户约 14 分钟曲目。取消不续算，重启重新计算未完成的整曲。不存在全曲质量“自动通过”。


交付完成：releases/0.5.0-dev.mega1 发布文件 2716 项哈希校验通过；9 组运行环境探测全部通过。整曲结果已迁移并按开发分析目录重建缓存，未自动标记为用户验收。试听页 3 个整曲与 9 个接缝音频引用、时长/声道/采样率检查通过。程序和数据均已就位。
