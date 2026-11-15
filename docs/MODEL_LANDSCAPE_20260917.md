# 模型选型调研：当前基线与可替代候选（2026-09-17）

调研日期：2026-09-17 至 09-18。范围：分轨 / 细分、单声部与多乐器转谱、鼓与节拍、段落与和弦。只做网络调研，没有下载权重、没有改动程序或默认。所有日期与数值均注明来源；标“未核实”的项没有找到一手出处。覆盖深度不均：转谱（第 3 节）与段落 / 和弦（第 5 节）做了完整检索；分轨 / 细分（第 2 节）与鼓 / 节拍（第 4 节）因控制成本只做了定向检索，各节开头有说明。

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

覆盖说明：本组只做了定向检索（MSST 模型库文档与 release、MVSEP 页面、SW 与 HyperACE 模型卡、gilliaan 模型库、三篇 2026 论文摘要），没有逐条核对 MVSEP 排行榜数值（该页为动态页面，只取到类别列表），结论比第 3、5 节保守。

### 2.1 基础六轨分离

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| BS-RoFormer “SW”（基线，`enerjazzer/BS-ROFO-SW-Fixed`） | HF 2026-04-23 | 同日 | **unknown** | 是（699 MB ckpt + yaml） | 模型卡无 SDR、无训练说明，只写“Edited version of that checkpoint to allow its use with UVR and MSST” | 是他人 checkpoint 的改格式副本，原始作者与训练数据**未核实**；架构为 Lu et al. 2023（SAMI-ByteDance，SDX23） |
| Demucs `htdemucs_6s`（备选） | 2022-11 | 仓库 archived（2024-04） | MIT | 是（fbaipublicfiles） | MSST 文档给 4 轨版 Multisong 平均 9.16（bass 11.76 / drums 10.88 / vocals 8.24 / other 5.74）；6 轨版无数值 | 唯一另一个开箱即用的 6 轨模型 |
| MSST 模型库 BS Roformer（MUSDB18HQ 4 轨） | 2024 | MSST 仓库 2026-09-09 | MIT | 是（release v1.0.12） | MUSDB18 test 平均 9.65；Multisong 9.38 | 4 轨，无 guitar / piano，不能直接替代六轨 |
| MDX23C（MUSDB18HQ 4 轨） | 2023 | — | MIT | 是 | MUSDB test 7.15；Multisong 7.02 | 低于 RoFormer |
| SCNet / SCNet-large（`starrytong/SCNet`，arXiv 2401.13276） | 2024-01 | 2025-09-08 | MIT | 是（Google Drive） | README 无 SDR；论文称在 MUSDB18-HQ 上超过当时 SOTA | 4 轨；“SCNet-XL”出现在 2026 论文对比中，公开权重位置**未核实** |
| BS-Roformer-HyperACE（`pcunwa/BS-Roformer-HyperACE`） | 2025-11 | 2025-12-20 | 未声明 | 是 | Multisong instrumental SDR 17.40（模型卡自报，MVSEP 条目 9475） | 只有 vocals / instrumental 两版；模型卡引用的 arXiv 2506.17733 是 YOLOv13 的 HyperACE 模块，不是分离论文；不能替代六轨 |
| MSST 框架论文（Solovyev, Kiselev, Stempkovskiy, Gabruseva，arXiv 2607.23395） | 2026-07-25 | — | MIT | — | 摘要给消融，无模型榜 | 我们细分推理走的正是这套 yaml + ckpt 体系，接入同架构新权重成本最低 |
| “Beyond SDR”（Chuxin Ding，arXiv 2609.04224） | 2026-07-12 | — | — | — | 对比 Spleeter / HT-Demucs / BS-Roformer / SCNetXL：SDR 领先者把鼓的 attack 失真放大约一倍，onset F 与 SI-SDR 相关 0.62 | 对我们的启示：分轨选型不能只看 SDR，要听瞬态 |
| 其他 2025–2026 论文（RT-STT 低延迟 arXiv 2511.13146；Input-Adaptive Spectral Compression arXiv 2602.08671） | 2025-11 / 2026-02 | — | — | 未核实 | RT-STT MUSDB18-HQ 5.17 dB（实时小模型） | 与离线高质量目标无关 |

MVSEP quality checker 现有类别：Synthetic、Multisong（vocals / instrumental / bass / drums / other）、Guitar、Piano、Strings、Wind、Medley、Vox、Lead/Back Vocals、Drums Separation（5 stems）、MUSDB18 test 等。榜单数值需手动打开各排行榜页面查看；本次未取到。SDX 2025 结果未检索。

### 2.2 乐器级细分与弦乐

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| MVSEP Mega 53（基线，MSST release v1.0.21） | **2026-04-20** | 无后续版本（截至 MSST 最近 8 个 release 均无 v2） | MSST MIT；权重条款未单列 | 是（1.37 GB） | release 页：vocals 10.31 / bass 7.18 / drums 7.66 / other 6.20（评测集**未核实**） | 53 目标含 acoustic-guitar / electric-guitar / guitar / piano / digital-piano / keys / strings / bowed_strings / violin / viola / cello 等；用户听评优于 Bowed v2 |
| gilliaan 模型库（`gilliaan/Stem-Separation-Models`） | 2026-06-03 | **2026-09-12** | 未声明 | 是 | 无数值 | 现有：BowedStrings v1 / v2（303 MB，BS-RoFormer）、Drums v1（303 MB）、CleanInvert v1、DeEffect v1beta、Karaoke Mel-RoFormer v1（870 MB）；**没有 v3，也没有钢琴 / 吉他 / 其他弦乐模型** |
| AudioSep（Audio-AGI，arXiv 2308.05037） | 2023-08 | 2024-11-26 | MIT | 是 | — | 用户已否定（电子串音） |
| 文本查询分离后继：Hybrid-Sep / FlowSep（arXiv 2506.16833，ICASSP 2025）、HSM-TSS（arXiv 2505.21025）、UniSep（arXiv 2503.23762）、FasTUSS（arXiv 2507.11435） | 2025 | — | — | **开源权重情况未核实** | HSM-TSS 称在 MUSIC 乐器集上全面领先 | 与 AudioSep 同一路线，优先级低 |

### 2.3 本组建议

