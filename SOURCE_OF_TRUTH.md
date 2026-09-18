# Xin’s Music Lab — Source of Truth after D-drive migration

Historical baseline date: 2026-07-31
Current summary updated: 2026-09-17

Current release candidate: 2026-09-15 — releases/0.5.0-rc.6; see work/refinement-bcnr-20260915/HANDOFF.md.

Latest development: 2026-09-17 — releases/0.5.0-dev.history.1; XLD core.25 / XML stems.10. P0 round A: historical MIDI results stay readable (readMidi `ok`) while only current-version results are cache hits (`matches`); every run keeps its own record under midi/<stem>/runs/; merge records provenance. No model, default or option changed; the three model registries are byte-identical to muscriptor.4. Next: round B (same-engine version switching / rollback / per-run deletion / bounded retention). See work/midi-history-20260917/HANDOFF.md.

Previous development: 2026-09-17 — releases/0.5.0-dev.muscriptor.4; XLD core.24 / XML stems.10. User accepted MuScriptor Large for strings: now the default, YourMT3+ retained. Toe Goodbye listening is complete: the user found the three models broadly similar, with slightly weaker cymbal tails from ADTOF. No drum-default switch was requested; ADTOF remains default and three full-song results are cached. Guitar tiers unchanged. See work/toe-drums-20260917/HANDOFF.md.

Independent runtime candidate: 2026-09-15 — 0.5.0-rc.2 with runtime/0.5.0, relative isolated Python environments and offline model weights. See work/runtime-pack-20260915/HANDOFF.md.

Local release candidate: 2026-09-15 — 0.5.0-rc.1-local, independent XML/XLD executables with explicit external runtime configuration. See work/release-prep-20260915/HANDOFF.md. Existing installed products remain unchanged.

Documentation backfill: 2026-09-13 (`DEVELOPMENT_LOG.md`); no runtime or
installed-product change.

## 2026-09-17 handoff and next iteration

Start with [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) and [the complete status and roadmap](docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md). Current MIDI defaults: HiRes Piano, HiRes Bass, MuScriptor Medium guitar (Large optional), MuScriptor Large strings, ADTOF drums. Future model-version management, ChordFormer, BeatThis and MIDI editing are plans, not completed features. First proposed iteration: decouple historical-result readability from current-model cache matching. That handoff changed documentation only; its round A shipped later the same day as 0.5.0-dev.history.1 (core.25), see above.

The sections below retain dated historical snapshots. Later corrections supersede earlier ownership/default/version statements. The July Material artistic review remains a separate pending item.

## Active development root

`D:\Projects\Xin-Music-Lab-Fusion`

## Editable baselines

- Fusion runtime baseline: `D:\Projects\Xin-Music-Lab-Fusion\source\fusion-runtime-baseline`
- Glitch Generator TypeScript baseline: `D:\Projects\Xin-Music-Lab-Fusion\source\glitch-generator-typescript`
- Phase 0 work controls: `D:\Projects\Xin-Music-Lab-Fusion\work\phase0-20260729`
- Phase 0 evidence: `D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase0-20260729`

## Read-only product reference

`D:\Program Files\xins-music-lab-fusion`

This is the installed product, not a development source directory.

## Current source status

Phase 2 native-material architecture, shared Mapping, MaterialField consumer,
fixed real-audio corpus, and complete engineering acceptance matrix passed on
2026-07-31. Phase 2 remains open only for Xin's artistic review of the final
gallery.

- Added `spectral-fabric`: continuous spectral density rather than bars.
- Added `temporal-strata`: accumulated density plus age history.
- Both use the Phase 1 registry/lifecycle/frame orchestrator and do not own
  audio analysis, a second clock, randomness, or Glitch targets.
- Four real music mappings now enter the same Generator `TargetMixer.mixFrame`
  call as Glitch mappings:
  `audio.loudness → material.coverage`,
  `audio.flatness → material.continuity`,
  `audio.flux → material.refreshRate`, and
  `audio.spectralDensity → material.density`.
- Material definitions are runtime Mapping extensions owned by the Material
  layer. They do not change the 21 formal Glitch targets and do not consume
  the Glitch energy budget.
- The shared engine frame now has explicit `pre-material` and `post-material`
  phases: resolve/evaluate Mapping, render Material, then render Generator.
