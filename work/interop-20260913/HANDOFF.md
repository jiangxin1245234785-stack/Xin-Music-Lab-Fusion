# XML / XLD 互通 v1 交接

阶段：首轮互通完成，可本机试用。XML 0.5.0-dev.stems.3；XLD 0.5.0-dev.shared.1。

目标与边界：XML 发起分轨和转谱，XLD 读取同一组现有文件。未加入共享任务队列、数据库、模型改动或 XLD 分轨启动入口。

实现：source/shared-analysis/derived-assets.cjs 统一目录、分轨和 MIDI 读取校验。XML 的内嵌服务改为调用它；desktop/midi-assets.cjs 只保留兼容导出。目录优先按磁盘路径元数据，兼容旧显示标题目录，避免嵌入标签不同导致双端找不到结果。XML 曲库记录补齐 pathArtist/pathAlbum/pathNumber/pathTitle。

XLD：source/xld-runtime-baseline 是新桌面开发副本。增加「分轨与 MIDI」区域，包括音轨选择、试听、刷新、WAV/MIDI 目录。单击选曲不播放；同曲切轨保留位置及暂停/播放状态；下一首回原曲；分轨过期或新版本替换后切回原曲，重新选择新声部。窗口重新获得焦点、选曲及手动刷新会重新读取。播放器仍使用母曲身份，页脚补充当前声部名。

运行：XLD 保留原 Beta 设置位置以共用曲库/分析目录。分析器与 Python 继续从已安装运行时读取，开发副本不复制或修改这些算法和模型。默认运行时 D:\Program Files\xin-local-deck-beta；原环境变量继续有效。开发启动器仅启动应用，不结束用户已有进程。XML 高级评测台优先启动开发副本，安装产品保持原样。

验证：XML 与 XLD 完整 npm test、共用目录/读取测试通过。真实 LAST WALTZ 分轨在双端返回相同 WAV URL 与 MIDI 目录。XLD 界面验证选曲不播放、bass 播放、piano 保持 35 秒及暂停、目录动作、失效回原曲、切歌、重开、语言切换、时间线/人工标签保留；XML 原有试听、定位、目录和重载回归通过。音频使用已有真实文件的测试链接，时间线/标签使用隔离 fixture；没有再次运行音乐分析模型。

测试记录：XLD 界面脚本最初误用内部 setLocalLocale，改成公开 setLocale 后通过。隐藏窗口截图需 XLD_TEST 下 offscreen 绘制才能反映最终 DOM；正常窗口不受影响。XML 目录动作检查由固定 100 ms 等待改为等待实际 IPC 完成，避免文件检查稍慢时误报。

已知边界：按当前共享分析资料库读取；迁移整库、跨目录导入的特殊 bridge、跨程序分析互斥仍不在本轮。分轨清单保持 v1，MIDI 音符质量仍待人工验收；本轮只优化数据复用与播放逻辑。

入口：source/fusion-runtime-baseline/start-dev.cmd；source/xld-runtime-baseline/start-dev.cmd。相关运行时与脚本位置见 XLD README。

测试：两个开发目录各执行 npm test；XLD Electron 用 tests/derived-electron-smoke.cjs 与 XLD_DERIVED_FIXTURE/OUTPUT；XML 沿用 tests/stems-electron-smoke.cjs。本轮报告与截图保存在本任务 work/interop，用户说明位于 outputs。

下一步：用户日常使用，优先反馈结果发现和试听逻辑；有实际需要再增加 XLD 发起分轨/转谱的入口。
