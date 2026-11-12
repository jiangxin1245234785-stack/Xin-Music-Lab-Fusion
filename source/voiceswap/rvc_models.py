"""The community RVC model catalog — what `fetch_rvc.py` downloads and `rvc.py` converts with.

The counterpart of `voices.py`, and kept for the same reason: the weights are third-party
downloads that never enter the repo, so this table is what makes them reproducible. Every
entry pins a repository revision and the sha256 of what is downloaded from it.

Take a model from the account that trained it, never from a re-uploader. The bulk mirror
`binant/*` was checked on 2026-10-26 and two of three samples were mislabelled: its
"Adele" and "Jungkook" both name a drum-kit model (`DrumKitRVCModels/*Drums.zip`) as their
source. A wrong label is invisible until it is heard, so provenance is checked up front.

Check the training sample rate too. 毛白灵 (`maotianchen/maobailing_rvc` @e56357e0) was
dropped on 2026-10-27 after listening: trained on 22.05 kHz audio, it renders nothing above
11 kHz (−52 dB in 11–16 kHz against −25 to −31 for the others) and sounds congested, and no
conversion setting brings that band back. Below 32 kHz, don't take it; where the README
doesn't say, measure the band above 11 kHz before the model goes on the bench.

Most community models have no declared licence and copy a real singer. `license` and `who`
are recorded per entry so that whatever is ever shared beyond private listening can be
filtered on them; the catalog itself takes no position.

`octave` is the only conversion setting that differs per model. An RVC model sings well
only near the range it was trained on, and nothing in the checkpoint records that range,
so it comes from who the model is: up one octave for a female voice over a male source.
It is octaves only, never semitones — the converted vocal has to stay in the song's key to
go back over the other stems.
"""

