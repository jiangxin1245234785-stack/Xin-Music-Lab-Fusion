# MIDI 多模型交接

阶段：2026-09-14，本机开发版多模型与面板排版完成。XML 0.5.0-dev.stems.6，XLD 0.5.0-dev.core.3。范围见 SPEC.md。

已定决策：采用已有高分辨率 CRNN 推理代码的三份乐器权重，分别用于钢琴、GAPS 吉他、贝斯；Basic Pitch 为通用备选。默认按声部选择已就绪的专用模型，用户选择按声部记忆。Aria 与 YourMT3 本轮未接入。模型来自作者公开仓库，代码、权重 revision 与 SHA256 已固定。接口维持简单模型表与独立 Python runner，没有插件系统。

界面：XLD 的分轨面板按 WAV / MIDI 分组，试听、生成、目录按钮对齐。MIDI 沿用现有 engine-card 选项样式，默认在前，备选在后；卡片显示可用/未就绪/缓存音符数量。缓存可点击「使用此 MIDI」更新 XML 当前结果。重新生成沿用一个复选框，任务进度与取消沿用原执行器。中英文、窄窗及大字号通过实际窗口检查；顶部按钮禁止换行以免大字号遮挡面板。

数据：core/derived-assets.cjs 按模型校验与缓存。midi/<stem>/<engine>.json 保存各模型，midi/<stem>.json 保存当前成功选择；旧 Basic Pitch 自动留档。失败、取消、模型不匹配不能替换当前结果；重分轨后旧缓存失效。各模型每次重做仍只保留该模型最近成功结果，其他模型独立保留。

文件地图：analysis-midi/models.json（共用模型合同）、runner.py（CLI/写出/校验）、highres.py（分块推理、拼接、解码）；core/analysis-service.cjs 与 derived-assets.cjs；desktop/main/preload 的 MIDI 模型和变体接口；derived-controls.js、index.html、style.css 与双语文案。XML 通过旧兼容适配器读取同一核心，仅版本与兼容性测试更新。

环境：新增 D:/Caches/codex/runtimes/xld-midi-highres，只读复用现有 XLD AI site-packages 的 CUDA/科学计算依赖，新增依赖锁见 analysis-midi/requirements-highres.lock；权重位于 D:/Caches/codex/models/xld-midi-highres。原 Basic Pitch 环境保留。缓存路径显式指向 D:/Caches/codex/cache/xld-midi-numba 与 xld-midi-matplotlib。本机环境并非独立安装包。

验证：两边完整 npm test 通过；新增 midi-models.cjs 验证旧结果保留、模型缓存隔离、切换、错误模型拒绝、取消与过期。真实 Radioactive Spell Wave 原曲 90–120 秒和已有分轨裁剪副本，GAPS Guitar 180 音符（9.219 秒）、HiRes Piano 26（7.812 秒）、HiRes Bass 95（6.219 秒）、Basic Pitch guitar 159（7.562 秒），时间为本机各 runner 内的单次实测。写出 MIDI 实际回读时间/音高校验通过；不是准确率指标。运行中取消在 12 秒后复核无迟到输出，保留已有模型结果和人工标签。

窗口验证：XLD 实际主进程、preload、renderer 中选择默认/备选、按模型打开目录、复用缓存、更换声部、记忆选择、播放位置保持、中英文与放大字号均通过。XML 实际界面读取 GAPS MIDI，切换到 Basic Pitch 后刷新目录和状态，保留 12 秒暂停位置。测试 shell.openPath 被拦截，只验证目标目录，不弹出用户窗口。

排查记录：初始模型检查卡在 numba 尝试访问共享安装目录的缓存；用 <30 行最小复现取得堆栈后指定可写缓存目录解决。期间尝试 meta device 初始化与 torchlibrosa 不兼容，已完全撤回，最终使用作者常规初始化和严格权重装载。新增 pretty_midi 首次真实运行缺 importlib_resources，补齐并锁定。界面测试最初依赖短暂完成文案、以及误用宿主语言报告接口，分别改用完成事件和实际语言按钮；产品相应行为正常。

不变量：XLD 拥有音乐分析，XML 拥有可视化；用户原音频、人工标签和安装产品不替换。分轨、段落、和弦模型未更换。无跨进程队列、批处理扩展或 MIDI 编辑器。

下一步：用户试听本轮对比样本和自己的完整声部；按具体误检/漏音反馈选择默认或调整一个参数。专用模型默认不等于质量验收；继续把自动音符视为机器结果。开发入口仍为两个 source/*/start-dev.cmd，需关闭旧开发窗口后重开。安装版未部署。
