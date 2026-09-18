# Xin’s Music Lab — Phase 2 视觉材料与 Glitch 艺术矩阵报告

日期：2026-07-31  
状态：工程验收通过；艺术验收等待 Xin 评审  
开发根目录：`D:\Projects\Xin-Music-Lab-Fusion`

## 结论

Phase 2 的工程范围已经收口：两种原生视觉材料、共享音乐映射、MaterialField 消费链、固定真实音频语料和完整 Material × Glitch 矩阵均已实现并通过自动验收。

本报告不把“工程通过”写成“画面已经好看”。最终艺术接受权仍属于 Xin。在 Xin 查看完整图库并作出接受或返工决定以前，Phase 2 保持“等待艺术验收”，不自动进入产品部署。

## 本轮完成内容

### 1. 两种底层视觉材料

- `spectral-fabric`：把频谱表达为连续的密度山脊，不使用柱状、刻度或仪表隐喻；输出 `density` 字段。
- `temporal-strata`：把时间历史表达为横向地层、断面与沉积带；输出 `density` 和 `age` 字段。
- 两者都只消费统一音乐帧与 `material.*` 映射，不建立第二套音频分析、时钟或随机触发器。

`temporal-strata` 的初始历史现在由确定性、全画幅的潜在地层构成；真实音乐帧到达后会覆盖并重新播种。这样既避免冷启动空白，也不会把假随机当作音乐反应。

### 2. 固定真实音频语料

曲目：world’s end girlfriend — *Radioactive Spell Wave*，专辑 *LAST WALTZ*。  
音频 SHA-256：`4a1b6e9805dcaea463b5f216c80fdab63e90b7c849778bb3f7d15ccd8a0ed32d`

固定五个状态：

| 状态 | 时间 | 用途 |
|---|---:|---|
| Quiet floor / 近静音 | 181.952 s | 检查安静时是否误爆发、黑屏或冻结 |
| Sparse / 稀疏 | 362.603 s | 检查留白、细结构和低能量连续性 |
| Build / 堆叠 | 278.639 s | 检查能量累积与破坏上升 |
| Drop / 坠落 | 296.658 s | 检查释放、断裂和负空间恢复 |
| Dense / 高密度 | 293.222 s | 检查高负载下的材料身份和可读性 |

自动矩阵使用曲中约 −58.07 dB 的近静音地板，而不是文件末尾的绝对静音。原因是该 FLAC 在接近 EOF 时反复跳转会使 Electron 媒体会话不稳定。尾部绝对静音仍可用于人工听感检查；内部近静音点用于可重复的工程验收。

语料文件：

`D:\Projects\Xin-Music-Lab-Fusion\source\fusion-runtime-baseline\phase2-listening-corpus.json`

SHA-256：`1a08491f1f83b0906aed04eb6e0c0bab70192b54969ced0dc7946931fdaf9458`

### 3. 完整艺术矩阵

矩阵规模：

- 2 种 Material；
- 5 种 Glitch 预设：Balanced Motion、Temporal Excavation、Raster Deflection、Bitplane Drift、Quantized Memory；
- 5 个真实音乐状态；
- 50 个效果单元 + 10 个 FX OFF 基线；
- 共 60 张截图。

最终结果：

| 指标 | 结果 |
|---|---:|
| 效果单元 | 50 / 50 |
| FX OFF 基线 | 10 / 10 |
| 工程失败 | 0 |
| 运行时失败 | 0 |
| 控制台错误 | 0 |
| 材质身份塌缩 | 0 / 25 对 |
| 最小材质图像分离度 | 0.018275 |
| 最大材质图像分离度 | 0.186622 |
| 非静音最小帧间变化 | 0.000586 |
| 近静音最大帧间变化 | 0.014594 |

近静音门槛经过一次修正：静音画面允许低对比度和低运动，但仍必须具有有效截图、足够亮度、非黑覆盖和最低纹理差异。这样不会把“安静”误判成“坏掉”，也不会放过纯黑或空截图。

正式证据：

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-report.json`

报告 SHA-256：`216a09e1a20facff5cfc972ada8f8f9ed8eaa6e16cd7294b56b0d39cfb16367d`

完整图库：

`D:\Projects\Xin-Music-Lab-Fusion\artifacts\phase2-20260731\artistic-matrix-v25-final\phase2-artistic-matrix-gallery.html`

## 人工视觉判断

当前画面已经建立清楚的材料身份：

- `spectral-fabric` 是连续、纵向起伏的频谱织物；
- `temporal-strata` 是横向堆叠、带有历史切片和断层边缘的时间地层；
- 稀疏、build、drop、dense 之间存在可见的能量梯度；
- Bitplane Drift 在高密度时形成明显的量化分层；
- Temporal Excavation 与 Raster Deflection 在低能量时仍较接近，但随着能量升高会分离。

这些结果证明“底层材料先成立，Glitch 再破坏”的结构已经成立。它们尚不证明每一格都达到最终作品质量。

## 已知限制

1. 本轮固定语料只有一首曲目，能够保证可重复比较，不能代表全部音乐类型。
2. 近静音时各 Glitch 预设应主动收敛，因此预设间差异很小；这不是缺陷，但需要 Xin 确认是否符合演出审美。
3. Temporal Excavation 与 Raster Deflection 的低能量视觉语法仍最接近，是下一轮最值得观察的一对。
4. 当前调色主要由曲目状态和既有 palette 驱动，尚未建立独立 Composer 层。
5. 自动指标只负责拒绝空白、断链、停滞、字段未消费或材质塌缩，不能宣布画面“美”。

## 回归状态

- Fusion 完整声明测试在 2026-07-31 通过，包含 Phase 2 材质、共享帧、MaterialField 和艺术矩阵契约。
- Generator 既有 327 / 327 基线保持不变；本轮没有修改 Generator TypeScript 或已安装产品。
- 安装目录 `D:\Program Files\xins-music-lab-fusion` 未部署、未修改。

## Phase 2 出口条件

工程出口条件已经满足。剩余唯一出口条件是 Xin 对完整图库作出以下之一：

- 接受：Phase 2 完成，进入下一阶段；
- 条件接受：记录需要微调的 material / preset / segment 组合，完成小范围修正后关闭 Phase 2；
- 退回：明确艺术问题，再进入第二轮材料设计。

在获得这项艺术决定前，不扩大预设数量，不开始产品部署，也不把 Phase 2 标记为完全完成。
