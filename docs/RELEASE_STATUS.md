# 2026-11-26 · 日常入口切到 terrain.36

根目录 XML 和 XLD 的日常版本为 `0.5.0-dev.terrain.36`，回退入口为 `0.5.0-dev.terrain.35`。相对 `.35` 只改了车窗地貌：晴天下午的阳光从左上落到窗台上，收音机有同向的受光和影子，光量跟天气引擎的云量走（雨、雪、沙尘没有光斑）；天上的光晕固定在左上，不再随时间移动；收音机待机电平去掉了与歌无关的起伏，只留声部电平和本曲鼓点。`.22` 仍在 `releases/` 下。[决定与用户原话](../work/terrain-20261119/SETTING.md) · [交接](../work/terrain-cabin-20261125/HANDOFF.md)

## 2026-11-26 · 日常入口切到 terrain.35（已被上一节取代）

根目录 XML 和 XLD 的日常版本为 `0.5.0-dev.terrain.35`，回退入口为 `0.5.0-dev.terrain.22`（`releases/current-release.cmd`、`previous-release.cmd`）。相对 `.22`，这一版有：车厢改造（窗洞纵深、窗帘、顶屏三行后改为分栏信息屏、线路图站名缩写、窗台便携收音机）；XLD 的情绪曲线（`mood-curve.json`，公式 `mood-direct-1`、尺子 `mood-scale-1`）；车窗地貌的天气强弱按情绪曲线走，可切回原来的办法；XML 的情绪曲线调试台（快捷键 M）和谱面设置收纳；XLD 一键分析列表在运行前显示已有 / 待运行 / 仅需升级 / 需重转，旧的 MuScriptor bass / piano / guitar 谱只补后处理、不重转。`.31`–`.34` 与 `mood.1` 是中间试版，本机已删除。[决定与用户原话](../work/terrain-20261119/SETTING.md) · [车厢与调试台交接](../work/terrain-cabin-20261125/HANDOFF.md) · [情绪曲线交接](../work/mood-curve-20261125/HANDOFF.md)

# 2026-11-25 · 车窗地貌暴雨与风雪试版

`0.5.0-dev.terrain.26` 可从版本目录的 XML.exe 单独启动。雪片在各自深度独立飘动，强风雪短暂遮去远山，极端雨势在道床上激起水雾。[本机试版与同曲动态对照](../work/terrain-storm-20261125/HANDOFF.md)

## 2026-11-25 · 车窗地貌雨雪山景与天气强度试版

`0.5.0-dev.terrain.25` 可从版本目录的 XML.exe 单独启动。雨雪山体沿实际山脊生成坡面，雨、雪和飞沙随曲目连续增强。日常启动器指向 `.22`。[本机试版与同曲对照](../work/terrain-intensity-20261125/HANDOFF.md)

## 2026-11-24 · 车窗地貌四天气美术版

四天气美术候选版 `0.5.0-dev.terrain.23` 可从该版本目录的 XML.exe 打开。根目录 XML 和 XLD 的日常版本为 `0.5.0-dev.terrain.22`，回退入口为 `0.5.0-dev.terrain.13`。[美术版与对照图](../work/terrain-art-20261124/HANDOFF.md) · [日常版发布记录](../work/terrain-polish-20261123/HANDOFF.md)

# 2026-09-26 · 0.5.0-preview.setup.1

新版试用包已发布：最新工作台、首次配置、模型导入检查与 MIDI 基础环境安装。附带匹配的过滤后源码 ZIP 和 SHA-256。旧 ui.1 资产保留。仓库可见性不变。

New preview: latest workbench, first-run setup, backend import/checks and optional base MIDI environment installation. Includes a matching filtered source archive and SHA-256 checksums. Older ui.1 assets remain. Repository visibility is unchanged.

验证：XLD/XML 现有回归通过；新建独立 Python 3.12.10 环境完成 MIDI 读写；实际两个 EXE 无模型启动、配置保存及双语布局通过。**尚未完成另一台干净 Windows 或完整 AI 安装/推理验收，仍为 prerelease。**

Validation: existing XLD/XML regressions; fresh managed Python with MIDI roundtrip; both packaged executables, no-model startup, setup persistence and bilingual layout. **Clean-machine and full AI installation/inference acceptance remain pending. Prerelease only.**

---

## Previous record / 先前记录

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