- Generator WebGL explicitly samples the optional `density` and `age` fields.
  Missing fields use neutral values, so all legacy Canvas/Butterchurn sources
  keep their prior path.
- The fixed corpus uses one verified FLAC plus five evidence-selected states:
  interior quiet floor, sparse, build, drop, and dense. The interior quiet
  floor avoids the repeat-seek instability observed at the FLAC EOF while
  preserving the intended false-trigger and settling check.
- The final Material × Glitch matrix exercised two materials, five current
  presets, and five real-music states: 50 / 50 effect cells and 10 / 10 FX OFF
  baselines passed. It produced 60 screenshots, zero engineering failures,
  zero runtime failures, zero console errors, and zero material-pair collapse.
- Fusion declared checks/contracts: 90 / 90 pass.
- Generator consolidated suite: 327 / 327 pass across 73 files.
- Electron runtime smoke: 57 / 57 pass, 515 observed material frames, zero
  frame mismatches, zero single-RAF ownership violations, and zero runtime
  errors.
- Fixed-frame Generator tests cover preset swap and transport-epoch rewind.
  Desktop replay covers pause, seek, and track-change material resets, plus
  hidden-window pause/resume.
- High-density evidence was captured before adaptive normalization.
- The installed product remains unchanged and contains no Phase 2 module or
  shared-Mapping/field-consumer entry.

Phase 2 engineering work is complete. The automatic matrix cannot declare an
image beautiful, so Phase 2 is not artistically complete until Xin accepts the
final gallery or records a bounded correction list.

See:

`D:\Projects\Xin-Music-Lab-Fusion\DEVELOPMENT_LOG.md`

`D:\Projects\Xin-Music-Lab-Fusion\work\phase2-20260730\PHASE2_MATERIALS_CORE_REPORT.md`

`D:\Projects\Xin-Music-Lab-Fusion\work\phase2-20260730\PHASE2_SHARED_MAPPING_FIELD_CONSUMER_REPORT.md`

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260730\phase2-materials-report.json`

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260730\phase2-shared-mapping-runtime-smoke-v3.json`

`D:\Projects\Xin-Music-Lab-Fusion\work\phase2-20260730\PHASE2_ARTISTIC_MATRIX_REPORT.md`

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-report.json`

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-gallery.html`

Phase 1 source reconciliation and Task 1 Material architecture seam completed
on 2026-07-30.

- The TypeScript source now owns the five current product presets.
- Rejected `fracture` / `impact` presets are removed from source, tests, and demo.
- The eight-frame history reservoir, preset GLSL pipeline, render port, runtime
  application, reserved uniforms, and current surface labels are backported.
- TypeScript check and clean build pass.
- Generator consolidated suite: 322 / 322 tests pass.
- Electron WebGL tolerance passes.
- The clean Generator package is staged in the editable Fusion runtime
  baseline with exact package parity (`tools` 433 files, `vendor` 430 files).
- Fusion baseline contracts: 80 / 80 pass.
- Fusion baseline runtime smoke: 54 / 54 pass, including Material/Generator
  same-frame alignment, injected WebGL
  context loss/restore and zero runtime errors.
- The frozen installed Generator was rechecked: 430 / 430 files, zero
  differences.
- The installed product was not modified.

Phase 1 Task 1 now provides:

- `VisualMaterialRegistry` with all 27 current visual entries registered;
- `MaterialRuntime` plus legacy Canvas/Butterchurn adapters;
- `reset / update / render / outputs / status` lifecycle ownership;
- abstract `MaterialSurface` color output and optional fields boundary;
- `MaterialTargetRegistry` with four initial `material.*` targets;
- a frame orchestrator and runtime same-frame monitor;
- backward-compatible `xin.xml-visual-source/1` plus
  `xin.xml-material-source/1` extension metadata;
- ownership metadata on all 21 formal Generator targets;
- cross-layer duplicate-semantic warnings with `allowDuplicate` exemption.

The source/deployment reconciliation, Material architecture seam, shared
Mapping path, renderer field consumer, deterministic lifecycle replay, fixed
real-audio corpus, and full Material × Glitch engineering matrix blockers are
closed. The remaining Phase 2 action is Xin's human art-direction decision on
the final gallery. Product deployment was not performed and still requires
explicit approval.

See:

`D:\Projects\Xin-Music-Lab-Fusion\work\phase1-20260730\PHASE1_SOURCE_RECONCILIATION_REPORT.md`