1. 先查清 SW 权重的来源：模型卡只说是他人 checkpoint 的改格式版，原作者、训练集、是否有更新都未知；这是基线里唯一“出处不明”的权重，建议在 MVSEP 论坛 / 原发布处核对后再决定是否跟进新版。
2. 手动核对 MVSEP 排行榜的 Guitar、Piano、Strings、Drums Separation 四个类别榜首及其权重是否公开；这是当前最直接的“同比测试”来源，本次未取到数值。
3. 用 Mega 53 的 guitar / piano 目标与 SW 六轨的 guitar / piano 做同源 A/B（同一原曲、同一片段），判断细分模型能否直接做吉他与钢琴的主来源。
4. 不追 HyperACE（仅人声 / 伴奏）、SCNet（4 轨）与文本查询分离后继（用户已否定该路线）。
5. 评测口径采纳 “Beyond SDR” 的结论：分轨对鼓瞬态的影响要靠试听，不用 SDR 单独定胜负。

## 3. 单声部与多乐器转谱

结论先行：钢琴上 HiRes 已明显落后于有公开权重的 Transkun V2 与 Aria-AMT；贝斯没有新的公开专用模型；针对失真电吉他的 2025–2026 新工作都不发布权重，MuScriptor 保持默认合理；弦乐叠奏没有替代品，小提琴独奏另有专用模型；力度与弯音方面有可用的补全工具。所有数值均为各论文 / README 自报或指明的第三方复测，测试协议不同时不能横向相减。

### 3.1 钢琴

MAESTRO 上的 note onset F1 / note-with-offset F1 / with-offset+velocity F1（%）：

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | MAESTRO 数值 | 备注 |
|---|---|---|---|---|---|---|
| HiRes Piano（基线，Kong et al.） | 2020-10 | 官方仓库 `bytedance/piano_transcription` 已 archived（最后提交 2023-08）；PyPI 0.0.6 2025-01-26 | MIT | 是（172 MB） | v2.0.0：96.72 / 82.47 / 80.92；踏板 onset 91.86 | 输出力度与踏板；Aria-MIDI 论文复测 96.82 / 85.33 / 83.82 |
| **Transkun V2**（Yan & Duan，ISMIR 2024，arXiv 2404.09466） | 2024-04 | 提交 2024-11-22；PyPI 2.0.1 2024-09-28 | MIT | 是（pip 自带 “V2 No Pedal Ext”，其余在 Google Drive） | v3：**98.32 / 93.48 / 92.94**；踏板 onset 86.37；12.9M 参数 | 输出力度与踏板；CPU / GPU 均可；pip 默认检查点按“不做踏板延音”协议评测（onset 98.33 / w-offset 81.49，不能与上一行直接比），音符长度习惯与 HiRes 不同 |
| hFT-Transformer（Sony，ISMIR 2023，arXiv 2307.04305） | 2023-07 | 提交 2023-07-11 | MIT | 是（GitHub release） | v3：97.44 / 90.53 / 89.48；5.5M 参数 | 2023 年后无更新，Python 3.6.9 环境 |
| **Aria-AMT**（EleutherAI；Aria-MIDI 论文 ICLR 2025，arXiv 2504.15071） | 2024-02 | 提交 2025-12-16；权重 2025-12-14 | 代码 Apache-2.0；权重放在 CC-BY-NC-SA-4.0 数据集仓库 | 是（`piano-medium-double-1.0.safetensors`，447 MB） | 97.63 / 90.50 / 89.45；MAPS note F1 90.58（Kong 83.10） | Whisper 式 seq2seq，面向多样录音条件；Python 3.11、BF16 GPU |
| SFT-CRNN / OT 分布匹配（Wei, Lalang, Li, Yoshii，ICASSP 2026，arXiv 2605.17405） | 2026-05 | — | — | **未查到** | onset 98.36（新高）/ w-offset 90.78 | w-offset 不及 Transkun，论文自述 |
| D3RM（Kim, Kwon, Nam，ICASSP 2025，arXiv 2501.05068） | 2025-01 | 提交 2026-02-03 | 未标注 | 未核实 | 97.57 / 90.44；2.0M 参数 | 离散扩散精修 |
| Hierarchical LM（Li, Zang, Kong，ICASSP 2025，arXiv 2501.03038） | 2025-01 | — | — | **未查到** | 0.971 / 0.852 / 0.832 | Kong 团队后续，无代码 |
| Streaming piano（arXiv 2503.01362）；Efficient sparse attention（APSIPA 2025，arXiv 2509.09318） | 2025 | — | — | 无权重 / 未提及 | 96.52 / 89.44；96.60 / 82.76 | 流式与效率导向，精度不高于 hFT |

补充：BandLab 的 Harmonica 论文（2026-09，arXiv 2609.04640，权重不公开）在统一协议下复测 MAESTRO onset F1：SFT-CRNN .964、MT3 .958、YourMT3+（其协议重训）.957、Transkun .926、MuScriptor medium .766、hFT .573、Basic Pitch .578；hFT 的 .573 与原论文差距极大，说明该表对预训练检查点的条件可能不利，只作参考。Marták 等（arXiv 2512.14602，2025-12）指出声学分布偏移可使钢琴转谱下降约 20 个百分点，力度比 onset 更脆弱。Sony / ByteDance / 腾讯 / 网易 2025–2026 未查到新的公开钢琴模型。

### 3.2 贝斯

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| FiloBass 检查点（基线） | 数据集论文 2023-11（arXiv 2311.02023） | HF 分发库 2026-08-22；配套代码 `xavriley/hf_midi_transcription` 2026-01-27 | MIT | 是（99 MB） | 论文只给基线（onset-only F）：Melodyne 78.95、CREPE Notes 72.89、Basic Pitch 62.73 | 数据为爵士低音提琴 4.97 h；配套说明称模型“针对单音演奏优化，重度处理 / 失真音频表现可能变化” |
| YourMT3+（多乐器） | 2024-07 | 见 3.4 | GPL-3.0 | 是 | Slakh 分乐器 Bass onset F1 93.20 | 合成数据训练，真实录音下降 |
| MulTTiPop 数据集（CMU，arXiv 2607.08756） | 2026-07 | v2 2026-08-20 | CC BY 4.0 | 数据集 | 真实流行乐 3.5 h 多轨 MIDI 对齐；“最佳模型 onset F1 仅 29%” | 说明真实录音多乐器转谱仍弱 |

