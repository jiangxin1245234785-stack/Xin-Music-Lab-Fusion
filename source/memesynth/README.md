# memesynth

用 meme 素材重新演奏 XLD 转出来的谱子。读一个 `merged.mid`，写一个 wav 加一组分轨。

和 XLD 没有任何运行时耦合——不读它的 storage，不共享进程，只通过一个你手动导出的 MIDI 文件交接。

## 装

在仓库根目录，一次性：

```bash
python -m venv source/memesynth/.venv
source/memesynth/.venv/Scripts/python.exe -m pip install -r source/memesynth/requirements.txt
```

需要 Python 3.12（numpy 1.26.4 没有 3.13 的 wheel）。装完是 10 个包，直接依赖只有 `numpy / soundfile / pretty_midi`，全是纯 wheel——没有 librosa，没有 numba，没有 scipy。`.venv` 已被 `.gitignore` 忽略。

## 跑

包没有 `pip install`，所以要让 Python 找得到它。在仓库根目录：

```bash
PYTHONPATH=source/memesynth source/memesynth/.venv/Scripts/python.exe -m memesynth "<曲名> merged.mid" source/memesynth/kits/hajimi.json -o out/
```

PowerShell 下环境变量另写：

```powershell
$env:PYTHONPATH = "source\memesynth"
.\source\memesynth\.venv\Scripts\python.exe -m memesynth "<曲名> merged.mid" source\memesynth\kits\hajimi.json -o out\
```

| 选项 | 作用 |
|---|---|
| `--dry-run` | 只校验 kit、打印路由覆盖报告，不渲染。**改完 kit 先跑这个。** |
| `--force` | 允许覆盖已有输出（反复调 kit 时必用） |
| `--no-stems` | 只写总混音 |
| `--peak` | 削顶上限 dBFS，默认 `-1.0` |
| `--min-duration` | 丢弃短于此秒数的音符，默认 `0.02` |

输出 48 kHz / 立体声 / 24 bit。总混音和全部分轨施加**同一个**衰减量，所以分轨相加仍然等于总混音。

## MIDI 从哪来

XLD 里走「融合 / 导出」，**不要导单 stem**。`merged.mid` 把所有声部放在一个文件里，而且轨名带 stem 前缀（`guitar / distorted electric guitar`）；单 stem 导出会把前缀丢掉，路由就没了依据。

## 命令行（memesynth.cmd）

仓库根目录有个 `memesynth.cmd`，双击看帮助，或者在任意终端里当命令用。它自己处理
解释器路径和 UTF-8，不用手敲 `runtime\0.5.0\envs\basic\python.exe`。

| 命令 | 做什么 |
|---|---|
| `memesynth` | 帮助 + 列出已装好的音色 |
| `memesynth 某首.mid` | 交互式导出：先打体检表，再问你导哪几套、要不要分轨、写到哪 |
| `memesynth check 某首.mid` | 只看转谱体检，不渲染 |
| `memesynth export 某首.mid -k gamelan -o D:\out --stems` | 非交互导出 |
| `memesynth studio [某首.mid]` | 开图形界面 |
| `memesynth kits` | 列出音色 |
| `memesynth build [名字...]` | 改了 `tools/kitdefs/` 之后重新生成音色 |
| `memesynth vocals <人声.wav 或 曲目文件夹> --merge <merged.mid>` | 把人声分轨转成 MIDI，并合出一份带主旋律的 |

人声那条调的是 XLD 的 pYIN 后端（`analysis-midi/vocals.py`），走真实 runner，所以力度也由
分轨能量那一步给。整首歌大约两三分钟——pYIN 占九成以上时间。默认写到输出目录，不会往
你的分析目录里写东西。memesynth 这个包本身仍然不 import XLD 的任何代码，只是启动器这一层
用子进程调它。

**把一个 `.mid` 拖到 `memesynth.cmd` 的图标上**，走的就是交互式导出那一条。
从资源管理器启动时窗口会停住等你看结果；在终端里敲则不会停。

## 工作台（双击就能跑）

仓库根目录双击 **`音色工作台.cmd`**，浏览器会自己打开。也可以把一个 `.mid` 拖到这个
`.cmd` 的图标上，启动后直接带入。

拖进去之后：

- **转谱体检** —— 每条轨的音符数、力度档位、换算成 dB 的真实动态、时长中位数、20 毫秒
  以下的音符数。动态分三档：**平**（力度档位 ≤4）、**窄**（有档位但不到 6 dB，听上去
  还是平的）、正常。同时报被丢弃的音符和路由不上的轨名。
- **试听** —— 八套音色瞬间切换（键盘 `1`–`8`），四个声部可以独奏，时间线上点哪换哪。
- **导出** —— 整首歌写成 48 kHz 立体声 24 bit WAV，可多选音色、可同时写分轨。同名文件
  自动加 `-2`，不覆盖。

试听在浏览器里算（`studio/engine.js` 是渲染器的 JS 移植），**导出走真正的 memesynth**，
所以落盘的 wav 和下面的命令行输出同源。移植版与 Python 的对账见
`studio/HANDOFF.md`。不想开界面就直接用：

```bash
cd source/memesynth
../../runtime/0.5.0/envs/basic/python.exe studio/batch.py <某首.mid> -o <输出目录> -k gamelan musicbox --stems
```

