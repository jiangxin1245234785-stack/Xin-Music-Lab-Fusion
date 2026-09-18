# GitHub 仓库与本机开发

仓库：https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion

## 仓库内容

源码、依赖锁文件、模型配置、测试、文档、各阶段的一级 Markdown 报告，以及少量 published / regression / verification JSON 纳入版本管理。XML 与 XLD 在同一个仓库，保持分析归 XLD、可视化归 XML 的边界。

`runtime/`、`releases/`、`archive/`、真实分析结果、曲库、模型权重、依赖安装目录与本机配置留在本机。work 中的实验脚本、快照和大量证据文件仍留在本机；历史文档链接到这些内容时，云端克隆不一定具有目标文件。

`.gitignore` 的忽略不删除本地文件。历史已安装环境和音乐可继续使用。初始提交保留原源码字节，不借 Git 接入顺便改行尾或程序逻辑。

## 新机器 / 云端接手

克隆源码不等于获得可直接推理的完整应用。请先读 CLAUDE_HANDOFF.md、SOURCE_OF_TRUTH.md 和对应阶段 HANDOFF，安装依赖并配置本地运行环境。不要把现有 C:/D: 路径当成所有电脑通用路径。

`source/release-tools/runtime.local.example.json` 提供构建路径模板；复制为同目录 `runtime.local.json` 后填写实际路径。该模板不是已经验证的可迁移环境安装器，后续模型附加路径应按 runtime-config 和当前发布配置补齐。

特别注意：ADTOF 的小权重也不上传。当前代码仍期望本地文件 `source/xld-runtime-baseline/analysis-midi/vendor/adtof_pytorch/data/adtof_frame_rnn_pytorch_weights.pth`。新环境须依照同级 vendor/ADTOF-README.md 与 PROVENANCE.md 的来源和校验恢复此文件；原电脑文件未移动。模型授权由使用者在上游完成，不提交访问令牌。

原有 `source/fusion-runtime-baseline/tools/glitch-generator` 与 vendor 内的运行时文件保留，这是当前应用使用的镜像。不要把它们一概当成可删除构建垃圾。独立 TypeScript 源码的 dist 按它自身 .gitignore 排除。

部分现有测试依赖 Windows、本机 Electron、已安装模型或真实曲库。此次接入没有添加宣称全量通过的云端 CI；先按环境要求跑合适的测试，GPU 与听评留在本机。

## 日常步骤

1. 开始工作前查看 Git 状态并同步远端，保留未提交改动。
2. 为一项明确功能建立短期分支；Claude 和 Codex 不在同一目录同时改同一批文件。
3. 测试后提交源码和文档，检查暂存列表中没有权重、音频或凭据。
4. 推送分支，查看差异后合并 main；用标签标记已验收版本。
5. 生成安装包仍放本地 releases，需分发时另行发布 GitHub Release。

首次 GitHub 接入不代表将全部模型和音乐备份到云端；这些本地资产仍需要各自的保管方案。第三方源码保留原署名和许可文件，本次不擅自为整个项目添加统一开源许可证。
