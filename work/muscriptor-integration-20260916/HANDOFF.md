# MuScriptor 默认接入 / Large 待授权

## 当前阶段
Medium 用户明确验收优于 GAPS，已接入、真实整曲及 UI/缓存/回归通过。Large 独立 HF 授权返回 403，已向用户请求接受；未下载/推理，不得称 Large 已测。

## Spec 摘要与已定决策
吉他默认 MuScriptor Medium，GAPS、Basic Pitch、YourMT3 保留。弦乐默认不变。模型卡片和一键使用同一选择；一次性清理旧吉他偏好，之后尊重手选。既有活跃结果不因卡片选择而切换，生成/使用才启用。
Medium 用用户已验收 batch4 / greedy / CFG1 / prelude_forcing=false，原生吉他分类保留，官方同音重叠清理，无额外修音。no_eos_is_ok=false：解码超长明确失败，不提交不完整结果。CPU 使用 batch1。

## 结果与验证
MEGURI 568.75 秒，2916 音符；接口推理 40.203 秒，完整运行 45.875 秒，PyTorch CUDA 已分配峰值 3172MiB。与已验收独立 MIDI 的音高、时值、力度、program 逐项完全一致。官方重复 tempo 元事件由既有导出流程规范化，时间无变化。
初接时 options 的数组无法通过既有标量指纹比较，现将乐器列表作为固定 CSV 字符串，不改其他模型缓存。真实整曲+复用、模拟取消/旧结果保留、双应用 npm test 均通过。
真实隐藏 Electron：四卡默认、旧偏好迁移、手选重启保留、单声部缓存、一键四声部+融合、目录、取消删除、隔离 GAPS 回收站与 Medium 回退、双语、大字与1180x780单屏通过；零console error。夹具中弦乐来源已失效，正确排除，本轮不声称五声部融合验收。发布壳三种尺寸通过，截图已目视。

## 文件地图
暂存 D:/Caches/codex/xld-muscriptor-20260916，包含 source/candidate/test-analysis（WAV硬链接，只读）。
后端 analysis-midi/muscriptor_backend.py、models.json、runner.py，调度 core/analysis-service.cjs。
菜单 derived-controls.js、i18n/runtime-messages.js；默认由 models.json 唯一声明。
附件 runtime/addons/muscriptor-v1 保存已校验官方源码与 Medium 权重；只读复用 yourmt3-v1 Python，不安装依赖。
发布 releases/0.5.0-dev.muscriptor.1，source core.21；旧版本保留。
Large 暂存 D:/Caches/codex/muscriptor-large，probe.py 检查授权，run.py 已准备 batch1 整曲试验，权重约5.47GB。

## 不变量
原音乐、WAV、旧 MIDI、旧开发版不删除；回收站验证只触及隔离测试 MIDI。Medium 档位的听感结论限本次用户 MEGURI 验收。无连续揉弦曲线，不以音符数判优。未做干净VM安装验证，本机开发版。

## 下一步
等待用户接受 https://huggingface.co/MuScriptor/muscriptor-large 后重新 probe，下载固定 revision 8809fdfbed2affa7ade94a7059e746e3880720e7 / SHA256 ac4eb6ea87dfc26b6ca6b954c6b967ab87ad4c7d08e078b25214f13ed051f397。复用同源568.75秒，分段1:00/4:30/8:00各30秒同音色对照 Medium / Large，记录显存与耗时（batch差异明确标注）。性能不足才调小批量/半精度；不自动更换默认。

## 复验命令
暂存 run-real.cjs（force会重新推理）、check-output.py、run-ui.cjs、run-package-ui.cjs；两个 source 应用 npm test。
## 发布后缓存
已把验证通过的 MEGURI Medium 结果复制到当前开发曲库并启用。复制前核对原 WAV SHA256 与 sourceRunId，按现有 activate 机制归档旧活跃索引；GAPS 模型结果仍可读取。user-cache.json 记录旧/new active 与新目录。用户打开新版即可使用该曲 Medium 缓存。

## 2026-09-17 后续
Large 已完成官方授权、下载和 batch1 整曲对照：248.437秒、10521MiB、3156音符；Medium 同批量113.469秒/2343MiB。Large batch2/4 共享内存占用与进度问题导致主动停止，未交付这两个配置。试听已发布 artifacts/muscriptor-large-20260917/listening/MuScriptor档位对比.html，听感待验收；Medium默认保持。后续以 work/muscriptor-large-20260917/HANDOFF.md 为准。
