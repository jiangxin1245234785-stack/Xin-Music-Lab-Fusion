# Mega53 全目标接入

阶段：实现、真实推理与候选包检查完成；发布记录见 publish-plan.json / published-checks.json。

版本：XLD 0.5.0-dev.core.13，独立开发包 0.5.0-dev.mega2；XML 保持 stems.8。沿用 Electron + 独立 Python 和原权重，无新增依赖。RC.6、mega1 与原开发缓存保留。

范围：开放 Mega53 全部 53 个独立目标，六类筛选与“全部”；输入可选可信曲库原文件 mix（无需六轨）或当前 active 六轨之一。默认继续 other / 弓弦乐组 / full / auto。一次一个目标，full 或 preview 1–30 秒。Bowed 与 AudioSep 仅 other/preview。没有批量 53 轨、自动合并或 MIDI 新接入。

映射：analysis-refine/mega-targets.json 含全部 53 个 modelStem；profiles.json targets/targetMap 供 Python 执行。历史 UI id strings 继续映射 bowed_strings；新 strings-all 对应原始 strings。两者不能合并。完整配置与 catalog 一一对应，53 个选定输出头均与原模型同时输出对应轨对齐，短输入 FP32 最大误差 0。

接口：sourceStem 贯穿 renderer → IPC → core → runner → result/read/keep/reveal。非 mix 读取已有分轨；mix 通过 soundfile 无 torch 元数据探测，parentRunId=null。其他模型拒绝非 other。原曲路径仅从后台曲库索引取得。探测有 15 秒超时与最多 32 项按路径/大小/修改时间缓存；无新增 ffmpeg，解码不支持的格式直接报错。

缓存不变量：other 的历史 identity 字段顺序和内容不变。非 other 新增 sourceStem；mix 的 parentRunId=null。来源路径/大小/时间、模型 manifest、目标、设备、范围区分缓存。发布不改旧结果、不将试跑标记为用户已保留。取消不提交残留。各次独立目标可重叠，不作为互斥 53 轨相加；仅同一次 target + residual 重建输入。

声音：保留 FLOAT 原始输出与原输入率/声道；需要时三路共用 gain 保存 listen- 试听文件。真实 MEGURI（Resistance & The Blessing）497–527 秒原曲 48 kHz / 双声道，电吉他、原声吉他、吉他总类、synth、strings-all 五目标通过逐采样输入一致、帧数/有限值/重建/试听增益/峰值验证。模型含加载 11.72–17.66 秒，显存分配峰值 1410.9 MiB。片段由最大 30 秒均方能量选择，不声称是听感最狂暴片段或分离质量通过。

验证：XLD npm test 全套通过，新增来源隔离、raw 无父轨、缺轨/非法来源、53 映射、旧 cache identity、菜单来源/类别切换和目录 payload；全部 53 头实际等价性测试；真实 MEGURI 5 目标 service 子进程 + 缓存复用；真实 full CPU 取消清理；原 Flowers 整曲与90秒预览 cache读取；9组运行环境与发布工具检查通过。UI 为 DOM 控制器契约测试，不等同实际桌面视觉验收。没有绕过先前浏览器本地试听页访问阻止。按用户“自己机器没问题”，保持本机开发版范围，未声称干净 VM 验证。

文件地图：core/refinement.cjs（来源/探测/缓存）、analysis-refine/{runner.py,roformer.py,profiles.json,mega-targets.json}、desktop/main.cjs、core/analysis-service.cjs、refinement-controls.js、index.html、i18n/runtime-messages.js、tests/refinement*.cjs。已有 style.css 的两列及窄宽单列布局继续适用。发布说明与使用说明同步更新。

下一步：用户试听 MEGURI 的失真吉他/合成器边界，再决定引入专门模型。synth 不等于所有电子采样/glitch，electric-guitar 不等于失真专用模型。53 头语义质量没有逐类评测；full 原曲与长时 RAM/磁盘随长度增长，保留原单目标实现。

复现：npm test（source/xld-runtime-baseline）；已安装 roformer/python.exe test-heads.py、check-audio.py；Node test-runtime.cjs；发布 verify.cjs 和 check-runtime.cjs。不要直接重跑有“新目录”保护的发布脚本；publish-plan.json 留存目标与前后哈希，备份在原缓存工作区 before/。
