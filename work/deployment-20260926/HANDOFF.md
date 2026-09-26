# 第三方试用版 setup.1 · 2026-09-26

## 当前阶段

已完成最新 core.69 / stems.13 工作台的独立界面打包、首次配置和基础 MIDI 环境安装。目标包为 releases/0.5.0-preview.setup.1。这是 prerelease，干净 Windows / 完整 AI 环境自动安装仍待后续，不宣称全部模型开箱即用。

## 已完成

- 双语 Setup 窗口：曲库/输出位置、分组模型路径选择、独立检查、保存、官方来源、取消、脱敏诊断。
- MIDI 基础安装：固定 uv 0.6.17 ZIP + SHA256；managed CPython 3.12.10；固定 MIDI 依赖；独立 xin-midi-* 环境，无系统 PATH/Python 修改；真实读写验证通过后才允许保存。
- 保存只修改选中配置项；未通过检查拒绝保存；失败/取消不改变原配置。需要重新打开 XLD/XML 生效。
- 配置窗口使用隔离 preload、可信窗口/主框架 IPC、固定官方 URL，禁止页面导航；没有远程代码输入入口。
- 排除 AI vendor、BTC 副本、旧应用开发型 README、模型、音乐和凭据；保留可视化依赖与原许可证。
- 发布包增加原创 MIT、Electron 与第三方许可说明；独立源码导出排除未审查的第三方副本。

## 验证

- XLD core.69 npm test 全部通过；XML stems.13 npm test 全部通过。
- test-setup / test-interface / test-release-shell 通过。
- 真实下载和新建 Python 环境，无现有 Python 复用，MIDI 读写通过。曾发现 PowerShell 模块自动加载干扰，改用内置 .NET ZIP 解压。
- 两个实际 EXE、隔离档案、缺模型启动；首次配置、重复打开、未检查禁止保存、实际 MIDI 检查与保存、中英切换、720px 宽度、XML 可视化资源通过。setup-preview.png 已人工检查。
- 最终程序 1119 文件哈希核对通过；源码导出 1072 文件。已知个人标识与常见令牌模式扫描通过，不是完整法律或安全审计。
- 原用户曲库、分析目录与常用工作台档案没有用于本次测试；测试配置写入后已恢复发行默认值。

## 文件地图

- source/release-tools/setup-{core,install,window,preload}.cjs：配置验证/安装/窗口/IPC。
- setup.html / setup.js / setup.css：双语配置 UI。
- release-shell.cjs / release-ui.js / build-local.cjs：发布壳和打包接入。
- interface-policy.cjs / DISTRIBUTION-NOTICES.md：过滤与再分发说明。
- test-setup.cjs：失败保护、路径、取消/超时、脱敏与排除项。
- 本目录 install-check.cjs / ui-check.cjs / package.cjs：本机实际安装、窗口验收与资产整理脚本，不随程序分发。

## 不变量与后续

不随包分发模型；不代用户接受模型协议；不修改导入的 Python 环境；安装失败不覆盖已有可用配置；原始机器结果与人工修订继续分开。

下一步是选择一套许可明确的 AI 后端，增加独立依赖安装和短音频推理，再验证另一台干净 Windows 及 GPU。现有向导的模型检查是可用性检查，不冒充音质/推理验证。源码仓库历史 ADTOF 许可问题仍未清除，不要因此改为公开。

升级仍需保留 runtime.json 或通过配置窗口重新导入；Windows 虚拟环境不可保证移动后继续可用。受控安装发生中断时保留新建目录供诊断，不自动递归删除用户选择的目录。
