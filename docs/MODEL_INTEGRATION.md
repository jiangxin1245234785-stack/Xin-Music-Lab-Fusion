# Model integration / 模型接入

[README](../README.md) · [中文](#中文) · [English](#english)

Updated: 2026-09-25. This document separates available configuration from the proposed setup assistant. / 本文区分现有配置方式与拟开发的接入向导。

## 中文

### 现在如何使用

程序提供交互、任务调度和适配接口；模型、Python 环境和 GPU 依赖单独配置。**目前没有通用模型安装向导，也不承诺下载程序后所有 AI 功能立即可用。**

1. 先安装需要的一个后端，按照对应上游项目的说明准备独立 Python 环境。代码、权重须匹配当前应用支持的版本，不能直接假设最新版本兼容。
2. 从作者官方入口获取权重。受限模型由使用者本人申请访问、阅读并接受条款。不要使用共享令牌或把凭据写进配置文件。
3. 关闭应用，在程序旁 `runtime.json` 的 `paths` 中修改对应解释器与模型目录，保留其余必需配置。相对路径以该 JSON 所在目录为基准；也可使用本机绝对路径。
4. 重启应用、刷新模型状态，再用自己有权处理的短音频试运行。路径存在或依赖可导入，不等于真实推理已经通过。

例如下面仅展示 MuScriptor 的两个路径项，**不能覆盖整个配置文件**：

```json
{
  "XLD_MUSCRIPTOR_PYTHON": "user-runtime/muscriptor/Scripts/python.exe",
  "XLD_MUSCRIPTOR_ROOT": "user-models/muscriptor"
}
```

将两项写入已有的 `paths` 对象。MuScriptor 根目录还需满足适配器的目录结构：`upstream/muscriptor/__init__.py`、Medium 的 `models/model.safetensors`，以及可选 Large 的 `models/large/model.safetensors`。Python 环境必须安装相应依赖。

完整后端路径、目录约定与锁定版本见[现有模型自配说明](../source/release-tools/MODEL-SETUP.md)。只装一个后端即可先使用它；全局“检查环境”可能仍报告其他可选模型未安装。该文档包含开发版后续补充，老发行包是否支持某后端应以其随包说明与模型清单为准。

### 接下来做什么：小型接入向导（尚未实现）

保留现在的默认＋备选菜单，在模型不可用时提供“配置”入口。第一版只需以下步骤：

**选择用途 → 查看官方来源与许可 → 选择现有 Python 和模型目录 → 检查版本 → 短片段试运行 → 启用。**

| 阶段 | 交付 | 验收 |
|---|---|---|
| 1. 模型卡 | 为当前支持的版本登记代码来源、权重来源、各自许可、申请入口、校验值和最后核查日期 | 未核实的许可明确显示“待确认”，不能默认视为可商用 |
| 2. 本地导入 | 选择解释器和模型目录；报告缺少文件、版本不符、依赖缺失；保存路径 | 一个模型可独立启用，不影响未安装项；失败不覆盖原配置 |
| 3. 试运行 | 用户选择短音频，运行现有适配器，检查输出是否可读取 | 分清“已配置”和“已通过试运行”；不默认启动整曲 GPU 任务 |
| 4. 可选官方获取 | 仅对许可已核实、下载方式允许的具体版本提供获取帮助 | 提示大小与条款；需要账号的在官方页面完成授权；不镜像权重 |

第一轮做到阶段 1–3 即可。每个后端继续使用独立环境和现有适配器，避免把全部 AI 依赖装进应用本身。更新模型时新增版本记录，保留旧结果的模型身份；不在后台擅自替换用户已验证的版本。

模型卡最少记录：`id`、`version`、`capability`、`codeUrl`、`codeRevision`、`codeLicense`、`weightsUrl`、`weightsRevision`、`weightsLicense`、`gated`、`termsUrl`、`sha256`、`requiredPaths`、`licenseCheckedAt`。使用限制应能展示原文链接，不能只靠一个“开源”徽章。此清单是设计建议，尚不是现有配置协议。

### 许可边界

不随包发权重能减少再分发问题，但不能自动消除模型使用、第三方代码或音乐素材的权利问题。将后端放进独立进程也不改变其许可。以下是本次核查的例子，不是所有模型的完整法律清单：

| 项目 | 已核查信息 | 接入处理 |
|---|---|---|
| MuScriptor | [代码 MIT](https://github.com/muscriptor/muscriptor/blob/main/LICENSE)；[Large 权重](https://huggingface.co/MuScriptor/muscriptor-large)标为 CC BY-NC 4.0，另有访问条件 | 本人接受具体模型页条款；本项目 MIT 不覆盖权重，商业使用不能据此获准 |
| BS-ROFO-SW-Fixed | [权重页](https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed)的许可标为 unknown | 在取得明确依据前，不提供默认自动下载或镜像；用户自行下载也不等于许可已解决 |
| Mega53 等其他检查点 | 框架许可不等于具体权重许可；从[作者发布入口](https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/tag/v1.0.21)逐项核实 | 保留具体版本来源与许可证据，未知项标记待核实，不套用框架许可 |
| 历史 ADTOF 移植源码 | 当前固定副本缺少 LICENSE，见[来源记录](../source/xld-runtime-baseline/analysis-midi/vendor/PROVENANCE.md) | 不进入对外界面包；公开开发仓库前仍需处理源码及历史副本 |

Hugging Face 受限模型的批准与用户账号关联，参见[官方访问说明](https://huggingface.co/docs/hub/models-gated)。未来下载助手应复用用户自己的官方认证，不索取或上传令牌，不替用户接受协议。应用、代码依赖、权重和待分析音乐分别判断权限；这套流程用于降低风险，不保证零纠纷。

## English

### Using a backend today

The application supplies the interface, task orchestration and adapters. Python environments, GPU dependencies and model weights are configured separately. **There is no universal model installation wizard yet, and downloading the application does not enable all AI features.**

1. Install one required backend in its own Python environment using the upstream instructions. Match the revision supported by your application; a newer upstream release is not automatically compatible.
2. Obtain weights from their official source. Request gated access and accept the terms using your own account. Do not share tokens or put credentials in configuration files.
3. Close the application. Edit the corresponding entries inside `paths` in the adjacent `runtime.json`, preserving the other required settings. Relative paths resolve from that file's directory; local absolute paths are also supported.
4. Restart, refresh model availability and test a short audio clip you have the right to process. Existing files or importable dependencies alone do not establish successful inference.

For MuScriptor, the JSON example above shows **two path entries, not a replacement configuration**. Insert them into the existing `paths` object. The model root must contain `upstream/muscriptor/__init__.py`, Medium at `models/model.safetensors`, and optionally Large at `models/large/model.safetensors`. The selected Python environment needs the upstream dependencies.

The [detailed setup reference](../source/release-tools/MODEL-SETUP.md) currently provides Chinese instructions with configuration keys, pinned revisions and directory layouts. One installed backend can be used independently even if the global environment report lists other optional models as missing. That document includes later development additions: check your package's own model manifest and instructions for supported backends.

### Proposed setup assistant — not implemented yet

Keep the default/alternative model menu and add a Configure entry for unavailable models:

**Choose a task → review official sources and terms → select an existing Python environment and model directory → validate the version → run a short test → enable.**

| Phase | Deliverable | Acceptance condition |
|---|---|---|
| 1. Model cards | Code and weight sources, separate licenses, access links, checksums, supported revisions and review date | Unknown terms are explicit, never treated as permission for commercial use |
| 2. Local import | Interpreter/folder selection, missing-file/dependency/version checks and saved paths | One backend works independently; a failed import preserves the previous configuration |
| 3. Test inference | A user-selected short clip through the existing adapter, with readable output validation | Distinguish configured from tested; do not start a full-song GPU job automatically |
| 4. Optional official acquisition | Download assistance only for specific versions with verified terms and permitted access methods | Show size and terms; use official account authorization; do not mirror weights |

Phases 1–3 are sufficient for the first iteration. Keep environments isolated and reuse existing adapters. Record model versions in results, and do not silently replace a user's validated version. Proposed metadata includes `id`, `version`, `capability`, code/weight URLs, revisions and separate licenses, `gated`, `termsUrl`, `sha256`, `requiredPaths` and `licenseCheckedAt`. This is a design proposal, not a shipped configuration schema.

### License boundaries

Omitting weights reduces redistribution exposure; it does not resolve all permissions for models, source code or music. A separate backend process does not change its license. The following are examples checked for this update, not a complete legal inventory:

- **MuScriptor:** [code is MIT](https://github.com/muscriptor/muscriptor/blob/main/LICENSE); the [Large weights](https://huggingface.co/MuScriptor/muscriptor-large) are labeled CC BY-NC 4.0 with additional access conditions. Each user must follow the specific model page. The application's MIT license does not authorize commercial use of those weights.
- **BS-ROFO-SW-Fixed:** its [weight page](https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed) lists the license as unknown. Do not enable automatic acquisition or mirroring without clarification. Manual downloading does not itself establish permission.
- **Mega53 and other checkpoints:** check the particular release and weights through the [author's release page](https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/tag/v1.0.21); the framework's code license does not settle weight licensing.
- **Historical ADTOF port:** the pinned source lacks a license file; see [provenance](../source/xld-runtime-baseline/analysis-midi/vendor/PROVENANCE.md). It is excluded from the interface-only package, but source and history still need resolution before public repository distribution.

[Hugging Face gated access](https://huggingface.co/docs/hub/models-gated) is associated with individual user accounts. Any future helper should use the user's official authentication, never collect/upload tokens or accept agreements for them. Application code, dependencies, weights and source music need separate rights checks. This approach reduces risk; it is not a guarantee against disputes.
