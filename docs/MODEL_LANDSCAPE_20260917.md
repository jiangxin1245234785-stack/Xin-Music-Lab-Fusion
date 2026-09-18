# 模型选型调研：当前基线与可替代候选（2026-09-17）

调研日期：2026-09-17。范围：分轨 / 细分、单声部与多乐器转谱、鼓与节拍、段落与和弦。只做网络调研，没有下载权重、没有改动程序或默认。所有日期与数值均注明来源；标“未核实”的项没有找到一手出处。

用途：为下一轮“模型优化迭代”挑选值得本地试验的候选。本项目的默认切换以用户人工试听与可视对照为准，论文分数与榜单只用来决定试哪一个、先试哪一个（见 [路线图 §P3](XLD_XML_STATUS_AND_ROADMAP_20260917.md)）。

## 0. 方法

- 基线维护状态：直接查询 GitHub API（`pushed_at`、stars、license、archived）与 Hugging Face API（`lastModified`、下载量、gated、license），快照存于 `work/model-survey-20260917/baseline-status.json`。
- 候选调研：按四个任务组分别检索 GitHub、Hugging Face、arXiv、MVSEP 排行榜与官方项目页，记录论文、首发年月、代码与权重的最近更新、许可证、同基准数值。
- “是否持续迭代”的判断口径：最近 6 个月内有提交或发布记为“活跃”；6–18 个月记为“缓慢”；超过 18 个月或仓库 archived 记为“停止”。这只反映代码仓库活动，不等于模型质量。

## 1. 当前基线与维护状态

查询时间 2026-09-17（GitHub / Hugging Face API）。

