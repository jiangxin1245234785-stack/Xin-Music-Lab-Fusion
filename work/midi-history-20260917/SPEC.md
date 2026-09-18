# MIDI 历史结果可读与模型版本记录（P0 轮次 A）
1. 不更换任何模型，不改默认、选项、精度与缓存身份；XLD core.25，XML stems.10 不变；开发版 0.5.0-dev.history.1。
2. readMidi 的 ok 改为“清单完整、文件齐全并绑定当前分轨 / 弦乐来源”；新增 matches 表示“由该 engine 当前模型版本生成”，只有 matches 为 true 才作为缓存命中免推理复用。来源失配仍为 ok=false，不进入一键或融合。
3. 版本身份由清单已有字段推导（engine、model 串、backend.checkpointSha256、逐字 options），不落盘、不新增注册表；profileForResult 改为按 engine 解析，无 engine 的旧 basic-pitch 清单按 model 串回退。
4. 每次运行独立记录 midi/<stem>/runs/<runId>.json：runner 输出经严格校验后直接提升到此处；engine / 活跃 / by-source 指针为派生写入；指针被覆盖前补写其所指旧运行的记录，旧运行不再成为无清单孤儿。
5. 成功重算：与上一次结果同版本则替换（删运行目录与 runs/ 记录），不同版本两者保留。失败 / 取消只清理本次运行。
6. 融合 parts 元组与 version:2 指纹不变，既有融合结果继续命中；另记 provenance（每声部 runId、identity、matches、模型信息）。
7. runner.py 增加清单 digests（.mid / notes.json sha256）与 notes.json 的 runId / engine / model，均为可选字段，旧清单无需迁移。
8. UI 最小提示：旧模型版本结果在卡片与状态行标注（中英各 3 键）；一键计划、“使用此 MIDI”按钮与按钮可用性按“无当前缓存”处理；不改布局，XML 零改动。
9. 测试：新增 tests/midi-history.cjs；扩展 midi-models、midi-delete、storage、derived-flow 与 shared-analysis/test.cjs；两端 npm test。
10. 验证：真实 MEGURI / toe 目录只读差分（旧读取器 vs 新读取器零差异、17 条运行分类、文件快照不变）；隔离硬链接副本上一次真实 ADTOF 推理；发布包 Electron 窗口检查（现有缓存不变、旧版本标签中英、一键 / 融合 / 目录、宽窄布局）。
11. 不修改原曲、WAV、用户结果与人工标注；旧发布与已安装产品保留；不做干净 VM 验收。
12. 后续轮次 B：同 engine 多版本切换 / 回退、按 runId 激活与删除、有限保留策略；落盘格式沿用本轮，不再迁移。
