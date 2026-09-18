# GitHub 接入（2026-09-17）

远程：https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion

## 本地完成

- 项目根目录建立 Git，main 分支，origin 指向上述仓库。
- 使用仓库级 Git 身份 jiangxin1245234785-stack 与 GitHub noreply 邮箱，不修改全局身份。
- .gitignore 仅纳入源码 / 文档 / 阶段 Markdown / 少量验证 JSON；环境、权重、原曲、WAV / MIDI、发布目录、本机路径配置和凭据排除。
- .gitattributes 保留基线字节；没有为首次提交批量转换 CRLF 或清理历史空格。
- docs/GITHUB_WORKFLOW.md 说明本机数据与源码边界、新机器运行前提、ADTOF 权重恢复和日常分支流程。
- source/release-tools/runtime.local.example.json 是不含真实机器路径的模板；原 runtime.local.json 留在本机。
- 采用目前实际 core.25 / history.1 的源码和交接材料，不回退为旧 core.24。

## 验证与范围

暂存清单经过大文件、模型 / 音频 / 环境排除和常见凭据格式扫描；只输出文件路径与问题类型，不输出凭据内容。外部证据：D:/Caches/codex/github-setup-20260917/staged-audit.json。初始扫描 3121 文件约 21 MB，后续新增本交接等文档会略增。

本次没有改应用运行代码、模型默认或用户结果，没有重跑音乐推理。仓库不附带所有历史 work 脚本 / 截图，文档中的本机证据链接可能在纯云端克隆中缺失。

## 远端状态

本记录先随本地初始提交保存。远端是否已发布以 git ls-remote origin refs/heads/main 与 git rev-parse HEAD 一致为准；成功后会补记连接验证。不把 origin 地址存在当成已上传成功。

GitHub 连接器账号识别与 Windows Git Credential Manager 是两套独立授权。本机 Git 登录在浏览器完成；没有把 token 保存进项目。连接器是否能访问仓库仍需单独验证。
