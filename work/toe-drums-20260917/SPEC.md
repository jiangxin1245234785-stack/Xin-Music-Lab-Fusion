# 弦乐默认与 toe 鼓对照
1. 用户验收弦乐MuScriptor，默认改为Large；YourMT3+、Medium、Basic Pitch保留。
2. 首次升级迁移旧默认YourMT3+/Basic Pitch，保留显式Medium/Large；以后尊重手选。
3. 单声部与一键共用默认；旧模型结果保留，模型参数与缓存身份不变。
4. toe《Goodbye》本地专辑版整曲，已有鼓分轨则复用，否则BS-RoFormer SW生成。
5. 同鼓轨生成ADTOF / MuScriptor Medium / Large，独立缓存，鼓默认不变。
6. 提供三个固定片段原鼓WAV与三模型统一音色/力度试听、完整MIDI。
7. 复用现有Electron、Python、权重、合成器；不新增依赖，不训练模型。
8. 失败记录日志并保留旧结果；现有可取消接口不变。
9. 开发版muscriptor.4；保留旧发布，仅验证当前Windows机器。
10. 验证默认迁移/持久选择/一键、删除回退、真实整曲/缓存/播放与发布哈希。
11. 不修改原曲/WAV/标注，不删除用户结果；全曲输出由现有存储管理管理。
12. 后续：用户听评鼓，决定默认；不按音符数量判优。