2025–2026 未查到任何新的公开专用贝斯模型。

### 3.3 吉他

GuitarSet 等数据集上的 note F1（%）：

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| MuScriptor Medium / Large（基线） | 2026-07 | 见 3.4 | 代码 MIT / 权重 CC BY-NC 4.0 | 是（需接受条款） | 论文未评 GuitarSet；Harmonica 复测 medium：GuitarSet .808、EGDB .789、**GOAT（失真）.710**、GAPS .781 | GOAT 上高于 YourMT3+（.680）与 MT3（.291） |
| Guitar-FL（Riley, Edwards, Dixon，ICASSP 2024，arXiv 2402.15258） | 2024-02 | HF 2026-08-22 | MIT | 是（`guitar-fl.pth` 99 MB） | GuitarSet zero-shot F50 87.3；同表 Basic Pitch 79.0、MT3 32.0、Omnizart 59.0 | 即我们试过的 Guitar-FL：Kong HiRes 架构在 François Leduc 爵士吉他数据集上微调 |
| GAPS（Riley et al.，ISMIR 2024，arXiv 2408.08653） | 2024-08 | HF 2026-08-22 | MIT | 是 | 微调后 F50 91.2（MT3 90.0、Basic Pitch 79.0）；zero-shot 88.1 | 14 h 古典尼龙弦 |
| Ti-hFT / TIT（NTU + Positive Grid，arXiv 2504.07406） | 2025-04 | — | — | **未查到**（仅数据集按请求） | 项目页无 F1 表 | hFT 加音色嵌入，专门针对放大器 / 失真；方向对但无权重 |
| GOAT 数据集 + Kong 模型（Loth et al.，ISMIR 2025，arXiv 2509.22655） | 2025-07 | — | 数据 CC BY 4.0（Zenodo，按请求） | **权重未发布** | AMP 模型：GuitarSet 0.843、失真测试集 0.800 | 5.17 h DI + 25.85 h 放大器渲染，可自行微调 |
| TART（UC Berkeley，ISMIR 2026，arXiv 2609.11904） | 2025-10 → 2026-09 | — | — | **未查到** | GuitarSet 87.40、EGDB 79.00、EGDB-noisy 76.80；技巧分类宏 F1 95.9 | Kong CRNN 骨干，训练含 GOAT-DI |
| Noise2Fret（ISMIR 2026，arXiv 2608.30854） | 2026-08 | 仓库 2 stars | 未见许可证 | 代码有，权重目录未核实 | note F1 0.856（FretNet 0.818）；GOAT 0.800 | 面向 tab 的扩散模型 |
| Fretting-Transformer（ICMC 2025，arXiv 2506.14223） | 2025-06 | — | — | 官方代码未查到 | MIDI→tab | 只是可选后处理 |
| Harmonica x-large（BandLab，arXiv 2609.04640） | 2026-09 | — | — | **不公开** | GuitarSet .909、EGDB .881、GOAT .750 | 商业服务 |

判断：所有明确针对失真电吉他的新工作（Ti-hFT、GOAT、TART）都没有权重；在失真测试集 GOAT 上，可下载模型里 MuScriptor Medium（.710）最高，只有不公开的 Harmonica 更高。YourMT3+ 自报 GuitarSet onset F1 91.65（noPS）。

### 3.4 多乐器与弦乐

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| MuScriptor small / medium / large（Kyutai + Mirelo，ISMIR 2026，arXiv 2607.08168 v2 2026-08-03） | 权重 2026-06-30；仓库 2026-07-02 | 权重 2026-07-10；代码 2026-09-04；release v0.3.0 2026-08-05 | 代码 MIT；权重 CC BY-NC 4.0 | 是（gated） | 自建 D_Test（372 轨）：large onset 60.4 / frame 72.4 / offset 48.6 / drums 49.6，YourMT3+ 32.5 / 45.5 / 17.8 / 41.4；规模效应 60M→1.3B onset 47.7→53.2 | 论文未评 MAESTRO / Slakh / GuitarSet；不输出力度、踏板、弯音；同乐器同音高不能重叠 |
| YourMT3+（Chang, Benetos, Kirchhoff, Dixon，MLSP 2024，arXiv 2407.04822） | 2024-07 | 代码 2024-11-29；Space 2025-01-31 | GPL-3.0 | 是 | MAESTRO onset 96.52；Slakh onset 84.14 / 84.56；GuitarSet 91.65；URMP multi F1 67.22（MT3 58.71）；Slakh 分乐器 Piano 88.84、Guitar 82.27、Bass 93.20、Strings 75.44 | 论文承认商业流行录音上“非主奏乐器低于 10%” |
| MIROS（2025 AMT Challenge 冠军，arXiv 2603.27528） | 2026-03 | — | — | **未查到** | 挑战赛 F1 0.5998（YourMT3 0.5938、MT3 0.3932） | MusicFM 编码器 + YourMT3+ 解码器，约 370M |
| Harmonica nano…x-large（BandLab，arXiv 2609.04640） | 2026-09 | — | — | **不公开** | x-large（15.1M）MAESTRO .968、GuitarSet .909、URMP .925、Slakh .918；RTX 4090 123× 实时 | 乐器无关、仅音符 |
| MR-MT3（Sony，arXiv 2403.10024） | 2024-03 | 2025-06-24 | MIT | 是（HF `gudgud1014/MR-MT3`） | 摘要仅称 Slakh onset F1 提升 | 经 `mt3-infer` 可调用 |
| mt3-infer（openmirlab） | 2025-11 | 2026-09-14 | MIT | 封装 MR-MT3 / MT3-PyTorch / YourMT3 | RTX 4090 57×（MR-MT3）至 15×（YourMT3）实时 | `pip install mt3-infer` |
| Timbre-Trap（Sony，ICASSP 2024，arXiv 2309.15717）；Perceiver-TF（ByteDance，ICASSP 2023）；Omnizart（v0.6.3 2026-05） | 2023 / 2023 / 2020 | — | MIT / — / MIT | 是 / 官方未查到 / 是 | Omnizart GuitarSet F50 59.0 | Omnizart 2026 更新仅为兼容性 |
| Basic Pitch 0.4.0（基线备选） | 2022-03 | 2025-11-13 | Apache-2.0 | 是 | GuitarSet F50 79.0；FiloBass onset 62.73；BSED 24.9 | 唯一自带 pitch bend 的基线，CPU |

