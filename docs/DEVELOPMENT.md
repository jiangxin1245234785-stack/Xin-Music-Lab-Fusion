# 开发入口

[返回用户首页](../README.md)

## 当前基线

2026-09-26 更新：`0.5.0-preview.setup.1` 将 core.69 / stems.13 工作台与第三方配置窗口打包。详情见 [RELEASE_STATUS](RELEASE_STATUS.md)。下列早期打包记录保留供溯源。

最近本机预览包：`0.5.0-preview.paths.1`；XLD `0.5.0-dev.core.26`，XML `0.5.0-dev.stems.11`。本轮增加可搬迁配置与独立预览偏好，模型和算法未改动。后续以 [SOURCE_OF_TRUTH](../SOURCE_OF_TRUTH.md) 顶部为准。

## 阅读顺序

1. [Claude / Codex 接手说明](../CLAUDE_HANDOFF.md)。
2. [当前进度与路线图](XLD_XML_STATUS_AND_ROADMAP_20260917.md)。
3. [GitHub 与本机环境约定](GITHUB_WORKFLOW.md)。
4. [第三方试用准备](PREVIEW_RELEASE_PLAN.md)。
5. [完整开发日志](../DEVELOPMENT_LOG.md)。

## 源码与构建

| 目录 | 职责 |
|---|---|
| `source/xld-runtime-baseline` | XLD 工作台、分析服务、分轨与 MIDI |
| `source/fusion-runtime-baseline` | XML 可视化及分析结果消费 |
| `source/shared-analysis` | 运行配置与兼容接口 |
| `source/glitch-generator-typescript` | 可视化 Generator 的 TypeScript 源码 |
| `source/release-tools` | 两应用打包、诊断与运行环境工具 |

构建说明：[release-tools README](../source/release-tools/README.md)；环境说明：[RUNTIME-BUILD](../source/release-tools/RUNTIME-BUILD.md)。依赖锁文件和各目录 package.json 是实际执行入口。

仓库不含模型、完整 Python 环境、真实音乐、历史生成结果或全部实验脚本。一些旧测试与启动脚本依赖原开发机的路径；当前不是通用源码一键构建项目。不要据此宣称克隆后所有功能开箱即用。

XLD 与 XML 各自的 `npm test` 是现有源码回归入口；另有实际 Electron、GPU 和发布验收脚本。按改动范围运行，不能用静态测试替代首次安装与真实推理。

## 历史资料

[此前开发型 README 快照](development/README_HISTORY_20260918.md)保留旧材料 / Glitch 阶段说明，仅供溯源，不代表当前版本。

当前 README 面向使用者；个人工作目录、机器路径、阶段哈希、内部 core 编号和大段测试记录统一放开发文档，避免重新堆回首页。
