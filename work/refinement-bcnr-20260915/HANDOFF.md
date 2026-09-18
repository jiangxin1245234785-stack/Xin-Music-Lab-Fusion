# XLD other 弦乐细分 — RC.6

## 当前阶段
2026-09-15：完成本机功能实现、真实 BCNR 片段推理、实际 EXE 界面及旧功能回归，发布个人试用候选版。用户已确认以自己的机器为当前验收范围；未做干净 Windows 再分发验收。

## 范围与决策
- XLD 分轨页内新增“细分”，读取当前启用的 other，起点可选，每次最多 30 秒。
- AudioSep 默认“弦乐组”，备选“小提琴倾向”。同一模型的两种固定文字条件，界面明确称预设；尚未证明哪种更好。
- 三路试听：原始 other / 弦乐 / 剩余音频；可取消、单独保留、打开目录。相同来源、模型和片段复用缓存。
- 原分轨、既有 MIDI、XML 消费边界不变。不自动加入一键 MIDI，不支持弦乐转谱或整曲细分。
- SAM Audio 权重访问受限，Banquet 未集成；不展示未实现模型。
- 复用现有 highres Python，约 156 MB 的推理权重/固定条件放在 runtime/addons/audiosep-v1，不安装额外依赖。

## 文件地图
- source/xld-runtime-baseline/analysis-refine：CLI/模块、预设、上游 MIT 推理代码和说明。
- core/refinement.cjs：来源校验、缓存、保留与独立输出；analysis-service.cjs：现有任务队列/取消接入。
- refinement-controls.js：界面；desktop/main.cjs、preload.cjs：受限 IPC。
- source/shared-analysis/runtime-config.cjs：可选模型目录；release-tools：配置和环境检查。
- 本目录 prepare_audiosep.py / download_models.py：权重来源及固定条件导出过程。
- artifacts/refinement-bcnr-20260915/listening/BCNR-弦乐试听.html：三段离线试听及各 WAV。

## 不变量
不覆盖原 other，不写用户现有分析缓存，不更换现有分轨/MIDI算法。结果保留原采样率、声道、帧数和时间原点。target + residual 重建输入仅证明数值关系，不能证明弦乐分离正确。

## 验证
- XLD / XML 原有测试通过；新增 refinement 测试覆盖来源/模型/片段隔离、保留、异常路径、取消和处理期间来源变化。
- BCNR Besties 60–90 秒、Two Horses 90–120 秒、For the Cold Country 180–210 秒：两个预设分别作用于原混音和 other，共 12 次真实 GPU 推理完成。
- 所有试听输出有限值、帧数/采样率/声道匹配，残差重建检查通过；32/44.1/48 kHz 非整段边界检查通过。
- 实际 XLD 窗口：生成、试听切换保持位置、避免主播放器同时发声、保留/目录可用、切换预设与歌曲、取消及缓存恢复通过。首轮失败由测试 pathTitle 与扫描器身份不一致引起，仅修正测试数据。
- RC.6 两个实际 EXE、帮助/版本、已有一键 MIDI 目录和 XML 交接回归通过；环境检查 8 组通过。

## 已知局限与下一步
先由用户试听确认，尚无人工确认的无弦乐音乐负例。Two Horses 的 other 提取能量接近整个输入，可能混入大量非弦乐，不能把出文件当作成功分离。32 kHz 单声道模型逐左右声道推理；立体声像、瞬态与分块衔接仍需试听。保留 FLOAT WAV，不逐文件归一化。下一步按听感决定预设/模型调整，再考虑整曲及转谱，暂不扩展到 WEG glitch 分类。

## 复验入口
XLD 源码 npm test；release-tools/test.cjs、test-diagnostics.cjs、test-release-shell.cjs；check-runtime.cjs 和 verify.cjs。test-refinement-ui.cjs 使用隔离 fixture/profile，真实 GUI 测试需能创建 Electron/GPU 子进程。已归档报告和截图在 artifacts/refinement-bcnr-20260915。
