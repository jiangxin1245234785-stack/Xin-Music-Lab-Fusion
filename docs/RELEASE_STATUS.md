# Release status / 发布状态

Updated / 更新：2026-09-25

[README](../README.md) · [Releases](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/releases)

## 中文

本页区分已经上传的程序和本机开发进度。仓库 README 的更新时间不等于程序更新日期。

| 项目 | 当前状态 |
|---|---|
| 可下载程序 | `v0.5.0-preview.ui.1`，Windows x64 界面预览；XLD core.26 / XML stems.11 |
| 最新本机工作台 | `0.5.0-dev.workbench.8`；XLD core.69 / XML stems.13；尚未同步为完整 GitHub 源码快照或新下载包 |
| 2026-09-25 更新范围 | 中英双语 README、原创代码 MIT、第三方清单和模型接入提案；仅文档与许可说明 |
| 模型与环境 | 不附带权重、Python、GPU 依赖或共享授权；使用者按上游说明配置 |
| 仓库可见性 | 本次更新前核查为私有；本次不更改可见性 |

最新本机开发版集中完成了时间轴、MIDI 编辑、监听、轨道组织、结果管理及工作台布局。已有本机流程验证，尚不能据此宣称全新 Windows 上的所有安装、依赖和推理组合通过。此次仅上传明确列出的文档，不把未审查的开发目录或模型供应商源码一并提交。

### 下一次程序更新前

1. 选择完整源码快照，核对新增第三方组件及其确切版本许可，处理历史 ADTOF 移植源码的待确认项。见[第三方说明](../THIRD_PARTY_NOTICES.md)。
2. 构建新的界面包，保留 Electron 与第三方声明；排除权重、虚拟环境、凭据、私人路径配置和试听素材。
3. 验证缺模型时仍可启动、路径可重新配置、基本播放可用，以及关键编辑/保存/导出流程。真实模型配置与干净机器验收分别记录。
4. 上传独立版本的 ZIP、校验值和双语变更说明，明确哪些模型需要用户自行安装。不要直接覆盖旧版本资产。

模型配置向导是后续功能，先做本地导入和试运行，再考虑官方来源获取帮助；详细范围见[模型接入计划](MODEL_INTEGRATION.md)。

## English

This page separates uploaded application builds from local development progress. A README update is not an application release.

| Item | Current status |
|---|---|
| Downloadable application | `v0.5.0-preview.ui.1`, Windows x64 interface preview; XLD core.26 / XML stems.11 |
| Latest local workbench | `0.5.0-dev.workbench.8`; XLD core.69 / XML stems.13; not yet uploaded as a complete source snapshot or new download |
| 2026-09-25 update | Bilingual README, MIT for original code, third-party inventory and model integration proposal; documentation and licensing notices only |
| Models and environments | No weights, Python/GPU dependencies or shared authorization; users configure these through upstream instructions |
| Repository visibility | Verified private before this update; this update does not change visibility |

Local development adds the shared timeline, MIDI editing, monitoring, track organization, result management and workbench layout. Existing local validation does not establish that every installation/dependency/inference combination works on a clean Windows machine. This update uploads only the listed documents, not an unreviewed development tree or additional model vendor source.

### Before the next application release

1. Select a complete source snapshot; inventory new third-party components and exact revision licenses, including the unresolved historical ADTOF port. See [third-party notices](../THIRD_PARTY_NOTICES.md).
2. Build a fresh interface-only package with Electron and third-party notices; exclude weights, virtual environments, credentials, personal path configuration and listening assets.
3. Verify startup without models, path reconfiguration, basic playback and core editing/save/export workflows. Record real-model and clean-machine checks separately.
4. Upload a separately versioned ZIP, checksum and bilingual release notes identifying separately installed models. Do not overwrite older assets.

The model setup assistant is future work: start with local import and test inference, then consider official acquisition help. See the [integration plan](MODEL_INTEGRATION.md).
