# analysis-harmony · 和弦引擎 runner

自 `0.5.0-dev.chords.1`（XLD core.29）起，和弦 runner 随源码发布（此前位于 `runtime/0.5.0/scripts/analysis-harmony`，旧版本继续使用那份拷贝）。Node 侧 `core/analysis-service.cjs` 与 `desktop/main.cjs` 都从本目录取 `harmony_runner.py`。

## 引擎

| id | 名称 | 解释器 | 权重 | 词表 |
|---|---|---|---|---|
| chord-cqt / chord-cens / chord-hybrid | Librosa 模板 + Viterbi | `XLD_HARMONY_PYTHON`（ai 环境） | 无 | maj-min / extended |
| chord-btc | BTC · Transformer（ISMIR19） | `XLD_HARMONY_PYTHON` | `XLD_RUNTIME_ROOT/analysis-harmony/btc/weights/btc_model_large_voca.pt`（回退：本目录 `btc/weights`，源码树中不存在） | 170 类 |
| chord-chordmini | ChordMini · BTC-CL（Phan 等，DAFx26 预印本，MIT） | `XLD_HARMONY_PYTHON` | `XLD_CHORDS_ROOT/models/chordmini/btc_model_best.pth` | 170 类，同 BTC |
| chord-consonance | consonance-ACE · Conformer（Poltronieri / Serra / Rocamora，ISMIR 2025，MIT） | `XLD_CHORDS_PYTHON`（`runtime/addons/chords-v1`） | `XLD_CHORDS_ROOT/models/consonance-ace/conformer_decomposed_smooth.ckpt` | Harte，根音 / 低音 / 音级分解 |

`--engines` 按环境变量与权重文件是否存在给出 `available`。自 chords.2 起 **ChordMini 为主引擎**：XLD 专辑批量与和弦页默认选中 `chord-chordmini`（`app.js` 的 `PRIMARY_HARMONY_ENGINE`，不可用时退回 `chord-btc`）；XML 加权共识先验 `chord-chordmini 1.5 / chord-btc 1.35 / 其余 1`（`fusion.js` 的 `CHORD_ENGINE_PRIOR` 与 `xld-timeline-provider-adapter.js` 的 `HARMONY_PRIOR` 必须同值），未知引擎 id 先验 1。runner 本身没有默认概念。

## 代码与权重

- `btc/`：vendored BTC 代码（yaml Loader、np.float 两处兼容修正）。ChordMini 检查点（`model_state_dict` + `normalization{mean,std}` + 自带 `idx_to_chord`）用同一份模型代码加载；其 `idx_to_chord` 与 BTC 只有等音拼写差异，`mirex_to_label` 统一根音拼写。
- `vendor/ace/`：consonance-ACE 仓库的 `ACE/` 包（仅代码，去掉 checkpoints 与标注数据）与 LICENSE。修改一处：`preprocess/audio_processor.py` 改为绝对导入 `ACE.preprocess.transforms`。推理流程照上游 `inference.run_inference`：22.05 kHz、hop 512 CQT、20 s 分块、`decode_chord` 阈值 0.5、`remove_short_chords` 0.5 s；差别是先跨分块合并同标签帧再做一次 0.5 s 过滤（上游按块过滤后再全局过滤）。
- 权重不进源码树、不进发布包（`tests/harmony-engines.cjs` 与 `tests/repair-static.cjs` 断言）。

## 输出

`<engine>.json`，`schemaVersion: 2`：

- `segments[{start,end,label,confidence,rawLabel?,bass?}]`：`label` 为 XLD 简写（`Bb7`、`Fm7`、`Em7b5`）；`rawLabel` 为原词表标签（BTC / ChordMini 为 MIREX 大词表，consonance 为 Harte，如 `A#:7/3`）；`bass` 仅 consonance 转位时出现（Harte 度数，如 `3`）。无和弦记 `N`。
- `engine{id,name,family,description,resource,vocabulary,source,checkpoint{file,sha256}}`：神经引擎记录权重文件名与 sha256。
- `metrics`：BTC 系 `rawSegments / smoothing{minSeconds 0.5, keepConfidence 0.7}`；consonance 另有 `uniqueRawChords / inversions / decoding{threshold,chunkSeconds,...,confidence:"root softmax max"} / peakGpuMiB`。consonance 的 `confidence` 是根音头 softmax 最大值的时长加权均值，与 BTC 的类别概率不可直接比较。
- 旧字段（`duration`、`featureCacheHit`、`separation`、`elapsedSeconds`、`source`）不变；`--separation hpss|demucs` 对三种神经引擎同样生效。

## 性能（RTX 本机，整曲）

BTC / ChordMini 约 8–10 s（含模型加载），consonance-ACE 约 35–50 s（5–9.5 分钟曲目），显存峰值约 0.1 GiB。四个旧引擎在源码 runner 与 runtime runner 下输出逐字节一致（`work/chords-20260918/verify.cjs`）。
