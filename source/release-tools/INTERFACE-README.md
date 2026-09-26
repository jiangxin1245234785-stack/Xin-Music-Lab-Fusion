# Xin Music Lab · {{VERSION}}

Windows x64 · 第三方试用版 / Third-party preview

## 中文

完整解压，启动 XLD.exe（曲库与工作台）或 XML.exe（可视化）。首次打开 XLD 显示配置窗口，以后可点击顶部“配置”重新打开。

1. 在配置窗口选择曲库与生成文件目录。
2. MIDI 保存和导出需要 Python：点击“安装 MIDI 基础环境”，确认联网下载并选择存储目录。安装成功后点击“保存配置”。也可以选择已有 python.exe，再检查并保存。
3. AI 分轨和转谱：按照 MODEL-SETUP.md 准备后端，在配置窗口选择对应解释器、模型或源码目录，检查后保存。此版本不自动安装全部 AI 依赖或下载模型权重。
4. 保存工作，关闭并重新打开 XLD/XML 使环境配置生效。回到曲库刷新，再开始分析。

程序包含最新工作台、时间轴、轨道监听、MIDI 编辑和结果管理。未安装模型时仍能浏览、播放和使用音频可视化。模型检查通过仅说明依赖与文件可用；MIDI 基础环境会实际验证读写。模型输出仍需试听。

程序与环境分开保存，升级程序时保留原 runtime.json 中自己配置的路径；不同版本的相对路径需要重新检查。移动受控 Python 环境后可能需重建，不要假定 Windows 虚拟环境可以任意搬迁。取消安装不会改动原配置；选择目录下新建的 xin-midi-* 是本程序管理的独立环境，失败残留可确认后删除。

模型、Python 和 AI 依赖不随 ZIP 提供。基础安装从 Astral / PyPI 联网获取，预留 1 GB。受限模型须在官方页面由本人授权，不提供模型镜像、共享账号或使用权限承诺。许可证见 PROJECT-LICENSE.txt 与 THIRD_PARTY_NOTICES.md。

这是未经签名的预览版。已做本机隔离配置与安装验证，尚未完成另一台干净 Windows 机器或全部显卡/模型组合验收。安装失败可取消重试，或通过“导出脱敏诊断”反馈。

## English

Extract the entire archive. Launch XLD.exe for the library/workbench or XML.exe for visualization. XLD opens setup on first launch; use the header's Setup button to reopen it.

1. Select your music library and output directory.
2. MIDI save/export needs Python. Choose Install MIDI environment, confirm the online download and select a storage folder. Click Save setup after installation. Alternatively select an existing python.exe, check it and save.
3. For AI separation/transcription, install a backend using MODEL-SETUP.md, then select its interpreter and model/source directories in Setup. This version does not install every AI dependency or download weights automatically.
4. Save your work, close and reopen XLD/XML to apply environment changes. Refresh the library before continuing.

Includes the latest workbench, timeline, track monitoring, MIDI editing and result management. Library playback and visualization remain available without models. Model checks establish dependency/file availability, not inference quality. The base MIDI environment performs a real read/write check.

Keep runtime environments separate from the application. When upgrading, retain your configured paths in runtime.json and recheck relative paths. A moved Windows virtual environment may need rebuilding. Cancelled installs leave existing configuration unchanged. Newly created xin-midi-* directories contain application-managed environments; failed install folders can be inspected and removed separately.

The ZIP contains no weights, Python or AI dependencies. Optional base installation downloads from Astral / PyPI; reserve 1 GB. Obtain gated access using your own account on official model pages. No weight mirrors, shared credentials or new model permissions are provided. See PROJECT-LICENSE.txt and THIRD_PARTY_NOTICES.md.

Unsigned preview. Locally isolated startup/installation checks are not equivalent to clean-machine or all-GPU/model validation. Cancel/retry failed installation or export redacted diagnostics for support.
