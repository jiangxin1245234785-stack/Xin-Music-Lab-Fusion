# 界面包发行

当前阶段：Windows 界面预览包完成，本机无模型验收通过，发布到当前私有仓库。

## 决策与 Spec

用户决定只提供交互设计及接入接口，不上传模型。见 SPEC.md。本包基于已提交 45bbecc / core.26 / stems.11，叠加无模型启动、标识和严格解释器选择修复。并行 core.28/Transkun 迭代未混入包或本次提交。

## 文件地图

source/release-tools/build-interface.cjs 构建入口；build-local.cjs 支持 interface-only；interface-policy.cjs 排除权重/vendor/凭据/音乐；INTERFACE-README.md / MODEL-SETUP.md / INTERFACE-GUIDE.html 为用户入口。bootstrap.cjs 不对界面包未安装项弹启动警告；release-shell/ui 传递类型并标识“模型自配”。core/analysis-service.cjs 在存在明确 Python 配置时禁止回退开发机环境。

## 不变量

模型、模型参数、旧包、在用程序及音乐数据不改；不上传大 runtime，不改变 GitHub 私有状态，不代替模型授权。用户只装需要的后端，其余不可用是预期状态。

## 测试

test-interface/test-configured-python/test-portable/test-release-shell 通过；XLD 完整回归通过。XML 相关服务、任务、MIDI、共享读取与刷新回归通过；源码快照的全量套件因缺少被 Git 忽略的 desktop-build/package.json 停止，不虚报全量通过。两打包应用实际启动、16 个模型入口不可用、自制 WAV 播放、帮助/F1/语言通过。所有 21 个配置路径均不存在，程序正常启动；未运行模型，不需要GPU。截图和详细验证在本目录 ui。

## 构建复现

用 git archive 45bbecc source 建干净快照，覆盖本次 core/analysis-service.cjs，运行 node source/release-tools/build-interface.cjs <snapshot/source> <Electron目录> <新的输出目录> 0.5.0-preview.ui.1 <rcedit.exe>。构建工具必须使用本提交版本。保留 Electron 许可证。package 里不含模型权重和 Python，只有本项目适配器及清单。

## 下一步

补充旧段落/和弦、AudioSep/ADTOF 的独立安装说明；未来可做路径选择页，但当前用户通过 runtime.json 自行配置。全新 Windows 验收、CPU 兼容、模型迭代为后续工作。下载访问需要仓库权限，源码 ZIP 仍非可运行程序。
