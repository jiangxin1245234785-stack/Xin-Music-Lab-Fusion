# 分轨 v1 交接

阶段：首版开发闭环已跑通，待用户试听和真实曲库使用反馈；不发布安装版。

范围：单曲、单任务、六声部 float32 WAV、独立 stems.json、XML 内试听与取文件。完整规格见 SPEC.md。

已完成：即时占用任务、准备期取消、启动失败释放、局部 SongFormer 继承旧结果、追加任务日志；独立 Demucs runner；分轨/重新分轨、音轨选择、打开输出目录。

关键决策：复用已安装 XLD AI 环境；六轨模型为 htdemucs_6s，权重缓存在 D:\Caches\codex\models\xld；不修改主时间线契约。只保留当前成功结果，旧文件被占用时清理可延后。不同程序暂不共享锁。

文件：desktop/xld-analysis-service.cjs 负责任务与清单；analysis-separation/runner.py 负责音频；stem-controls.js 负责试听；desktop/main.cjs / preload.cjs 负责 IPC；tests/xld-analysis-task-regression.cjs 与 tests/stems-electron-smoke.cjs 负责关键回归。

验证：npm test 通过；新增任务回归通过；真实 LAST WALTZ（211.515 秒）六轨生成、44.1 kHz/双声道/FLOAT/9327818 帧与有限采样校验通过；再次请求命中缓存。Electron 实际音频试听、35 秒定位、原曲切回、重新加载和界面可见性通过。时间线是测试 fixture；不将此次测试写成 SongFormer 真实推理验收。

测试：npm run test:analysis；npm test。界面测试使用已生成 preview-result.json 作为 STEM_SMOKE_INPUT，并设置 STEM_SMOKE_OUTPUT，使用本机 Electron 执行 tests/stems-electron-smoke.cjs。STEM_SMOKE_RERUN=1 会重新生成测试曲目的分轨并更新该输入清单。

测试环境记录：普通隐藏 Electron 窗口中的合成动画停在初始状态，最小 CSS 探针后改用 offscreen 绘制完成截图；不通过修改产品 CSS 绕过断言。

不变量：原音频、人工标签、安装目录和既有视觉语义保留。开发代码统一写回 D:\Projects\Xin-Music-Lab-Fusion\source\fusion-runtime-baseline。

已知限制：钢琴/吉他实际分离质量未获人工试听确认；仅一首完整曲目通过，更多编配素材待试。跨程序并发、曲尾历史问题、旧 /1 迁移仍属待办。首版依赖本机现有 Python/Electron，不是独立安装包。

下一步：用户在开发版选曲试听，优先反馈 piano / guitar 是否可用；据反馈选第二组素材或调整模型。继续按小迭代修复，不扩展混音台或 MIDI。


2026-09-13 后续：用户已确认分轨质量可以接受。当前构建 0.5.0-dev.stems.2，新增单轨 MIDI，见 work/midi-20260913/HANDOFF.md。旧测试的版号约束已修正，完整 npm test 重新通过。MIDI 质量仍需单独验收。
