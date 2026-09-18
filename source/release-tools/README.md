# 本机发布工具

三模型开发版：configure-bundle.cjs 的第 5 个参数可传入 RoFormer 细分权重目录，写入 XLD_REFINE_ROFORMER_MODELS。AudioSep 仍使用第 4 个参数。开发包加入 development-settings.json 时，bootstrap 为两个应用使用同一独立开发档案根目录；不存在此文件的既有 RC 行为不变。完整用户设置不得写入开发种子，只指定曲库与独立分析目录。

## 当前发布方式（RC.6）

当前使用独立 runtime/0.5.0，下面 RC.1 的外部环境方案仅作历史参考。

1. `node configure-bundle.cjs <runtime绝对路径> <配置输出路径> <候选版号> [细分模型绝对路径]` 生成运行配置。RC.6 可选 AudioSep 固定预设位于 runtime/addons/audiosep-v1；复用 highres 解释器，不改动 runtime/0.5.0。配置该目录时环境检查增加细分探测。
   构建前设置 XIN_RCEDIT 为现有 electron-winstaller 5.4.0/vendor/rcedit.exe 的绝对路径。brand-exe.cjs 校验固定 SHA256；它仅用于构建，不随包分发。更换工具必须重新核验并更新摘要。
2. `node build-local.cjs <source根目录> <Electron dist> <新输出目录> <配置路径>` 构建。必须明确 releaseVersion，不覆盖既有目录。
3. 构建自动加入发布版 UI/IPC、窗口版本、版本/帮助按钮、ⓘ 路径状态、F1、本地使用说明；版本取自同一配置。开发源码窗口不注入发布控件，用户档案名称不变。
4. 输出目录内 README.md、使用说明.html、主包 package.json、runtime.json、release-manifest.json 使用同一版本号。搬迁后重新核对 runtime.json 相对路径与文件清单。
5. `node test-release-shell.cjs` 验证版本、可信窗口 IPC、帮助复用、F1 与环境路径提示；`node test.cjs` 验证运行配置。`test-packaged.cjs` 验证实际两个 EXE、帮助窗口、1180px 视口、一键 MIDI 和同包交接。
6. EXE 文件属性写入产品名称、版本和图标；XML 沿用原图标，XLD 沿用页面字标配色。make-xld-icon.ps1 可重建多尺寸 XLD 图标。release-manifest.json 记录品牌工具摘要和最终文件哈希。
7. 随包“检查环境.cmd”以 Electron 的 Node 模式运行 resources/diagnostics/diagnose.cjs。无需系统 Node/Python，使用 runtime.json 绑定的解释器，逐项探测全部引擎（含 drums-adtof）；每项 120 秒超时。JSON/中文报告保存到 LocalAppData/XinMusicDiagnostics 的独立目录。Ctrl+C 可停止控制台检查。test-diagnostics.cjs 覆盖缺 Python、缺鼓模型、超时和损坏配置；检查失败退出码为 1。

帮助页面不需要网络或额外运行库。路径检查仅判断文件/目录存在，不冒充模型推理验证。保留 RC 标识，直至干净 Windows 验收；个人本地使用与公开再分发许可审查分别记录。

本轮冻结功能，将两个应用、共享模块和 Electron 放入一个新发布目录。发布模型是“本机程序包＋显式外部分析环境”，不是离线环境包。

## 构建

使用本机 Node 执行 build-local.cjs，依次传入四个绝对路径：source 根目录、Electron dist 目录、尚不存在的输出目录、runtime.local.json。示例：

```powershell
& 'C:\Program Files\nodejs\node.exe' 'D:\Projects\Xin-Music-Lab-Fusion\source\release-tools\build-local.cjs' 'D:\Projects\Xin-Music-Lab-Fusion\source' 'D:\Program Files\smoke-resonance\node_modules\electron\dist' 'D:\Projects\Xin-Music-Lab-Fusion\releases\0.5.0-rc.1-local' 'D:\Projects\Xin-Music-Lab-Fusion\source\release-tools\runtime.local.json'
```

构建使用现有 Electron，产物内自带 Electron；运行时不再借用该目录。禁止覆盖已有输出目录。旧 XML scripts/build-desktop.cjs 是历史单应用构建，本次两应用候选版统一使用此入口。

## 检查

- node test.cjs：运行环境配置、相对路径、缺失项及直接启动的错误反馈。
- node check-runtime.cjs <配置绝对路径> <source 或 resources/apps> <报告路径>：逐环境执行引擎探测，并记录基础 Python 和 .pth 外部依赖。
- node verify.cjs <发布目录>：检查所有发布文件哈希。
- node test-packaged.cjs <候选目录> <fixture.json> <输出目录>：真实 EXE 窗口、缓存 MIDI 和同包交接；使用隔离配置及已存在的测试分析缓存。预留本机端口 19381/19382。
- node test-inference.cjs <候选目录> <fixture.json> <输出目录>：取真实歌曲 90–120 秒，重新分轨、bass/piano/guitar/drums 四声部 MIDI、融合；结果只写测试输出。六步全部完成才标记 complete。

runtime.json 按清单覆盖所列环境变量；相对路径以清单所在目录解释。NUMBA_CACHE_DIR/MPLCONFIGDIR 可在首次使用时创建，其他必需路径要存在。启动时缺失路径提示不阻止浏览播放，模型探测仍由原界面显示。

保留旧用户档案名称，以兼容配置与单实例行为。测试专用配置重定向只有 XLD_TEST、XML_TEST 同时为 1 且设置 XIN_RELEASE_TEST_ROOT 才启用；不改变正常启动。

Windows 虚拟环境不能仅复制后即假设独立；目前 .pth 共享库和基础 Python 的实际位置在 runtime-report.json 中。后续若做可迁移环境包，先重建环境并在无 Python 机器验证，不以本机缓存成功代替。
