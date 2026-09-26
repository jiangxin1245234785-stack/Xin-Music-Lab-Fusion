# Distribution notices / 发行说明

Original Xin Music Lab code is MIT-licensed; see PROJECT-LICENSE.txt. Third-party components retain their own licenses. No AI weights, music or shared credentials are included.

Xin Music Lab 原创代码采用 MIT，见 PROJECT-LICENSE.txt。第三方组件保留原许可；不附带 AI 权重、音乐或共享凭据。

- Electron: retain LICENSE and LICENSES.chromium.html at the application root.
- Butterchurn 2.6.7 and Butterchurn Presets 2.4.7: MIT notices in resources/apps/fusion-runtime-baseline/vendor/LICENSE-butterchurn*.txt.
- OpenMIRLab overlap-add helper: retained MIT notice in resources/apps/xld-runtime-baseline/analysis-separation/THIRD_PARTY_LICENSES.txt.
- Original Glitch visualizer runtime: part of Xin Music Lab's original code.

AI vendor source trees, including the historical ADTOF port and BTC source copy, are excluded from this interface-only package. Some optional adapters therefore require independently installed upstream source as well as weights and Python dependencies. Availability is not implied by a model's appearance in the menu.

界面包排除 AI vendor 源码、历史 ADTOF 移植与 BTC 副本。一些可选后端还需要自行准备上游代码，不能仅凭菜单中有模型名称就认定它已可用。

The optional MIDI environment installer downloads uv 0.6.17 from Astral's official release, verifies its SHA-256, and uses its managed Python distribution and PyPI packages. These are downloaded on the user's request, not bundled or relicensed by this project. Their notices remain in the installed distributions. Official sources:

- https://github.com/astral-sh/uv (MIT / Apache-2.0)
- https://github.com/astral-sh/python-build-standalone (Python distributions and their included notices)
- https://pypi.org/project/pretty-midi/0.2.11/
- https://pypi.org/project/mido/1.3.3/
- https://pypi.org/project/numpy/2.2.4/

For AI weights, read the exact upstream model's terms, including noncommercial or gated-access conditions. Importing a local model does not grant new rights to it or to input music. No access agreement is accepted on a user's behalf.

AI 权重须遵守具体上游条款，包括非商业或访问申请条件。本地导入不改变模型和音乐的权利状态，程序不代替用户接受协议。