弦乐 / 管弦专用：

| 模型 / 数据 | 首发 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|
| **VioPTT**（ICASSP 2026，arXiv 2509.23759） | 2025-09 | Apache-2.0 | 是 | URMP F1 84.5（no-offset 93.1）、Bach10 69.9 | Kong 架构 + 演奏技巧模块；独奏小提琴 |
| MUSC（MTG，ISMIR 2023） | 2023 | AGPL-3.0 | Colab 可跑，权重位置未核实 | URMP 84.6 | 10-cent 音高偏差可进 MIDI（揉弦） |
| BSED / BSD（Müller 组，TISMIR 2026） | 2026-07 | 数据 Zenodo | 权重未核实 | BSED onset F1：Basic Pitch 24.9、YourMT3+ 42.3、T_BSD 71.1 | 管弦评测集与 63 h 训练集 |
| MuScriptor 跨集（论文 Table 2） | — | — | — | Bach10 onset 43.1 vs YourMT3+ 59.8（frame 85.0 vs 66.0）；PHENICX 56.1 vs 56.7，offset 32.6 vs 18.7 | 古典 / 弦乐上 onset 不占优，frame / offset 更好 |

MuScriptor 维护细节：1,477 stars，28 open issues；release v0.2.2（2026-07-21，MPS 与 MIDI 导出）、v0.3.0（2026-08-05，节拍检测、CPU 初始化修复）；Issue #92（2026-08-20）协作者答复“改进主要在模型外围与长曲处理，而非重训模型”；Issue #103 确认所有音符力度为 100；Issue #102 报告 RTX 4090 + WSL2 下 Large 的 RTF 4.19。

### 3.5 力度与表现力

| 模型 / 工具 | 首发 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|
| Transkun V2 / hFT / Aria-AMT（钢琴自带力度） | — | MIT / MIT / Apache | 是 | MAESTRO w-offset+vel 92.94 / 89.48 / 89.45 | 钢琴换模型即解决力度 |
| DiffVel（Kim & Serra，CMMR 2023） | 2023 | MIT | 是 | — | 需音频 + 乐谱卷帘；钢琴 |
| Diff-SFProxy “Beyond Piano”（ISMIR 2026，arXiv 2608.08985） | 2026-08 | 待定 | **尚未发布**（承诺 9 月中） | 吉他 GAPS 力度相关系数 0.860 | 输入“对齐音符 + 音频”给已有转谱补力度，可叠在 MuScriptor 输出之后 |
| Velocity Prediction in AGT（EUSIPCO 2026，arXiv 2606.24912） | 2026-06 | — | **未查到** | GuitarSet F50 86.87；合成集力度误差 7.04 vs 32.39 | Kong CRNN 加力度头 |
| PESTO v2（Sony CSL，TISMIR 2025，arXiv 2508.01488） | 2025-08 | LGPL-3.0 | 是（`pip install pesto-pitch`） | 130k 参数，CPU 12× 实时 | 单音 f0 轨迹，可对分离后的单声部自制 pitch bend |
| Basic Pitch | 2022 | Apache-2.0 | 是 | — | 自带 pitch bend |

### 3.6 本组建议

1. 钢琴：Transkun V2 与 HiRes 做同曲 A/B（MIT，pip 安装，CPU 可跑）。注意 pip 默认检查点不做踏板延音，音符长度习惯不同，可换 Drive 上的 V2 Aug 对比。
2. 钢琴备选：Aria-AMT，面向多样录音条件，可能对后摇混响 / 失真钢琴更稳；权重许可为 CC-BY-NC-SA-4.0。
3. 弦乐独奏声部：VioPTT 或 MUSC 做小提琴类试验；叠奏仍只有 MuScriptor Large / YourMT3+。
4. 力度补全：等 Diff-SFProxy 代码；过渡方案是对单声部用 PESTO v2 提 f0 自写 pitch bend、用逐音 RMS 近似力度（工程量小、无模型风险）。
5. 失真电吉他：短期保留 MuScriptor Medium；若要提升，可用 GOAT 数据（按请求）在 Kong HiRes 架构上自行微调，12 GB 显存可行，但单声部 CRNN 对和弦与串音仍弱。

## 4. 鼓转谱与节拍

覆盖说明：本组同样只做了定向检索（ADTOF 仓库、Separate-and-Detect 仓库、Beat This releases、两篇 2025–2026 论文摘要、两次关键词搜索）。

### 4.1 鼓转谱

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| ADTOF 5 类（基线；Zehren, Alunno, Bientinesi，ISMIR 2021；后续 *High-Quality and Reproducible ADT from Crowdsourced Data*，Signals 2023） | 2021 | `MZehren/ADTOF` 2025-09-18 | 仓库内容 **CC BY-NC-SA 4.0** | 是（Colab / 本地） | README 未列 F 值 | 我们用的 PyTorch 移植自报比原版约 -0.2% F；Python 3.10 |
| **Riley & Dixon, *Enhanced Automatic Drum Transcription via Drum Stem Source Separation*（arXiv 2509.24853）** | 2025-09-29 | v1 | — | **arXiv 页无代码链接（未查到）** | 5 类 F：MDB 0.89 / RBMA 0.63 / ENST 0.85；8 类 F：MDB 0.84（基线 0.72）、ENST 0.76（基线 0.65） | ADTOF + 开源鼓组分离 → 5 类扩到 7 类（crash / ride 分开）并从分离 stem 估计 **MIDI 力度**；正是我们缺的两项 |
| **Separate-and-Detect**（Hsu, Chang, Chen, Su, Yang，ISMIR 2026，arXiv 2608.01093） | 仓库 2026-07-17 | 2026-08-13 | MIT | 是（HF `msgld_ob.ckpt`、`msgld_obtb.ckpt`） | README 只写“F1 高于 U-Net 基线、kick / snare 与端到端 ADT 相当”，无数值 | 潜扩散生成 kick / snare / toms / hi-hats / cymbals 五个 stem 并输出 onset；需 MusicLDM 的 HiFi-GAN / VAE 权重与两个 conda 环境（3.9 / 3.10），接入重 |
| MuScriptor Medium / Large 鼓（基线备选） | 2026-07 | 2026-09-04 | MIT / CC BY-NC 4.0 | 是 | 论文 D_Test drums F1 49.6（YourMT3+ 41.4） | onset 事件、固定力度 100 |