## 自带的音色库

八套纯合成音色，不需要在外面找任何素材。recipe 在 `tools/kitdefs/`，一行命令全部生成：

```bash
runtime/0.5.0/envs/basic/python.exe source/memesynth/tools/make_kits.py all
```

| kit | 声音 | 换完是什么感觉 |
|---|---|---|
| `acid` | TR-808 + TB-303 | 电子舞曲，低音带酸性扫频 |
| `chiptune` | NES 2A03 方波 / 三角波 / 噪声 | 红白机，旋律线最清楚 |
| `pluck` | Karplus-Strong 物理建模弦 | 最接近原声，换完还听得出原编曲 |
| `musicbox` | FM 钟声、钟琴、玻璃 | 八音盒，脆而远 |
| `fmkeys` | DX 式 FM 电钢 + 合成器垫 | city pop / vaporwave，和声最厚 |
| `organ` | 电风琴拉杆 + 闭管风琴 | 唯一不衰减的一套，长音真能撑住 |
| `orchestra` | 弓弦、铜管、竖琴、定音鼓 | 唯一慢起音的一套，气质完全不同 |
| `gamelan` | 青铜排琴与锣，非谐波 | 和弦不融合，互相打拍 |

`samples/*.wav` 是构建产物（已被 `.gitignore` 忽略），随时可以重跑覆盖；要留的是 `kitdefs/` 里的
recipe。`tools/synth.py` 是共用的振荡器、滤波器和包络，加新音色从那里取料。

每套都覆盖全部 12 条必需路由（bass / piano / guitar / strings / vocals 加七类鼓），缺一条
`make_kits.py` 就拒绝写出——少一条路由在渲染里是静音，而静音是测试最不会替你发现的那种失败。

素材长度是按真实音符时长定的：`artifacts/` 下 31 个导出里，99 分位音符吉他 2.4 秒、贝斯 2.6 秒、
弦乐 2.7 秒、钢琴 4.8 秒。新的七套截断率 0–1%，`acid` 因为保留原样是 58%。

## kit 怎么配

一个 JSON 加一个 `samples/` 目录。照着 `kits/hajimi.json` 改，或者抄一份 `tools/kitdefs/` 里的 recipe。

**`rootHz` 必须自己测，占位值是错的。** 这是唯一需要 librosa 的一步，所以它不在主程序里：

```bash
runtime/0.5.0/envs/basic/python.exe source/memesynth/tools/measure_root.py kits/samples/*.wav
```

哈基米有真实基频，看 `pyin` 那一列；大狗叫和叮咚鸡是非乐音，看 `peak` 那一列。

### 路由

轨名 `/` 前段是 stem，后段是音色。查找**先精确后回退**：`guitar/distorted electric guitar` 找不到就用 `guitar`。鼓轨按 pitch 分成六个固定类：

```
36 kick   38 snare   42 hihat   47 tom   49 crash   51 ride
```

### 声部参数

| 字段 | 默认 | 说明 |
|---|---|---|
| `sample` | 必填 | 用哪个素材 |
| `transpose` | `0` | 半音偏移 |
| `gain` | `1.0` | 音量 |
| `pan` | `0` | 声像 −1…1，等功率 |
| `pitched` | `true` | `false` = 不跟音高变速（鼓用） |
| `follow` | `"auto"` | 音长跟谱子(`note`)还是跟素材(`sample`)；auto = 鼓跟素材、其余跟谱子 |
| `maxDur` | 不限 | 音长硬上限，秒 |
| `fade` | `0.005` | 两端淡入淡出，防爆音 |

`follow` 和 `maxDur` 是整个项目最该调的两个参数。哈基米一个音节 300–500 ms，摇滚的十六分音符在 120 bpm 下只有 80 ms——`follow: "note"` 会把素材掐掉大半，`follow: "sample"` 会让音符糊在一起。先听，再决定每条路由归哪边。

## 已知的上游数据缺陷

这些是 XLD 输出的性质，不是 bug，渲染器已经处理：

- **吉他轨力度恒为 100**。MuScriptor 不产动态，所以吉他声部听起来是平的。要起伏得自己造（v2）。
- **鼓轨 duration 恒为 0.1 s**，是占位值。只取 onset，长度由素材决定。
- **存在 8 ms 的极短音符**。默认 20 ms 阈值滤掉，否则是一片爆音。
- **tempo / 拍号 / 小节线全是占位**（永远 120 bpm、4/4、960 tpb）。一切按秒，别拿它们对齐。
- **没有人声 MIDI**。XLD 的转谱后端只覆盖 bass / piano / guitar / strings / drums，主旋律得从这些声部里找。

## 测

```bash
source/memesynth/.venv/Scripts/python.exe source/memesynth/tests/test_memesynth.py
```

测试自己会把包加进 `sys.path`，不需要 `PYTHONPATH`。XLD 的 `runtime/0.5.0/envs/basic/python.exe` 也带齐了依赖，可以拿来跑。

路由那几项会跑在 `artifacts/` 下的真实 XLD 导出上——契约是 XLD 输出的性质，拿自己造的 fixture 测没有意义。没有 artifacts 时那几项自动跳过。
