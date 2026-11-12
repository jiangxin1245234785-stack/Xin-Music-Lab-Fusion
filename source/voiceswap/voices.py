"""The voice catalog — what `make_voices.py` builds the reference library from.

This is the kept thing. The wavs it produces are gitignored build output, exactly as
`kitdefs/` is kept and `kits/*/samples/*.wav` is not: a voice must always be reproducible
without having to find an audio file again.

A kit recipe is a few kilobytes of synthesis and earns a module of its own. A voice recipe
is four fields, so the catalog is one table instead — there is nothing here that a module
per voice would carry.

Seed-VC takes f0 from the song and only timbre from the reference, so what matters when
choosing voices is how far apart they *sound*, not what language they read. The scripts
are per-locale anyway: a voice reading a language it was not trained on mispronounces, and
strained phonation makes a worse timbre reference than natural speech does.
"""

#: Reference text per locale. Vowel-rich, no long pauses, long enough for the ~10 s of
#: speech Seed-VC wants and short enough not to waste the endpoint's time.
SCRIPTS = {
    'zh': ('月亮升起来的时候，河水慢慢往南边流去。远处有人在唱歌，'
           '声音很轻，像是从很久以前传过来的一样。'),
    'ja': ('月が昇るころ、川の水はゆっくりと南へ流れていきます。'
           '遠くで誰かが歌っている声が、とても静かに聞こえてきます。'),
    'ko': ('달이 떠오를 무렵, 강물은 천천히 남쪽으로 흘러갑니다. '
           '멀리서 누군가 노래하는 소리가 아주 조용히 들려옵니다.'),
    'en': ('When the moon comes up, the river drifts slowly away to the south. '
           'Somewhere far off a voice is singing, so quietly it seems to come '
           'from a long time ago.'),
}

#: Build order, which is also the order they are offered. An entry may override `rate`
#: (passed to edge-tts, default `+0%`) or `script`; neither is usually needed.
#:
#: Slowing the reference down was tried and dropped. The idea was that longer vowels are
#: closer to sung phonation, but a `-35%` reference and a normal one scored 0.976 against
#: each other on campplus — the same voice. It buys nothing and is not worth the field.
VOICES = {
    'xiaoxiao': dict(voice='zh-CN-XiaoxiaoNeural', label='晓晓 · 温暖女声'),
    'xiaoyi': dict(voice='zh-CN-XiaoyiNeural', label='晓伊 · 活泼女声，更年轻更亮'),
    'yunjian': dict(voice='zh-CN-YunjianNeural', label='云健 · 浑厚男声，有力'),
    'yunxi': dict(voice='zh-CN-YunxiNeural', label='云希 · 阳光男声，偏年轻'),
    'yunxia': dict(voice='zh-CN-YunxiaNeural', label='云夏 · 少年感男声，最高的男声'),
    'yunyang': dict(voice='zh-CN-YunyangNeural', label='云扬 · 播音腔男声，端正'),
    'xiaobei': dict(voice='zh-CN-liaoning-XiaobeiNeural', label='晓北 · 辽宁女声，方言音色'),
    'xiaoni': dict(voice='zh-CN-shaanxi-XiaoniNeural', label='晓妮 · 陕西女声，明亮'),
    'hiumaan': dict(voice='zh-HK-HiuMaanNeural', label='曉曼 · 粤语女声'),
    'wanlung': dict(voice='zh-HK-WanLungNeural', label='雲龍 · 粤语男声'),
    'nanami': dict(voice='ja-JP-NanamiNeural', label='七海 · 日语女声，元音色彩不同'),
    'keita': dict(voice='ja-JP-KeitaNeural', label='圭太 · 日语男声'),
    'sunhi': dict(voice='ko-KR-SunHiNeural', label='선히 · 韩语女声'),
    'injoon': dict(voice='ko-KR-InJoonNeural', label='인준 · 韩语男声'),
    # English accents are here for timbre spread, not language: the lyrics come from the
    # song either way. Cross-language references scored among the most distinct in the
    # probe, so these cost nothing and widen the library.
    'ana': dict(voice='en-US-AnaNeural', label='Ana · 童声感，全库最细的声音'),
    'christopher': dict(voice='en-US-ChristopherNeural', label='Christopher · 低沉男声，播报腔'),
    'sonia': dict(voice='en-GB-SoniaNeural', label='Sonia · 英式女声'),
    'connor': dict(voice='en-IE-ConnorNeural', label='Connor · 爱尔兰男声'),

    # Voices made from a recording (`make_clip_voice.py`), for people nobody has trained an RVC
    # model of. `clip` replaces the TTS `voice`: files of a pinned GitHub revision with their
    # sha256, or `local=True` for a recording the user hands over. Asked for by the user on
    # 2026-11-11: otto is 电棍, and 说的道理 is 电棍 played backwards.
    #
    # The clips come from 活字印刷 (DSP-8192/HuoZiYinShua), whose `ysddSources` are the famous
    # phrases as the meme has them, which is already his speech reversed. So 说的道理 uses
    # them as they are and 电棍 plays them backwards, back into ordinary speech.
    'otto': dict(label='电棍 · otto 平常说话的声音',
                 clip=dict(repo='DSP-8192/HuoZiYinShua', revision='3dc8d0156d28f4d2510787143e2cec4f156ad5c0', reverse=True, files={
                     'ysddSources/djha.wav': '', 'ysddSources/wssddl.wav': '', 'ysddSources/jtlaidian.wav': '',
                     'ysddSources/miyu.wav': '', 'ysddSources/sddl.wav': ''})),
    'shuodedaoli': dict(label='说的道理 · 电棍的倒放',
                        clip=dict(repo='DSP-8192/HuoZiYinShua', revision='3dc8d0156d28f4d2510787143e2cec4f156ad5c0', reverse=False, files={
                            'ysddSources/djha.wav': '', 'ysddSources/wssddl.wav': '', 'ysddSources/jtlaidian.wav': '',
                            'ysddSources/miyu.wav': '', 'ysddSources/sddl.wav': ''})),
    'shanniruo': dict(label='山泥若 · 用一段录音学的音色', clip=dict(local=True)),
}

#: Checks a built reference has to pass. A reference that is too short carries too little
#: of the speaker to embed; one that is near-silent carries none at all, and neither would
#: raise an error anywhere downstream — the conversion would just quietly sound wrong.
MIN_SECONDS, MAX_SECONDS, MIN_RMS_DB = 6.0, 25.0, -30.0


def script_for(voice_id):
    """The reference text for a voice, chosen by the locale its name starts with."""
    for prefix, text in SCRIPTS.items():
        if voice_id.startswith(prefix):
            return text
    raise KeyError(f'{voice_id}: 没有对应语种的参考文本，先往 SCRIPTS 里加一条')
