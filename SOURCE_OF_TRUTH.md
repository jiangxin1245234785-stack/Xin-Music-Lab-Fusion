# Xin’s Music Lab — Source of Truth after D-drive migration

2026-11-22 当前开发版为 **0.5.0-dev.midiin.4**，上一入口为 **0.5.0-dev.other.5**。根目录 XML 和 XLD 启动器共用 `releases/current-release.cmd`。本版 XML 支持外部 MIDI 和 4K 谱面视频导出，详见[使用说明](docs/XML_EXTERNAL_MIDI.md)。雷达双行铭牌的实测见[other.5 交接](docs/XML_RADAR_OTHER5.md)。

最新本地入口（2026-11-12，优先于下方历史）：**releases/0.5.0-dev.score.25（XLD core.76 / XML score.25）**，上一稳定score.21。XML已接入“按录音强弱显示”，默认关闭；显式生成独立力度副本，缓存、进度、取消、强制复跑、原值回退、中英与重开记忆齐全。原音频/MIDI/分析只读，每次完成留新run，失败/取消不替换旧副本；已有动态、人工修订和人声曲线保持。完整默认/最小窗口验收、40组/240状态、启用副本64次换歌、22→25缓存复用、播放连续与169原文件SHA通过；6后端、147谱面、38适配器改坏、48渲染和两个exe通过。新包2803/旧包2800文件完整；XLD包内固定为21已验证基线，工作区额外XLD改动保留未混入。阶段22–25与源码SHA均留存，未提交。见 [当前交接](work/score-dynamics-20261112/HANDOFF.md)、[验收报告](work/score-dynamics-20261112/REPORT.md)、[后续清单](work/score-dynamics-20261112/NEXT_WORK.md)。

节拍候选更新（2026-10-26，优先于下文历史）：当前本机入口为 `releases/0.5.0-dev.tempo.1/XLD.exe`，XLD core.73 / XML stems.13。MuScriptor v0.4.0（8a1ef886）已作为弦乐的“v0.4 · 节拍试验”独立卡片；默认仍是用户确认的4c03caf/50ms。新拍点分析在CPU处理原曲，正常MIDI/编辑/混合仍按秒且不量化，另行导出带速度图的谱面MIDI；谱面可能增加弱起留白。Large权重不变，无新的音符精度结论。真实MEGURI/toe拍点与导出、既有回归和对照页逻辑通过，拍号未确定、听评待用户验收；MEGURI音符复用已验收事件，本轮未重新运行Large GPU。旧strings.1及原数据保留。详见[本轮报告](work/muscriptor-v04-20261026/REPORT.md)和[试听对照](work/muscriptor-v04-20261026/listening/index.html)。未发布GitHub。


**已被取代（2026-11-14）**：人声只留一条识别链 `score-vocals`（主唱分离 + RMVPE + 八度保护，`analysis-score/vocals_runner.py`），结果和主唱 / 和声都由 XLD 写进这首歌的分析目录（见 `work/xld-vocals-20261114/INTERFACE.md`）。`vocals-pyin` 不接界面、不再当候选；代码留着不删，因为 `score-vocals` 借它的切音符参数，XLR 的命令行壳也调它。以下是当时的记录。
人声转谱后端（2026-10-26，**未进界面、未发布**）：新增 `vocals-pyin`，XLD 第一次能转人声。`vocals.wav` 本来就是分离的六轨之一，缺的只是转谱这一侧。pYIN 是算法不是模型，**没有权重、没有新环境**，只用 XLD_MIDI_PYTHON（basic）里已有的 librosa；`derived-assets.cjs` 的 STEMS 从 models.json 推导，加档案后 `vocals` 自动注册、`defaultEngine('vocals')` 可用。改动集中在 Python 侧：新增 `analysis-midi/vocals.py`、`models.json` 档案、`runner.py`（STEMS/vocals=53、分发、availability）、新增 `tests/midi-vocals.py`；**`app.js`、`derived-controls.js`、`workspace-controls.js`、i18n 一律未动**（那几个文件当时压着未提交改动），所以界面里还选不到它，`workspace-controls.js:136` 的引擎列表也还没有 `vocals-pyin`。力度不在后端做：返回 constant-100 并声明，由 runner 已有的 `velocityFromStem` 分轨能量那一步给，和吉他弦乐同一条路径。算法上处理了三个真实失败模式——按分块中位数做八度修正（副歌整体高八度不会被误改）、半音域中值滤波加 hysteresis 防揉弦切碎长音、门限同时看 voicing 概率与分轨自身 p90 相对电平。七里香实测 466 音符、唱 108.9 秒（占 36%）、音域 A#2–A4、修正 795 帧、离群 0；音高集中在降 E 大调，与该曲调性一致。只在响的区段上跑 pYIN 使整首从 210 秒降到 139 秒且音符数不变（466→466）。命令行入口 `memesynth vocals <人声.wav|曲目文件夹> --merge <merged.mid>`。听感待用户验收，尤其八度与和声垫误判；下一步是界面接线。

弦乐更新（2026-10-18，优先于下文历史）：当前本机开发版 `releases/0.5.0-dev.strings.1/XLD.exe`，XLD core.72，XML stems.13。项目根目录“启动XLD.cmd”为新入口。用户确认MuScriptor Large“新版＋填空50ms”有明显提升，已设为默认，并提供原时序Large备选。固定上游4c03caf单独目录，其他用途保留原上游/配置，权重复用。旧MIDI/人工修订可切回，不批量重算；原storage.1保留。回归与30秒真实GPU输出/预览一致性已通过，个人听评不作普适精度声明。详见[本轮交接](work/muscriptor-update-20261018/HANDOFF.md)。未发布GitHub。