`D:\Projects\Xin-Music-Lab-Fusion\work\phase1-20260730\PHASE1_MATERIAL_RUNTIME_REPORT.md`

## Superseded development location

`C:\Users\12452\Documents\Codex\2026-06-17\new-chat\.webgl-opt`

After file-level verification, this location may be removed to reclaim space. It must not become active again.


## 2026-09-13 subsequent development: stems v1

The editable Fusion baseline now includes the single-track stem workflow and task fixes. Build: `0.5.0-dev.stems.1`. Existing Phase 2 artistic acceptance remains pending. Installed products remain unchanged.

- Task reservation occurs before filesystem awaits; cancellation/retry, partial SongFormer preservation, and append-only task logs are tested.
- Standalone `analysis-separation/runner.py` uses the existing XLD AI environment and htdemucs_6s weights in `D:\Caches\codex\models\xld`.
- XML offers separation, individual stem audition, and output-folder access; stems.json is independent of the timeline manifest.
- Full declared tests, focused task regressions, one real complete song, WAV validation, and Electron audition/reload checks passed. Human stem-quality review is pending.
- Development entry: `source/fusion-runtime-baseline/start-dev.cmd`. The installed-product launcher does not include these changes.
- Scope and handoff: `work/stems-20260913/SPEC.md`, `work/stems-20260913/HANDOFF.md`.


## 2026-09-13 subsequent development: single-stem MIDI

Current development build: releases/0.5.0-dev.guitar.1; daily release candidate remains RC.6.

The obsolete i18n version-stamp assertions were removed while retaining functional checks. Full declared tests and MIDI task regression pass. Real 211.515-second stem transcription, cache and cancellation checks, and Electron UI/reload checks pass. MIDI note accuracy still needs user review; no score/tempo detection or MIDI editor is implied. Installed products remain unchanged. See work/midi-20260913/HANDOFF.md.


## 2026-09-13 subsequent development: XML / XLD shared results

Active editable XLD desktop baseline: D:\Projects\Xin-Music-Lab-Fusion\source\xld-runtime-baseline (0.5.0-dev.shared.1). XML is 0.5.0-dev.stems.3. Both use source/shared-analysis/derived-assets.cjs for stem/MIDI discovery and validation. XLD adds existing-result audition and folder access; generation stays in XML for this iteration. The installed Python/model runtime is reused without modification.

Shared path identity, legacy result discovery, dual-app file parity, playback/reload checks and full declared tests pass. Installed products remain unchanged. See work/interop-20260913/HANDOFF.md and the XLD baseline README for launchers and runtime paths.


## 2026-09-14 correction: XLD owns music analysis

Current XML: 0.5.0-dev.stems.4; XLD: 0.5.0-dev.core.1. This supersedes the earlier “generation stays in XML” product boundary. XLD owns source/xld-runtime-baseline/core/analysis-service.cjs, core/derived-assets.cjs, analysis-separation and analysis-midi. XLD UI can generate, cancel, audition and export. Section, harmony, stems and MIDI use the same service instance in XLD. XML retains convenience controls through an import-only compatibility adapter to the XLD core; it no longer owns a separate analysis implementation. The former shared-analysis reader is a compatibility export.

Source models and output contracts remain unchanged. Full tests, real 30-second XLD WAV/MIDI and SongFormer/CENS+HPSS runs, cache/cancel/retry, XML output parity, manual-tag preservation and both UI playback regressions pass. Cross-process task coordination and product packaging were not added. Installed products remain unchanged. See work/ownership-20260914/SPEC.md and HANDOFF.md.


## 2026-09-14 follow-up: XML / XLD round trip

Current XML: 0.5.0-dev.stems.5; XLD: 0.5.0-dev.core.2. The analysis ownership above remains authoritative. XML now presents existing results and audition by default, with a primary XLD entry and folded analysis controls. Both the current-track entry and library-row actions open XLD. Returning focus or selecting Update results reloads the current track's timeline and derived assets from disk, including library analysis badges, while preserving audio playback state and position. Invalid results retain the displayed timeline; replaced or invalid auditioned stems fall back to the original at the same position.

XLD reuses its existing window per user-data profile and consumes a one-time current-track request from the active analysis directory. New selection does not start playback or interrupt an analysis task. This is window reuse, not cross-process analysis-task coordination.

