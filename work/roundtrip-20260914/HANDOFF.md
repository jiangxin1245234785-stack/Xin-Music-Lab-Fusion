# XML / XLD 往返使用交接

阶段：2026-09-14，使用流程收口。XML 0.5.0-dev.stems.5，XLD 0.5.0-dev.core.2。范围见 SPEC.md；保持 XLD 分析、XML 可视化的既定产品边界。

变化：XML 的分析面板默认显示试听音轨、WAV/MIDI 目录、更新结果与「在 XLD 中分析」入口。旧本机调用核心的按钮收在「分析选项」中，仍可用。曲库行的分析按钮也前往 XLD。中英文同步。

结果刷新：XML 新增 fusion:refresh-track 和 desktop/refresh-track.cjs。依照 XLD 的磁盘目录身份、旧显示名目录及已知 bridge 查找 music-lab.json，并沿用 XML manifest 身份/结构校验。选曲同样读取最新磁盘文件，避免继续使用扫描时缓存。返回焦点或手动刷新只读取当前曲目，不重扫音频库，不调用 acceptPayload 重新加载音频。更新分析时间线、可视化 provider、曲库分析标记和 WAV/MIDI 状态。播放位置、状态和当前有效声部保留；分轨替换或失效时回原曲并保持位置。加载序号防止旧刷新响应覆盖新选曲。损坏清单不替换当前结果。

交接：XLD core/open-request.cjs 负责一次性选曲请求写入/领取。XML 刷新 XLD 设置后，只向当前分析目录原子写入一次；不再向多个历史目录写重复请求。XLD 使用按配置目录区分的单实例窗口；第二次启动退出并唤起原窗口，通知 renderer 领取新选曲。XLD 启动、返回焦点也会领取。请求只改变选择，不播放或取消任务。曲库找不到该歌时提示刷新/检查曲库，不自动开展分析。

文件地图：XML fusion.js、stem-controls.js、index.html/style.css/i18n、desktop/main.cjs/preload.cjs/refresh-track.cjs；XLD desktop/main.cjs/preload.cjs、app.js/i18n、core/open-request.cjs。未更改模型或分析执行器。

验证：两边 npm test；新增 XML tests/refresh-track.cjs 与 XLD tests/open-request.cjs。隔离真实 Electron 主进程和界面测试通过：XML 实际写出选曲请求、折叠默认、焦点更新段落并保持 35 秒暂停、播放 bass 时手动更新、MIDI 文件变化、损坏清单保留、分轨失效回退、延迟响应与快速换曲。XLD 第二次实际启动退出、原窗口接收新选择、母曲在 35 秒暂停保持、语言跟随、请求一次性消费。真实 WAV/MIDI 使用隔离链接，时间线变化为测试清单，无新模型推理。

测试过程：XML 新清单读取的单元测试首次遗漏人工标签 id，被既有 validator 正确拒绝，修正测试后通过。快速换曲测试首次点击了列表容器，改点实际选曲按钮后通过。XLD i18n 静态测试改为检查拆出后的请求写入函数及时间戳，不再限定旧实现的字段相邻排列。窗口测试 XML_TEST/XLD_TEST 仅隐藏测试窗口并启用离屏截图；单实例测试通过 XLD_SINGLE_INSTANCE_TEST 显式开启真实锁。

不变量：分析仍由 XLD 核心提供，原模型/算法、清单合同、用户音频、人工校正文件与安装产品不改变；已有结果可继续使用。没有常驻服务、数据库、跨应用分析队列或跨进程分析锁。单实例只解决 XLD 多开窗口，不宣称 XML 与 XLD 的分析任务已跨程序互斥。

入口：原 source/fusion-runtime-baseline/start-dev.cmd 与 source/xld-runtime-baseline/start-dev.cmd 继续有效。首次使用请关闭旧开发窗口后重开，以加载新代码。原安装版不会自动更新。

测试命令：两个桌面目录各 npm test；XML tests/roundtrip-electron.cjs 使用 XML_ROUNDTRIP_ROOT；XLD 同名脚本使用 XLD_ROUNDTRIP_ROOT。本轮 work/roundtrip/fixture.json 定义隔离曲库与配置；两种 GUI 测试共享请求目录，应顺序运行。XML GUI 对启动命令作拦截以免打开用户窗口，但实际 IPC、请求文件和刷新逻辑运行；XLD GUI 则实际启动第二进程验证单实例。交付说明和截图在本任务 outputs。

下一步：实际使用这条往返流程；如需要结构性分析，先明确首个结构化结果与可视化用途。尚未实现 motif/loop/声部角色推断或歌曲比较；不要把分轨等同于完成结构分析。只有实际出现多程序分析冲突时，再考虑轻量协调。
