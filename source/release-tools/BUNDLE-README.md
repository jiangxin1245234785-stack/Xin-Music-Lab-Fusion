# Xin Music · {{VERSION}}

本版新增鼓 MIDI 备选引擎 “ADTOF · DrumSep 7 类”：鼓点仍由 ADTOF 检测，MDX23C DrumSep 把鼓轨分离为 kick / snare / toms / hh / ride / crash 六轨，用于把镲片拆成 crash 与 ride、并按各击在自己 stem 上的能量给出本曲内的相对力度（32–127）。ADTOF 保持默认，MuScriptor 鼓备选不变；分离权重（CC BY-NC-ND）在 runtime/addons/drumsep-v1，不随包。相对力度不是录音真实力度。

上一版（chords.2）把和弦主引擎从 BTC 换成 ChordMini · BTC-CL（同架构、同 170 类词表的蒸馏版），依据是四首整曲（MEGURI、toe、BCNR Nancy、七里香）的对照页与用户拍板：XLD 专辑批量与和弦页默认选中 ChordMini（不可用时退回 BTC），XML 加权共识给 ChordMini 最高先验（1.5，BTC 1.35，其余 1）。BTC 与 consonance-ACE · Conformer（根音 / 低音 / 音级分解输出，保留转位）保留为备选，已有 BTC 结果继续可读、可在 XML 单选。和弦 runner 与 BTC / ACE 代码随程序发布，权重留在 runtime（BTC 在 runtime/0.5.0，ChordMini 与 ACE 在 runtime/addons/chords-v1）。

钢琴默认仍为 Transkun V2（piano.2），其他声部默认、模型参数、分轨、细分与融合不变。ai 环境补齐了 soxr 与 packaging（此前缺失时四个旧和弦引擎无法启动）。

双击 XLD.exe 开始，XML.exe 负责可视化，F1 查看使用说明。保留 releases/{{VERSION}} 与 runtime 的相对目录，不要单独复制 EXE。仅本机开发版，未做干净 Windows 验收。