Both full declared test suites and isolated real Electron round-trip tests pass. Checks cover real request writing, focus/manual refresh, paused and playing audio, MIDI availability, corrupt results, stale stems, delayed refresh during song changes, and a real second XLD process. This iteration reuses existing real WAV/MIDI fixtures and does not rerun models. No dependencies or installed products changed. Close old development windows and reopen the existing launchers. See work/roundtrip-20260914/SPEC.md and HANDOFF.md.


## 2026-09-14 follow-up: instrument-specific MIDI models

Current XML: 0.5.0-dev.stems.6; XLD: 0.5.0-dev.core.3. XLD adds HiRes Piano, GAPS Guitar (paper checkpoint) and HiRes Bass alongside Basic Pitch. Available specialist models are the per-instrument defaults, with Basic Pitch as the general alternative. The existing engine-card pattern is used in a reorganized WAV/MIDI panel, including default/alternative and cached-result status.

Each instrument/model has its own MIDI manifest. The existing per-stem manifest remains the active successful result for XML. Creating or explicitly reusing a cached model activates that result; selecting a card alone does not. Legacy Basic Pitch MIDI remains available, and failed/cancelled runs do not replace existing successful results. Model defaults are product presets, not a claim of validated musical superiority.

An isolated high-resolution runtime and three checksum-verified public checkpoints were added under D:/Caches/codex, reusing the existing XLD AI environment read-only. Installed products and original audio were not replaced. Full declared tests, real 30-second Radioactive Spell Wave transcription with all four models, independent-cache/activation and running-cancellation checks, actual XLD model selection and bilingual/enlarged layouts, and actual XML refresh/folder/playback compatibility passed. MIDI accuracy still requires listening review. See work/midi-models-20260914/SPEC.md and HANDOFF.md; detailed runtime/model provenance is in source/xld-runtime-baseline/analysis-midi/README.md.


## 2026-09-14: MIDI save/readback correction

XLD 0.5.0-dev.core.4; XML remains 0.5.0-dev.stems.6. Nancy Tries to Take the Night exposed a MIDI validator bug: almost simultaneous chord notes share a saved MIDI tick and can change list order. A positional comparison rejected valid full-song results. Validation now compares note multisets by pitch, velocity and MIDI start/end ticks, without changing transcription or note JSON timing. Real corruption and missing notes still fail. XLD retains scoped failure details across refreshes and clears them after retry/success; existing cached results remain available.

Both runtime regression suites and both app test suites pass. The complete 396.581-second guitar and piano stems were transcribed and validated (2915/3086 notes). Actual Electron checks cover persistent failures, model/stem isolation, cached-result preservation, successful retry and folder access. Installed products, source audio and model parameters are unchanged. See work/midi-save-fix-20260914/HANDOFF.md.


## 2026-09-14: WEG 多模型分轨

当前开发版 XLD 0.5.0-dev.core.5、XML 0.5.0-dev.stems.7。XLD 分轨新增 BS-RoFormer SW 六轨（可用时默认），Demucs 6s 保留为备选；默认/备选卡片沿用既有布局。每模型单独保存 WAV，生成/使用成功才激活 stems.json，卡片预选不修改音源。XML 继续读取 XLD 的当前结果，便捷操作沿用当前模型或首次可用默认，分析所有权没有改变。

MIDI 缓存按分轨 sourceRunId 再分模型，切换新 WAV 不误用旧 MIDI，切回旧 WAV 可恢复该来源全部模型结果。失败/取消保留成功结果。新 RoFormer 环境、固定公开代码与校验权重仅放入缓存；安装产品、原音频、SongFormer/和弦及人工标注未改。整曲结果在 CPU 累加，按块使用 GPU。

两首完整 WEG、真实取消、新分轨的三声部全曲 MIDI、短音频/静音/重采样、上游数值一致性、实际 XLD/XML 窗口、两产品完整测试及本地 A/B 试听页均列入验证。默认不表示已证明 WEG 音质最优。交接与详细证据见 work/weg-separation-20260914/HANDOFF.md。


## 2026-09-15：鼓 MIDI 与一键输出目录修复

XLD core.9 / XML stems.8，发布候选 RC.3。XLD 新增 ADTOF 五类鼓点 MIDI（固定力度）；一键生成覆盖 bass、piano、guitar、drums，再融合非空声部。快速同类鼓点保存时截断重叠时长，敲击起点不变。

