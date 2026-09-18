# XLD 三模型开发版

## 当前阶段 / 范围
0.5.0-dev.refine3，个人本机试用。用户指定 WEG Flowers of Romance 验收。保持 30 秒片段；三模型、目标选择、自动/GPU/CPU、进度取消、三路试听、保留与目录入口。不训练模型、不增加弦乐 MIDI、不一次导出 53 轨。

## 决策
- 默认 Bowed Strings v2，备选 AudioSep / Mega 53。默认是开发试用顺序，并非已证明的质量排名。
- Bowed 仅弓弦组；AudioSep 弓弦组/小提琴；Mega 支持弓弦组、小提琴、中提琴、大提琴、低音提琴、木管、铜管、长笛、萨克斯。
- Mega 的 strings UI 对应原模型 bowed_strings 输出，不混合 strings/bowed_strings 两个输出。
- 官方权重严格载入 CPU，仅保留所选独立 mask head，复用现有 bs-roformer-infer，不改变共享网络/该输出层权重。
- 全输出与选定输出对照：Bowed(strings)、Mega(violin)，8192 样本 FP32 测试最大绝对误差均 0。
- GPU batch=1，累计波形在 CPU；CUDA OOM 时短块重试，自动模式才回退 CPU。显存值仅表示 PyTorch 分配峰值。CPU 不是显存扩容。
- Chunk 对齐 STFT hop，修复 Mega 上游 istft 不指定 length 时少返回末尾部分样本的问题；精确帧数与原速率保持。

## 文件地图
source/xld-runtime-baseline/analysis-refine/{runner.py,roformer.py,profiles.json}；core/refinement.cjs；refinement-controls.js；桌面 IPC；共享 runtime-config；release-tools 可选开发档案及第 9 组模型探测。
runtime/addons/refine-roformer-v1：作者原始权重、配置及 manifest/downloads 来源哈希。旧 runtime/0.5.0 与 audiosep-v1 不修改。
artifacts/refinement-three-20260915：完整 Flowers 基础分轨、90–120 秒模型预览、独立试听页、测试报告和截图。
development-settings.json 仅为本开发包启用独立档案，避免旧版单实例把开发入口带回 RC.6。

## 测试与实测
- WEG 90–120 秒：三模型真实 GPU 推理；Mega 小提琴；Mega 大提琴 1 秒输入的真实 CPU 推理通过。
- 初轮片段测量：Bowed 12.38s / 3106.4 MiB，Mega strings 14.01s / 1410.9 MiB，AudioSep 4.02s / 958.7 MiB；含模型加载，非通用性能承诺。
- 模拟 CUDA OOM 验证缩短分块/CPU 回退顺序，非 OOM 错误不能掩盖；本机实际 GPU 推理未触发 OOM。
- XLD npm test 通过，扩展 target/device 缓存隔离测试；发布配置、诊断、发布壳回归通过。
- 实际开发 EXE：三个模型生成、Mega 目标菜单、中英文、试听定位保持、CPU 任务取消、缓存/保留、切歌清理通过。
- 完整 Flowers of Romance（LAST WALTZ 录音室版）基础 6 轨已准备；UI 另生成该整曲 other 的 90–120 秒预览。

## 不变量 / 局限
原歌曲、日常版配置、既有 WAV/MIDI 不覆盖；开发分析目录独立。schema 2 与 RC.6 schema 1 文件隔离，旧版仍可读自己的结果。输出 original/target/residual；不同目标存在重叠，不可直接求和融合。当前没有目标存在检测，电子采样可能被归到弦乐。已有官方权重不等于效果保证，用户听感验收仍待完成。
模型权重来源记录在 downloads.json，gilliaan 模型卡未声明明确许可证；本轮为用户机器本地试用，未做公开再分发。干净无 Python Windows 验收不属于本轮用户要求。

## 下一步 / 复验
用户用 WEG 多个位置试听选择模型；只有验证后才改变默认。运行 npm test、test_roformer.py、head_equivalence.py、test-refinement-ui.cjs、release-tools/test-packaged.cjs、check-runtime.cjs。不要将这轮重新扩展为模型训练或全曲多乐器转谱项目。

## 交付状态
已发布 releases/0.5.0-dev.refine3；2716 个发布文件哈希验证通过，发布后的 9 组环境探测通过。实际最终 EXE 的原有 MIDI 目录、帮助、中英文与 XML 衔接回归通过。新开发分析目录迁移后按实际路径重新建立缓存索引，三个 strings 结果与 Mega violin 均可读取，默认弦乐的保留标记也已恢复。开发版自带独立档案配置；默认不会修改 RC.6 档案。用户打开开发版，选择 LAST WALTZ / Flowers of Romance，在分轨→细分设起点 90 秒、目标弦乐组、自动运行，即可切换已有三模型结果。试听页位于 artifacts/refinement-three-20260915/listening/WEG-三模型试听.html。

## 2026-09-16：用户多段试听结论
用户原话：“Mega完胜，bowed把部分人声以及失真的声音剪进去了”。本轮 Flowers of Romance 多段对比以 Mega 53 为优选；Bowed 提取量较大包含人声/失真声音误入，不据提取量判为更完整。90 秒初轮两模型通过的历史记录保留；用户未提供逐段评分，不自动填写全部片段通过或推及其他曲目。
后续版本默认选择 Mega 53，Bowed 保留备选，AudioSep 保留实验选项。此轮仅更新验收与交接记录；当前 0.5.0-dev.refine3 包及其默认卡片未修改、未重打包。后续先落实模型排序，再考虑整曲细分。