| 任务 | 当前模型（我们的用法） | 论文 / 来源 | 首发 | 代码最近提交 | 权重最近更新 | 许可证 | 维护判断 |
|---|---|---|---|---|---|---|---|
| 基础六轨分离（默认） | BS-RoFormer “SW” 社区权重 `enerjazzer/BS-ROFO-SW-Fixed`；推理 `openmirlab/bs-roformer-infer` | 架构：Lu et al., *Music Source Separation with Band-Split RoPE Transformer*（arXiv 2309.02612，ICASSP 2024）；SW 权重训练来源未核实 | 权重 HF 建库 2026-04-23 | 推理代码 2026-09-14（MIT，建库 2025-11-27） | 2026-04-23 | 代码 MIT；权重 license 未声明（unknown） | 代码活跃；权重为单次发布 |
| 基础六轨分离（备选） | Demucs `htdemucs_6s` | Rouard, Massa, Défossez, *Hybrid Transformers for Music Source Separation*（ICASSP 2023） | 2022-11 | 2024-04-24，仓库已 **archived** | — | MIT | 停止 |
| 细分 53 目标（默认） | MVSEP Mega `mvsep_mega_model_bs_roformer_53_stems_v1`（经 ZFTurbo MSST release v1.0.21 分发） | MVSEP / ZFTurbo `Music-Source-Separation-Training` | v1.0.21 发布日期见第 2 节 | MSST 2026-09-09（MIT，1547 stars） | 见第 2 节 | MIT（训练框架）；权重条款见第 2 节 | 框架活跃 |
| 细分弓弦乐（备选） | `gilliaan_bsroformer_bowedstrings_v2`（HF `gilliaan/Stem-Separation-Models`） | 社区模型 | 见第 2 节 | — | 见第 2 节 | 见第 2 节 | 社区 |
| 细分文本查询（实验） | AudioSep（Audio-AGI） | Liu et al., *Separate Anything You Describe*（2023） | 2023-08 | 2024-11-26 | — | MIT | 缓慢 / 停止 |
| 钢琴 MIDI（默认） | HiRes Piano（note+pedal 权重，`xavriley/midi-transcription-models` 分发） | Kong et al., *High-resolution Piano Transcription with Pedals by Regressing Onset and Offset Times*（arXiv 2010.01815，TASLP 2021） | 2020-10 | `qiuqiangkong/piano_transcription_inference` 2025-01-26 | HF 分发库 2026-08-22（MIT） | 代码 MIT | 缓慢 |
| 贝斯 MIDI（默认） | FiloBass（`filobass_20000_iterations.pth`，HiRes 架构） | Riley & Dixon, *FiloBass*（arXiv 2311.02023，ISMIR 2023） | 2023-11 | 同上分发库 | 2026-08-22 | MIT | 缓慢 |
| 吉他 MIDI（已退出） | GAPS（论文版 12200 iterations） | Riley et al., *GAPS*（arXiv 2405.16687，ISMIR 2024） | 2024-05 | 同上分发库 | 2026-08-22 | MIT | 用户听评不如 MuScriptor，仅保留历史结果 |
| 吉他 MIDI（默认 / 复杂曲） | MuScriptor Medium / Large（`muscriptor/muscriptor`，Kyutai & Mirelo） | arXiv 2607.08168（2026-07） | 仓库建于 2026-07-02，权重 2026-06-30 | 2026-09-04（MIT，1477 stars，28 open issues） | 2026-07-10（Medium 1.23 GB，Large 5.47 GB） | 代码 MIT；权重 **CC-BY-NC-4.0**，需在 HF 接受条款（gated: auto） | 活跃 |
| 弦乐 MIDI（默认） | MuScriptor Large（FP16 加载） | 同上 | 同上 | 同上 | 同上 | 同上 | 活跃 |
| 弦乐 MIDI（备选） | YourMT3+（MoE noPS，HF Space `mimbres/YourMT3`） | Chang et al., *YourMT3+*（2024） | 2024-07 | `mimbres/YourMT3` 2024-11-29 | Space 2025-01-31 | GPL-3.0 | 缓慢 / 停止 |
| 通用备选 | Basic Pitch 0.4.0（Spotify） | Bittner et al., ICASSP 2022 | 2022-05 | 2025-11-13 | pip 0.4.0 | Apache-2.0 | 缓慢 |
| 鼓 MIDI（默认） | ADTOF 5 类 frame_rnn（PyTorch 移植权重） | Zehren, Alunno, Bientinesi, *ADTOF*（ISMIR 2021） | 2021 | `MZehren/ADTOF` 2025-09-18 | — | 仓库 license 未声明（NOASSERTION） | 缓慢 |
| 鼓 MIDI（备选） | MuScriptor Medium / Large 鼓（onset → 约 100 ms 音符） | 同 MuScriptor | 同上 | 同上 | 同上 | 同上 | 活跃 |
| 段落 | SongFormer（`ASLP-lab/SongFormer`）；MSAF | SongFormer 论文见第 5 节；MSAF：Nieto & Bello | SongFormer 仓库 2025-09-14 | SongFormer 2026-05-14（license 未声明）；MSAF 2026-05-13（MIT） | 见第 5 节 | 见第 5 节 | SongFormer 缓慢；MSAF 活跃 |
| 和弦 | BTC（`jayg996/BTC-ISMIR19`）+ librosa CQT / CENS 模板方案 | Park et al., *A Bi-directional Transformer for Musical Chord Recognition*（ISMIR 2019） | 2019-06 | 2020-05-23 | — | MIT | 停止 |
| 计划试验 | ChordFormer（`mwaseemrandhawa/ChordFormer`，arXiv 2502.11840）；Beat This!（`CPJKU/beat_this`） | 见第 4、5 节 | ChordFormer 论文 2025-02，仓库建于 2026-09-02（3 stars，无 license）；Beat This 仓库 2024-04 | ChordFormer 2026-09-03；Beat This 2026-05-28（MIT） | 见第 4、5 节 | — | Beat This 活跃；ChordFormer 仓库刚公开 |
| 曾调研候选 | Separate-and-Detect（`ddman1101/Separate-and-detect`） | 见第 4 节 | 仓库 2026-07-17 | 2026-08-13（MIT） | HF 2026-08-13（MIT） | MIT | 新发布 |

基线里最值得注意的三点：Demucs 仓库已归档，作为备选只能维持现状；BTC 与 YourMT3+ 两年以上无更新；MuScriptor 是唯一“论文 + 代码 + 权重”都在近三个月内活跃的转谱模型，但权重是 CC-BY-NC-4.0（个人非商业使用可以，再分发需注意）。

## 2. 分离与细分

（调研结果待填）

## 3. 单声部与多乐器转谱

（调研结果待填）

## 4. 鼓转谱与节拍

（调研结果待填）

## 5. 段落与和弦

（调研结果待填）

## 6. 综合建议

（待填）

## 7. 参考文献与来源

（待填）
