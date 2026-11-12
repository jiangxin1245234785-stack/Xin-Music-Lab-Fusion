# HANDOFF — memesynth

**当前阶段**：Phase 1 完成（核心逻辑 + CLI 可跑）。未进 Phase 2（无 GUI 需求）、未进 Phase 3（v1 不打包）。

接手前先读 [SPEC.md](SPEC.md)。未触发升级条件不要重构架构。

## spec 摘要

读一个 XLD 导出的 `merged.mid`，用 meme 素材渲染成 wav + 分轨。独立 CLI，与 XLD 零运行时耦合，只通过文件交接。

## 已定决策及理由

| 决策 | 理由 |
|---|---|
| 独立部件，不并入 XLD | 用户明确要求：避免 XLD 体量膨胀带来性能负担 |
| 只读 `merged.mid`，用户手动导出 | 不碰 XLD 的 storage，交接面收敛到一个文件 |
| 要 merged 不要单 stem | 单 stem 导出会丢掉轨名里的 stem 前缀，路由失去依据（已验证） |
| 简单重采样，不保共振峰 | 花栗鼠效应是本项目要的听感（SPEC §8）。这条决定顺带砍掉整条 WORLD / Rubber Band 依赖链 |
| 重采样用 `np.interp` 不用 scipy | 实现下来 scipy 一次都没用上，依赖从 4 个减到 3 个 |
| 素材测频离线化，放 `tools/` | 唯一需要 librosa 的一步。踢出主程序后依赖全是纯 wheel，将来要打 exe 没有雷区 |
| 分轨存单声道，声像写出时施加 | 490 秒 / 10 路由全存立体声要 ~3GB。改后峰值约 1.1GB |
| 总混音与全部分轨施加同一衰减量 | 分轨可能比总混音更响（声像/相消）。单独归一化会让分轨相加不再等于总混音 |

## 文件地图

```
SPEC.md                     冻结的需求
README.md                   用法
memesynth/score.py          MIDI 读取 + 路由层（唯一懂 XLD 导出格式的地方）
memesynth/kit.py            kit.json 加载 + 一次性校验
memesynth/render.py         重采样渲染器，纯函数，不碰 IO
memesynth/cli.py            argparse + 文件写出（唯一碰 IO 的地方）
kits/hajimi.json            示例映射表（samples/ 还是空的）
tools/measure_root.py       离线测基频，不属于包，需要 librosa
tests/test_memesynth.py     15 项，含对真实 XLD 导出的契约断言
```

## 不变量（禁止改动）

1. **一切按秒。** 禁止读取文件里的 tempo / 拍号 / tick 做任何推算——XLD 永远写 120 bpm / 4-4 / 960 tpb，全是占位。
2. **`DRUM_CLASSES` 的六个值跟 XLD 的 `analysis-midi/drumkit.py` 绑定**，改之前先去核对那边。
3. **`render.py` 不做 IO，`cli.py` 不做 DSP。** GUI 或别的调用者只接 `render()`。
4. **不要为了"音质"加抗混叠滤波**。重采样的混叠是这个项目要的质感（SPEC §8）。
5. **分轨与总混音共用一个衰减因子**，否则分轨不再可相加。

## 已知问题

- **190 / 6291 个音符被素材长度截断**（实测 Cornelius - Mirrors）。素材比乐谱音符短时只能停在素材末尾，不循环不拉伸。属 v2 backlog。
- **吉他声部没有动态**：上游 MuScriptor 力度恒为 100，不是本程序的问题，但听感是平的。
- **没有人声 MIDI**：XLD 转谱只覆盖 bass / piano / guitar / strings / drums。主旋律得从这些声部里找，这会影响创作层的素材分配。
- `kits/samples/` 为空，示例 kit 跑不起来（符合预期，校验会清楚报出缺哪几个文件）。

## 下一步

1. 找到并切好三个 meme 素材，放进 `kits/samples/`。
2. `tools/measure_root.py` 测出 `rootHz` 填进 `kits/hajimi.json`。
3. 拿一首真摇滚跑 `--dry-run` 看路由覆盖，再渲染试听。
4. **听完再决定每条路由的 `follow` 和 `maxDur`** —— 这是辨识度的决定性参数，不听没法定。

## 测试命令

```bash
source/memesynth/.venv/Scripts/python.exe source/memesynth/tests/test_memesynth.py
```

XLD 的 `runtime/0.5.0/envs/basic/python.exe` 也带齐依赖，可以替代。两个环境都跑过 15/15，输出峰值逐位一致。

路由那几项跑在 `artifacts/**/midi/merged/*/merged.mid` 上，没有 artifacts 时自动跳过。

## 依赖已验证（2026-10-21）

净 venv（Python 3.12.10）装 `requirements.txt` 后装入 10 个包，测试 15/15，端到端渲染与 XLD runtime 下结果一致。AST 审计确认包内无未声明的第三方 import。`tools/measure_root.py` 在净 venv 里按设计报 `ModuleNotFoundError: librosa`——隔离是真的，不是碰巧。