本曲 MIDI 目录入口独立于试听声部和模型预选，原曲选择、部分完成、取消及重开后可访问有效输出；少于两个非空声部明确提示无需融合。XML 同步支持读取鼓 MIDI。

完整 WEG 隔离副本生成 2853 个鼓点，四轨融合 7018 音符；两应用回归、鼓通道/滚奏回读、实际窗口/目录状态及 EXE 往返通过。音符数不代表质量，鼓听感待用户确认。沿用 runtime/0.5.0，保留 RC.2/安装产品；仍为个人本地 RC，干净 Windows 验收和上游再分发许可确认未完成。见 work/drums-midi-20260915/HANDOFF.md。


## 2026-09-15：RC.4 发布体验收尾

发布壳 RC.4；分析源码保持 XLD core.9 / XML stems.8。发布包统一窗口/页面版本，新增版本帮助按钮、F1 离线帮助和只读环境路径检查。使用说明包含四声部一键 MIDI、输出定位、缓存、升级回退与另一台 Windows 验收清单。构建从单一版本字段生成说明书及元数据，修复旧文档 RC.2 与页面 FUSION 0.3 标识不一致。

两应用回归、发布配置/壳测试、实际 EXE 双端帮助复用、双语标签、小视口与一键缓存流程/同包跳转通过。没有改算法、模型、运行环境、用户档案或结果。保留 RC.3 与安装版；未发现 Windows Sandbox，干净机器验收未完成，继续保留 RC 标识。见 work/release-polish-20260915/HANDOFF.md。


## 2026-09-15：RC.5 文件标识与环境检查

XLD/XML Windows 文件属性写入产品名、版本及图标，窗口图标同步；XLD 复用页面字标配色，XML 沿用原图标。新增随包“检查环境.cmd”，无需系统 Node/Python，逐项探测所有环境与模型（含鼓），输出独立 JSON/中文报告。缺 Python、模型、超时和损坏配置都有失败反馈。真实推理验收已补齐鼓轨，按六步动态判断完成。

发布配置/壳/诊断测试、两个实际 EXE 窗口、帮助复用、缓存一键 MIDI 目录、同包交接通过；WEG 30 秒分轨、四声部 MIDI 与融合重新推理通过。保留既有版本、分析算法、运行环境与用户数据。未完成无 Python 的干净 Windows 全流程验收，仍为个人候选版。详见 work/release-branding-20260915/HANDOFF.md。


## 2026-09-15：RC.6 other 弦乐细分试用

XLD 分轨页加入 AudioSep 30 秒细分：默认弦乐组、备选小提琴倾向，明确为同模型两种提取预设。支持起点、取消、原始/目标/剩余三路试听、缓存、单独保留和目录入口；原分轨及 MIDI 不变。新增独立约 156 MB 模型附件，复用现有 Python 环境。BCNR 三段共 12 次 GPU 推理、数值检查、实际界面与两个 EXE 旧流程回归通过。试听质量待用户评估，不能以残差重建正确代替语义分离成功。详见 work/refinement-bcnr-20260915/HANDOFF.md；试听页 artifacts/refinement-bcnr-20260915/listening/BCNR-弦乐试听.html。

Current development build: releases/0.5.0-dev.refine3; daily release candidate remains RC.6.


## 2026-09-15：WEG 三模型独立开发版

发布 releases/0.5.0-dev.refine3，默认 Bowed Strings v2，备选 AudioSep / Mega 53；目标与模型分开选择，保留 30 秒试用范围。GPU 独立输出层推理，CPU 累计音频；自动模式显存不足缩短分块再回退 CPU，手动 CPU 已实测。未将 RAM 当作显存。Bowed/Mega 与完整模型对应输出 FP32 对照误差为零。WEG Flowers of Romance 整曲基础分轨及 90–120 秒三模型/小提琴预览已准备；真实 GUI、取消/缓存/保留、原一键 MIDI 目录与 XML 衔接回归通过。开发档案和分析目录独立，RC.6 保留。质量待用户试听，详见 work/refinement-three-20260915/HANDOFF.md。

## 2026-09-16：用户多段试听结论
用户原话：“Mega完胜，bowed把部分人声以及失真的声音剪进去了”。本轮 Flowers of Romance 多段对比以 Mega 53 为优选；Bowed 提取量较大包含人声/失真声音误入，不据提取量判为更完整。90 秒初轮两模型通过的历史记录保留；用户未提供逐段评分，不自动填写全部片段通过或推及其他曲目。
后续版本默认选择 Mega 53，Bowed 保留备选，AudioSep 保留实验选项。此轮仅更新验收与交接记录；当前 0.5.0-dev.refine3 包及其默认卡片未修改、未重打包。后续先落实模型排序，再考虑整曲细分。


