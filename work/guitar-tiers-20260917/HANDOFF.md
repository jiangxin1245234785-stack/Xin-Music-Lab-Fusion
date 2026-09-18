# 吉他 MIDI 双档上线与旧方案退役

## 当前阶段
用户确认 Large 对复杂 MEGURI 提升可感知，授权上线「日常 Medium / 复杂 Large」并删除旧吉他独占方案。实现、接口实曲、回归、清理、真实桌面与发布壳验收完成；发布 0.5.0-dev.muscriptor.2（XLD core.22 / XML stems.9）。

## Spec 与决策
吉他仅两张卡片：Medium 默认 batch4；Large 备选 batch1。沿用已验收 greedy/CFG1/no-prelude，不再次调整算法。单声部/一键/融合/目录/删除共享既有服务；删除启用的 Large 时若有 Medium 缓存则回退。旧偏好迁移到 Medium，Medium/Large 的手动选择保留。
GAPS、Basic Pitch guitar、YourMT3 guitar 标记 retiredFor，退出菜单且服务和CLI拒绝新吉他生成；保留历史格式读取，其他声部继续共用模型。XML 遇到退役的活跃结果生成请求时选择当前默认，而非调用退役引擎；仍尊重已启用 Large。

## 验证结果
真实应用 Large 接口生成3156音符，音高/时值/力度/program与用户验收独立结果完全一致。推理452.172秒，全程464.953秒，峰值PyTorch分配10521MiB；此前独立运行248.437秒。耗时明显有运行状态波动，本轮不声称固定4分钟或已定位差异原因。
XLD全套测试通过；XML修改后全套通过；7项XML旧模型回退/有效模型保留路由测试通过；新增Medium/Large缓存、取消旧结果保留与退役拒绝测试通过。
真实Electron：两张菜单、旧偏好迁移、Large选择重启保留、单轨使用、一键四声部融合、目录、取消删除、隔离Large回收站及Medium回退、双语/大字/1180x780单屏通过，零console error。夹具弦乐来源原已失效，正确排除；不宣称五声部融合验收。新包窗口三种尺寸通过，截图目视完成。
清理后环境检测：Medium/Large均可用，弦乐YourMT3、Basic Pitch、钢琴、贝斯、鼓均可用。

## 文件地图
工作暂存 D:/Caches/codex/xld-guitar-release-20260917。发布 releases/0.5.0-dev.muscriptor.2，沿用开发曲库。
models.json定义档位/retiredFor；muscriptor_backend.py复用不改；core/analysis-service.cjs过滤菜单与拒绝旧引擎；runner.py阻止退役CLI生成。
derived-controls.js与i18n用途卡片/迁移；XML desktop/main.cjs与fusion.js同步路由/任务状态。
Large权重从缓存移到 runtime/addons/muscriptor-v1/models/large，SHA256 ac4eb6ea87dfc26b6ca6b954c6b967ab87ad4c7d08e078b25214f13ed051f397；Medium仍位于同附件models根目录。复用yourmt3-v1 Python，无安装新依赖。

## 清理与不变量
cleanup-plan.json逐文件列出路径、大小、SHA256；cleanup.ps1先核对绝对边界、无reparse父目录、内容未变，再逐文件永久删除。
50个文件、1815463113 bytes（1.691 GiB）：三份GAPS专用权重、Guitar-FL专用权重、Medium已验证重复缓存，以及退役吉他试听副本。磁盘可用量观测增加1815638016 bytes（会受其他写入影响）。旧试听页已标记归档，不再保留失效播放器/下载按钮。
原音乐、基础及细分WAV、实际曲库旧MIDI和融合文件、人工标注不删除。YourMT3/Basic Pitch共用环境及钢琴/贝斯权重不删除。原始结论与统计留档。旧版本保留，但其GAPS生成权重已按授权退役。
不是干净VM验证的通用发行版，是当前机器可用的开发版。Large运行成本高且有波动，保留手动档位选择。

## 验证入口与下一步
run-real.cjs、check-output.py、run-ui.cjs、run-package-ui.cjs、check-engines.cjs、test-xml-retirement.cjs、两应用npm test。清理脚本不可无检查重复执行。
用户打开新版选择复杂Large，或日常Medium；当前曲目的缓存可直接使用。后续仅按真实听感和资源需求迭代。