管理补验（2026-09-24）：workbench.8/core.69 源码与包未变；标注增改删、版本保留/切换/指定删除回退、自动结果清理取消/确认、WAV保留保护通过。见[本轮交接](work/workbench-management-20260924/HANDOFF.md)。剩余模型任务实跑、部分管理分支与正式发行验收继续按清单推进。

工作台界面整合进度（2026-09-23，优先于下文历史版本）：workbench.8/core.69 完成第四轮核心编辑/监听/导出综合验收，XML stems.13。新增空结果引导并调整属性/日志顺序；真实导出、融合、草稿跨版本恢复和新进程重启通过。见[第四轮交接](work/workbench-review-20260923/HANDOFF.md)及[53项验收记录](work/workbench-review-20260923/FEATURE_ACCEPTANCE.md)。部分模型/管理分支与正式发行验收仍待补。

当前阶段（2026-09-23）：R12–R16工程已交付；追加R17轨组、拖动排序和轨头监听控件也已交付。当前tracklayout.3/core.65，见[本轮交接](work/track-layout-20260923/HANDOFF.md)。下一步真实编辑与布局使用反馈；FL Studio/外部DAW暂缓。

Historical baseline date: 2026-07-31
Current summary updated: 2026-09-23

Current release candidate: 2026-09-15 — releases/0.5.0-rc.6; see work/refinement-bcnr-20260915/HANDOFF.md.

Latest development: 2026-09-23 — releases/0.5.0-dev.tracklayout.3; XLD core.65 / XML stems.13. R17: foldable per-stem instrument groups, original-instrument editing in the combined view, persistent group/child display order, drag handles and per-track WAV/MIDI/M/S/volume controls. Six regression chains, real MEGURI grouped editing and layout persistence, full save/export/merge/restart passed. 2783 package files / 2881 source hashes verified. User feedback and clean-machine release validation remain. See work/track-layout-20260923/HANDOFF.md.

Previous development: 2026-09-23 — releases/0.5.0-dev.noteshape.2; XLD core.64 / XML stems.13. R16: explicit same-pitch consecutive join, cursor/precise-time split, orange preview, one-step undo/redo, draft and mixed audition. Six regression chains, real MIDI round trips, packaged MEGURI save/export/merge/recovery and independent restart passed; 2782 package files / 2879 staged sources verified. User listening and clean-machine formal-release validation remain. See work/note-shape-20260923/HANDOFF.md.

Previous development: 2026-09-23 — releases/0.5.0-dev.hybrid.1; XLD core.63 / XML stems.13. R15: WAV/MIDI source union, complementary Mega parent replacement, unique-source bounded PCM streaming, per-stem sources, presets and original A/B. Full regressions, real MEGURI mixing and complete edit/export/merge/restart passed; listening acceptance and clean-machine release validation remain. Next R16 note join/split. See work/hybrid-20260923/HANDOFF.md.

Previous development: 2026-09-23 — releases/0.5.0-dev.multimidi.1; XLD core.62 / XML stems.13. R14: overview multi-MIDI, parent/child mute/solo, smooth parent gain, focus-independent shared scheduling and explicit 256-voice overload stop. Five regressions, real MEGURI and 112-note native AudioContext stress, packaged editing/restart passed. Next R15 WAV/MIDI mixing. See work/multimidi-20260923/HANDOFF.md.

Previous development: 2026-09-23 — releases/0.5.0-dev.consistency.1; XLD core.61 / XML stems.13. R13: draft-safe merge and commit revalidation, overlap-weighted harmony, exact chord parsing and visible model reference. Five regression chains, real MIDI race tests, packaged MEGURI and process restart passed. Next R14 multi-track MIDI/M/S. See work/consistency-20260923/HANDOFF.md.

Previous development: 2026-09-22 — releases/0.5.0-dev.transport.1; XLD core.60 / XML stems.13. R12: shared transport, master volume/seek/loop, explicit WAV/MIDI listening, preview time mapping and cancellation. Five regression chains, packaged MEGURI and process restart passed. See work/transport-20260922/HANDOFF.md. Next R13; user listening and clean-machine release validation remain.

Previous development: 2026-09-22 — releases/0.5.0-dev.export.1; XLD core.59 / XML stems.13. R11: byte-identical whole-stem MIDI export, draft/version/source recovery, complete engineering flow and separate-process restart verified. All eleven implementation rounds delivered; user listening acceptance and clean-machine release validation remain. See work/midi-export-20260922/HANDOFF.md.

Previous development: 2026-09-22 — releases/0.5.0-dev.edit.1; XLD core.58 / XML stems.13. R10: note editing, undo/redo, persistent drafts, live draft audition and safe revision save; multi-instrument cache fixed. Five regression chains and packaged MEGURI editor passed. See work/midi-editor-20260922/HANDOFF.md. Next: R11 export, source changes and P0 acceptance.

Previous development: 2026-09-22 — releases/0.5.0-dev.pitch.1; XLD core.57 / XML stems.13. R9: fixed 18px pitch rows, vertical wheel/scrollbar, 128x time zoom and one-click fit. Viewport buffers and original note identities retained. Five regression chains and packaged MEGURI UI passed. See work/pitch-zoom-20260922/HANDOFF.md. Next: R10 editing, undo/redo and drafts.

Previous development: 2026-09-22 — releases/0.5.0-dev.viewport.1; XLD core.56 / XML stems.13. R8: viewport-limited note canvases, reused pixel buffers, separate selection overlay, frame-coalesced pan. Five regression chains and packaged MEGURI UI passed. See work/viewport-render-20260922/HANDOFF.md. Next: R9 fixed pitch-row height, vertical scroll and deeper zoom.

