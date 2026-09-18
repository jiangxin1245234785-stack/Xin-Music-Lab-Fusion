# 兼容读取入口

音乐分析及派生结果由 XLD 拥有。derived-assets.cjs 只重新导出 ../xld-runtime-baseline/core/derived-assets.cjs，兼容已有调用位置；这里不维护第二份实现。

createDerivedAssets({analysisRoot}) 提供 directory、readStems、readMidi 与校验；支持动态分析目录，兼容旧目录，MIDI 验证源分轨 runId。清单格式未变。

node test.cjs 检查共享读取、旧目录、路径身份、目录优先级、缺失/过期与路径校验。完整任务测试在 XLD 开发版中。
