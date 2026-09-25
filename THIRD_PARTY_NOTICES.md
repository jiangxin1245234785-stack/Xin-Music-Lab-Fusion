# Third-party notices / 第三方说明

Updated / 更新：2026-09-25

## Scope / 许可范围

The root [MIT license](LICENSE) applies to original Xin Music Lab code and documentation. Third-party code, dependencies, model weights, music, artwork and generated content are not relicensed by that file. Their respective terms and rights still apply. A model adapter does not grant permission to use or redistribute its upstream model.

根目录 [MIT 许可证](LICENSE) 适用于 Xin Music Lab 原创代码和文档。第三方代码、依赖、模型权重、音乐、封面及生成内容不因此改为 MIT，仍受各自条款和权利约束。提供模型适配接口，不等于授予该模型的使用或再分发权限。

## Included source / 已收录源码

| Component / 组件 | Location / 位置 | Notice / 说明 |
|---|---|---|
| Butterchurn 2.6.7; Butterchurn Presets 2.4.7 | `source/fusion-runtime-baseline/vendor/` | MIT; retain both [license notices](source/fusion-runtime-baseline/THIRD_PARTY_NOTICES.md) / 保留两份上游声明 |
| Overlap-add helper adapted from OpenMIRLab | `source/xld-runtime-baseline/analysis-separation/` | MIT; [retained license](source/xld-runtime-baseline/analysis-separation/THIRD_PARTY_LICENSES.txt) / 保留原署名 |
| AudioSep inference classes | `source/xld-runtime-baseline/analysis-refine/vendor/models/` | MIT; [retained license](source/xld-runtime-baseline/analysis-refine/vendor/LICENSE), [upstream](https://github.com/Audio-AGI/AudioSep) / 此处仅说明源码，不代表权重授权 |
| Historical ADTOF PyTorch port | `source/xld-runtime-baseline/analysis-midi/vendor/adtof_pytorch/` | **Redistribution clearance unverified.** The pinned snapshot lacks a license file; see [provenance](source/xld-runtime-baseline/analysis-midi/vendor/PROVENANCE.md). It is excluded from the interface-only package by the vendor filter. / **再分发许可尚未核实**，不能将这部分套用本项目 MIT |

The ADTOF source above remains in this development repository and its history. This documentation update does not clear it for public redistribution. Resolve permission or prepare an audited source export that excludes it before publishing the development tree. Removing a file from a new commit does not remove earlier copies from Git history.

上述 ADTOF 源码仍存在于开发仓库及历史记录中。本次文档更新没有解决其公开再分发许可。对外发布开发树前，应取得明确许可，或准备排除这部分的已审查源码导出；仅从新提交删除文件不会清除 Git 历史中的副本。

## External models and runtimes / 外部模型与环境

Models and Python environments are obtained separately. Consult [model integration](docs/MODEL_INTEGRATION.md) and the exact upstream revision's terms. Code licenses and weight licenses can differ. Commercial use of the MIT interface does not imply commercial use of every backend. Authentication must use each user's own account; no credentials are supplied.

模型和 Python 环境由使用者另行获取。见[模型接入说明](docs/MODEL_INTEGRATION.md)，并核对具体上游版本的条款。代码与权重许可可能不同；界面可以商用不等于所有后端均可商用。授权使用各用户自己的账号，不提供共享凭据。

## Binary distributions / 二进制发布

Electron distributions must retain their `LICENSE`, `LICENSES.chromium.html` and applicable dependency notices. A future package that adds dependencies needs its own inventory review; this document is not a blanket clearance for everything installed on a developer's computer. Music and listening-test assets are not included in the interface release.

分发 Electron 时必须保留其 `LICENSE`、`LICENSES.chromium.html` 及适用的依赖声明。今后增加依赖需重新核对发行清单，本文件不是对开发机全部已安装组件的授权证明。界面发行包不附带音乐或试听测试素材。