Previous development: 2026-09-22 — releases/0.5.0-dev.selection.1; XLD core.55 / XML stems.13. R7: single/additive/box note selection and compact readonly properties. Original instrument/note identities survive sorting; selection does not seek or alter MIDI. Five regression chains and packaged MEGURI UI passed. See work/note-selection-20260922/HANDOFF.md. Next: R8 viewport rendering.

Previous development: 2026-09-22 — releases/0.5.0-dev.compare.1; XLD core.54 / XML stems.13. R6: same-position WAV/MIDI comparison and interval looping, one AudioContext, exact validated stem input, compact range controls and cancellation. No note editing yet. Five regression chains and packaged UI passed; analysis/core/XML unchanged. See work/compare-loop-20260922/HANDOFF.md.

Previous development: 2026-09-21 — releases/0.5.0-dev.writer.1; XLD core.53 / XML stems.13. R4 of the note-level MIDI editing plan: the revision writer and the commit path, with no editing interface on purpose. Measuring before building overturned the plan's central design claim. It said the main risk was a pretty_midi round trip silently dropping events, and prescribed a reread-parent-vs-reread-child field walk as the only shape that catches it. That is wrong in both directions. For the untouched instruments the prescribed check CANNOT FAIL: every .mid here was written by pretty_midi and is already a fixed point (all 163 files across the two analysis roots, 116 + 47, re-serialise byte-identically), and the in-memory object IS the parse of the source, so in-memory-vs-reread and reread-vs-reread are literally the same comparison. For the EDITED instrument the plan excludes verification altogether, and that is the only place corruption happens — a same-pitch overlap comes back with the note count, pitches and velocities intact and an end time a full second early. So verification is inverted: untouched instruments are guarded by raw MTrk chunk digests (an edit's blast radius is exactly one chunk, and byte equality is immune to everything pretty_midi drops on read — sysex, markers, aftertouch, running status, channel assignment), and the edited instrument is compared against the REQUESTED notes plus the parent's own expression. Attacking that design found one real hole: the edited instrument's own control changes sit inside the permitted blast radius, so wiping 646 sustain-pedal events passed until its expression and identity were checked against the parent too. Six classes of note the serialiser eats are refused by name before anything is written, tolerance is one tick rather than one millisecond (a millisecond is nearly two ticks here and hides a real truncation), and the commit order verifies before writing a byte, stages outside the run directory, and re-activates the parent when activation fails rather than deleting the run out from under pointers already rewritten. One consequence of R3 surfaced here: pythonFor cannot serve a revision, because manual-revision is deliberately absent from ENGINE_IDS and the lookup falls through to the MSAF interpreter, which has no pretty_midi. See work/revision-writer-20260921/HANDOFF.md.

Previous development: 2026-09-20 — releases/0.5.0-dev.revision.1; XLD core.52 / XML stems.13. R3 of the note-level MIDI editing plan, and the most expensive convention in it: whether identities are merged per engine is the line between changing a decision later and migrating the owner's saved work. The decision is one identity per revision, which means a hand-edited revision can never match a model version and is therefore permanently matches:false, status 'superseded'. That is what makes the round dangerous — every place that reads 'superseded' as an obsolete draft would grey out, mislabel, refuse or delete the user's own work, and there is no editor yet to notice with. A parallel mapping pass over five subsystems plus a completeness critic changed the implementation three times. (1) The visualizer has its own transcribe entry point that no file list mentioned and no reader opened: fusion:midi-run picks the engine itself and its renderer always passes force, so the cache branch that protects a revision in the workbench is never reached there — under every possible profile shape the button ran a model straight over the edit. It now refuses before it picks an engine, and the button is disabled in that state. (2) The engine id is 'manual-revision', not the 'manual' the plan specified: 'manual' already belongs to the hand-made section and chord annotations, and none of the 497 MIDI records on disk uses either, so renaming costs nothing now and a migration later. (3) The profile must NOT enter models.json but MUST enter the profile lookup, because verify() refuses a record whose engine it cannot resolve and that refusal renders as 'record damaged' — the user's edit presented as a corrupt file. Its options must stay empty for the same reason. Retention's guard was proven behaviourally: with the engine clause removed, one stem-wide sweep trashes the surplus model run AND the revision. The version panel now asks for revisions unconditionally, because a row the user cannot see is work the user cannot pin, and pinning is the only manual protection against retention. Separately, making the out-of-chain merge test runnable found a pre-existing defect: a track that was never separated made plan() throw instead of refusing. See work/revision-record-20260920/HANDOFF.md.

Previous development: 2026-09-20 — releases/0.5.0-dev.audition.1; XLD core.51 / XML stems.12. R5 of the note-level MIDI editing plan, and the first time this application makes a sound of its own: the button that used to be called MIDI audition played the WAV the transcription model was fed, so a part could be looked at but never heard — and the question the whole editing plan starts from, whether three fragments are one sustained note that got cut up, is not answerable by looking. The tone is written by hand (oscillators, envelope, filter; no sample library, so nothing whose redistribution terms would need clearing), which is enough for pitch, onset, length and rough loudness and is explicitly NOT enough to judge a drum's kind or any timbre — the tooltip says so in both languages. Three numbers came from measuring the library rather than one track: the polyphony cap is 64 because the densest lane sounds 43 notes at once while the fixture alone would have suggested 15; the audible floor is 30 ms because 4.2% of notes are shorter than 50 ms and the shortest is 0.6 ms, and it stays small because stretching a 5 ms fragment to 40 ms makes two fragments 10 ms apart sound joined; drums ignore the note length entirely, since every drum note on disk is exactly 0.100 s from a fixed-length adapter. WebAudio has no timeupdate, so timeline-controls.js gained an optional time source the audition drives — the same seam R6 swaps for its WAV/MIDI shared clock. Five paths stop sound through one silenceAll(), always over a ramp. Two real defects came out of testing: a released voice still counted as sounding, so the polyphony cap kept stealing the same voice and never freed a slot; and starting the audition pauses the recording on purpose, which left an unhandled AbortError from the transport button's bare play(). Renderer only — core/, analysis-*/ and desktop/ are byte-identical, XML untouched, no audio asset ships. See work/audition-20260920/HANDOFF.md.

