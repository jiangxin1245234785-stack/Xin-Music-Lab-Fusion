# XLD 开发版

版本：0.5.0-dev.core.8。位置：D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline。
双击 start-dev.cmd 或从 XML 开发版的「在 XLD 中分析」进入。沿用 Xin's Local Deck Beta 的曲库和分析目录设置；默认分析目录为 D:\Caches\Xin's Local Deck\Analysis。

XLD 负责音乐分析：分轨、MIDI、段落和和弦；XML 负责可视化，使用同一 XLD 核心。选择曲目后可以分轨、选声部试听、生成 bass/piano/guitar MIDI、打开目录。默认复用有效结果，需要重新计算时勾选「重新生成」。全部分析共用进度和取消；同曲切轨保持位置，播放新曲使用原曲。

core/analysis-service.cjs 是可导入执行器，core/derived-assets.cjs 负责结果；analysis-separation 和 analysis-midi 维护分轨/转谱 CLI。XML 的旧文件位置只保留兼容转发。分轨新增 BS-RoFormer SW 默认与 Demucs 6s 备选；MIDI 沿用按乐器选择的模型，段落与和弦逻辑未改，用户音频及已有输出目录不搬迁。XLD 的段落/和弦原有任务代码已改为调用此核心。

Python/模型继续使用现有安装：D:\Program Files\xin-local-deck-beta；MSAF Python 复用 D:\Program Files\xin-local-deck；Basic Pitch 使用 D:\Caches\codex\runtimes\xld-midi；专用转谱模型使用 D:\Caches\codex\runtimes\xld-midi-highres，权重位于 D:\Caches\codex\models\xld-midi-highres。支持 XLD_RUNTIME_ROOT、XLD_PYTHON、XLD_AI_PYTHON、XLD_HARMONY_PYTHON、XLD_MIDI_PYTHON 及原模型缓存变量。开发源码没有复制运行时环境，也没有覆盖安装产品。

同一配置目录复用一个 XLD 窗口。XML 再次打开 XLD 时，新选曲交给已有窗口，不自动播放或取消任务；切回 XML 后当前曲目结果自动更新。每个宿主拥有独立的分析服务实例，同一实例内各类任务互斥；没有跨应用任务队列或常驻服务。

检查：npm test。tests/generation-electron-smoke.cjs 使用隔离 XLD_OWNERSHIP_TEST_ROOT 执行真实模型；tests/derived-electron-smoke.cjs 用 XLD_DERIVED_FIXTURE/OUTPUT 检查已有结果试听。核心详情见 core/README.md；往返窗口测试 tests/roundtrip-electron.cjs 使用隔离 XLD_ROUNDTRIP_ROOT；交接见 ../../work/roundtrip-20260914/HANDOFF.md。

MIDI 默认按声部使用 HiRes Piano / GAPS Guitar / HiRes Bass，Basic Pitch 为备选。各模型独立缓存；生成或点击「使用此 MIDI」后 XML 使用该结果。模型与环境详情见 analysis-midi/README.md，最新交接见 ../../work/midi-models-20260914/HANDOFF.md。

分轨模型、独立缓存和长曲推理说明见 analysis-separation/README.md。新环境为 D:/Caches/codex/runtimes/xld-roformer；最新交接见 ../../work/weg-separation-20260914/HANDOFF.md。选择卡片只预选，生成/使用成功才激活；切回旧分轨会恢复其 MIDI。

默认进入工作台，曲库常驻左侧，按专辑/曲目浏览。工作台分为概览、段落、和弦、分轨、MIDI；段落与和弦的模型选择可展开。任务与播放器常驻，完成/失败/取消后可收起。概览汇总已有结果，人工标签不计入机器分析份数；恢复上次选曲但不自动播放。设计、文件地图与验收见 ../../work/xld-workspace-20260914/HANDOFF.md。界面测试：设置隔离的 XLD_WORKSPACE_TEST_ROOT 后运行 npm run test:workspace:ui；fixture.json 指向测试缓存及配置目录。

MIDI 工作区新增实验功能“MIDI 融合”：将当前 WAV 来源下已启用的至少两个 bass/piano/guitar MIDI 合成多轨文件，保留绝对时间与乐器；可打开文件或目录。输出单独保存在 midi/merged/，不覆盖单声部 MIDI。详见 ../../work/midi-merge-20260914/HANDOFF.md。

MIDI 页顶部“一键生成 MIDI”依次处理 bass、piano、guitar 后自动融合。使用各声部记住的模型或可用默认模型；默认复用缓存，“重新生成”重算三个 MIDI。需先完成 WAV 分轨；失败、取消或 WAV 来源改变时停止后续步骤，已完成结果保留。单声部转谱和独立融合仍可使用。详见 ../../work/midi-batch-20260914/HANDOFF.md；隔离界面验证设置 XLD_BATCH_TEST_ROOT 后运行 Electron tests/midi-batch-ui.cjs。
