# MuScriptor 弦乐与鼓接入

## 交付状态
2026-09-17 完成。本机开发版 0.5.0-dev.muscriptor.3，XLD core.23 / XML stems.10。
发布目录：D:/Projects/Xin-Music-Lab-Fusion/releases/0.5.0-dev.muscriptor.3
试听：artifacts/muscriptor-parts-20260917/listening/弦乐与鼓MIDI对比.html
当前默认仍为 strings YourMT3+、drums ADTOF；新模型听感待用户验收。

## 实现
strings / drums 各新增 MuScriptor Medium、Large，独立引擎ID与缓存。复用现有模型和Python，无新下载。
Medium batch4；新声部 Large batch1，官方 float16 权重加载，CPU仍float32，加载后释放临时CUDA缓存。吉他维持已验收配置；旧8项模型配置及5声部默认均验证未变。greedy / CFG1 / no-prelude；不声称FP16与FP32逐音符一致。
弦乐按Mega目标约束原生乐器组，沿用来源GM音色，保留重叠同音高音符。
鼓保留模型鼓键，合并标准通道10；onset模型统一100ms音符时长，同键下次敲击前截断。与前一版逐音符验证onset/pitch/velocity未变。
所有新模型力度固定100，不恢复真实动态或揉弦曲线。模型菜单沿用紧凑默认/备选布局。
修复复杂options浅比较导致的生成后缓存验证失败，改为逐字段深比较，仍严格检查期望参数。
服务、XML/XLD完成通知、单声部、一键、融合、目录、回收站均接入。

## MEGURI 整曲
568.75秒；弦乐来自Mega53组，鼓来自BS-RoFormer SW。全部走真实应用服务，生成后缓存复用通过。
- strings Medium：3718音符，推理142.468秒。
- strings Large：4698音符，推理393.453秒。
- drums Medium：2280音符，最终推理14.813秒。
- drums Large：2147音符，最终推理108.875秒。
Large峰值已分配约10523MiB，包含加载临时状态，不代表稳定推理显存。
不同运行时GPU负载不同，不作为受控性能比较。音符数不代表准确率。
四份结果已写入用户MEGURI独立模型缓存；实际音源stat/runId核对通过；原启用选择保持。

## 验证证据
- XLD / XML 完整回归通过：xld-tests-final.log / xml-tests-final.log。
- Python真实导出14例、独立缓存/目标/损坏参数验证通过。
- real-parts.json：四模型整曲与缓存通过。
- cancellation：cancel.json，取消保持旧结果。
- drum-duration-check.json：鼓导出时长调整不改变敲击事件。
- parts-ui.json：实际发布壳五声部一键、融合、目录、重启偏好、删除与默认回退通过；回收站仅操作隔离测试副本。
- 宽窄窗口、双语、大字号通过，零控制台错误；不声称启动性能优化。
- listening/comparison.json / listening-ui.json：24段30秒同源试听渲染、元数据及实际播放通过。三固定位置60/270/480秒，每声部含原WAV、当前默认、Medium、Large；同音色/力度/每声部统一增益。
- preservation.json / package-parity.json：旧配置保持；2722发布文件和关键源码哈希一致。
- user-cache.json：4结果入库，活跃选择保持。
- published.json：发布复制及源码校验。

## 边界和后续
原曲、分轨WAV、手动标注、旧MIDI和旧发布保留；没有清理用户真实MIDI。
用户曾占用GPU导致早期试跑中断，这些不是有效性能结果。恢复后完整实测已结束，不需要重复推理。
仍是当前机器开发版，未做干净VM通用发行验收。用户听评后再决定默认；OaF鼓力度与额外后处理留后续。
暂存构建及完整隔离夹具：D:/Caches/codex/xld-muscriptor-parts-20260917。work目录保留脚本和报告；源码原状备份位于暂存before。
