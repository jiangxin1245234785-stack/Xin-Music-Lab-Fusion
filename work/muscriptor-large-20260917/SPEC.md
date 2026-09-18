# Large 对照
- 同源 MEGURI 吉他，官方 Large 固定 revision，与已认可 Medium 三片段对比。
- batch1 / greedy / CFG1 / prelude_forcing=false；不调整音符。
- 显卡 FP32 权重与官方默认混合精度；记录显存和推理耗时。
- 授权后下载，下载错误仅输出状态码；结果独立，不改生产默认。
- 输出独立 MIDI、运行记录、三段同音色试听，不打包模型新环境。
- 性能测试补充：Large batch1 完成后，顺序测试 batch4；如显存不足，保留失败记录，不改变精度或抢占其他模型。核对两种批量音符是否一致。
- batch4 观察到共享内存大量占用，停止并留档；补测 batch2 作为低内存吞吐折中。
