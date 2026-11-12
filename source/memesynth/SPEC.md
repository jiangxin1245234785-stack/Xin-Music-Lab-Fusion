# SPEC — memesynth v1

**一句话**：读 XLD 导出的 `merged.mid`，用 meme 素材渲染成 wav。与 XLD 完全解耦，只通过文件交接。

1. **输入**：① XLD「融合 / 导出」产出的单个 `merged.mid`（手动导出，一首一个）；② `kit.json` 素材映射表；③ `samples/` 下已切好的 wav。
2. **输出**：`<曲名>.wav`（48k / stereo / 24bit）+ 每轨分轨 wav（便于后期重混）。同名文件报错退出，不覆盖。
3. **界面**：CLI（`python -m memesynth song.mid kit.json -o out/`）。无 GUI。
4. **目标机器**：本机开发用。**v1 不打包 exe**。自建 venv，依赖仅 `numpy / soundfile / pretty_midi` —— 全部纯 wheel，**无 librosa、无 numba、无 scipy**（重采样用 `np.interp`，scipy 实现下来并不需要），绕开打包雷区。
5. **失败策略**：素材缺失或 `kit.json` 引用不到 → 启动前一次性校验，列出全部缺失项后中止。单个音符渲染异常 → 跳过并记 log，继续。
6. **路由契约**（已对 `artifacts/refinement-three-20260915` 下真实导出验证）：轨道 `name` 以 `/` 分段，前段为 stem（`bass`/`piano`/`guitar`/`drums`/`strings`），后段为音色名（如 `clean electric guitar`）；鼓轨 `is_drum=True`，pitch 固定六值 —— `36 kick / 38 snare / 42 hihat / 47 tom / 49 crash / 51 ride`。
7. **时间基准**：一切按**秒**。文件里的 `tempo=120`、`4/4`、`960 tpb` 全是占位，禁止用于量化、对齐或小节推算。
8. **变调方式**：简单重采样，共振峰随音高走。**不做共振峰保持** —— 花栗鼠效应是本项目要的听感，不是缺陷。
9. **已知数据缺陷**（渲染器必须处理）：吉他轨力度恒为 100（MuScriptor 不产动态）；鼓轨 duration 恒为 0.1s（无意义，只取 onset）；存在 <10 ms 的极短音符（需最小时值阈值过滤，否则渲染出一片爆音）。
10. **素材分析离线化**：测基频等需要 librosa 的步骤**不进主程序**，一次性离线跑完，把 `rootHz` 固化进 `kit.json`。主程序依赖链因此保持干净。

## v2 backlog

- exe 打包 / GUI
- 按音高或音符密度派生吉他动态
- 时间拉伸（而非掐断）以匹配长素材与短音符
- 和声轨（BTC 输出）作为垫底
- 单 stem 文件输入（注意：per-stem 导出会丢掉轨名里的 stem 前缀，需从文件名反解）
