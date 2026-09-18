# 独立运行环境

环境固定现有库和模型版本，采用解释器原生文件、独立标准库、各环境 site-packages 与相对 ._pth。不复制虚拟环境的启动器/pyvenv.cfg；HiRes/RoFormer 的共享库只指向包内 AI 环境。运行环境与程序可以分别更新。

当前包含 Python 3.12 与 3.10、MSAF、AI、Basic Pitch、HiRes/GAPS、RoFormer、BTC/Demucs/SongFormer 和相关权重。保留包内许可证、发行元数据；来源与版本见模块审计报告。仅作当前个人项目的运行环境快照。

## 工具

- build-runtime.cjs <新环境绝对目录> <原 runtime.json> <Python312 基目录> <Python310 基目录>：复制已有固定依赖，清除绝对共享 .pth，建立相对路径，生成哈希清单。
- hash-runtime.cjs <环境目录>：按块计算大权重哈希，排除运行缓存与字节码。
- audit-runtime.cjs <环境目录> <报告文件>：在外部 PYTHONHOME/PYTHONPATH 无效时逐环境真实 import，核查所有已加载文件和 sys.path 都在环境内。
- configure-bundle.cjs <环境目录> <配置输出文件>：生成相对路径与离线开关；build-local.cjs 会按最终发布位置重算这些相对路径。
- install-runtime.cjs <源环境> <新目标目录>：只复制清单内文件，逐一校验目标哈希，不覆盖已有环境。

大文件校验使用流式分块，避免超过 Node 单个 Buffer 的 2 GiB 限制。SongFormer 缓存将快照的符号链接展开为实际文件，不依赖原用户 Hugging Face 缓存；离线模式禁止自动拉取缺失模型。

MSAF 的兼容初始化继续沿用原 runner.patch_legacy_msaf_runtime，不改变库版本。MIDI/分轨 runner 显式把自身目录加入 Python 搜索路径，使相邻后端在隔离解释器下可导入。

## 边界

移动环境需要和发布目录一起保持 runtime.json 所指相对位置，或重新生成配置。Numba/Matplotlib/Transformers 的可写缓存不属于不可变文件清单。用户曲库、分析输出和人工标签不迁移。

本机模块隔离与目录迁移不等同于全新 Windows 兼容性；CUDA 驱动与 Windows 运行库仍属于系统条件。无 Python 干净机器/VM 验收仍是正式发布前的独立步骤。

Python 隔离路径机制参照官方文档：https://docs.python.org/3.12/library/sys_path_init.html#pth-files
