# 相对路径预览交接

当前阶段：本机开发预览已构建和验证，独立 Windows 验收待做。

## Spec 与决策

见 SPEC.md。新包 releases/0.5.0-preview.paths.1；XLD core.26 / XML stems.11。环境路径统一相对于 runtime.json，构建时换算；旧绝对配置仍可读。跨盘无法表达相对路径时明确报错。用户曲库和分析输出保持绝对路径，不迁移、不覆盖。预览偏好固定使用 AppData/XinMusicPreview，两个应用共享该命名空间，后续预览版本保留选择。

## 文件地图

- source/shared-analysis/runtime-config.cjs：解析、检查、换算。
- source/shared-analysis/user-paths.cjs：Windows 音乐与文档默认目录。
- source/release-tools/configure-bundle.cjs、build-local.cjs、bootstrap.cjs：生成、打包、预览偏好。
- source/release-tools/check-runtime.cjs：移除退役 GAPS 必需项，覆盖 YourMT3 与 MuScriptor。
- source/release-tools/USER-GUIDE.html：用户离线帮助，真实窗口已检查。
- artifacts/portable-paths-20260918/verification.json：可入库摘要。
- 本工作目录内 build.json、relocation.json、relocated-diagnostics.json、relocated-inference.json、ui/：本机详细证据，不含入库音乐。

## 不变量

模型注册表、默认引擎、参数、权重不变；history.1、用户曲库、已有分析结果、系统已安装产品不变。并行修改的 CLAUDE_HANDOFF.md、MODEL_LANDSCAPE、XLD_XML_STATUS_AND_ROADMAP 和 MODEL_INTEGRATION_FREEZE 不属于本次提交。开发历史脚本不全局替换路径。

## 验证

两应用 npm test 通过；release-tools 的 test.cjs、test-portable.cjs、test-release-shell.cjs、test-diagnostics.cjs 通过。新目录含中文与空格，21 项解析成功、11 组模型就绪检查通过；6 个 Python 的 sys.path 与受检模块路径均在搬迁树内。使用故意无效的 PYTHONHOME/PYTHONPATH 验证隔离；XLD/XML 启动、首次默认、目录保留、共享设置、帮助/F1/语言均通过。ADTOF 对 toe 鼓 60–90 秒片段实际 CUDA 推理成功，保存/回读 30 个音符，源文件大小与时间未变。验收不代表对本次音质的人工确认。

完整运行树复制到 D:/Caches/codex/portable-paths-20260918/搬迁测试 Music Lab，目录不使用 junction，大型不可变二进制使用 NTFS 硬链接，其他文件独立复制。原安装仍存在，不能据此宣称干净机器验证通过。无需立即删除此证据目录。

## 已知问题与下一步

1. CPU 测试：CUDA_VISIBLE_DEVICES 为空时，torch.backends.cudnn._init 对空设备集合取 min()，ADTOF 在 model.to(cpu) 失败。源路径在搬迁树内；正常 GPU 转谱成功。本轮没有改 torch 或算法，先补独立最小复现并处理 CPU 兼容，再宣布 CPU 支持。
2. 依次完成无原开发目录的 Windows 验收、可分发组件核实、按需模型安装说明；尚未创建公开 Release 或完整大环境下载包。
3. 用户首次用预览版需手工选择原曲库与原分析资料库，选择后可继续读取结果。只复制版本目录不足以搬迁，需要 runtime/0.5.0 与 runtime/addons 同行。
4. 原 MODEL 历史 round B 等路线不因本轮宣告完成。

## 测试命令

从仓库根目录运行 node source/release-tools/test-portable.cjs、node source/release-tools/test-diagnostics.cjs、node source/release-tools/test-release-shell.cjs；分别进入两应用目录运行 npm test。test.cjs 仍依赖本机 runtime.local.json，是已知开发测试边界。发布哈希用 node source/release-tools/verify.cjs <版本目录>。

## 并行工作说明

收尾时工作区已有另一轮 Transkun 接入（含 XLD core.27、models.json、runner.py、界面及测试改动）。本预览构建于此前，包内 core.26，models/runner/主要界面与本轮起点 HEAD 一致，没有混入 Transkun。提交仅收录本轮文件；package.json 的 core.26 通过索引保留，本地 core.27 不回写、不覆盖。后续合并时以各包对应快照和该轮交接为准。