#: Build order, which is also the order they are offered. A model is either two files in
#: the repository (`model` + `index`) or one `archive` holding them; `sha256` covers
#: whatever is downloaded, as Hugging Face reports it for the LFS object. An archive with
#: several checkpoints names the one to take in `member`.
MODELS = {
    'miku': dict(
        label='初音未来 · 虚拟歌手，22 分钟歌声训练',
        repo='HidekoHaruna/RVC_V2_Hatsune_Miku', revision='0a5ccf3ba0040aecc959a97bad2997e8a0482964',
        model='weights/MikuAI_e210_s6300.pth',
        index='weights/added_IVF1811_Flat_nprobe_1_MikuAI_v2.index',
        sha256={'weights/MikuAI_e210_s6300.pth': 'ed8522a71c0985fd6825d7c91330dea5b8dc036ec4a2d5cad89fdebe4002a37c',
                'weights/added_IVF1811_Flat_nprobe_1_MikuAI_v2.index':
                    '6c79ac6d9d7822beeecbcf400ef31a18dde0b998a1f11d376c552d1285cdb4f9'},
        license='未声明（角色版权属 Crypton）', who='虚拟歌手', octave=1),
    'iu': dict(
        label='IU · 韩国流行女歌手',
        repo='Zonas/RVC2-IU-1K', revision='8defb7fd15e368d9ec56b010a2284724f12ac03d',
        model='IU-Zonas.pth', index='added_IVF1231_Flat_nprobe_1_IU-Zonas_v2.index',
        sha256={'IU-Zonas.pth': 'cc0f973b74350d8b723b771dfbdee621db0c104bd2b73cc4356a3d25863c5dbd',
                'added_IVF1231_Flat_nprobe_1_IU-Zonas_v2.index':
                    '2462b4ed5c8439a77c422e74ceb64143b0ddbda391f40270bfc6ee77db0f4d28'},
        license='未声明', who='真人歌手', octave=1),
    'luotianyi': dict(
        label='洛天依 · 中文虚拟歌手，用她的歌声训练（同仓库另有说话声版本，没用）',
        repo='kouylty/RVC-luotianyi-speech-and-song', revision='65dd8fa0852138fd43a78b6e17d6271f1069f04f',
        model='luotianyi_song_v1.pth', index='added_IVF2063_Flat_nprobe_1_luotianyi_song_v1_v2.index',
        sha256={'luotianyi_song_v1.pth': '99fd643b9d050d1a3339decfc2edf9e45ec19f5e224dcddb1b9258eeba68c2b3',
                'added_IVF2063_Flat_nprobe_1_luotianyi_song_v1_v2.index':
                    '44652040f1c123c1b2b99f04a24d9754d8d02ae5ca6c9cbc63605e1409cc9cbf'},
        license='MIT（角色版权属上海禾念）', who='虚拟歌手', octave=1),
    'chester': dict(
        label='Chester Bennington · 摇滚男声，Linkin Park 主唱',
        repo='SUP3RMASS1VE/Chester-Bennington-0v2', revision='04fda982da68a3022ce44a599f0835882f9a54f2',
        archive='Chester Bennington 0v2.zip',
        sha256={'Chester Bennington 0v2.zip': 'b15e112459fec704a0ffda4a119ade1a3963d4fb2f572ac4d251a58e307ebc25'},
        license='OpenRAIL', who='真人歌手', octave=0),
    'freddie': dict(
        label='Freddie Mercury · 男高音，Queen 主唱',
        repo='MatiasCoversAI/MusicAIBySingers', revision='c72c32cf8de10e1ce87b35daba75c98edc0221ec',
        archive='FreddieMercury700Epochs.zip',
        sha256={'FreddieMercury700Epochs.zip': '1087d8d78495c667cc1290dbc49c47e9aa57074c4c8a87f5822fefc7aa8e482b'},
        license='未声明', who='真人歌手', octave=0),

    # Picked by the user on 2026-11-11 from work/rvc-candidates-20261110/candidates.md. `trial=True`
    # means downloaded and measured but not yet judged by ear: the studio lists these apart, and
    # the key comes off (or the entry goes) once the user has listened.
    'peter': dict(
        label='Peter Griffin · 动画《恶搞之家》的爸爸，粗嗓男声',
        repo='Delik/Peter_Griffin_RVCv2', revision='5482ff1faa5a8c7e9555c3e6f3a291646d847139',
        archive='petergriffin.zip',
        sha256={'petergriffin.zip': '60568d2d1d775a3bd38ff7b3afaa5e3982febe20bedd50a95f109015813de5d0'},
        license='OpenRAIL', who='动画角色', octave=0, trial=True),
    'morty': dict(
        label='Morty · 动画《瑞克和莫蒂》里的少年',
        repo='6ixcut/morty_rvc', revision='e2a43c93918742e3ecfa45e64c7295dee395dcaa',
        archive='morty_rvc.zip',
        sha256={'morty_rvc.zip': '9b87c3d9e3af01ee053c652a20190bd673a6798eb9ab41988d7e320644075733'},
        license='未声明', who='动画角色', octave=0, trial=True),
    'trump': dict(
        label='特朗普 · 用说话声训练的，拿来唱歌',
        repo='0x3e9/Trump_RVC', revision='e6b9761e786c37c787078b1821da093fb434f51c',
        archive='trump.zip',
        sha256={'trump.zip': 'b75478c2084b8ab82d200b83d59220d6170df6fa93b401158c733cdd28e1fd33'},
        license='未声明', who='公众人物', octave=0, trial=True),
    'violin': dict(
        label='小提琴 · 把人声变成琴声',
        repo='0x3e9/0x3e9_RVC_models', revision='c01b83496b7b20db1f8530e54270aec1ca8a8d96',
        archive='violin.zip',
        sha256={'violin.zip': '57cbf77aa3e087b9c427fd2d9fb9c7bdb08c353b8b836163162c76d1be0a11bf'},
        license='未声明', who='乐器', octave=1, trial=True),
    'guitar': dict(
        label='吉他 · 把人声变成吉他声',
        repo='0x3e9/0x3e9_RVC_models', revision='c01b83496b7b20db1f8530e54270aec1ca8a8d96',
        archive='guitar.zip',
        sha256={'guitar.zip': '8890565c246e2a2f0a50d06ae075e78e85ecaf62617fc07fd620c4d898d1b7ac'},
        license='未声明', who='乐器', octave=0, trial=True),
    'axl_chest': dict(
        label='Axl Rose（胸声） · 枪花主唱的中低音区',
        repo='GugaTorres/AxlRoseRVC', revision='a9589c389e389a8bb708a48bd444a8361b74ec7f',
        archive='AxlRose_ChestVoice_V2_500e.zip',
        sha256={'AxlRose_ChestVoice_V2_500e.zip': 'fdcdb0cbf083920b873033dde07d2d1c0e80364f9c62e2c5a0315a0ac1a9fe99'},
        license='OpenRAIL', who='真人歌手', octave=0, trial=True),
    'axl_drive': dict(
        label='Axl Rose（嘶吼） · 枪花主唱招牌的沙哑高音',
        repo='GugaTorres/AxlRoseRVC', revision='a9589c389e389a8bb708a48bd444a8361b74ec7f',
        archive='AxlRose_DriveVoice_V2_500e.zip',
        sha256={'AxlRose_DriveVoice_V2_500e.zip': '188a0e059623e705092ba6aebced8cb960a6992060426a065561297d0186e699'},
        license='OpenRAIL', who='真人歌手', octave=0, trial=True),
    'axl_head': dict(
        label='Axl Rose（头声） · 枪花主唱尖细的高音区',
        repo='GugaTorres/AxlRoseRVC', revision='a9589c389e389a8bb708a48bd444a8361b74ec7f',
        archive='AxlRose_HeadVoice_V1_500e.zip',
        sha256={'AxlRose_HeadVoice_V1_500e.zip': '0fd52362473b189c541a8f35ba3ca341e55a67a11f37b33836c457772d530dda'},
        license='OpenRAIL', who='真人歌手', octave=1, trial=True),
    'curtis': dict(
        label='Ian Curtis · Joy Division 主唱，低沉男中音',
        repo='Andrewk2/ian-curtis-700', revision='f5e56892c6c2183cccc0dae2b0edf99dd803d473',
        archive='curtis.zip',
        sha256={'curtis.zip': 'cb7525d5dde1c98bdbb19d6a657a1b01ddb3c1bf75061ad864b8ba4c873dd927'},
        license='未声明', who='真人歌手', octave=0, trial=True),

    # 丁真, found by the user on 2026-11-11 (a search by repository name misses it: the name is
    # only in file names inside collections). Of two trainings the user kept this one by ear:
    # "咬字不清楚才对劲". Dropped: `lowo/RVC-weights` @8ff8d75d `丁真v1.zip`, member
    # `dingzhen_e40.pth` (sha256 a415c3e2…), which articulates more clearly.
    'dingzhen_b': dict(
        label='丁真 · 网络红人丁真的声音，咬字含糊',
        repo='chaye741/RVC-Voice-Models', revision='acfd9f836ca1fc862a594bc303cfccee8d565e94',
        # No index: the repository's `indices/丁真.index` (sha256 4fb5b11e…) has another feature
        # width than this v1 model, and faiss refuses the search (AssertionError, d != self.d).
        model='weights/丁真.pth',
        sha256={'weights/丁真.pth': '434d7468264b1641180724152003426b34d1fa418392095c07360702577c9165'},
        license='未声明', who='公众人物', octave=0),
    # Asked for by name on 2026-11-11 and found by file name in the same collection as the dropped 丁真.
    # The repository has no index for it.
    'sunxiaochuan': dict(
        label='孙笑川 · 抽象带主播的声音',
        repo='lowo/RVC-weights', revision='8ff8d75d1cb5bf96116ac2eb63ebe8ff62d98f7c',
        model='sunxiaochuan.pth',
        sha256={'sunxiaochuan.pth': 'c74c5ed19ba8e49f0de3c2891754fb12e9a1db6cbd26a9227f8fe2418c54e5cf'},
        license='AGPL-3.0', who='公众人物', octave=0, trial=True),
}
