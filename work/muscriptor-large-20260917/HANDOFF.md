# MuScriptor Large 与 Medium 对照

## 当前阶段
用户已授权 Large，整曲 CUDA 推理、原始事件与 MIDI 回读、九段播放/布局检查完成。Large 听感待用户验收，Medium 仍为产品吉他默认；不因参数量更大自动替换。

## 输入、配置与来源
同一 BS-RoFormer SW MEGURI guitar.wav，568.75 秒；保留 60/270/480 秒起三个固定30秒窗口。
官方代码 7f213afecf23bd6a1b8672aa223690ee9807cefb。
Large revision 8809fdfbed2affa7ade94a7059e746e3880720e7，SHA256 ac4eb6ea87dfc26b6ca6b954c6b967ab87ad4c7d08e078b25214f13ed051f397，权重 5465642136 bytes。
官方令牌授权通过后，常规下载未开始传输，终止该下载进程；改用官方 URL 分段下载、完整 SHA256 校验。没有改用第三方权重或绕过授权。
Medium/Large 同为 batch1、greedy、CFG1、prelude_forcing=false，三类吉他限定；FP32 权重、官方 CUDA 混合精度；关闭容忍超长解码，114段完成，无解码上限告警。
官方验证与同声部同音重叠整理保留，无额外修音或节奏量化，时间基准120BPM不是曲目检测速度。

## 实测
RTX 5070 Ti Laptop 12GB；单次测量，无重复稳定性/热状态控制，不是官方基准。
- Medium batch1：转谱 113.47 秒，加载 1.38 秒，峰值已分配 2343 MiB，2916 音符。
- Large batch1：转谱 248.44 秒，加载 3.22 秒，峰值已分配 10521 MiB，峰值保留 10648 MiB，3156 音符。
- 同批量转谱耗时比 2.19 倍；已分配显存比 4.49 倍。
- 产品当前 Medium batch4 历史实测 40.203 秒 /3172 MiB；此行与本轮单批量不同，只表示当前配置实用成本，不能视为纯模型差异。
- 试听使用此前用户验收的 Medium batch4 原始 MIDI，未替换为性能复测 MIDI；同音色 program27/力度90，完整下载保留原生分类。

## 批量优化实测
Large batch4 虽未立刻 OOM，但 WDDM 性能计数器显示大量系统共享内存（见 large-batch4/memory-snapshot.json），主动停止，未输出完整 MIDI。batch2 同样观察到共享内存占用，在34/114处多次检查无进度后停止。两次均是未完成的吞吐试验，不据其部分时长推算整曲，不声称 CUDA OOM 或已确认上游错误。status.json 与日志保留；当前建议 Large batch1，Medium batch4。Medium batch1 与已验收 batch4 输出完全相同。


## 验证与限制
Medium batch1与Large batch1均完整114段、所有原始音符闭合、回读符合官方清理后音符集合；原 WAV 和旧 GAPS 未变。九段30秒有限值音频，Electron实际加载/播放、宽窄无横向溢出，截图已目视。
连续揉弦曲线不在输出中；音符数/时长只能描述输出，不能代表准确率或自动听感验收。官方 MIDI 存在重复相同tempo事件的解析警告，时间回读已验证。

## 文件地图
本目录脚本的原始工作目录 D:/Caches/codex/muscriptor-large；权重只保留在该目录 models，不重复复制5.47GB附件。
试听 artifacts/muscriptor-large-20260917/listening/MuScriptor档位对比.html，含完整 Medium/Large MIDI。
原始事件、模型结果和验证日志在 artifacts；medium-batch1 保存同批量性能复测。
环境 runtime/addons/yourmt3-v1/python.exe；试听渲染 runtime/0.5.0/envs/highres/python.exe。

## 不变量与下一步
产品菜单、Medium 默认、已启用结果、原WAV、旧MIDI和旧开发版未修改。没有新安装依赖或包装EXE。
用户对比延音、错音、和弦细节后再决定是否将 Large 接为慢速备选。

## 复验入口
run.py（结果存在时拒绝覆盖）；verify.py；medium-batch1/run.py 与 verify.py；render.py；check-ui.cjs。下载记录 download.json 不包含凭据。
