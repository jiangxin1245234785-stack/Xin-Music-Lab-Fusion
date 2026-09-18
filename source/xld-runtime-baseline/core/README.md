# XLD 分析核心

XLD 拥有音乐分析，XML 拥有音乐可视化。XML 可以嵌入调用 XLD 核心，不需要先打开 XLD 窗口。

analysis-service.cjs 提供 createService({xldRoot, stableXldRoot, analysisRoot, buildManifest?})，不依赖 Electron。实例提供 run(track, engine, options, onTask)、task()、cancel()、setAnalysisRoot()、readStems() 和 readMidi()。一个实例同时只执行一个任务，先保留任务再执行异步操作。XLD 的段落、和弦、分轨、MIDI 均经同一实例运行；XML 的旧服务入口仅重新导出这个实现。

derived-assets.cjs 拥有 Track 目录定位以及 WAV/MIDI 清单读取、有效性校验。source/shared-analysis/derived-assets.cjs 保留兼容导出。MIDI 绑定源分轨 runId；重新分轨后旧 MIDI 不作为当前结果。清单、源文件和人工标签结构不变。

分轨和 MIDI CLI 位于 ../analysis-separation/runner.py 和 ../analysis-midi/runner.py。XML 旧 CLI 路径只转发到这里。MIDI 模型与新增环境见 ../analysis-midi/README.md；SongFormer/MSAF/和弦脚本继续复用已安装 XLD 运行时。

buildManifest 是宿主已有结果导出的可选回调，XLD 用它保留原来的 Music Lab 导出行为。导出失败返回 integrationWarning，已经成功的分析文件保留；核心默认导出同一版本的 music-lab.json。

本轮没有跨进程任务协调。分别打开 XML 和 XLD 时，各宿主有自己的核心实例，不能据此宣称两个程序之间也实现了任务互斥。新增分轨和 MIDI 的主操作入口在 XLD，XML 保留方便可视化使用的调用入口。

检查：在 XLD 开发目录执行 npm test；tests/generation-electron-smoke.cjs 验证真实分轨、转谱、取消、段落和和弦，并要求设置隔离的 XLD_OWNERSHIP_TEST_ROOT。


## 窗口间选曲请求

open-request.cjs 提供 writeRequest(root, request) 和 consumeRequest(root)。XML 只向当前共享分析目录的 .xml-open-request.json 写一次请求；通过临时文件原子替换，XLD 通过原子领取一次消费。只保留最新选曲，无任务队列。XLD 的窗口单实例锁仅管理同一配置目录的 XLD 窗口，不改变上面的分析服务边界。

MIDI 多模型：midiEngines() 提供就绪状态；run 的 engine 取 analysis-midi/models.json 中支持该声部且未退休的条目。readMidi(track, stem, engine?) 省略 engine 时读取当前结果；指定 engine 则读取该模型独立缓存并兼容旧清单。模型合同由 analysis-midi/models.json 统一提供。

MIDI 版本记录（core.25 起）：readMidi 返回的 ok 表示结果完整并绑定当前来源，matches 表示由该 engine 当前模型版本生成；只有 matches 为 true 的结果才在 run 的缓存分支中免推理复用，ok 但 matches 为 false 的结果仍可查看、打开目录并按当前选择参与融合。derived-assets 的 midi.verify 是宽松校验（返回 identity 与 matches），midi.validate 保持严格语义与原错误码，供 runner 输出提升与缓存复用使用。每次运行的记录在 midi/<stem>/runs/<runId>.json，promoteResult 直接写到这里；listMidiRuns(track, stem, engine?) 只读列出全部运行及状态 current / superseded / source-changed / files-missing / invalid。成功重算只替换同版本的上一次运行，不同版本保留。详见 ../analysis-midi/README.md。

分轨多模型：separationEngines() 提供可用状态，run 的 engine 支持 demucs-6s、bs-roformer-sw；readStems(track, engine?) 可读当前或指定模型缓存。derived-assets 提供 stemsManifestPath/activateStems，保留单一 stems.json 当前入口。MIDI 按 sourceRunId 保留全部模型变体与来源内的当前选择，切回原分轨可恢复。XML 的便捷入口沿用当前模型，首次生成按可用默认选择；更换模型在 XLD 中完成。模型清单位于 analysis-separation/models.json。