2025–2026 未查到其它带公开权重的新鼓转谱模型；能输出力度的公开方案只有 Riley & Dixon 2025 描述的“分离 stem 估力度”路线。

### 4.2 节拍与强拍

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| **Beat This!**（Foscarin, Schlüter, Widmer，ISMIR 2024，arXiv 2407.21658） | 2024-07 | release v1.0 2024-10-18；**v1.1.0 2026-04-14**（维护版，模型不变，发布 PyPI `beat-this`，新增 `infer_beat_numbers()`） | MIT | 是 | 见论文；GTZAN downbeat F1 75.5（BeatFM 论文转述） | 无 DBN 后处理；路线图 P2 已定 |
| BeatFM（Ru et al.，arXiv 2508.09790 v2 2025-09-09） | 2025-08 | 论文自标“Early draft, do not cite” | — | **无代码 / 权重** | 搜索摘要：GTZAN downbeat 79.6 vs Beat This 75.5；Ballroom beat 96.7 / downbeat 95.2（摘要页未列数字，**未核实**） | 音乐基础模型 + 语义聚合模块 |
| *The SMC Blind Spot*（Ahn, Hwang, Jung，ISMIR 2026 技术报告，arXiv 2605.12287） | 2026-05-12 | — | — | — | SOTA 追踪器在 SMC（慢速 / 表现性音乐）上出现八度错误、连续性错误与完全失败；DBN 最低 55 BPM 阈值影响约 21% SMC 曲目 | 对后摇慢段直接相关：网格必须可关、允许多假设速度 |
| madmom / Essentia / librosa（工具） | — | madmom PyPI 0.16.1（2018-11），main 2024-08；Essentia 2026-08 活跃但无 Windows wheel | 自定义 / AGPL / ISC | — | — | 只作 onset / 特征工具 |

### 4.3 本组建议

1. 鼓：沿 Riley & Dixon 2025 的路线用现有部件自建“分离 + ADTOF + 力度”管线：MVSEP 有 Drums Separation（5 stems）类别、gilliaan 有 Drums v1 BS-RoFormer；先找其论文是否随后开源（作者的 HF 分发库 `xavriley/midi-transcription-models` 2026-08-22 仍在更新），没有就按论文方法做最小复现（stem RMS → 力度，crash / ride 由分离 stem 判定）。
2. 节拍：接入 Beat This! v1.1.0（P2 已定）；参考 SMC 报告，慢段与自由速度段允许隐藏网格并显示备选速度。
3. Separate-and-Detect 只在需要“可编辑的五个鼓 stem”时试，环境重、无公开数值。
4. 不追 BeatFM（草稿、无代码）。

## 5. 段落与和弦

### 5.1 和弦识别

各论文测试集不同（BTC 原文 Iso 221 + RW 65 + UsPop 185；ChordFormer 1217 曲；ChordMini 600 曲；Kim & Park 471 曲；BMACE 仅 uspop），唯一可横向比的是 BTC 在各论文中作为共同基线的数值。WCSR（%）：

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| BTC（基线，Park et al.，ISMIR 2019，arXiv 1907.02698） | 2019-07 | 2020-05-23 | MIT | ChordMini 仓库内含原 teacher `btc_model_large_voca.pt` | 170 类 5 折：root 83.5 / majmin 82.3 / sevenths 71.8 / MIREX 80.8 | 已在用 |
| **ChordFormer**（Akram, Dettori, Colla, Buttazzo，arXiv 2502.11840；TASLP 2026） | 2025-02 | 仓库建于 2026-09-02，最后提交 09-03，3 stars | **无 LICENSE** | 是（仓库 `cache_data/` 5 折 `.sdict`，合计约 368 MB） | 1217 曲：root 84.69 / majmin 84.09 / sevenths 72.28 / MIREX 83.62；对照 Jiang 2019 83.39 / 82.62 / 69.78 / 81.52 | 6 头结构化词表（root/triad、bass、7、9、11、13）含 N；5 折集成 + HMM；GPU 索引硬编码、数据路径耦合 |
| Jiang et al. 2019 / `lv-chordia`（PyPI 1.1.0 2026-07-11） | 2019 | 2026-07 | MIT | 是（wheel 内置 27 MB 集成） | README 转述：Billboard ~81 / RWC ~78 / Iso ~83（未核实原文） | 词表可选 ~170 / ~25 / 600+；无置信度 |
| **consonance-ACE**（MTG，ISMIR 2025，arXiv 2509.01588） | 2025-09 | 36 stars，40 次提交 | MIT | 是（仓库内 ckpt） | 训练 Iso+Billboard，测试 RWC-Pop+USPop：root 84.0 / majmin 77.8 / sevenths 66.0 / MIREX 79.8 | Conformer + 分解输出 root(13) / bass(13) / 音级(12)，天然给出转位与 top-k 候选；Python 3.11 |
| ChordMini（Phan et al.，DAFx26 预印本，arXiv 2602.19778） | 2026-02 | 21 stars | MIT | 是 | 170 类 600 曲：BTC-CL majmin 80.24 / MIREX 80.16；同切分 BTC teacher 79.00 / 78.65 | 伪标签 1000 h + 蒸馏；与 BTC 同架构可直接替换 |
| Kim & Park 事件级 seq2seq（ICASSP 2026，arXiv 2604.24386） | 2026-04 | 仓库 3 次提交 | 未查到 | **未见权重** | 471 曲：root 87.4 / majmin 86.7 / sevenths 78.6 / MIREX 85.7；同表 BTC 83.5 / 82.3 / 71.8 / 80.8 | 数值最高但无权重；无转位 |
| BMACE（Mamba，arXiv 2601.02101） | 2026-01 | — | 未查到 | 未查到 | uspop：majmin 76.78 vs BTC 76.28 | 114K 参数 |
| OMAR-RQ（MTG，arXiv 2507.03482） | 2025-07 | HF 2025-12-04 | 代码 AGPL-3.0 / 权重 CC-BY-NC-SA-4.0 | 仅编码器 | 探针 majmin-25 准确率 0.749 vs MERT 0.609 | 需自训探针 |
| crema（bmcfee）、madmom、Chordino | 2017 / 2015 / — | 2024-05 / 2024-08 / 2020-04 | BSD-2 / 自定义 / GPL-2.0 | 是 | 未查到 | 老工具，madmom PyPI 停在 0.16.1（2018） |

