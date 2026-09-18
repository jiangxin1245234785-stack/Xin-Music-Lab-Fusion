# 独立模型环境 · 2026-09-15

## 当前阶段

独立环境已组装，发布候选版 0.5.0-rc.2。程序位于 releases/0.5.0-rc.2，运行环境位于 runtime/0.5.0。保持此相对目录关系可重定位；不再从旧安装目录、Codex 基础 Python 或用户 Hugging Face 缓存加载本轮分析依赖。

## 决策与范围

使用已有已验证解释器和依赖文件重组目录，保持包版本，不在线重新解算依赖。不直接搬动旧 venv：使用原生 Python EXE/DLL、独立标准库与相对 ._pth；MSAF、AI、Basic Pitch 分开，HiRes/RoFormer 只共享包内 AI 依赖。

约 9.5 GiB，含 Python 3.12/3.10、五套库环境、旧分析脚本、MIDI/RoFormer/Demucs/BTC/SongFormer 权重。文件清单 SHA-256 固定实际内容；模块审计报告记录包版本。Hugging Face 快照展开为实际文件，离线加载。首次计算可在包内 cache 生成 NumPy/Numba/Matplotlib 等缓存，缓存不计入不可变清单。

## 文件地图

- source/release-tools/build-runtime.cjs：组装解释器、库、脚本、模型；丢弃绝对共享 .pth。
- hash-runtime.cjs / install-runtime.cjs：大文件流式哈希、复制后逐文件验证。
- configure-bundle.cjs / build-local.cjs：相对运行环境配置、RC.2 程序包。
- audit-runtime.py / audit-runtime.cjs：无效外部 Python 路径、真实 import、已加载模块与依赖版本审计。
- test-analysis-runtime.cjs：MSAF/SongFormer/CQT/BTC/Demucs/Basic Pitch 实际推理。
- source/shared-analysis/runtime-config.cjs：支持限定的离线环境开关。
- 两个 analysis-*/runner.py：将相邻后端目录加入隔离 Python 的搜索路径。

## 不变量

未改模型参数、曲库、结果格式或人工标签；原软件、RC.1 和旧运行环境保留。XLD 分析所有权及 XML 消费接口不变。没有新增分轨声部、自动更新、后台任务服务。

## 验证

两个应用 npm test 与原发布配置测试通过。五套 Python 在无效外部 PYTHONHOME/PYTHONPATH/PYTHONUSERBASE 和精简 PATH 下，实际加载的库均来自独立目录；隔离标志开启。MSAF 审计使用原分析器已有的 SciPy 兼容初始化。

真实 WEG 第 90–120 秒经独立 RoFormer 生成六轨，HiRes Bass 输出 70 音符，Piano/Guitar 输出合法空 MIDI；不足两个非空声部时融合正确拒绝。完整歌曲已有缓存的三轨融合另由 EXE 验证。原始音频及既有分析目录均未修改。

离线旧分析器推理、迁入最终目录后的模块审计/窗口验证及逐文件校验，以 artifacts/runtime-pack-20260915 下各报告为准；临时工作目录 D:/Caches/codex/xld-runtime-pack 保留完整日志。

## 后续门槛与回退

本机路径隔离和实际搬迁不等于新 Windows 兼容性验收。干净系统/无 Python 机器、CUDA 驱动适配、完整长曲日常试用和最终图标/版本标识尚需验收，仍保留 RC/Beta 标识。

先关闭新窗口，再打开原版或 RC.1 即可回退；无数据格式迁移。请暂时保留旧版本依赖，因为旧版回退仍会使用它们。新版本程序和 runtime/0.5.0 应一起保留或重新生成相对配置。

测试及构建命令见 source/release-tools/RUNTIME-BUILD.md。Python ._pth 行为依据官方说明：https://docs.python.org/3.12/library/sys_path_init.html#pth-files
