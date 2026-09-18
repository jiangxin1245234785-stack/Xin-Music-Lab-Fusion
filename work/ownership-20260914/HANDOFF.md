# XML / XLD 职责纠正交接

当前阶段：2026-09-14，源码迁移及真实流程验证完成。XML 0.5.0-dev.stems.4，XLD 0.5.0-dev.core.1。

用户明确纠正：XML 的设计目的是音乐可视化；分轨和转谱应属于 XLD，与段落、和弦分析同属本地分析能力。上一轮“XML 生成、XLD 只读取”是过渡实现，已被本轮决策取代。SPEC.md 是本轮范围。

实现与文件地图：
- source/xld-runtime-baseline/core/analysis-service.cjs 拥有所有分析执行和任务状态；desktop/main.cjs 的 runAnalysis、assets:run 均调用同一个实例，避免 XLD 内存在两套任务流程。
- core/derived-assets.cjs 拥有目录和清单读取；旧 shared-analysis 模块只作兼容导出。
- XLD analysis-separation/runner.py、analysis-midi/runner.py 和 requirements.lock 是分轨/MIDI 实现与依赖的维护位置，模型算法未改变。
- XML desktop/xld-analysis-service.cjs 只重新导出 XLD 核心；旧 Python CLI 只转发调用。XML 的分轨、转谱快捷入口保留，实际能力归 XLD。
- XLD derived-controls.js 新增分轨、生成 MIDI 和重新生成选项。结果默认复用；进度及取消复用原任务卡。界面将曲目、分轨、共用任务放在段落/和弦工作台之前。
- XML 侧原任务回归脚本改为调用 XLD 中维护的回归套件。单元测试中的进程替身现在装载核心真正的源码位置。

不变量：Track ID、磁盘目录身份、stems/MIDI 清单和 music-lab/2 合同保持；失败或取消保留旧结果，人工标签独立；XML 原可视化及分轨试听逻辑保留；安装产品、Python 环境和模型不改动。

验证：两边完整 npm test；核心归属、跨类型任务互斥、早期取消、重试、SongFormer 局部分析保留、异常输出、MIDI 旧源失效检查。真实测试取 LAST WALTZ 中 30 秒，独立测试曲库和配置：从 XLD UI 生成六轨 WAV，bass MIDI 62 音符；缓存、重新生成、MIDI/段落互斥、取消及保留旧 MIDI、重试；真实 SongFormer 与 CENS+HPSS；XML 读取同一输出且人工标签字节不变。两边原真实分轨试听、35 秒定位和重开检查通过。MIDI 音符质量仍需人听辨。

测试过程：首次 Electron 在沙箱中 GPU 子进程无法启动，改用经授权的隔离桌面测试。首次完整流程最后的跨端断言误把不含 filePath 的 renderer Track 传给核心，测试改为从该曲 fileUrl 还原路径；实际 XML 主进程原本提供 filePath。修正后完整流程通过，未因此修改产品音频或目录逻辑。

边界：统一执行器限于一个宿主进程。XML 与 XLD 同时运行仍各有实例；没有常驻服务、跨应用队列或跨进程锁。本次是本机开发版，不是重新打包的安装产品。Python/模型按 README 复用安装目录，MIDI 环境位于 D:\Caches\codex\runtimes\xld-midi。

入口：source/xld-runtime-baseline/start-dev.cmd；XML source/fusion-runtime-baseline/start-dev.cmd 中的「高级评测台」也打开这个 XLD。项目目录 D:\Projects\Xin-Music-Lab-Fusion。

测试命令：两个桌面源码目录各执行 npm test；XLD Electron tests/generation-electron-smoke.cjs 使用 XLD_OWNERSHIP_TEST_ROOT；tests/derived-electron-smoke.cjs 使用 XLD_DERIVED_FIXTURE/OUTPUT；XML tests/stems-electron-smoke.cjs 使用 STEM_SMOKE_INPUT/OUTPUT（回归读取时 STEM_SMOKE_RERUN=0，MIDI_SMOKE=0）。本任务 work/ownership 下保存隔离数据、日志和截图，outputs 中提供用户说明。

下一步：用户通过 XLD 日常分轨/转谱并用 XML 可视化；按实际体验再决定是否需要进一步收起 XML 中的分析操作，或增加跨进程协调。不要重新把生成归属写成 XML。