置信度与多候选：BTC、crema、ChordMini、ChordFormer 有帧级后验；consonance-ACE 可由 root / bass / 音级激活派生候选；lv-chordia 无。截至调研日未查到“基于 MERT / MuQ / MusicFM 微调并附可下载和弦头”的公开模型（MARBLE v2 有 Chords1217 任务但无推理脚本）。

### 5.2 段落 / 结构

| 模型 | 首发 | 最近更新 | 许可证 | 权重 | 数值 | 备注 |
|---|---|---|---|---|---|---|
| **SongFormer**（基线，ASLP-lab，arXiv 2510.02797 v3 2026-04-08） | 2025-09 | 代码与 HF 2026-05-14 | README / HF 标 CC-BY-4.0；依赖 MuQ 权重 CC-BY-NC-4.0 | 是（头 104 MB + 含骨干 2.76 GB） | SongFormBench-Harmonix：ACC 0.807 / HR.5F 0.696 / HR3F 0.780；RWC-Pop 0.814 / 0.650 / 0.804；**无 SALAMI** | 8 标签；MuQ + MusicFM 双骨干，30 s 局部 + 420 s 全局窗；HF pipeline 只返回 start / end / label，取置信度需改内部代码；代码硬编码 cuda:0；12 GB 显存可行性未核实 |
| MSAF（基线） | 2014 | 2026-05-13；PyPI 0.1.80 2023-06 | MIT | 无需 | Marmoret 2026 同类算法：Foote Harmonix F0.5 46.95 / F3 72.39，SALAMI 36.96 / 52.87 | 无功能标签 |
| All-in-One（Kim & Nam，WASPAA 2023，arXiv 2307.16425） | 2023-07 | 2024-05-09；PyPI 1.1.0 2023-10 | MIT | 是 | 自报 Harmonix HR.5F 0.660 / PWF 0.738；SongFormBench-Harmonix ACC 0.740 / HR.5F 0.596 / HR3F 0.730 | 标签含 solo / break；可输出帧级激活；Windows 需自编译 NATTEN；16 个月无提交 |
| LinkSeg（Buisson, McFee, Essid，ISMIR 2024） | 2024-11 | 2025-04-02 | 未查到 | 是（7 类 / 9 类） | SongFormBench-Harmonix ACC 0.780 / HR.5F 0.630 / HR3F 0.762 | 图链接预测；依赖 madmom |
| TA（ByteDance，WASPAA 2025，arXiv 2507.13572） | 2025-07 | — | — | **否** | Harmonix ACC 0.787 / HR.5F 0.610 / HR3F 0.801 | 无代码 |
| Sony MSA-bench（ICASSP 2026，arXiv 2512.17209） | 2025-12 | 2026-01-29 | MIT（评测代码） | 否 | 线性探针：MusicFM(MSD) HR.5F 54.19 / HR3F 63.91；MERT-330M 45.39 / 57.72 | 结论：长上下文 + 音乐数据自监督最优 |
| Marmoret 无监督嵌入评测（SMC 2026，arXiv 2603.27218） | 2026-03 | v2 2026-07-16 | 未查到 | 无模型 | CBM 算法：MATPAC++ Harmonix 55.30 / 73.79，SALAMI 38.90 / 53.74；MuQ SALAMI 35.68 / 48.73 | 唯一覆盖 SALAMI（含非流行）的新结果；建议 trimming 评估 |
| MIREX 2025 MSA | 2025 | — | — | — | relabeled Harmonix：Baseline(MusicFM) ACC 0.705 / HR.5 0.644；kgstruct 0.720 / 0.590 / HR3 0.762 | 7 类 |

SongFormer 补充：Issue #3（末尾分块过短浮点异常，已关）、#5（重复段标签，开放）、#9（商用许可澄清，开放，无回复）；个人离线使用不受 NC 影响。器乐适用性：论文无独立分析，标签集有 inst / silence 但无 solo / break；HeartMuLa（arXiv 2601.10547）已用 SongFormer 做结构标注。

### 5.3 调性、速度与工具

调性：S-KEY（Deezer，ICASSP 2025，arXiv 2501.12907，MIT，含权重，支持 CPU）；keymyna（arXiv 2604.10021，2026-04）声称新 SOTA。拍 / 速度：Beat This!（PyPI `beat-this` 1.1.0 2026-04-14）可直接推速度；拍号检测未查到 2025–2026 强公开模型。工具：madmom PyPI 停在 0.16.1（2018-11），main 分支 2024-08 做过 NumPy 兼容；Essentia 活跃（2026-08-27）但 PyPI 无 Windows wheel。

### 5.4 本组建议

1. consonance-ACE：MIT、权重在仓库、同行评审；分解式输出直接服务“原始标签 + 归一化标签 + 多候选”的需求。风险：majmin 数值不高于 BTC（测试集不同）。
2. ChordFormer（路线图既定）：权重刚公开、301 和弦结构化词表；风险：无 LICENSE、3 stars、GPU 索引硬编码。若环境卡住，先用 `pip install lv-chordia` 验证词表映射流程。
3. ChordMini BTC-CL：与现用 BTC 同架构同词表，接入成本最低，各项高于 teacher 1–3 点。
4. 结构（器乐 / 后摇补充）：Marmoret 的 CBM + MuQ / MATPAC++ 嵌入是唯一在 SALAMI 上有 2026 数据的路线，与 MSAF“同字母仅表相似”的语义一致；风险：SALAMI F0.5 仅约 39–40，无功能标签。
5. LinkSeg 7 类作为结构第三意见；风险：Python 3.9 + madmom 在 Windows 的编译。
观察名单：Kim & Park（数值最高但无权重）、Sony MSA-bench（需自训探针）、TA（无代码）。

## 6. 综合建议

按“确定性收益 × 接入成本 × 许可可用”排序，只作试验顺序建议；是否改默认由固定曲库上的人工试听与可视对照决定（路线图 P3），每次只换一个变量。

