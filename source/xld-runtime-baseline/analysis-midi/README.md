# XLD MIDI

runner.py 将已有单声部 WAV 转为 MIDI 和 notes.json。models.json 是 Python runner 与 XLD 核心共用的模型清单。模型选择不参与段落、和弦和视觉渲染。

| 声部 | 默认模型（已就绪时） | 备选 |
|---|---|---|
| piano | HiRes Piano | Basic Pitch |
| guitar | MuScriptor Medium | MuScriptor Large（复杂曲）；GAPS / Basic Pitch / YourMT3+ 仅保留历史结果 |
| bass | HiRes Bass | Basic Pitch |
| strings | MuScriptor Large | MuScriptor Medium、YourMT3+、Basic Pitch |
| drums | ADTOF | MuScriptor Medium / Large |

默认沿用用户试听后的验收结论（见 docs/XLD_XML_STATUS_AND_ROADMAP_20260917.md §5）；精确 ID、选项与 checkpoint 以 models.json 为准。Basic Pitch 保持原模型和参数，用于对照。

模型来源：[Qiuqiang Kong 高分辨率钢琴转谱](https://github.com/qiuqiangkong/piano_transcription_inference)、[Xavier Riley 推理适配](https://github.com/xavriley/piano_transcription_inference)、[作者发布的权重](https://huggingface.co/xavriley/midi-transcription-models)。固定代码 revision 为 7568dc7f78b625e40cf9776e2806d164006610e3；权重 revision 为 b7bec65a2b860aca72856b0feef58b5df407b777。每个权重的文件名、大小与 SHA256 见 models.json，推理前复核 SHA256。HiRes Piano 使用 note+pedal 模型，GAPS Guitar 使用论文版 12200 iterations 权重，HiRes Bass 使用 filobass 20000 iterations。

## 本机环境

Basic Pitch：D:\Caches\codex\runtimes\xld-midi（原环境）。专用模型：D:\Caches\codex\runtimes\xld-midi-highres，Python 3.12.14，通过本环境的 xld-shared-runtime.pth 只读引用已有 XLD AI site-packages，从而复用 torch 2.11.0+cu128。新增依赖列在 requirements-highres.lock。此环境依赖本机已有 XLD AI 安装，并非独立分发包。

权重：D:\Caches\codex\models\xld-midi-highres。环境变量 XLD_HIGHRES_PYTHON、XLD_HIGHRES_MODELS 可覆盖路径；Basic Pitch 仍使用 XLD_MIDI_PYTHON。numba 与 matplotlib 缓存明确放在 D:\Caches\codex\cache 下，避免尝试写入共享的安装环境。runner --engines 仅检查包和权重就绪状态；完整兼容性由真实推理验证。

## 输出与兼容

每个声部、每个模型保留 midi/<stem>/<engine>.json；资产位于 midi/<stem>/<runId>/，包含 <stem>.mid 和 notes.json。新增 midi/<stem>/by-source/<sourceRunId>/<engine>.json 与 active.json，按分轨版本缓存所有模型与当前选择。共享 readMidi 会读取当前分轨来源的结果；旧 midi/<stem>.json 和模型清单作为兼容回退。切换卡片只改变选择；点击生成/使用才更新当前结果。首次激活其他模型前，旧 Basic Pitch 清单自动保留为模型专属清单。

重新生成只替换该模型的成功结果，失败/取消保留旧结果与当前选择清单。更换分轨模型时，旧 MIDI 不作为新 WAV 的结果；切回原分轨可以恢复。强制重分轨产生新的 sourceRunId，需要为新 WAV 转谱。人工标签不修改。

所有输出保留母曲秒级时间原点；120 BPM 仅用于 MIDI 编码，未量化、未识别拍速。HiRes Piano 的踏板信息保留为 MIDI CC64；notes.json 保存音符字段。音符数量不能用于判断转谱质量。

## 版本记录与历史结果（core.25 起）

每次转谱运行都有自己的记录 midi/<stem>/runs/<runId>.json：runner 的输出经校验后先落到这里，midi/<stem>/<engine>.json、midi/<stem>.json 与 by-source 下的清单只是指向某次运行的派生指针，可以被重写。指针被重写前，如果它指向的运行还没有 runs/ 记录，会先补写一份，所以旧运行不会因为指针被覆盖而变成无清单的孤儿。runs/ 记录与其他清单一样纳入存储管理的依赖计数。

清单新增可选字段 digests（<stem>.mid 与 notes.json 的 sha256）；notes.json 新增 runId、engine、model。读取时只在字段存在时校验，旧清单不需要迁移，也不伪造这些字段。

版本身份由清单已有字段推导：engine、model 字符串、backend.checkpointSha256 与逐字保存的 options；与 models.json 中该 engine 当前条目相同即为同一版本。读取结果因此有两个层次：ok 表示清单完整、文件齐全并绑定当前分轨 / 弦乐来源，可查看、可打开目录、可参与融合，XML 也按此显示；matches 表示由该 engine 当前模型版本生成，只有 matches 为 true 才作为缓存命中免推理复用。旧模型版本的结果 ok 为 true、matches 为 false，界面标为"旧模型版本"，单声部、一键与"使用此 MIDI"都按无当前缓存处理，点击生成会用当前版本重新转谱并保留旧运行。来源失配（分轨或弦乐来源变化）仍是 ok 为 false，不进入一键或融合。

成功重算后的清理：与上一次结果版本相同时替换它（删除上一次运行目录与 runs/ 记录）；版本不同则两者都保留。失败或取消只清理本次运行。融合清单在原有 parts 之外增加 provenance（每声部 runId、identity、matches、模型信息），不参与指纹计算，既有融合结果继续命中。

升级模型的约定：在 models.json 中就地修改该 engine 的 model 字符串、checkpoint 与 options，不改 id；不要从 stems 中删除声部，改用 retiredFor（参考 guitar-gaps）。每个条目的 model 字符串与推导身份必须唯一（tests/midi-history.cjs 检查）。同一 engine 的多版本切换、按 runId 激活与有限保留策略属于后续轮次，本轮只保证旧结果可读、不被误命中、不被丢失。

检查：两边 npm test；tests/midi-history.cjs 覆盖旧清单、旧版本结果、runs/ 记录、删除与融合 provenance；tests/multimodel-real.cjs、tests/multimodel-electron.cjs 和 XML tests/midi-models-electron.cjs 使用 XLD_MODELS_TEST_ROOT 下的隔离 fixture.json。窗口与真实测试顺序运行，避免同时改动当前结果指针。