Previous development: 2026-09-20 — releases/0.5.0-dev.instrument.1; XLD core.50 / XML stems.12. R2 of the note-level MIDI editing plan, and a round that adds no model and re-transcribes nothing: MuScriptor has always written several named instrument tracks into a stem's .mid — strings as cello / string ensemble / contrabass / violin / viola, guitar as distorted electric / clean electric / acoustic — and runner.py flattened that away when it built notes.json, so the timeline could only ever show one block per stem. A read-only SMF reader (core/midi-read.cjs) recovers the boundaries, the main process tags every note with the instrument it came from before the payload leaves it, and a lane's identity becomes laneId rather than stem. MEGURI went from 5 rows to 11. The real hazard is that a WRONG split looks exactly like a right one, so the reader refuses rather than guesses (a count mismatch yields no segmentation at all, and the lane falls back to the undivided view), the alignment check is start-times-never-go-backwards within an instrument rather than offsets-sum-to-the-note-count, and the renderer is never given the offsets so it cannot slice positionally after sorting. Verified across the whole library read-only: 124 run directories, 124 parsed and matched, 0 ordering violations, 29 multi-instrument, max 12. One contract defect was fixed before publishing: editable was only reachable when notes existed, which would have marked the library's single empty result (New Order's Ceremony strings, 41 bytes, a real active pointer) unreadable — making the one part that most needs a first note the one part that could not have one added. See work/instrument-lanes-20260920/HANDOFF.md.

Previous development: 2026-09-20 — releases/0.5.0-dev.merge.1; XLD core.49 / XML stems.12. First round of the note-level MIDI editing plan, and the one its main acceptance path was blocked on: changing the strings source used to fail the entire merge, and the failure reached the interface as the internal token midi-string-source-stale — which is only the strings spelling of midi-stale, a code plan() already tolerated. Tolerating it alone would have been worse than the bug: the strings part would vanish from merges silently and every later check would still pass on a file quietly missing a voice. So the round is really about the skip list — a part that exists but cannot be used is reported with its reason, through plan(), through read()'s catch, and into the status line; a stem that was simply never transcribed is not reported, because saying so for three untranscribed stems buries the one notice that matters. The merge fingerprint's hashed input is untouched, so every merged directory already on disk still resolves. Two things the checks forced: the skip rule narrowed to results that exist, and the brackets and list joiner moved into the locale tables after an English sentence came out wrapped in full-width Chinese brackets. See work/merge-skip-20260920/HANDOFF.md and docs/XLD_MIDI_EDITING_EXECUTION_PLAN_20260920.md.