| 顺序 | 试验 | 理由 | 主要风险 | 成本 |
|---|---|---|---|---|
| 1 | 钢琴：Transkun V2 与 HiRes 同曲 A/B | MAESTRO with-offset F1 93.5 vs 82.5，MIT，pip 安装，CPU 可跑，带力度与踏板 | 2024-11 后无提交；默认检查点不做踏板延音，音符长度习惯不同 | 低 |
| 2 | 和弦：consonance-ACE 与 ChordFormer 对照 BTC（P2 已定） | 前者 MIT、分解式输出适合多候选展示；后者权重刚公开、结构化大词表 | ChordFormer 无 LICENSE、硬编码 GPU 索引；测试集不同不可直接比数 | 中 |
| 3 | 鼓：ADTOF + 鼓组分离 → 7 类 + 力度 | 直接解决现有“5 类、固定力度”两大限制；论文 8 类 F 提升 10–12 点 | 论文代码未查到，可能要最小复现 | 中 |
| 4 | 节拍：Beat This! v1.1.0（P2 已定） | MIT、PyPI、活跃维护 | 慢速 / 自由速度段失效（SMC 报告），网格必须可关 | 低 |
| 5 | 分轨：核对 MVSEP 排行榜 Guitar / Piano / Strings 榜首；Mega 53 吉他 / 钢琴目标与 SW 六轨同源 A/B；查清 SW 权重出处 | 基线里唯一出处不明的权重；细分模型可能直接给出更干净的吉他 / 钢琴 | 排行榜数值本次未取到；A/B 需要整曲推理 | 中 |
| 6 | 钢琴备选：Aria-AMT | 面向多样录音条件，MAPS 90.6 vs Kong 83.1 | 权重 CC-BY-NC-SA-4.0、Python 3.11、BF16 | 低 |
| 7 | 力度 / 弯音补全：等 Diff-SFProxy 代码；过渡用 PESTO v2 提 f0 + 逐音 RMS | 叠在 MuScriptor 输出之后即可，不换模型 | 代码未发布；工程近似不是模型预测 | 低 |
| — | 吉他、弦乐叠奏、贝斯：维持 MuScriptor / FiloBass | 失真吉他新工作（Ti-hFT、GOAT、TART）无权重；MuScriptor 在失真集 GOAT 上是可下载模型里最高；贝斯无新模型 | 若要提升只能用 GOAT 数据自行微调 | 高 |

维护状态汇总：活跃（6 个月内）——MuScriptor、MSST、bs-roformer-infer、Beat This、MSAF、SongFormer（5 月）、Transkun 否（2024-11）；停止或归档——Demucs、BTC、YourMT3+（2024-11）、HiRes 官方仓库（2023-08，权重分发库仍更新）。许可需留意：MuScriptor 权重与 SongFormer 依赖的 MuQ 权重为 CC BY-NC，ADTOF 仓库为 CC BY-NC-SA，Aria-AMT 权重 CC BY-NC-SA，SW 权重 unknown，ChordFormer 无 LICENSE；个人本地使用均可，再分发需逐项确认。

## 7. 参考文献与来源

论文（按任务；年月为 arXiv v1 或会议时间）

分离与细分
- Lu, Wang, Kong, Hung. *Music Source Separation with Band-Split RoPE Transformer*. arXiv 2309.02612（2023-09），ICASSP 2024. https://arxiv.org/abs/2309.02612
- Rouard, Massa, Défossez. *Hybrid Transformers for Music Source Separation*. arXiv 2211.08553（2022-11），ICASSP 2023. https://arxiv.org/abs/2211.08553
- Tong et al. *SCNet: Sparse Compression Network for Music Source Separation*. arXiv 2401.13276（2024-01）. https://github.com/starrytong/SCNet
- Solovyev, Kiselev, Stempkovskiy, Gabruseva. *Music-Source-Separation-Training (MSST): A Unified Framework…*. arXiv 2607.23395（2026-07）. https://arxiv.org/abs/2607.23395 ；模型库 https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/docs/pretrained_models.md ；Mega 53 release https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/tag/v1.0.21
- Ding. *Beyond SDR: How Music Source Separation Reshapes Rhythm-Relevant Signal Properties*. arXiv 2609.04224（2026-07）. https://arxiv.org/abs/2609.04224
- Liu et al. *Separate Anything You Describe*（AudioSep）. arXiv 2308.05037（2023-08）. https://github.com/Audio-AGI/AudioSep
- 文本查询分离后继：Hybrid-Sep arXiv 2506.16833；HSM-TSS arXiv 2505.21025；UniSep arXiv 2503.23762；FasTUSS arXiv 2507.11435
- 权重与模型卡：https://huggingface.co/enerjazzer/BS-ROFO-SW-Fixed ；https://huggingface.co/gilliaan/Stem-Separation-Models ；https://huggingface.co/pcunwa/BS-Roformer-HyperACE ；https://github.com/openmirlab/bs-roformer-infer ；https://mvsep.com/quality_checker/

钢琴
- Kong et al. *High-resolution Piano Transcription with Pedals…*. arXiv 2010.01815（2020-10），TASLP 2021. https://arxiv.org/abs/2010.01815
- Yan, Duan. *Transkun V2*（ISMIR 2024）. arXiv 2404.09466. https://github.com/Yujia-Yan/Transkun
- Toyama et al. *hFT-Transformer*（ISMIR 2023）. arXiv 2307.04305. https://github.com/sony/hFT-Transformer
- Aria-AMT / Aria-MIDI（ICLR 2025）. arXiv 2504.15071. https://github.com/EleutherAI/aria-amt
- Wei, Lalang, Li, Yoshii. OT 分布匹配（ICASSP 2026）. arXiv 2605.17405 ；D3RM（ICASSP 2025）arXiv 2501.05068 ；Li, Zang, Kong（ICASSP 2025）arXiv 2501.03038 ；Streaming arXiv 2503.01362 ；Efficient sparse attention（APSIPA 2025）arXiv 2509.09318
- Marták, Hu, Widmer. *Sound and Music Biases*. arXiv 2512.14602（2025-12）

