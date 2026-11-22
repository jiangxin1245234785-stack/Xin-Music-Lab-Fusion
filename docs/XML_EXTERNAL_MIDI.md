# 在 XML 里用原曲和 MIDI 播放谱面

XML 的外部 MIDI 导入从 Windows 本地开发版 `0.5.0-dev.midiin.2` 开始提供，4K 导出从 `0.5.0-dev.midiin.4` 开始提供。目前 GitHub 的 `v0.5.0-preview.setup.1` 下载包早于此功能。下文的导入、播放和导出都在本机完成。这条路线需要一份录音和一份与录音合拍的标准 MIDI，免装转谱模型和 Python。

## 准备两个文件

- **原曲音频**用于播放，也用作导出视频的声音。可用 FLAC、WAV、MP3、M4A、AAC、OGG 或 Opus。把它放到 XML 配置好的曲库根目录或该目录的专辑文件夹里。
- **MIDI**提供音高、起止、力度、通道和乐器信息。支持常见的标准 `.mid` / `.midi` 文件（0 型、1 型，按每四分音符的 tick 数计时）。导入保留文件里的变速。文件大小上限 4 MiB。

自己用编曲软件制作的 MIDI 也可以用。想从录音转谱，推荐把**同一个音频文件**交给 [MuScriptor 官方在线演示](https://muscriptor.kyutai.org/)，下载多轨 MIDI。以跟随原声为目的时，保留录音开头和原始时序，关闭音符量化和裁掉开头空小节的选项。拍速随演奏变化时保留速度图。[MuScriptor 导出设置](https://github.com/muscriptor/muscriptor#tempo-and-quantization)

MuScriptor 的演示由第三方运营。用户自行选择是否向该网站提交音频。其代码采用 MIT，模型权重采用 CC BY-NC 4.0。单独的钢琴、吉他或人声录音也可试 [Spotify Basic Pitch](https://basicpitch.spotify.com/)。请按来源条款使用工具、录音和输出文件。[MuScriptor 许可说明](https://github.com/muscriptor/muscriptor#license)

## 导入和试听

1. 打开 **XML.exe**，选中原曲，进入「谱面」。打开「谱面设置」，选「为当前曲目导入 MIDI」。也可把文件拖到这个导入区。
2. 选择「回波雷达」或其他谱面样式，按播放。两轨吉他可以共享雷达的吉他圈，原始声部各自的音符仍保留。打开「声部分配与同步」能逐轨改分配，文件里难以识别的声部可以手动指定。
3. 找一个容易辨认的起音，在前奏和靠后的位置各试听一次。如果画面一直比声音早，在「音符偏移」填正数，例如 `150`，再点「应用」，音符会晚 150 毫秒。负数会提前，允许范围为前后 60 秒。如果误差随歌曲推进不断扩大，请核对录音版本和 MIDI 导出时的速度图。
4. 「使用 MIDI 拍号与小节」默认关闭。有拍号事件时可以手动开启。某些转谱工具写入固定 120 BPM，只为保存音符的秒数；听起来没有对齐的网格可以关掉，音符照常走。缺少拍号事件时，此开关不可用。
5. 在「谱面设置 → 导出视频」选码率，再点分辨率并选择保存位置。4K 成片可选「自动（随分辨率）」和「4K（2160p）」，输出 3840 × 2160、30 fps 的 H.264 MP4，目标视频码率 32 Mbps，双声道 AAC 192 kbps。按钮旁会显示预计体积。也可以选择 1080p 或 720p。播放器使用当前曲目的声部分配、时间偏移和小节选项生成带原声的 MP4。

已经导入的谱面和设置记在 XML 的个人配置里，重开同一曲目即可继续。重新导入可替换这首歌的 MIDI；导入失败会保留上一次可用的数据。「恢复曲库谱面」移除当前曲目的导入副本，随后重新读取原有分析。源 MIDI、音乐文件和 XLD 分析都保留。曲目按本地文件身份关联，移动或重新编码原曲后可能需要重新导入。

## 在雷达上会看到什么

音轨可以点亮对应的音符回波、琴键和可识别的鼓件。导入只提供 MIDI 事件，录音中各件乐器的真实电平、声像、人声连续音高和段落等信息需要其他分析来源。这个模式下，没有这些数据的仪表保持空闲。未分配的音轨可先在普通谱面查看，再分配到雷达声部。导入多轨 MIDI 不会分离原曲的人声或伴奏。

## English quick start

Use the Windows build `0.5.0-dev.midiin.2` or a release advertising **external MIDI import**. The older `preview.setup.1` release predates it. Select a recording in XML, open the Score scene, then **Score settings → Import MIDI for this track**. Import a standard type 0 or 1 PPQ file made against that exact recording. You can use your DAW or [MuScriptor](https://muscriptor.kyutai.org/).

Under **Instruments and timing**, review track assignments and audition both an early and a late passage. A positive offset moves the notes later. Enable MIDI bars only when the file contains a relevant meter. Use **Export video** to save an MP4 with the original audio and current score settings. From `0.5.0-dev.midiin.4`, choose **Auto** and **4K (2160p)** for 3840 × 2160 at 30 fps, with a 32 Mbps video target and 192 kbps stereo AAC. **Restore library score** removes the per-track import and resumes using the library analysis.
