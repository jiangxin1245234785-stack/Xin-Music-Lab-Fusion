# 本地开发版：构建、校验、实际启动与入口

在仓库根目录运行 `build-dev.cjs`。输入均显式指定；目标发布目录必须不存在，旧版本保留。

```powershell
node source/release-tools/build-dev.cjs --version 0.5.0-dev.score.N --electron "D:\Program Files\smoke-resonance\node_modules\electron\dist" --config work/scoreview-20261110/runtime.score.json --seed releases/0.5.0-dev.score.6/development-settings.json --rcedit "D:\Program Files\smoke-resonance\node_modules\.pnpm\electron-winstaller@5.4.0\node_modules\electron-winstaller\vendor\rcedit.exe" --startup-library "D:\Download\bandcamp" --startup-analysis "D:\Projects\Xin-Music-Lab-Fusion\work\scoreview-20261110\xml-fixture\analysis" --activate
```

把 `N` 换成新的版本号。脚本同步 XML 的 package version 与 runtime.score.json 的 releaseVersion，构建到 releases/<版本>。开发配置在生成清单前加入，不需要手工拷贝或补哈希。

每个文件的大小与 SHA-256 校验通过后，脚本依次实际启动 XML.exe、XLD.exe。两者共用新建的隔离档案；XML 先启动，检查共享设置自动生成，XLD 再启动时保留同一份设置。检查载入的文件、版本帮助入口和 XLD 两个谱面层按钮；截图、日志和报告放在 work/build-<版本>/，不写进包。

启动检查只将分析位置改为 `--startup-analysis` 的副本，不运行分析，不改发布包的默认种子配置。脚本需要能访问本机回环窗口检查接口；若环境阻止（EACCES），会失败，不会切换入口。

`--activate` 仅在校验和启动全部成功后生效。根目录的 `启动XML.cmd` 与 `启动XLD.cmd` 共读 `releases/current-release.cmd`；它是唯一的当前版本指针。构建失败时恢复本脚本修改的两个版本字段，独立的其他元数据改动保留，旧入口不变，失败包留下供排查。

无图形检查环境可显式用 `--skip-startup` 仅构建和校验，此时禁止同时使用 `--activate`。不要把跳过的启动检查写成通过。

回归：

```powershell
node --test source/release-tools/test-build-dev.cjs
node source/release-tools/test.cjs
node source/release-tools/test-release-shell.cjs
node source/release-tools/test-portable.cjs
```

2026-11-12 补充：当前已验收 score.12，上一稳定 score.10。切换先保留 `releases/previous-release.cmd`，再用临时文件完整写入并替换当前指针；重复启用当前版本不覆盖上一指针。旧版本目录不覆盖、不清理。完整实测及关键源码快照见 `work/score-advance-20261112/REPORT.md`。
