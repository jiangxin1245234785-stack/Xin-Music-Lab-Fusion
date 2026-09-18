# WEG 多模型分轨交接

开发版 XLD 0.5.0-dev.core.5；XML 0.5.0-dev.stems.7。关闭旧开发窗口后重新打开已有开发入口即可。安装产品未更新。

## 已交付

- XLD 的 WAV 区增加 BS-RoFormer SW 默认与 Demucs 6s 备选，沿用已有模型卡片。显示可用、已缓存、正在使用；选卡片仅预选，生成/使用成功才激活。
- 两个六轨模型单独保存；统一时间原点、44.1kHz 双声道 float WAV。长曲 CPU 累加、GPU 分块推理，模型/配置校验固定。
- MIDI 绑定分轨版本；切换不误用旧音符，切回原分轨恢复其全部 MIDI 模型变体。失败、取消保留旧结果；试听切换保留声部、位置及播放/暂停状态。
- XML 继续读取 XLD 当前结果。其便捷分析沿用当前模型，首次选择可用默认；模型菜单仍由 XLD 提供。
- 两首 WEG 的两模型完整 WAV 已加入原分析目录。Radioactive Spell Wave 的 RoFormer 分轨附 guitar GAPS 1633、piano HiRes 1048、bass HiRes 1484 个音符的 MIDI。数量仅用于确认文件，不用于评价质量。
- 修正文档中 GAPS 为古典吉他模型的旧表述：主要面向干净爵士吉他，不能据此推断失真/滑音的准确率。

## 本机实际运行

| 歌曲 | 模型 | 原曲秒数 | 生成秒数 | PyTorch 峰值分配 MiB |
|---|---|---:|---:|---:|
| Radioactive Spell Wave | demucs | 647.711 | 21.438 | 未记录 |
| Radioactive Spell Wave | roformer | 647.711 | 76.922 | 未记录 |
| Scorpius Circus | demucs | 617.667 | 17.218 | 734.8 |
| Scorpius Circus | roformer | 617.667 | 72.828 | 2355.7 |

Radioactive 的 Demucs 行为已有历史结果；其余为本轮实际运行。时间包含加载和写盘，只适用于本机这次运行。峰值是 PyTorch 已分配内存，不是整机总显存。每份音频的有限值、帧数、声道和采样率检查见 audio-validation.json。没有原始多轨真值，没有 SDR 或质量排名结论。

## 验证证据

两产品完整 npm test 通过。新增 separation-models 测试覆盖旧缓存、来源内多个 MIDI 模型恢复、复用、错误模型拒绝、取消与失效。

真实整曲三声部 MIDI、真实 RoFormer 运行中取消、16k 单声道短静音与 48k 双声道重采样均通过。30 秒实际音频与固定上游推理逐样本对照，最大误差小于 0.0001（实际约 1e-7），验证 CPU 累加没有改变推理内容。

真实 XLD 窗口验证默认/备选、预选与激活、暂停时 123 秒位置、同声部切换、MIDI 恢复、目录、失败信息及重试；真实 XML 窗口验证新结果、刷新后的播放位置和便捷入口模型一致性。试听页六片段在 Electron 中逐一验证加载与 A/B 播放切换。

## 使用与结果

XLD 入口：D:/Projects/Xin-Music-Lab-Fusion/source/xld-runtime-baseline/start-dev.cmd

本地试听页：D:/Caches/codex/weg-separation/outputs/WEG 分轨试听.html。两首各三个 20 秒候选片段，以能量和高频占比选取，仅用于方便对照，不是人工编配分类。各轨未单独归一化或降噪。

Radioactive 目录：D:\Caches\Xin's Local Deck\Analysis\world's end girlfriend - LAST WALTZ\08 Radioactive Spell Wave__5ff7c04558

Scorpius 目录：D:\Caches\Xin's Local Deck\Analysis\world's end girlfriend - The Lie Lay Land\06 Scorpius Circus__1ace6c462c

用户清单备份：D:\Caches\codex\weg-separation\user-result-backup。旧 Demucs WAV/MIDI 仍留在原目录。源码备份：D:/Caches/codex/weg-separation/before。

## 边界与下一轮

个人项目迭代没有增加任务队列、常驻服务、跨进程协调、无限历史、打包发布或训练。每模型保留最近一次成功分轨；强制重分轨产生新来源，旧 MIDI 不作为新 WAV 的结果。原音频、人工标签、段落与和弦算法不改。

默认模型是可用且经过工程验证的预设，不代表已通过 WEG 听感优越性验收。先用本地试听页标记具体串音、目标声部缺失或尾音损伤片段，再决定是否引入目标乐器专用权重；不要按音符多少或人声排行榜选模型。器乐纹理、噪声和混响仍保留在 WAV，当前没有角色/动机自动标注。
