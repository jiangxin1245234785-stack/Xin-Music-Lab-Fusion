# 本机候选版 · 2026-09-15

## 当前阶段与范围

完成独立程序目录、集中运行环境清单、同包启动及构建入口；交付 0.5.0-rc.1-local。源码功能版本仍为 XLD core.8 / XML stems.7，发布壳版本为 0.5.0-rc.1。尚未标记稳定版。

## 已定决策

- 冻结音乐算法和交互功能；保留 Electron，不将 torch/librosa 环境重新塞进 PyInstaller。
- 两个 EXE 共用 Electron 文件，resources/apps 内保留 XML、XLD、shared-analysis 相对关系。XML 直接启动同包 XLD.exe，不再通过开发启动器。
- Python、权重和段落/和弦旧运行脚本通过 runtime.json 显式绑定已有环境。本轮不移动大型环境，避免虚拟环境的基础 Python/.pth 路径失效。
- 复用原用户档案名称和曲库配置。Beta 视觉标识暂留；不为去掉文字而丢失配置或改变单实例行为。
- 候选版目录 D:/Projects/Xin-Music-Lab-Fusion/releases/0.5.0-rc.1-local；安装产品保持原样。每次构建要求新目录，发布清单记录文件哈希和源码版本。

## 文件地图

- source/release-tools/build-local.cjs、bootstrap.cjs：构建与启动。
- source/shared-analysis/runtime-config.cjs：配置读取、路径检查、应用环境。
- source/release-tools/runtime.local.json：本机分析环境位置。
- source/fusion-runtime-baseline/desktop/launch-xld.cjs 与 main.cjs：直接启动同包 XLD，并读取配置的分析运行根目录。
- source/xld-runtime-baseline/core/analysis-service.cjs：支持配置稳定 MSAF 运行根目录。
- source/release-tools/README.md：构建、诊断、文件校验和测试命令。

## 不变量

模型参数、WAV/MIDI 缓存格式、人工标签、曲库与分析输出位置均不改动。XLD 负责分析，XML 使用 XLD 核心与结果。没有跨应用并发队列，没有自动更新或覆盖安装程序。

## 验证与证据

两应用 npm test、运行环境配置/启动错误测试通过。七组运行环境引擎探测通过：MSAF、SongFormer、和弦、Basic Pitch、HiRes/GAPS、RoFormer、Demucs。

真实独立 EXE 窗口已验证：XLD 读取既有 WEG 缓存，一键完成三轨 MIDI 与 4165 音符融合；XML 从发布资源启动，并成功打开同包 XLD、传递选曲、消费请求。使用隔离配置，未改动用户当前设置。截图、packaged-ui.json、runtime-report.json 存于 artifacts/release-prep-20260915。

短片段真实推理使用 WEG 第 90–120 秒，RoFormer 生成六轨（18 秒）；HiRes Bass 生成 70 音符（20 秒），Piano 与 Guitar 各生成合法空 MIDI（10 秒、8 秒）。只有一个非空声部，融合正确拒绝 merge-needs-parts；整曲缓存另行验证三轨融合。初次沙箱转谱停留模型加载阶段约 408 秒后由测试主动终止；使用常规本机权限重试后完成，并生成了新位置的缓存。未把该中断算作通过，也未修改模型参数。详细记录及校验报告见 artifacts/release-prep-20260915。

## 已知限制及下一步

1. 本机依赖仍包含旧安装目录、D:/Caches/codex 下的模型/venv，以及 C:/Users/12452/.cache 下的基础 Python/Hugging Face 缓存。具体 pyvenv.cfg 和 .pth 记录在环境报告中；这些目录目前不能删除。本包不宣称跨机器便携。
2. 下一轮：整理可迁移的模型环境包，重建并锁定基础 Python 和共享库，避免直接搬动虚拟环境；再做无 Python 干净机器/VM 验收。
3. 稳定版前完成整首复杂 WEG 的日常使用验收、升级/回退体验、程序图标与版本标识收尾。现有短片段与缓存结果不构成长曲稳定性或音乐质量证明。
4. XML 旧 dist 脚本属于历史单应用流程；本轮发布用 source/release-tools/build-local.cjs，不直接运行旧打包入口。

## 回退

先关闭两个新窗口，再使用原 start-dev.cmd 或旧安装版。原分析结果无需迁移。本轮源码更新有逐文件备份及哈希清单，位于 D:/Caches/codex/xld-release-prep。
