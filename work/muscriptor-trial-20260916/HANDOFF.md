# MuScriptor Medium 吉他试听

## 当前阶段
MEGURI 整曲 CUDA 转谱及独立试听交付完成，音乐准确性待用户验收。GAPS 保持默认。

## 已定范围
- 官方 Medium 权重 revision f32236969308476e01fd3aae67357de5feb05a2d，SHA256 ac80adbdf85d87231735fd948af7013441c0afced316c4e9067fd5d8a7fb97ec。
- 官方代码 7f213afecf23bd6a1b8672aa223690ee9807cefb，复用既有 yourmt3-v1 Python；未修改依赖或产品。
- 仅同源 BS-RoFormer SW guitar.wav，568.75 秒。原 WAV、GAPS 哈希不变。
- 限定 acoustic_guitar、clean_electric_guitar、distorted_electric_guitar，batch=4、prelude_forcing=false、CFG=1、确定性解码。
- 无节奏量化或时间平移。官方导出包含同声部同音重叠整理，不额外修音；原始事件独立保存。
- 完整 MIDI 保留官方声部与音色；试听统一清音电吉他 program 27 和力度 90，与 GAPS 使用相同音源。
- 不输出连续弯音曲线，不能承诺还原揉弦；统计不代表听感质量。
- 0 个片段触发官方解码长度上限；具体时间见 verification.json 和试听页，可能漏音或不完整，不等于无警告成功。

## 首次尝试与复核
首次 batch=1、prelude_forcing=true 在若干片段达到 2000 token 上限，且随跨片段状态累计出现异常密集音符，因此主动中止；日志与事件保存在 attempt-forced-ties。160–170 秒独立重跑，限定吉他/自动乐器分别为 121/123 个原始音符，未复现该异常。问题可能与强制跨片段状态有关，尚不能认定上游根因。本交付改用官方 prelude_forcing=false、batch=4 模式重跑整曲，不对音符额外修补。该设置可能影响片段边界的延音，须结合试听判断。

## 运行及验证
- CUDA，官方转谱计时 42.1 秒（不含加载/导出）；显存峰值未留存。
- 导出 2916 音符；原始事件 2919 音符。
- 全部 114 片段完成，无未关闭音符；MIDI 回读与官方清理后的音符集合按 MIDI tick 一致。
- 9 段 30 秒音频可播放、宽窄窗口无横向溢出；页面视觉检查完成。
- 三个对照窗口为 60/270/480 秒起；不按识别结果挑选片段。

## 导出说明
运行报告在导出后遇到 NumPy 整数 JSON 序列化问题，已修正脚本，并从完成日志和 MIDI 恢复报告；未为补报重复推理，显存峰值记为未知。官方 MIDI 在各声部轨重复写入相同的 120 BPM 导致 pretty_midi 提示，已检查所有 tempo 都在零时刻且值为 500000，回读时序与原始事件官方清理结果严格一致；120 BPM 是时间编码基准，不是歌曲测得速度。

## 文件地图
- 暂存与下载权重 D:/Caches/codex/muscriptor-trial。
- 试听 artifacts/muscriptor-guitar-20260916/listening/吉他MuScriptor对比.html。
- result/verification/events.jsonl 保存运行和原始事件；models 仅本地缓存，不复制到交付。
- run.py 转谱，verify.py 校验，render.py 试听，check-ui.cjs 页面检查。
- Python: runtime/addons/yourmt3-v1/python.exe；渲染使用 runtime/0.5.0/envs/highres/python.exe。

## 不变量与下一步
当前产品菜单、默认模型、真实资料库索引、原始曲目、WAV 和旧 MIDI 均保留。
用户已否决 MEGURI 的 YourMT3+ 吉他与 FL 改善；仅在本次听感胜过 GAPS 后讨论接入。
官方下载授权已由用户完成；不得在日志或聊天里记录令牌。后续使用同一个本机 HF 登录。