Previous development: 2026-09-20 — releases/0.5.0-dev.retire.2; XLD core.48 / XML stems.12. The simplification round the owner asked for: retire what lost its comparison, and give every stored output a way to be cleared. Four MSAF section variants, both MuScriptor drum engines, Bowed Strings and AudioSep retire. The property the whole round rests on is that retirement is a FLAG and never a removal — a retired engine must still resolve, its results must still read, and above all they must still be deletable, or retiring a bad engine would take away the ability to clean up after it. Tests pin that in both directions, including a reverse assertion that the deletion and sweep modules never consult retirement at all. The section engine ids, which had been copy-pasted into three files each quietly serving a different job (what can run, what can read, what can delete), now have one definition. New: a full-library result sweep that lists every stored section and chord result, draws each segmentation, and sorts by fragments — segments shorter than two seconds for sections, a quarter second for chords, because a chord that lasts a second is a chord and one shared threshold buried the thing the list was built to find. Measured over the real library: MSAF has a median of 3 fragments and reaches 12 with zero-length boundaries, SongFormer has a median of 0 and never goes below a second, and every one of the 20 results with three or more is MSAF. Also found and fixed: a literal NUL byte that a shell heredoc had written into source three times running, now guarded by a test over the whole tree that immediately caught a pre-existing one in the ID3 reader. Kept as alternatives, each with the one sentence that says when to switch: HiRes piano (the only path to see note length after the sustain pedal), ADTOF (the DrumSep weights are CC-BY-NC-ND and do not ship), YourMT3+ on strings (the only different model family), MuScriptor Large on guitar, MuScriptor Medium on strings. Deferred to the owner: Basic Pitch, Demucs and the chord engines. See work/retirement-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.results.1; XLD core.46 / XML stems.12. The owner asked for a delete capability on every analysis output, wanting to clear a lot of bad MSAF segmentations. The first finding was that the capability already existed and was dangerous: the two buttons on the sections page called fs.rm with force, swallowed every error, returned ok:true unconditionally, and also removed <engine>.next.<taskId>.json — another run's staging file, which on this machine means an analysis running in one of the several windows the owner keeps open. Deletion now goes to the Recycle Bin, a trash that quietly did nothing is reported as a failure rather than a success, and there is no fall-back that removes a file for real. The safety property that replaces the MIDI deletion's "this directory holds exactly two known files" — which does not transfer, because these are single JSON files sitting beside the owner's own manual-tags.json — is that the deletable set is generated from the engine id and never from a directory listing, so the protected neighbours are outside the image of that generator for every possible input. Three files move; storage.cjs is deliberately untouched, which keeps its own four-segment path restriction as an independent third guard. The cross-track bulk sweep the owner actually asked for is not in this round. See work/result-delete-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.history.3; XLD core.45 / XML stems.12. A same-day fix for a data-loss regression round B introduced: the same-version cleanup that runs just above the retention sweep is a hard fs.rm, it predates the keep marker, and round B taught the sweep about pinning but not that older line — so pinning a version and then regenerating it with force deleted the pinned run outright and left a keep marker the UI could not even clear. Both deletion sites now consult the marker, and an unreadable marker directory keeps the run rather than deleting it; unpinning no longer checks that the run exists, because a marker outliving its run is exactly the state that has to stay clearable. The regression test was confirmed to fail with the guard removed. Two smaller round-B defects went with it: the version list did not refresh after a transcription run (a run changes which versions exist without moving midiSourceKey, the only axis the cache key had), and a refused deletion said nothing at all (every refusal midi-delete raises comes out of plan(), which runs before the confirm dialog, so the click looked like a dead button). Four files move; IPC, the analysis pipeline and the retention module are byte-identical to history.2. See work/midi-keep-fix-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.history.2; XLD core.44 / XML stems.12. P0 round B: runs of one engine finally have addresses. Round A made an earlier model version readable; it could still only be reached through whichever pointer happened to name it, so rolling back meant re-running the model and the runs an A/B loop leaves behind could not be deleted at all. A run can now be read, switched to, pinned and deleted by its runId, and a bounded sweep reclaims the surplus. The sweep is the only new deletion and its load-bearing invariant is that a run no pointer names is a run no reader can resolve to — so it provably cannot take away the version in use or leave a dangling pointer. Duplicates of the version now active are removed outright; the rest go to the Recycle Bin, newest kept as the comparison slot; source-changed, files-missing and damaged records are never touched; a pinned run is exempt forever and pins its WAV with it. On disk this adds exactly one optional file family, midi/<stem>/kept/<runId>.json. The cache branch is deliberately untouched, so after a rollback Generate really does re-run the model — the status line says so and points at the switch instead of quietly undoing the choice. Packaged check on the isolated MEGURI fixture: two versions listed, switching moved the active pointer with no inference and the note data followed (896 -> 298 notes), pinning blocked deletion, and the only new entry under midi/<stem>/ was kept/. See work/midi-versions-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.timeline.7; XLD core.43 / XML stems.12. Per-stem harmony, the item the user had deferred and then asked for: the strip under each pitched lane can now read either how the part is played or how it sits against the chord lane — inside the chord, adding to it, or against it — chosen from a Lane strip selector in the tab header. One reading at a time, because two strips would eat a third of a compact lane. The chord lane stays the reference: this is a relation, not a second opinion about the harmony, and the layer deliberately never names a chord for a single part. Thresholds are duration-weighted so passing notes do not read as clashes, and every span also reports the lowest note against the root as an inversion. Renderer-only: analysis directories, core/, desktop/ and the IPC channel set are byte-identical to drums.2, and only five files move. Packaged check on MEGURI: 413 spans measured against a named chord; strings read 56% additions (pads with sevenths and ninths), bass 46% inside with inversions named, and clashes sit at 3–8% — which is the useful signal, since that is where the chord lane and the transcription actually disagree. See work/timeline-harmony-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.drums.2; XLD core.42 / XML stems.12. The drum default moves to `drums-adtof-stems` (ADTOF onsets plus MDX23C DrumSep for crash/ride and stem-energy-relative velocity) after the user's listening verdict; plain ADTOF and both MuScriptor tiers stay available and every existing drum result keeps reading. Three files move — the registry's defaultFor, a one-time `xld.midi.drums-default` migration that only drops a stored choice of the old default, and the version; verify strips defaultFor from both registries and deep-compares to prove no model, weight or option changed. A fresh profile lands on the new engine, and the packaged check confirms the old ADTOF result still shows as 当前用于融合. Also written (not run): work/drums-default-20260919/delete-superseded.cjs, which clears MIDI results that are not on the current default through the app's own deletion path (Recycle Bin, dependency protection), excluding drums; its dry run reports 10 deletable and 7 unexaminable records rather than silently skipping them. See work/drums-default-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.revert.1; XLD core.41 / XML stems.12. **The string split (strings.1, strings.2, strings.3) is withdrawn at the user's decision.** They pointed out the level error: `strings` is a container, not an instrument beside bass/piano/guitar/drums, so pulling one violin out is not splitting the group — and the overlap rule that dropped the group part silently lost the viola with it. Real splitting needs chained residuals (other -> violin + rest -> cello + rest -> ... -> remaining strings), which every refinement run already produces as residual.wav, but `refinement.context()` only accepts the six base stems or the mix as input, so it is its own mechanism; the user chose not to build it now. Reverted the way R4 was: 15 files restored from the timeline.6 staging snapshot, then the whole 2841-file staged tree hashed against that baseline — zero drift except package.json's version. Five stems again, no per-instrument plumbing left anywhere, no merge-overlap bookkeeping. All six timeline rounds are kept. The user's existing violin/double-bass separations, source pointers and MIDI stay on disk untouched (the packaged check asserts it); the app simply ignores them, and Mega53's six string targets are still selectable as the source for the one `strings` part. The feasibility gate evidence is kept — its findings do not expire with the code. See work/strings-revert-20260919/HANDOFF.md.