## 2026-09-16：Mega 53 整曲开发版

XLD 默认 Mega 53，细分支持整曲 / 30 秒切换；其他两模型保留预览。整曲与旧预览缓存隔离，目标/残差不覆盖基础六轨或进入 MIDI。原始 FLOAT 输出保留，另按三路共用增益保存安全试听文件。Flowers of Romance 整曲 823.9423 秒已完成，模型推理 200.51 秒 / 1410.9 MiB PyTorch 显存分配峰值。逐样本对齐与重建、164 个边界数值检查、恒等拼接、真实取消/缓存/旧结果保留及 XLD 单元与控制器测试通过；声音与实际窗口视觉待用户验收，不声称自动听评通过。开发入口 releases/0.5.0-dev.mega1，沿用独立开发分析目录，新版偏好隔离，RC.6 与 refine3 保留。详见 work/mega-full-20260916/HANDOFF.md。


## 2026-09-16：Mega53 全部目标开发版

XLD 0.5.0-dev.core.13，releases/0.5.0-dev.mega2：开放 53 个原始目标与六类筛选，输入支持原曲或当前六轨；默认保持 other / 弓弦乐 / full / auto。独立来源缓存与旧缓存兼容，原曲无须先分轨。原 strings 与 bowed_strings 区分；53 个输出不是互斥声部，不能直接相加。所有 53 头实际等价性、XLD 全套测试、五项 MEGURI 原曲 497–527 秒真实 GPU 推理/音频检查、旧整曲/预览读取与真实取消测试通过。9组环境检查通过；UI 为控制器契约测试，实际窗口和新目标听感待用户验收。旧 mega1/RC.6 保留；开发版共用原开发分析目录，不改原 MIDI。详见 work/mega-all-20260916/HANDOFF.md。


## 2026-09-16：音频存储管理开发版

XLD core.14 / releases/0.5.0-dev.storage1，在资料库中新增存储管理：按歌曲/模型/目标查看完整输出体积、搜索筛选、保留与取消保留、批选、定位、回收站或明确确认的永久删除。已有细分/MIDI依赖保护基础分轨，保留原曲/MIDI/段落/人工标注，音频缺失后可重新生成。当前开发目录只读统计约9.22GiB/23组，未自动清理用户数据。XLD全套、临时删除夹具、真实Windows回收站、控制器、9组环境检查通过；无实际窗口视觉或干净VM验收声明。沿用开发分析目录，mega2和RC.6保留。详见 work/storage-20260916/HANDOFF.md。


## 2026-09-16：分轨与 MIDI 流程整理

XLD core.15 / releases/0.5.0-dev.flow1。MIDI 转谱声部与试听选择独立，明确当前基础分轨来源，模型卡片区分已保存与当前用于融合。一键计划显示缓存复用/生成/重算；失败与完成消息绑定 WAV 来源；空音符可访问但不融合。分轨/MIDI 重算选项分开，切歌重置。完成后等待读回结果再恢复操作，修复状态/按钮提前更新的时序。Mega53 细分保留独立 WAV 流程，暂未接入 MIDI。

XLD/XML 回归、真实隐藏 Electron 四声部缓存/融合/失败/取消/目录/重载/双语/小窗口检查，以及9组环境探测通过；零 UI console error。没有新增模型或修改算法、用户音频/结果与人工标注；沿用开发分析目录，旧开发版保留。详见 work/flow-20260916/HANDOFF.md。


## 2026-09-16：弦乐 MIDI 第一版

XLD core.16 / releases/0.5.0-dev.strings1。复用 Basic Pitch，将 Mega53 已有整曲弦乐组/小提琴/中提琴/大提琴/低音提琴结果接入单轨 MIDI、一键生成与融合。每曲显式选择一个弦乐来源，按细分 runId 隔离缓存，整曲时间保持，GM音色匹配目标。原曲细分可独立转谱；片段不纳入。存储管理保护存在 MIDI 依赖的细分 WAV。

