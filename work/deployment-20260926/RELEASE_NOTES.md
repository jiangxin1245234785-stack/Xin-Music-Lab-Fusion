## 中文

这一版把最新工作台整理为可下载的 Windows 试用包。

- 首次启动配置窗口，也可从顶部“配置”重新打开。
- 选择曲库与输出目录；逐个导入模型解释器和文件夹，检查后保存，不必手改 JSON。
- 可联网安装独立的 MIDI 保存/导出基础环境，不修改系统 Python；提供进度、取消和诊断导出。
- 包含统一时间轴、轨头 WAV/MIDI 监听、静音/独奏、折叠与排序、MIDI 编辑、修订版本和结果管理。
- 补齐可视化资源及发行许可说明，排除模型权重、AI vendor 源码、个人配置和试听素材。

**下载 `Xin-Music-Lab-0.5.0-preview.setup.1-win-x64.zip`，完整解压后运行 XLD.exe。** `source.zip` 是对应的过滤后源码，不能直接运行。SHA256SUMS.txt 用于核对下载文件。

AI 环境仍需按 MODEL-SETUP.md 自行准备后导入；本版不是全部模型的一键安装器。受限权重须本人向上游申请。保存环境配置后请关闭并重新打开应用。旧版资产保留，升级前备份自己修改的 runtime.json。

已通过本机隔离配置、全新受控 Python 安装与 MIDI 读写、实际 XLD/XML 窗口和已有回归检查。尚待另一台干净 Windows、更多显卡和完整 AI 安装链验收。未签名预览版，不标为稳定版。

## English

This release packages the latest workbench as a downloadable Windows preview.

- First-run setup, also accessible from Setup in the header.
- Choose library/output locations, import backend interpreters/folders, check and save without editing JSON.
- Optional online installation of a separate MIDI save/export environment, with progress, cancellation and redacted diagnostics. System Python is unchanged.
- Shared timeline, WAV/MIDI monitoring, mute/solo, folding/reordering, MIDI editing, revision history and result management.
- Restored visualization resources and distribution notices; no model weights, AI vendor trees, personal settings or listening assets.

**Download `Xin-Music-Lab-0.5.0-preview.setup.1-win-x64.zip`, extract everything and launch XLD.exe.** `source.zip` contains matching filtered source, not an executable. Use SHA256SUMS.txt to verify downloads.

Install AI environments separately using MODEL-SETUP.md, then import them. This is not an all-model one-click installer. Obtain gated authorization through your own upstream account. Reopen the app after saving environment changes. Older assets remain available; back up your customized runtime.json before upgrading.

Validated with isolated local profiles, fresh managed Python/MIDI roundtrip, actual XLD/XML windows and existing regression suites. A separate clean Windows machine, broader GPU coverage and full AI setup validation remain pending. Unsigned prerelease, not a stable release.
