# Xin Music Lab

**本地音乐分析、分轨与 MIDI 工作台 · Local music analysis, stem separation & MIDI workbench**

[中文](#中文) · [English](#english) · [Download / 下载](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/releases/tag/v0.5.0-preview.ui.1) · [Model setup / 模型接入](docs/MODEL_INTEGRATION.md)

## 中文

Xin Music Lab 是一个持续迭代的个人音乐工具项目，关注器乐、后摇和复杂编配。它把第三方研究模型接入统一工作流，方便分轨、转谱、试听、比较和管理结果。核心模型来自各上游作者，本项目的工作重点是交互、适配与分析结果的衔接。

- **XLD — Xin’s Local Deck**：本地曲库与分析工作台，负责段落、和弦、分轨和 MIDI。
- **XML — Xin’s Music Lab Fusion**：音乐可视化，消费 XLD 的分析结果。

### 下载与版本

在 [Windows 预览版 Release](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/releases/tag/v0.5.0-preview.ui.1) 的 **Assets** 中下载 `Xin-Music-Lab-0.5.0-preview.ui.1-win-x64.zip`，完整解压后运行 `XLD.exe` 或 `XML.exe`。不要只移动 EXE。

**GitHub 的 Code → Download ZIP / Source code 是源码，不是可直接运行的程序。** 程序包不含模型权重、Python 或 AI 依赖。不配置模型也可体验曲库、播放和音频可视化；分析功能需要对应后端。

| 版本范围 | 状态 |
|---|---|
| 已上传界面预览包 `0.5.0-preview.ui.1` | 基于 XLD core.26 / XML stems.11；当前下载入口 |
| 最新本机工作台 `0.5.0-dev.workbench.8` | 基于 XLD core.69 / XML stems.13；已进行本机验证，**尚未上传为新发行包或完整源码快照** |
| 本次 GitHub 更新（2026-09-25） | 双语 README、原创代码 MIT 声明、第三方说明与模型接入方案；不更新程序包 |

截至本次更新，仓库仍为私有，下载需要访问权限。版本记录见[发布状态](docs/RELEASE_STATUS.md)。这是个人项目预览版，尚未完成干净 Windows 环境的完整验收。

### 可以做什么

**现有界面预览包**提供以下流程；AI 步骤均需自行配置模型：

| 功能 | 用途 |
|---|---|
| 曲库与播放 | 浏览本地专辑和曲目、试听歌曲 |
| 分轨与细分 | 生成多个 WAV 声部，提取指定目标，试听目标与剩余声音 |
| MIDI 转谱 | 按声部选择默认或备选模型，逐轨或一键生成、融合导出 |
| 段落与和弦 | 查看分析边界、标签与和弦变化 |
| 结果管理 | 比较模型结果、打开目录、清理生成文件 |
| 音乐可视化 | 使用音频与已有分析结果驱动视觉表现 |

**后续本机开发版**已增加统一时间轴、轨道折叠与排序、轨头 WAV/MIDI 监听、静音/独奏/音量、音符编辑与撤销/重做、人工修订版本、段落和和弦标注，以及集中的结果与属性面板。这些功能尚不包含在上述下载包中。人工修订与机器原始结果分开保存；当前编辑功能也不等于完整 DAW。

### 开始使用

1. 解压预览包，启动 XLD，选择自己的曲库和输出目录。
2. 按[模型接入说明](docs/MODEL_INTEGRATION.md)配置所需后端，先用短音频检查。
3. 选择歌曲 → 分轨 → 试听 → 选择声部与模型 → 生成 MIDI。
4. 比较结果、保留需要的版本；需要可视化时打开 XML。

具体操作见[使用指南（中文）](docs/USER_GUIDE.md)，后端路径和适配版本见[模型自配参考（中文）](source/release-tools/MODEL-SETUP.md)。不同开发版支持的模型可能不同，以随包清单为准。**目前没有通用的一键模型安装功能。**

### 模型、许可与限制

本项目支持可替换后端，例如 BS-RoFormer/Demucs 分轨、Mega53 目标提取，以及 MuScriptor、HiRes 等 MIDI 转谱方案。具体能力与支持版本取决于适配器和本地配置，不能把任意模型文件直接放入目录就使用。

- 本项目原创代码采用 [MIT](LICENSE)，允许商用和修改并保留许可与署名。**MIT 不覆盖第三方模型、代码、音乐和输出内容的权利。** 见[第三方说明](THIRD_PARTY_NOTICES.md)。
- 模型从作者官方来源自行获取。代码和权重可能使用不同许可；例如 [MuScriptor Large 权重](https://huggingface.co/MuScriptor/muscriptor-large)标为 CC BY-NC 4.0，不能因应用采用 MIT 就视为允许商用。受限模型须使用本人账号授权。
- 部分权重许可尚未明确，历史第三方源码也有待清理项。未附带权重不等于所有许可问题均已解决；[接入方案](docs/MODEL_INTEGRATION.md)记录已核查的例子与下一步。
- 主要在 Windows / NVIDIA 环境验证。显存、内存、速度和存储需求依模型与曲长而变，不承诺全部后端适用同一硬件配置。
- 失真、串音、揉弦和复杂叠奏仍可能导致转谱错误。MIDI 音符保留秒级位置，固定导出速度不代表已识别真实速度变化。
- 分析由已配置的本地后端运行；获取依赖和权重可能需要联网。请仅使用自己有权处理的素材。

### 反馈与开发

通过 [Issues](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/issues)提供版本、系统/显卡、模型、复现步骤和错误信息；请去掉令牌、个人路径和无权分享的歌曲。开发入口：[DEVELOPMENT](docs/DEVELOPMENT.md)；构建工具：[release-tools](source/release-tools/README.md)。部分历史脚本仍依赖开发机路径，当前不承诺克隆后即可一键构建。

## English

Xin Music Lab is a personal project for instrumental music, post-rock and complex arrangements. It connects third-party research models through a shared workflow for separation, transcription, listening, comparison and result management. Model research belongs to the upstream authors; this project focuses on the interface, adapters and connections between analysis results.

- **XLD — Xin’s Local Deck:** the local music library and workbench for sections, chords, separation and MIDI.
- **XML — Xin’s Music Lab Fusion:** music visualization that consumes XLD analysis results.

### Download and version status

Open the [Windows preview release](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/releases/tag/v0.5.0-preview.ui.1), expand **Assets**, and download `Xin-Music-Lab-0.5.0-preview.ui.1-win-x64.zip`. Extract the entire archive and launch `XLD.exe` or `XML.exe`. Keep the accompanying files beside the executables.

**GitHub’s Code → Download ZIP / Source code downloads source, not a runnable application.** The application archive contains no model weights, Python environments or AI dependencies. Library browsing, playback and audio visualization are available without models; analysis requires the corresponding backend.

| Version scope | Status |
|---|---|
| Uploaded interface preview `0.5.0-preview.ui.1` | XLD core.26 / XML stems.11; the current downloadable package |
| Latest local workbench `0.5.0-dev.workbench.8` | XLD core.69 / XML stems.13; tested locally, **not yet uploaded as a new release or complete source snapshot** |
| This GitHub update (2026-09-25) | Bilingual README, MIT license for original code, third-party notices and model integration proposal; no new application package |

The repository remains private as of this update, so downloads require access. See [release status](docs/RELEASE_STATUS.md). This is a personal-project preview; full validation on a clean Windows machine is still outstanding.

### Features

The **uploaded interface preview** provides these workflows. AI steps require separately configured backends.

| Feature | Purpose |
|---|---|
| Library and playback | Browse local albums and tracks, and listen to music |
| Separation and refinement | Produce WAV stems, extract selected targets, and compare target/residual audio |
| MIDI transcription | Select default or alternative backends per part; transcribe individually or in a batch and merge/export results |
| Sections and chords | Inspect analysis boundaries, labels and harmonic changes |
| Result management | Compare model results, open output folders and remove generated files |
| Music visualization | Drive visuals from audio and existing analysis results |

The **later local development build** adds a shared timeline, track folding/reordering, track-header WAV/MIDI monitoring, mute/solo/volume, note editing and undo/redo, manual revisions, section/chord annotations, and consolidated result/property panels. These features are not in the linked download yet. Manual revisions remain separate from machine originals; the editor is not a complete DAW.

### Getting started

1. Extract the preview, launch XLD, and select your music library and output directory.
2. Configure a required backend using the [bilingual model integration guide](docs/MODEL_INTEGRATION.md), then test a short clip.
3. Select a song → separate stems → listen → choose a part and model → generate MIDI.
4. Compare and retain useful results; open XML when you want visualization.

The detailed [user guide](docs/USER_GUIDE.md) and [backend setup reference](source/release-tools/MODEL-SETUP.md) are currently in Chinese. Configuration keys, directory layouts and pinned versions are provided there. Check the manifest shipped with your build: later development versions may support different models. **There is no universal one-click model installer yet.**

### Models, licenses and limitations

Adapters include BS-RoFormer/Demucs separation, Mega53 target extraction, and MIDI backends such as MuScriptor and HiRes. Supported capabilities depend on the adapter version and local setup; arbitrary model files cannot simply be dropped into a folder.

- Original project code is [MIT-licensed](LICENSE), allowing modification and commercial use with the required notice. **That license does not grant rights to third-party code, weights, music or generated content.** See [third-party notices](THIRD_PARTY_NOTICES.md).
- Obtain models from their official authors. Code and weights may have different licenses: [MuScriptor Large weights](https://huggingface.co/MuScriptor/muscriptor-large), for example, are labeled CC BY-NC 4.0. The application's MIT license does not permit commercial use of those weights. Use your own account for gated access.
- Some weight licenses remain unclear, and historical third-party source still requires cleanup. Omitting weights does not settle all licensing questions. The [integration proposal](docs/MODEL_INTEGRATION.md) records checked examples and next steps.
- Primarily tested on Windows with NVIDIA GPUs. VRAM, RAM, runtime and storage needs vary by model and track length; no single hardware specification is guaranteed for all backends.
- Distortion, leakage, vibrato and dense arrangements can still cause transcription errors. MIDI preserves note positions in seconds; a fixed export tempo does not mean the actual tempo map has been detected.
- Analysis runs through configured local backends. Acquiring dependencies and weights may require network access. Process only material you have the right to use.

### Feedback and development

Use [Issues](https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion/issues) to report the app version, OS/GPU, backend, reproduction steps and error message. Remove tokens, personal paths and songs you cannot share. Start with [development notes](docs/DEVELOPMENT.md) and [release tools](source/release-tools/README.md), currently primarily in Chinese. Some historical scripts still rely on developer-machine paths; cloning the source is not yet a one-command installation.