WEG Flowers of Romance 823.942 秒真实转谱耗时52.032秒，3623音符，回读/缓存/音色/范围和与人工鼓夹具的融合验证通过，音质待听评。两应用回归、隐藏Electron来源选择/目录/重载/双语以及9组运行环境检查通过。沿用开发资料库，旧版本保留。详见 work/strings-midi-20260916/HANDOFF.md。


## 2026-09-16：紧凑工作台 compact1

XLD core.17 / releases/0.5.0-dev.compact1：缩小曲目栏、按钮、模型卡片和播放器；MIDI 单声部与整曲操作宽屏双栏，音源与试听集中；说明和融合声部详情默认折叠。分轨页统一密度，窄窗自动重排。后端/模型/缓存不变。两应用回归及真实 Electron 窗口、目录、双语、大字体和发布资源检查通过。沿用现有开发分析目录，旧版本保留。详见 work/compact-workspace-20260916/HANDOFF.md。


## 2026-09-16：YourMT3+ 与单屏工作台

XLD core.18 / releases/0.5.0-dev.yourmt3.1：strings 新增 YourMT3+ 备选，Basic Pitch 保持默认；整曲跨段解码，重叠同音高分通道输出保留时长。Flowers of Romance 同源结果 1163 音符，实际歌曲目录已缓存，先前启用结果恢复。默认工作台在 1180×780 普通字号一屏，分轨与 MIDI 左右分区，说明/标注/明细折叠。真实转谱/缓存/切换/一键/目录/融合、双应用回归、窗口及发布资源验证通过。试听见 artifacts/yourmt3-workspace-20260916/listening/弦乐MIDI对比.html；细节与限制见 work/yourmt3-workspace-20260916/HANDOFF.md。新附加环境依赖 runtime/0.5.0。旧版本保留，仍为本机开发版。


## 2026-09-16：弦乐默认 YourMT3+ 与 MIDI 清理

XLD core.19 / releases/0.5.0-dev.yourmt3.2：用户试听 MEGURI 后确认 YourMT3+，现为 strings 单声部及一键 MIDI 默认引擎，Basic Pitch 保留备选。一次性迁移旧默认选择，之后尊重手动偏好。MIDI 页新增删除当前音源/模型结果的入口，确认后移入 Windows 回收站；删除启用中的 Basic Pitch 时自动启用已有同源 YourMT3+ 缓存。同步刷新模型、目录、一键及融合状态；保留原始音乐、WAV、其他模型和已有融合文件。未清理用户真实曲目结果。核心删除/缓存/恢复/边界测试、双应用回归、隔离真实回收站交互、发布窗口宽窄与大字体验证通过。细节见 work/midi-manage-20260916/HANDOFF.md，证据见 artifacts/midi-manage-20260916。未调整模型参数，揉弦造成碎音仍是待验证解释；旧版本保留，本机开发版。


## 2026-09-16：电吉他 YourMT3+ 试听版

XLD core.20 / releases/0.5.0-dev.guitar.1：guitar 新增 YourMT3+ 备选，GAPS 仍默认；模型菜单按原声／清晰拨弦、电吉他试听、通用／弯音检测说明用途。复用原模型环境，支持独立缓存、一键 MIDI、融合、删除与目录。MEGURI 同源整曲完成 YourMT3+ 1912 音符（GAPS 883），新模型缓存可直接使用，原启用选择保留。统计不代表质量提升，待用户试听。吉他与弦乐联合验证发现融合通道不足，现对同声部同音色无表情轨进行无损通道整理；五声部 9260 音符 / 10 轨，回读验证时值与音符完整。融合缓存指纹升级，旧文件保留。双应用回归、真实推理、单屏双语、一键/删除/目录、发布窗口和九段音频通过。试听 artifacts/guitar-yourmt3-20260916/listening/吉他MIDI对比.html；细节 work/guitar-yourmt3-20260916/HANDOFF.md。本机开发版，尚未改电吉他默认，不重建连续揉弦曲线。




## 2026-09-17: GitHub source repository connected

Private repository: https://github.com/jiangxin1245234785-stack/Xin-Music-Lab-Fusion . The local main branch tracks origin/main; the initial push was verified against the remote commit. Source, documentation and selected text evidence are tracked. Models, installed runtimes, releases, music and generated results remain local. Windows Git Credential Manager handles local Git authentication; no token is stored in this project. See docs/GITHUB_WORKFLOW.md and work/github-setup-20260917/HANDOFF.md. This repository setup does not change the application version.