Previous development: 2026-09-19 — releases/0.5.0-dev.strings.3; XLD core.40 / XML stems.12 (XML unchanged). Overlap fix, found by the user: after transcribing violin on their real library the merged MIDI held the violin twice, once inside the 4698-note `strings` part (whose sourceTarget is the whole bowed group) and again as the 1528-note `violin` part. This broke an invariant the old single-pointer design enforced by construction and that the limits list had spelled out — the group and its members must not both reach the merge — and the string split removed the enforcement without replacing it. `core/string-source.cjs` now defines GROUP_TARGETS and `overlaps()`, and `midi-merge.plan()` drops the `strings` part when it overlaps any active per-instrument part, recording it in `plan.skipped`; the merge status line says which part was left out and why. Only `strings` can hold a group target, so the rule collapses to one comparison. Disjoint cases survive: a viola group source alongside a violin part keeps both. Nothing on disk changes — clearing a per-instrument source brings the group part straight back. Analysis directories, checkpoints and the whole XML package are byte-identical to strings.2; five files move. build.cjs also stopped naming a fixed release for its development-settings seed, since the user prunes old builds (releases/ now holds only strings.*). See work/strings-overlap-20260919/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.strings.2; XLD core.39 / XML stems.12 (XML unchanged). String split round 2. The user reframed the goal: bowed strings should not be forced into named instrument classes, only into relative registers — telling violin from cello is enough. That reading explains the gate exactly (the ends of the range separate, the middle leaks both ways), so the stem ids stay `violin`/`cello`/`double-bass` — they are the Mega53 target names and GM programs 40/42/43, and the separation page uses the same names — while the copy now speaks of high / low / lowest bowed register and names what may leak into each. double-bass was added as a stem at the user's request; STEMS is now eight. viola is still excluded and verify asserts it. Real end-to-end on the isolated fixture: separation 70 s, transcription 60 s, 795 notes at program 43, merge grew to seven parts. **Incident: while rebuilding, I deleted releases/0.5.0-dev.strings.1 while the user was running it** — only two locked files remain there. Its evidence was restored from work/ into artifacts/, and strings.2 supersedes the package, so strings.2's verify baseline is timeline.6 rather than strings.1. Always check for a running XLD.exe before removing a release directory. See work/strings-dbass-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.strings.1; XLD core.38 / XML stems.12 (XML unchanged). String split (roadmap P4.5 row G): `violin` and `cello` are now transcription stems in their own right, alongside `bass`/`piano`/`guitar`, each pointing at its own Mega53 separation, transcribed with its own GM program (40/42), merged as its own part and drawn as its own timeline lane. Done as first-class stems rather than a `strings:cello` sub-key: a sub-key would need compound keys (a colon is not a legal Windows filename), and would change `readMidi(track, stem)` from returning one record to returning a set, touching every caller. The `strings` group stem is untouched and still accepts all six Mega53 targets, so results transcribed before this round stay readable with no migration. A feasibility gate ran first (work/strings-gate-20260918): eight full-track separations at 7.8–8.4x realtime showed violin↔cello correlating 0.016/0.194 — genuinely separable — while viola is not, so viola and double-bass are deliberately excluded (on a track with no viola at all, the viola output still held 24.6% of the group's energy and correlated 0.429 with the violin). Real end-to-end run on the isolated MEGURI fixture: separation 75 s, MuScriptor Large transcription 145 s, 1528 notes at program 40, merge grew to six parts, and the group's own source pointer was byte-identical throughout. Analysis moves in exactly two files (analysis-midi/models.json and runner.py); harmony, separation, refinement, every checkpoint, the IPC channel set and the whole XML package are byte-identical to timeline.6. See work/strings-split-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.6; XLD core.37 / XML stems.12 (XML unchanged). Role layer round 1 (roadmap P4.5 row F): every pitched note lane now carries a strip saying how that part is being played — chordal, arpeggiated or linear — and a focused lane colours its notes to match. The user asked before implementation how arpeggiated playing would be recognised, which is the hole in a chordal-vs-linear split: an arpeggio is one note at a time but it is a chord. So the measure is how far the onsets of one group of chord tones are spread, not polyphony: chordal when over half the notes sit in clusters within 60 ms holding three or more distinct pitch classes, arpeggiated when onsets are staggered but the pitches stay inside the current chord (>=75% by duration) and move by leaps (<=35% stepwise), linear otherwise. Without a chord lane there is no arpeggio call at all, and drums get no reading. Computed entirely in the renderer from notes already fetched: no analysis, no runner, no storage change, and app.js, desktop/main.cjs, core/ and the whole XML package are byte-identical to timeline.5. Every segment's tooltip carries its evidence and says the reading comes from the transcription, not the audio. Packaged-window check on MEGURI: strings read 54% chordal (sustained pads), bass 39% arpeggiated (chord tones by leap), guitar a genuine mix (17 chordal / 11 arpeggiated / 11 linear), drums none. A first cut that called a span chordal on its single densest cluster read almost the whole guitar lane as chordal and was replaced by the share-of-notes rule. See work/timeline-roles-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.5; XLD core.36 / XML stems.12 (XML unchanged). Timeline view round 5, both points from the user's review of round 4. Alt is a reserved Windows key — with autoHideMenuBar the window shows Electron's default menu when it is pressed — so the pan modifier is now Shift (ruler drag and middle-drag unchanged) and the packaged controller is asserted to contain no altKey. The menu bar was deliberately left as is rather than made permanent: it is the default developer menu, a native control that cannot be styled to match this dark UI, while help, version, locale and font size already live in the app's own header. And Follow playhead became Locate playhead: the old control only re-centred once the playhead drifted out of a band (~23 s apart at 8x), which reads as a single-shot action rather than following, so it is now exactly that — one press scrolls to the playhead, playback never scrolls the axis on its own, and the control is disabled when the selected track is not the one playing. True continuous following (playhead pinned at a fixed screen position) remains a separate job. Renderer-only: app.js, desktop/main.cjs, core/ and the whole XML package are byte-identical to timeline.4. Packaged-window check: playback left scrollLeft at 0 with the playhead off-screen at 8x, one press centred it at 0.50 and pressing twice landed identically, ruler drag moved the axis exactly 300 px, Shift-drag panned without seeking while Alt-drag behaved as a plain drag. See work/timeline-locate-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.4; XLD core.35 / XML stems.12 (XML unchanged). Timeline view round 4, both items from the user's review of round 3 — they could not quickly find the playhead and tried to drag the axis only to find it did not pan. A Follow playhead control (on by default) keeps the playhead inside the middle band while playing and, when off, jumps back to it and resumes; dragging the ruler pans, as does Alt-drag or middle-drag on any lane, and a manual pan switches the follow off; zooming now keeps the centre time (or the playhead when following) instead of dropping back to 0:00; lane heads are pinned to the left edge so a panned axis still says which lane is which. Renderer-only: app.js, desktop/main.cjs and core/analysis-service.cjs are byte-identical to timeline.3. Two real defects came out of it: setPointerCapture throws NotFoundError for synthetic pointer ids and aborted the rest of the pointerdown handler (capture is now best-effort and each gesture tracks its own pointer id — the test double throws like the browser to pin it), and the pinned note-lane head was transparent because the toggle button reset the background. Packaged-window check: playhead held at 0.50 across the window at 8x, ruler drag moved the axis exactly 300 px and released the follow, a stopped follow left the picture put while the clock moved, zoom 8x->4x held the centre at 0.445, the pinned head stayed opaque at the far end, Alt-drag panned without seeking and a plain drag still seeked. See work/timeline-nav-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.3; XLD core.34 / XML stems.12 (XML unchanged). Timeline view round 3, the thing the user asked for when the timeline work started: annotating on the chart. A 标注 toggle in the tab header arms the lanes — dragging any lane draws an interval, clicking a block copies its range and label into the editor, so correcting a ChordMini block is two clicks. Model results are never rewritten: every mark is written to manual-tags.json, the same store the section lab uses, with a new `kind` field ('section' default, 'chord'); annotations written before the field existed read back as section marks, so no migration. Two manual lanes now sit with the engines they correct. music-lab.json's manualTags exports section marks only, so XML sees exactly what it saw before and its contract is untouched (how manual chords should enter XML's consensus is undesigned and deliberately out of scope). Packaged-window check on the isolated MEGURI fixture: ChordMini's Fmaj7 (4:43.796–4:46.019) copied into the editor, saved as Cmaj7(#11) with kind=chord, and all three chord result files byte-identical afterwards; the section lab lists the same mark; edit and delete round-trip; leaving annotate mode restores seeking. Renderer plus one storage-contract change: the IPC channel set, preload, derived-assets, midi-merge, midi-delete, every analysis directory and the whole XML package are byte-identical to timeline.2, and core/ differs only in analysis-service.cjs. See work/timeline-annotate-20260918/HANDOFF.md.

Note (2026-09-18, confirmed by the user — they cleared dev builds they will not reuse): releases/ now holds only the newest timeline builds and the two previews; the earlier dev builds (drums.1, chords.2, chords.1, piano.2, piano.1, muscriptor.4, history.1) are no longer on disk, with 127 GB free on D:. Their verification evidence is intact under artifacts/ and work/. Round scripts that seeded development-settings.json from drums.1 must seed from the newest surviving dev build.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.2; XLD core.33 / XML stems.12 (XML unchanged). Timeline view round 2, both items from the user's review of round 1: the playhead now follows playback (round 1 exported `updatePlayhead` but never called it, so it painted once and froze — it is now driven by the audio element's timeupdate, with each lane caching the segment block it is standing in so a 4 Hz tick does not rescan ~750 blocks), and clicking a note lane's header shows that stem on its own, filling the view height with piano-roll shading, octave guide lines and pitch labels repeated along the lane (drums get one row per GM key played, labelled kick/snare/hihat/tom/crash/ride). Section, manual and chord lanes stay visible while focused — they are the reference for reading that stem and the surface for round 3's on-chart annotation. Esc, the header, or a 返回全部轨 button leaves focus. Renderer-only again: the notes IPC from round 1, all analysis code, registries, core/ and the whole XML package are byte-identical to timeline.1. Packaged-window check: playhead moved 10.5495 % -> 52.7473 % for 60 s -> 300 s of a 568.75 s track, focused piano lane 72 -> 477 px with 645780 lit pixels, Esc restored all five lanes. See work/timeline-focus-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.timeline.1; XLD core.32 / XML stems.12 (XML unchanged). Timeline view round 1: a new read-only Timeline tab draws a track's section lanes, manual tags, chord lanes and the MIDI notes of all five stems on one shared time axis; the former MIDI tab is renamed 转谱 (Transcribe). Segment lanes stay DOM, note lanes are canvas (a track can carry >10k notes); every lane derives x from the same duration and zoom, so lanes cannot drift apart. Zoom 1x-8x, drag-to-seek on any lane, per-stem colours, GM drum key grouping. New read-only IPC `assets:midi-notes` returns the active MIDI of every stem as [start, end, pitch, velocity] tuples; nothing writes to the analysis directory. No quantisation, no grid, no note editing, no on-chart annotation yet (that is round 2). Renderer-only: analysis code, all model registries, core/ and the whole XML package are byte-identical to drums.1; MIDI defaults unchanged. Packaged-window check on the isolated MEGURI fixture: 3 chord lanes + 5 note lanes (896/540/2916/4698/1596 notes), 752 segment blocks, canvas painted, zoom widened the axis 1154->2308 px, zh/en labels, wide and narrow windows clean. See work/timeline-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.drums.1; XLD core.31 / XML stems.12. Model-iteration round R3: new alternative drum MIDI engine `drums-adtof-stems` ("ADTOF · DrumSep 7 类"), ADTOF onsets unchanged, MDX23C DrumSep stems split cymbals into crash / ride and give每 hit a stem-energy-relative velocity. ADTOF stays the default pending the user's listening verdict. See work/drums-stems-20260918/HANDOFF.md.

Round R4 (Beat This! rhythm) was implemented, evaluated and DROPPED on 2026-09-18 at the user's decision: apart from MEGURI (steady waltz bed) the beat tracking was unusable on this library — an octave error on the fixed-tempo pop track (71.4 vs librosa 143.6 BPM) and scattered downbeats on the post-rock tracks (only 29 % of Nancy's bars had four beats). All R4 source edits were reverted to the drums.1 baseline (2839 files verified byte-identical), the release and the checkpoint were deleted and the two pip packages uninstalled from envs/ai. Evidence kept in work/beats-20260918 and artifacts/beats-20260918. Lesson recorded: self-consistency metrics (interval CV, meter share) cannot detect octave or downbeat errors.

Previous development: 2026-09-18 — releases/0.5.0-dev.drums.1; XLD core.31 / XML stems.12 (XML unchanged). Model-iteration round R3: new alternative drum MIDI engine `drums-adtof-stems` ("ADTOF · DrumSep 7 类"): ADTOF onsets and classes unchanged, MDX23C DrumSep 6-stem separation (aufr33/jarredou, CC BY-NC-ND, weights only in runtime/addons/drumsep-v1, MIT MSST model code vendored) splits cymbals into crash 49 / ride 51 and gives every hit a stem-energy-relative velocity (32–127, per-key percentile scaling within the track). ADTOF stays the default; kit stems are not persisted (0.9 GB per track). Feasibility gate met: toe separation 11.1 s vs 58.3 s base six-stem, MEGURI 14.2 s vs 70.5 s. Hit counts identical to ADTOF on both fixtures; quiet-vs-loud velocity 32 vs 103 (toe). Listening page artifacts/drums-stems-20260918/listening. Next: user verdict on the drum default, R4 Beat This!, P0 round B. See work/drums-stems-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.chords.2; XLD core.30 / XML stems.12. Model-iteration round R2 complete: after reviewing the four-track comparison page the user made ChordMini · BTC-CL the primary chord engine. XLD album batch and Harmony Lab default selection prefer chord-chordmini (BTC fallback); XML weighted consensus priors are ChordMini 1.5 / BTC 1.35 / others 1 in both fusion.js and the timeline adapter; library badge shows M when ChordMini results exist. Engines, runner, weights, registries and MIDI defaults unchanged (packaged analysis-harmony byte-identical to chords.1). Packaged XLD and XML window checks on the isolated MEGURI fixture passed, including a moment where consensus now follows ChordMini (Dm) against BTC (A). ChordFormer licence issue deferred by the user. Next: R3 drums gate, R4 Beat This!, P0 round B. See work/chords-default-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.chords.1; XLD core.29 / XML stems.11. Model-iteration round R2: two alternative chord engines added beside BTC — ChordMini BTC-CL (same architecture and 170-class vocabulary, MIT, loaded by envs/ai) and consonance-ACE decomposed Conformer (root / bass / pitch-class heads with inversions, MIT, run by runtime/addons/chords-v1). The harmony runner and vendored BTC / ACE code moved from runtime/0.5.0/scripts into source/xld-runtime-baseline/analysis-harmony; weights stay in runtime. Fixed envs/ai missing soxr and packaging, which had broken all four legacy chord engines under the packaged runtime. No default, registry or XML consensus weight changed; legacy engine output byte-identical. Comparison page for four full tracks: artifacts/chords-20260918/compare/index.html. Next: user listening verdict on the comparison, then R3 drums gate / R4 Beat This / P0 round B. See work/chords-20260918/HANDOFF.md.

Previous development: 2026-09-18 — releases/0.5.0-dev.piano.2; XLD core.28 / XML stems.11. Model-iteration round R1 complete: Transkun V2 (predicted velocity + CC64 pedal, MIT) is now the piano MIDI default after the user's BCNR "Nancy Tries to Take the Night" listening test found HiRes producing spurious root notes from piano resonance; HiRes stays as the alternative, old results remain readable, one-time preference migration `xld.midi.piano-default`. Only defaultFor changed in models.json. Next: R2 chord engines. See work/piano-default-20260918/HANDOFF.md (engine integration: work/piano-transkun-20260918/HANDOFF.md, releases/0.5.0-dev.piano.1).

Latest local preview: 2026-09-18 — releases/0.5.0-preview.paths.1; XLD core.26 / XML stems.11. Relative runtime configuration, independent preview profile, OS user-directory defaults, consolidated offline help and current-model diagnostics. Local relocation / GUI / ADTOF GPU sample pass; no clean-machine or public-release claim. No model/default/weight changes. See work/portable-paths-20260918/HANDOFF.md.

Previous development: 2026-09-17 — releases/0.5.0-dev.history.1; XLD core.25 / XML stems.10. P0 round A: historical MIDI results stay readable (readMidi `ok`) while only current-version results are cache hits (`matches`); every run keeps its own record under midi/<stem>/runs/; merge records provenance. No model, default or option changed; the three model registries are byte-identical to muscriptor.4. Next: round B (same-engine version switching / rollback / per-run deletion / bounded retention). See work/midi-history-20260917/HANDOFF.md.

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


## 2026-09-18: User-facing documentation and preview preparation

README now targets users; developer entry is docs/DEVELOPMENT.md. docs/USER_GUIDE.md covers the current workflow; docs/PREVIEW_RELEASE_PLAN.md separates completed documentation from portable-package, first-run and clean-machine work. Existing executables and app versions are unchanged. Both release README templates are updated for future builds; offline HTML help still needs consolidation. No public release or repository-visibility change was made.