贝斯、吉他
- Riley, Dixon. *FiloBass*（ISMIR 2023）. arXiv 2311.02023
- Riley, Edwards, Dixon. *High Resolution Guitar Transcription via Domain Adaptation*（Guitar-FL，ICASSP 2024）. arXiv 2402.15258
- Riley et al. *GAPS*（ISMIR 2024）. arXiv 2408.08653 ；权重分发 https://huggingface.co/xavriley/midi-transcription-models
- Chen et al. Ti-hFT / TIT. arXiv 2504.07406 ；Loth et al. GOAT（ISMIR 2025）arXiv 2509.22655 ；Gupta et al. TART（ISMIR 2026）arXiv 2609.11904 ；Simionato, Bigo. Noise2Fret（ISMIR 2026）arXiv 2608.30854 ；Fretting-Transformer（ICMC 2025）arXiv 2506.14223 ；Loth et al. Velocity Prediction in AGT（EUSIPCO 2026）arXiv 2606.24912 ；Guitar-TECHS（ICASSP 2025）arXiv 2501.03720
- MulTTiPop 数据集. arXiv 2607.08756

多乐器、弦乐、力度
- Rouard, Krause, Roebel, Simon-Gabriel, Défossez. *MuScriptor: An Open Model for Multi-Instrument Music Transcription*. arXiv 2607.08168（v1 2026-07-09，v2 2026-08-03），ISMIR 2026. https://github.com/muscriptor/muscriptor ；https://huggingface.co/MuScriptor/muscriptor-large
- Chang, Benetos, Kirchhoff, Dixon. *YourMT3+*（MLSP 2024）. arXiv 2407.04822. https://github.com/mimbres/YourMT3
- Ou, Martel, Hennessy-Priest, Cho. *Harmonica*（BandLab，2026-09）. arXiv 2609.04640
- 2025 AMT Challenge 结果 arXiv 2603.27528 ；MR-MT3 arXiv 2403.10024 ；mt3-infer https://github.com/openmirlab/mt3-infer ；Perceiver-TF arXiv 2306.10785 ；Timbre-Trap arXiv 2309.15717 ；Basic Pitch arXiv 2203.09893
- Wang, Peng, Su, Cheung. *VioPTT*（ICASSP 2026）. arXiv 2509.23759. https://github.com/y10ab1/VioPTT ；MUSC https://github.com/MTG/violin-transcription ；BSED / BSD（TISMIR 2026）https://transactions.ismir.net/articles/10.5334/tismir.343
- He et al. *Beyond Piano*（Diff-SFProxy，ISMIR 2026）. arXiv 2608.08985 ；Score-Informed Transformer arXiv 2508.07757 ；DiffVel https://github.com/Hyon0930/DiffVel_CMMR2023 ；Riou et al. *PESTO v2*（TISMIR 2025）arXiv 2508.01488

鼓与节拍
- Zehren, Alunno, Bientinesi. *ADTOF*（ISMIR 2021）；*High-Quality and Reproducible Automatic Drum Transcription from Crowdsourced Data*（Signals 2023）. https://github.com/MZehren/ADTOF
- Riley, Dixon. *Enhanced Automatic Drum Transcription via Drum Stem Source Separation*. arXiv 2509.24853（2025-09）
- Hsu, Chang, Chen, Su, Yang. *Separate-and-Detect*（ISMIR 2026）. arXiv 2608.01093. https://github.com/ddman1101/Separate-and-detect
- Foscarin, Schlüter, Widmer. *Beat This!*（ISMIR 2024）. arXiv 2407.21658. https://github.com/CPJKU/beat_this/releases
- Ru et al. *BeatFM*. arXiv 2508.09790（草稿）；Ahn, Hwang, Jung. *The SMC Blind Spot*. arXiv 2605.12287（2026-05）

和弦
- Park et al. *A Bi-directional Transformer for Musical Chord Recognition*（ISMIR 2019）. arXiv 1907.02698. https://github.com/jayg996/BTC-ISMIR19
- Akram, Dettori, Colla, Buttazzo. *ChordFormer*. arXiv 2502.11840（2025-02），TASLP 2026. https://github.com/mwaseemrandhawa/ChordFormer
- Poltronieri, Serra, Rocamora. consonance-ACE（ISMIR 2025）. arXiv 2509.01588. https://github.com/andreamust/consonance-ACE
- Phan et al. *ChordMini*（DAFx26 预印本）. arXiv 2602.19778. https://github.com/ptnghia-j/ChordMini
- Kim, Park. 事件级 seq2seq（ICASSP 2026）. arXiv 2604.24386 ；BMACE arXiv 2601.02101 ；OMAR-RQ arXiv 2507.03482 ；lv-chordia https://github.com/openmirlab/lv-chordia ；crema https://github.com/bmcfee/crema

段落 / 结构
- ASLP-lab. *SongFormer*. arXiv 2510.02797（v1 2025-10，v3 2026-04）. https://github.com/ASLP-lab/SongFormer ；https://huggingface.co/ASLP-lab/SongFormer
- Kim, Nam. *All-in-One*（WASPAA 2023）. arXiv 2307.16425. https://github.com/mir-aidj/all-in-one
- Buisson, McFee, Essid. *LinkSeg*（ISMIR 2024）. https://github.com/morgan76/LinkSeg
- Zhang et al.（ByteDance）. TA（WASPAA 2025）. arXiv 2507.13572 ；Toyama et al.（Sony）. MSA-bench（ICASSP 2026）. arXiv 2512.17209 ；Marmoret. 无监督嵌入评测（SMC 2026）. arXiv 2603.27218 ；MIREX 2025 MSA https://music-ir.org/mirex/wiki/2025:Music_Structure_Analysis_Results
- MSAF https://github.com/urinieto/msaf

调性与工具
- S-KEY（Deezer，ICASSP 2025）arXiv 2501.12907 https://github.com/deezer/skey ；keymyna arXiv 2604.10021 ；madmom https://github.com/CPJKU/madmom ；Essentia https://github.com/MTG/essentia

基线维护状态的原始 API 快照：`work/model-survey-20260917/baseline-status.json`（2026-09-17）。未能核实的项目已在各表内标注：MVSEP 排行榜数值、SW 权重出处、Mega 53 评测集、SCNet-XL 权重位置、BeatFM 数值、ChordFormer TASLP 卷页、LinkSeg 原论文表格、SongFormer 在 12 GB 显存上的可行性。
