((root) => {
  'use strict';
  // 车窗地貌's hand-painted materials (batch 7, 2026-11-20): GPT's set of 101 transparent pictures the user accepted
  // (work/terrain-20261119/gpt-assets/out), scaled to what the largest display needs and turned into WebP under
  // assets/terrain/ by work/terrain-20261119/batch7/convert-assets.cjs, which also writes the table below.
  // The look uses the pictures only once every one of them is decoded (and the few derived layers are made); until then,
  // or when anything fails, it draws everything with its own code as before - never half pictures, half code. Under Node
  // (tests) there is no Image: the state stays 'none' and the code drawing is what runs.
  //   XinScoreTerrainAssets.ready()   -> Promise<boolean> (starts loading on the first call)
  //   XinScoreTerrainAssets.isReady() -> boolean, synchronous; .get(key) -> {img, ...table row}; .derived(name) -> canvas

  // BEGIN TABLE (written by work/terrain-20261119/batch7/convert-assets.cjs; do not edit by hand)
  const TABLE = Object.freeze([
    {"key":"roadside/pole-a","file":"roadside/pole-a.webp","ow":360,"oh":1300,"w":360,"h":1300,"k":1,"anchor":[180,1248],"bbox":[71,52,285,1247],"bytes":21452,"sha256":"11a58c325fb899bd97f8cc901cc876d69b5834db7a42c93d991ac77e923c6abd"},
    {"key":"roadside/pole-b","file":"roadside/pole-b.webp","ow":360,"oh":1300,"w":360,"h":1300,"k":1,"anchor":[180,1248],"bbox":[22,52,316,1247],"bytes":40046,"sha256":"fe94dd403c08b21a76bf94640bbceb296d7bb1e610f12fd4c35f7c320d388610"},
    {"key":"roadside/pole-c","file":"roadside/pole-c.webp","ow":360,"oh":1300,"w":360,"h":1300,"k":1,"anchor":[180,1248],"bbox":[80,52,312,1247],"bytes":29760,"sha256":"82e1bccf0fb6377dc669c91e82f58d1caf1f8d13e9f83b8d3bdaf12bf3d6301b"},
    {"key":"roadside/pole-d","file":"roadside/pole-d.webp","ow":360,"oh":1300,"w":360,"h":1300,"k":1,"anchor":[180,1248],"bbox":[66,52,345,1247],"bytes":32466,"sha256":"c4fa0a1ed4d8bf8b9b06cd3883433982b8d0f064490e45ed855a82f7c7c089c8"},
    {"key":"roadside/pole-stub-a","file":"roadside/pole-stub-a.webp","ow":420,"oh":700,"w":252,"h":420,"k":0.6,"anchor":[139,672],"bbox":[23,27,396,670],"bytes":11646,"sha256":"288922624e28205bf550ef7539afa698da165f964ddba21a1c16b54797938601"},
    {"key":"roadside/pole-stub-b","file":"roadside/pole-stub-b.webp","ow":420,"oh":700,"w":252,"h":420,"k":0.6,"anchor":[271,672],"bbox":[17,57,403,671],"bytes":12308,"sha256":"47705a9111ffcb5dda2b304dacebe0c59fd82c71242dde873eeb1ad31da66816"},
    {"key":"roadside/mile-post-a","file":"roadside/mile-post-a.webp","ow":120,"oh":420,"w":108,"h":378,"k":0.9,"anchor":[60,403],"bbox":[26,17,94,403],"bytes":5608,"sha256":"ebc65b9acb80252297f26ff7664062d199d3dbf2d4601251db9db3d8496f8323"},
    {"key":"roadside/mile-post-b","file":"roadside/mile-post-b.webp","ow":120,"oh":420,"w":108,"h":378,"k":0.9,"anchor":[60,403],"bbox":[18,17,93,403],"bytes":6400,"sha256":"a4ffc133a7642b299523c42c193d7b21da5cefe1505f655662af762d735cca3a"},
    {"key":"roadside/mile-post-c","file":"roadside/mile-post-c.webp","ow":120,"oh":420,"w":108,"h":378,"k":0.9,"anchor":[60,403],"bbox":[29,17,91,403],"bytes":5398,"sha256":"ecf6735b52ec63076477769525bc578c24bbe4d86079e8d0e51cd3796279214a"},
    {"key":"roadside/whistle-post-a","file":"roadside/whistle-post-a.webp","ow":140,"oh":480,"w":140,"h":480,"k":1,"anchor":[70,461],"bbox":[20,18,119,460],"bytes":6758,"sha256":"26889cbf4ed2014a972656cfc6aab0a9017f5aaced7d4b29685d3d34e95cb5c7"},
    {"key":"roadside/whistle-post-b","file":"roadside/whistle-post-b.webp","ow":140,"oh":480,"w":140,"h":480,"k":1,"anchor":[70,461],"bbox":[5,18,133,460],"bytes":7634,"sha256":"156599c1cfa8e03a47ceddf3e800ee2ebb481296904eba607f57d7db7ac58dc2"},
    {"key":"roadside/fence-post-a","file":"roadside/fence-post-a.webp","ow":90,"oh":260,"w":54,"h":156,"k":0.6,"anchor":[45,250],"bbox":[26,21,63,249],"bytes":2440,"sha256":"130bfe0b0571772b3e279e1617cd76c576631eb6412495548937f5a5384800c4"},
    {"key":"roadside/fence-post-b","file":"roadside/fence-post-b.webp","ow":90,"oh":260,"w":54,"h":156,"k":0.6,"anchor":[45,250],"bbox":[26,9,63,249],"bytes":2540,"sha256":"06ce7880869b0ad520752f4a7727218ffa5d09957d405e168db518129afe6fe0"},
    {"key":"roadside/fence-post-c","file":"roadside/fence-post-c.webp","ow":90,"oh":260,"w":54,"h":156,"k":0.6,"anchor":[45,250],"bbox":[24,41,66,250],"bytes":2568,"sha256":"b4fb9d7ea731032b71bb2a6bac77fc0d27d1f67b039fac659d32e97950fd49df"},
    {"key":"roadside/fence-post-d","file":"roadside/fence-post-d.webp","ow":90,"oh":260,"w":54,"h":156,"k":0.6,"anchor":[45,250],"bbox":[27,29,73,250],"bytes":2790,"sha256":"dc5c51515cc127c3a6790741b665ec4372b0c8798c6ae8b9ca92f3c5741ccbe3"},
    {"key":"roadside/fence-post-braced-a","file":"roadside/fence-post-braced-a.webp","ow":260,"oh":320,"w":156,"h":192,"k":0.6,"anchor":[130,307],"bbox":[10,13,249,307],"bytes":6296,"sha256":"c510cd942999f354afa579c42432a4b533c08e75704c90d26ae860b6d3a379e6"},
    {"key":"roadside/fence-post-braced-b","file":"roadside/fence-post-braced-b.webp","ow":260,"oh":320,"w":156,"h":192,"k":0.6,"anchor":[130,307],"bbox":[12,13,246,307],"bytes":6480,"sha256":"89e597c914f9f6d92bcf41e4c2e2f8b695d603366d758a49ac67f1ede7ab1db9"},
    {"key":"roadside/rock-pile-a","file":"roadside/rock-pile-a.webp","ow":420,"oh":240,"w":420,"h":240,"k":1,"anchor":[210,230],"bbox":[17,115,402,229],"bytes":11972,"sha256":"90f77537bd15a39745a0a722b302262d18c9f671c6ad91126f72c69bc0837593"},
    {"key":"roadside/rock-pile-b","file":"roadside/rock-pile-b.webp","ow":420,"oh":240,"w":420,"h":240,"k":1,"anchor":[199,230],"bbox":[17,79,402,229],"bytes":12178,"sha256":"2edd1fc65baca0845da9ba64c30fd3ae0b213891692d235d2382ea6084dad1d3"},
    {"key":"roadside/rock-pile-c","file":"roadside/rock-pile-c.webp","ow":420,"oh":240,"w":420,"h":240,"k":1,"anchor":[186,230],"bbox":[17,145,402,228],"bytes":8510,"sha256":"003962136d9bd0814573e5b6a1b4efcde8bfefafd1cc37b6046cb814320fc95c"},
    {"key":"roadside/rock-pile-d","file":"roadside/rock-pile-d.webp","ow":420,"oh":240,"w":420,"h":240,"k":1,"anchor":[228,230],"bbox":[17,109,402,229],"bytes":10692,"sha256":"3a25a22f253c6ea970a55b82bae3c1699840d874af4d4772ce016fe7923a5fd7"},
    {"key":"roadside/sagebrush-a","file":"roadside/sagebrush-a.webp","ow":360,"oh":240,"w":360,"h":240,"k":1,"anchor":[167,230],"bbox":[14,17,345,229],"bytes":20682,"sha256":"7beeea72cc5e937c5911f7c960bc82f240e0f32c4d929625bf11239794db0b61"},
    {"key":"roadside/sagebrush-b","file":"roadside/sagebrush-b.webp","ow":360,"oh":240,"w":360,"h":240,"k":1,"anchor":[175,230],"bbox":[14,68,345,229],"bytes":17652,"sha256":"2090dc08bd1f9e3dd0a15bd0ba29f699a7eec630152b728449a692fe6cbb91ce"},
    {"key":"roadside/sagebrush-c","file":"roadside/sagebrush-c.webp","ow":360,"oh":240,"w":360,"h":240,"k":1,"anchor":[158,230],"bbox":[17,10,342,229],"bytes":21962,"sha256":"5d32d284f445504df40902ad0d9b17d8c2e8c6490bb03ae9aab075d648a37058"},
    {"key":"roadside/sagebrush-d","file":"roadside/sagebrush-d.webp","ow":360,"oh":240,"w":360,"h":240,"k":1,"anchor":[145,230],"bbox":[14,64,345,229],"bytes":18646,"sha256":"8e962125a5b3e9b5008c2bdf2e55bb5bdf2409ed8931c3f870efad3e863edc80"},
    {"key":"roadside/windpump-a","file":"roadside/windpump-a.webp","ow":520,"oh":1100,"w":312,"h":660,"k":0.6,"anchor":[179,1056],"bbox":[21,118,499,1056],"bytes":35084,"sha256":"3ece5f3e16a5d48a573a2d8473f58a603e0a03b7ef95e5b17f260d8eb6c26ec9"},
    {"key":"roadside/windpump-b","file":"roadside/windpump-b.webp","ow":520,"oh":1100,"w":312,"h":660,"k":0.6,"anchor":[179,1056],"bbox":[28,44,491,1054],"bytes":37746,"sha256":"113d3cba363e0a6a902ab6e60e93f9cbcdc80ee6e12e408a38c1aad80b30cf83"},
    {"key":"roadside/windpump-c","file":"roadside/windpump-c.webp","ow":520,"oh":1100,"w":312,"h":660,"k":0.6,"anchor":[185,1056],"bbox":[21,252,498,1055],"bytes":31832,"sha256":"72fbf152f7bf1bbd499d50b43aa7990fad6a8749f508a02fac6d4b9ce873d1cd"},
    {"key":"roadside/windpump-wheel-a","file":"roadside/windpump-wheel-a.webp","ow":520,"oh":520,"w":312,"h":312,"k":0.6,"anchor":[260,260],"bbox":[22,18,499,495],"bytes":32398,"sha256":"34e91be0bf0f21eeea0f6ada2d706f360cbd054838af55e2405dea3c590dbf38"},
    {"key":"roadside/bird-a","file":"roadside/bird-a.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,9,109,55],"bytes":1780,"sha256":"a47de00c7b33a39f422f2b4bbd079825effbb105f5792ec497f6fd06d4925a0a"},
    {"key":"roadside/bird-b","file":"roadside/bird-b.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,28,109,55],"bytes":1612,"sha256":"ca81392d3d771ad04bab0ff454b7347144a1f2a678787439c33012bd0e9b9353"},
    {"key":"roadside/bird-c","file":"roadside/bird-c.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,38,109,68],"bytes":1520,"sha256":"d43f6a7b212f8047255b9cde1f5cd03b37c41ea0353a8387058560b91e6bfb29"},
    {"key":"roadside/bird-d","file":"roadside/bird-d.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,38,109,84],"bytes":1706,"sha256":"11f0e87ff7bd5de8204572ca5fcddbca2c99a2ad3a862ed688ea11ead8493c30"},
    {"key":"roadside/bird-e","file":"roadside/bird-e.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,38,109,62],"bytes":1322,"sha256":"103e184f122359e9dcab431fa539b296dc151f838b054093b48abc05ef5970bf"},
    {"key":"roadside/bird-f","file":"roadside/bird-f.webp","ow":160,"oh":90,"w":160,"h":90,"k":1,"anchor":[80,45],"bbox":[46,26,109,55],"bytes":1590,"sha256":"83058324b69bd408af4f3fcf79265e3c386f27369dabefc905bb4cde9558a8b2"},
    {"key":"station/station-sign-a","file":"station/station-sign-a.webp","ow":900,"oh":520,"w":900,"h":520,"k":1,"anchor":[450,498],"bbox":[36,66,863,498],"bytes":22196,"sha256":"c1d44b01559d80fd93a8a27c1f14f41e2fd781513477405c1e14f3c2bee1e9f6"},
    {"key":"station/station-sign-b","file":"station/station-sign-b.webp","ow":900,"oh":520,"w":900,"h":520,"k":1,"anchor":[450,498],"bbox":[35,41,863,499],"bytes":32250,"sha256":"80ff677d357390b8655c5ccb5ef1e323f315b798565b8071a593768a4a90ff3c"},
    {"key":"station/station-sign-c","file":"station/station-sign-c.webp","ow":900,"oh":520,"w":900,"h":520,"k":1,"anchor":[450,498],"bbox":[35,63,863,498],"bytes":25998,"sha256":"86ac7d4e15dad871cc7f81b608815132ee999bdf3878fad5d5516e0045d73a10"},
    {"key":"station/station-lamp-a","file":"station/station-lamp-a.webp","ow":200,"oh":900,"w":200,"h":900,"k":1,"anchor":[42,863],"bbox":[17,34,182,863],"bytes":11474,"sha256":"a9e0847b1c9e91a6d0588e82c74e05a933eca7a7f5fdae33a1727250e5ce470a"},
    {"key":"station/station-lamp-b","file":"station/station-lamp-b.webp","ow":200,"oh":900,"w":200,"h":900,"k":1,"anchor":[150,863],"bbox":[15,36,182,863],"bytes":11798,"sha256":"677a1426d29b14dd7702b588445df727ab1984f8baf600ab27b4375fef7bf3dc"},
    {"key":"station/station-lamp-glow-a","file":"station/station-lamp-glow-a.webp","ow":200,"oh":900,"w":100,"h":450,"k":0.5,"anchor":[42,863],"bbox":[72,111,187,182],"bytes":2480,"sha256":"228b447a895085da9a15f23f6798d74c30d2b3ddf6d089e7ff30e9d79d3db28e"},
    {"key":"station/station-lamp-glow-b","file":"station/station-lamp-glow-b.webp","ow":200,"oh":900,"w":100,"h":450,"k":0.5,"anchor":[150,863],"bbox":[10,109,109,181],"bytes":2264,"sha256":"c1f8ee24a640ba3386f54210566450745d2ee1a805dad194e4a98b79772e7a2c"},
    {"key":"station/town-water-tower-a","file":"station/town-water-tower-a.webp","ow":520,"oh":900,"w":338,"h":585,"k":0.65,"anchor":[260,864],"bbox":[46,36,472,863],"bytes":35490,"sha256":"3c963801be567a283f07f835a802a246fede2af62671287f9f728ae06cc6444c"},
    {"key":"station/town-water-tower-b","file":"station/town-water-tower-b.webp","ow":520,"oh":900,"w":338,"h":585,"k":0.65,"anchor":[260,863],"bbox":[126,35,392,863],"bytes":22830,"sha256":"ee0cfbfd4a429dc1b8b4f9c082e54495f04caf4168e547419bd1007be5054d59"},
    {"key":"station/town-water-tower-c","file":"station/town-water-tower-c.webp","ow":520,"oh":900,"w":338,"h":585,"k":0.65,"anchor":[260,863],"bbox":[27,35,491,863],"bytes":33004,"sha256":"bfd7efd281a5a00c3287bedf15b364131b69d78a173a87ddcd20f0efbc29de24"},
    {"key":"station/town-grain-elevator-a","file":"station/town-grain-elevator-a.webp","ow":760,"oh":900,"w":494,"h":585,"k":0.65,"anchor":[380,863],"bbox":[73,36,685,864],"bytes":19352,"sha256":"b9cb5873320f97c31b7ab7440ec25cb2cc8c65a981ab1c8c3fc11e0f83563a28"},
    {"key":"station/town-grain-elevator-b","file":"station/town-grain-elevator-b.webp","ow":760,"oh":900,"w":494,"h":585,"k":0.65,"anchor":[380,863],"bbox":[127,35,632,863],"bytes":19364,"sha256":"723d5f0046b9ecba84f02034649b53801f2c9aa6a55fcdbe6aebcc54348e46e5"},
    {"key":"station/town-grain-elevator-c","file":"station/town-grain-elevator-c.webp","ow":760,"oh":900,"w":494,"h":585,"k":0.65,"anchor":[380,863],"bbox":[213,34,546,863],"bytes":16218,"sha256":"7808fe1f273a36325743d9556fc0a97458b40c444fcd15177dd29a25fd7f94f9"},
    {"key":"station/town-house-a","file":"station/town-house-a.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[20,20,498,345],"bytes":13988,"sha256":"5237354cbda9b2fa54dd4af7a26096e119cab7f2f38ba410a5b0a039bc482904"},
    {"key":"station/town-house-b","file":"station/town-house-b.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[21,84,498,346],"bytes":12624,"sha256":"959a38c755a41007576d09557503dbcbc16595a448c86786ca7810a72ef3fb66"},
    {"key":"station/town-house-c","file":"station/town-house-c.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[23,13,495,345],"bytes":8430,"sha256":"2e433c9d05cef41ab72b563a03cd1d75cc916a331358f5c8cebfa3c02bcb477e"},
    {"key":"station/town-house-d","file":"station/town-house-d.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[21,112,498,345],"bytes":6864,"sha256":"7de76f93a537013c29c48811e38d704e293a2f40534384b9b723893e71587b29"},
    {"key":"station/town-house-e","file":"station/town-house-e.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[20,131,499,346],"bytes":7336,"sha256":"7cff2e8392d9d891155577a189b4398822d5f77fa11d815f55b32480526c3ea4"},
    {"key":"station/town-house-f","file":"station/town-house-f.webp","ow":520,"oh":360,"w":286,"h":198,"k":0.55,"anchor":[260,345],"bbox":[20,18,498,345],"bytes":8998,"sha256":"aab55d0b22a70c3e92d8f1782021cd4bd8e5b8a5f9d19762aefea6532571f183"},
    {"key":"station/town-tree-a","file":"station/town-tree-a.webp","ow":420,"oh":480,"w":231,"h":264,"k":0.55,"anchor":[198,460],"bbox":[105,19,312,461],"bytes":7904,"sha256":"e7612e4cbb20f1d26f0ffd671dd3e8f9018d536b1567c9d8f37826af2ba101cd"},
    {"key":"station/town-tree-b","file":"station/town-tree-b.webp","ow":420,"oh":480,"w":231,"h":264,"k":0.55,"anchor":[152,460],"bbox":[16,216,402,460],"bytes":8094,"sha256":"241d0faf4791995d20d1fcc64c39d189056287f26126946b97d1977da17df0a8"},
    {"key":"station/town-tree-c","file":"station/town-tree-c.webp","ow":420,"oh":480,"w":231,"h":264,"k":0.55,"anchor":[202,460],"bbox":[50,18,368,461],"bytes":10164,"sha256":"283c280d4c18ded1c4ef5fc1a65c6923fbcf0d9aeb3a31adeba0bf5a51ce8dbe"},
    {"key":"station/town-tree-d","file":"station/town-tree-d.webp","ow":420,"oh":480,"w":231,"h":264,"k":0.55,"anchor":[213,460],"bbox":[36,19,382,460],"bytes":11924,"sha256":"c14b54e4c2c5c6a1b83bab29525943429f58351c51858a4ddca32f62e2158a96"},
    {"key":"station/crossing-signal-a","file":"station/crossing-signal-a.webp","ow":320,"oh":760,"w":320,"h":760,"k":1,"anchor":[160,729],"bbox":[37,29,280,729],"bytes":19202,"sha256":"fbb21787ba7d7abd93d44db9489f8579b09301b6dec791b5fc88314102de3253"},
    {"key":"station/crossing-signal-b","file":"station/crossing-signal-b.webp","ow":320,"oh":760,"w":320,"h":760,"k":1,"anchor":[160,729],"bbox":[29,30,290,730],"bytes":19886,"sha256":"0410aa7b57e6e0e48c78343283bf6c60ec46bedb52ca71f3bed87e75ed5f51c5"},
    {"key":"station/crossing-signal-lit-l-a","file":"station/crossing-signal-lit-l-a.webp","ow":320,"oh":760,"w":160,"h":380,"k":0.5,"anchor":[160,729],"bbox":[28,306,146,419],"bytes":2862,"sha256":"368e2ed9630a66c1dc18e5c8f972bc50d013b7ead5be04c29299c538b1c96235"},
    {"key":"station/crossing-signal-lit-l-b","file":"station/crossing-signal-lit-l-b.webp","ow":320,"oh":760,"w":160,"h":380,"k":0.5,"anchor":[160,729],"bbox":[14,305,128,410],"bytes":2712,"sha256":"26233e6a6711938863582705d78d2bfd260051e36c11b7a1b97faaefb69981b2"},
    {"key":"station/crossing-signal-lit-r-a","file":"station/crossing-signal-lit-r-a.webp","ow":320,"oh":760,"w":160,"h":380,"k":0.5,"anchor":[160,729],"bbox":[170,306,289,421],"bytes":2996,"sha256":"8f1ec2f5b5c306ed097a1927d4a6e61883c1f729d667e9912dfcad817e1f3f79"},
    {"key":"station/crossing-signal-lit-r-b","file":"station/crossing-signal-lit-r-b.webp","ow":320,"oh":760,"w":160,"h":380,"k":0.5,"anchor":[160,729],"bbox":[192,308,303,413],"bytes":2688,"sha256":"429a433d0cde7e1dde1a3526a8760ad49ba352011db9b62a0f71e4c80d89bbca"},
    {"key":"station/crossing-gate-a","file":"station/crossing-gate-a.webp","ow":900,"oh":200,"w":900,"h":200,"k":1,"anchor":[185,82],"bbox":[36,52,863,148],"bytes":9656,"sha256":"9e433a316aea7eb8c0012fff4aa54728fb5cd5b4efed49244a412d7b95ce5717"},
    {"key":"station/town-depot-a","file":"station/town-depot-a.webp","ow":900,"oh":420,"w":495,"h":231,"k":0.55,"anchor":[450,402],"bbox":[35,106,863,402],"bytes":13792,"sha256":"9d9eeacd016f61d0a06a2b3d05f5836e779068698ff8da9e75aedc7f7769dc44"},
    {"key":"station/town-depot-b","file":"station/town-depot-b.webp","ow":900,"oh":420,"w":495,"h":231,"k":0.55,"anchor":[450,402],"bbox":[36,123,863,402],"bytes":13478,"sha256":"9a1cf30624553ac7fd82780ea88b8c1cc2a9eca60dc4d2e00c327932135d0623"},
    {"key":"carriage/curtain-left-a","file":"carriage/curtain-left-a.webp","ow":520,"oh":2200,"w":520,"h":2200,"k":1,"anchor":[260,95],"bbox":[24,90,495,2109],"bytes":158174,"sha256":"b4f45cc15d09ee6dc74b4eb63dfaf19912ded1b89fbf7882a584209a23bcc164"},
    {"key":"carriage/curtain-left-b","file":"carriage/curtain-left-b.webp","ow":520,"oh":2200,"w":520,"h":2200,"k":1,"anchor":[260,95],"bbox":[22,88,498,2111],"bytes":109440,"sha256":"9152c97d6a7ca749b057a6f9b2cf4324872b5acb9ee21673c43271b371084a10"},
    {"key":"carriage/curtain-right-a","file":"carriage/curtain-right-a.webp","ow":520,"oh":2200,"w":520,"h":2200,"k":1,"anchor":[260,95],"bbox":[21,90,498,2110],"bytes":103172,"sha256":"4902d4c5c5107ba261f54f847061d2411f5c5001ed137d44adebcc59e9ed96ce"},
    {"key":"carriage/curtain-right-b","file":"carriage/curtain-right-b.webp","ow":520,"oh":2200,"w":520,"h":2200,"k":1,"anchor":[260,95],"bbox":[23,89,497,2111],"bytes":99852,"sha256":"d1e4a666673027ac9d4705e58bedc76b098f5c518268d4d466f23c053c48e351"},
    {"key":"carriage/curtain-rail-a","file":"carriage/curtain-rail-a.webp","ow":4200,"oh":120,"w":1890,"h":54,"k":0.45,"anchor":[0,5],"bbox":[0,9,4199,108],"bytes":18136,"sha256":"a0bfdf1c958bd5e68854637c9a1b1973feeef254dcab3600fce73af0ffcea1ad"},
    {"key":"carriage/window-transom-a","file":"carriage/window-transom-a.webp","ow":4200,"oh":90,"w":1680,"h":36,"k":0.4,"anchor":[0,10],"bbox":[0,11,4199,78],"bytes":6442,"sha256":"7e0d02b44fe92ffcc862a5e211c8df23d787b2b36f3b6ae38b13cbc75d96fac9"},
    {"key":"carriage/window-corner-a","file":"carriage/window-corner-a.webp","ow":400,"oh":400,"w":240,"h":240,"k":0.6,"anchor":[0,0],"bbox":[3,3,399,399],"bytes":5150,"sha256":"ff2d665e75928931e5bab11442e69840ff6f045848969cb531ca70ce5057cf4f"},
    {"key":"carriage/wall-panel-a","file":"carriage/wall-panel-a.webp","ow":1024,"oh":1024,"w":512,"h":512,"k":0.5,"anchor":[0,0],"bbox":[0,0,1023,1023],"bytes":8930,"sha256":"aa44671f98dc577960a870af5a01e91743a4206fc275f0416c11acfd79812dab"},
    {"key":"carriage/wall-panel-b","file":"carriage/wall-panel-b.webp","ow":1024,"oh":1024,"w":512,"h":512,"k":0.5,"anchor":[0,0],"bbox":[0,0,1023,1023],"bytes":1354,"sha256":"2ee88b36dad72dc23faed384c92d70aa89cadbfb758671dbe3e654ca4bd8c6cf"},
    {"key":"carriage/sill-a","file":"carriage/sill-a.webp","ow":4200,"oh":260,"w":2730,"h":169,"k":0.65,"anchor":[0,0],"bbox":[0,0,4199,259],"bytes":7256,"sha256":"a02273a02a6faab0b01d66d9c1839b0678dd6d58a7dada8e24e5fcb157942ac1"},
    {"key":"carriage/led-bezel-a","file":"carriage/led-bezel-a.webp","ow":4200,"oh":360,"w":4200,"h":360,"k":1,"anchor":[0,0],"bbox":[67,23,4133,333],"bytes":89104,"sha256":"a211b58314dd90fe380efcef7277c8bfb3808d06bb2a5bb3c265bad08bc1b944"},
    {"key":"carriage/led-bezel-b","file":"carriage/led-bezel-b.webp","ow":3000,"oh":180,"w":2550,"h":153,"k":0.85,"anchor":[0,0],"bbox":[46,11,2953,167],"bytes":34690,"sha256":"5361931a179c83121cdecb8fbffdb33515407512a901d41a8a9c9e9de795975d"},
    {"key":"ground-sky/cloud-strip-a","file":"ground-sky/cloud-strip-a.webp","ow":4096,"oh":600,"w":2458,"h":360,"k":0.6001,"anchor":[0,0],"bbox":[0,156,4095,443],"bytes":100388,"sha256":"d4f8e328b597ffee2b2e710c9c0fcd391049bf4c063a83b52432117ddc64b96f"},
    {"key":"ground-sky/cloud-strip-b","file":"ground-sky/cloud-strip-b.webp","ow":4096,"oh":600,"w":2458,"h":360,"k":0.6001,"anchor":[0,0],"bbox":[0,195,4095,402],"bytes":106586,"sha256":"66b6acf6aaf97546f80caca6eb0e016bb62f29640980ed8274f15ac3b2a7a221"},
    {"key":"ground-sky/cloud-strip-c","file":"ground-sky/cloud-strip-c.webp","ow":4096,"oh":600,"w":2458,"h":360,"k":0.6001,"anchor":[0,0],"bbox":[0,184,4095,415],"bytes":115246,"sha256":"786c528d248dced3ff8e9f57213bac9052060bfd8f7de6913d14bb994d455b77"},
    {"key":"ground-sky/plain-tile-a","file":"ground-sky/plain-tile-a.webp","ow":4096,"oh":700,"w":3482,"h":595,"k":0.8501,"anchor":[0,0],"bbox":[0,0,4095,699],"bytes":197038,"sha256":"99b990b8547d6201de3be6508a9d611308779a0d177dc7bf058fcd08bc317fc3"},
    {"key":"ground-sky/plain-tile-b","file":"ground-sky/plain-tile-b.webp","ow":4096,"oh":700,"w":3482,"h":595,"k":0.8501,"anchor":[0,0],"bbox":[0,0,4095,699],"bytes":180504,"sha256":"cfd09f7b906866403b8e29f909d62ec4283c44b9b1c61d8d79a8260c451715dc"},
    {"key":"ground-sky/plain-tile-c","file":"ground-sky/plain-tile-c.webp","ow":4096,"oh":700,"w":3482,"h":595,"k":0.8501,"anchor":[0,0],"bbox":[0,0,4095,699],"bytes":175576,"sha256":"5c0ac22ebe91dc7b1151a1cf890997f2d2d577c654b4767f4f7ceb4bd7bcc32e"},
    {"key":"ground-sky/ballast-strip-a","file":"ground-sky/ballast-strip-a.webp","ow":4096,"oh":220,"w":2048,"h":110,"k":0.5,"anchor":[0,0],"bbox":[0,23,4095,219],"bytes":66146,"sha256":"480680c8f5fff97dde100e5d9edfe8c4f7fb163db2253f10391d3bcb412e4417"},
    {"key":"ground-sky/ballast-strip-b","file":"ground-sky/ballast-strip-b.webp","ow":4096,"oh":220,"w":2048,"h":110,"k":0.5,"anchor":[0,0],"bbox":[0,15,4095,219],"bytes":70314,"sha256":"a4a5c6f0950151bfebdfbb8c8f1e3306a15f45bd6f3ff68ba9c693bdca9df9b2"},
    {"key":"ground-sky/rail-strip-a","file":"ground-sky/rail-strip-a.webp","ow":4096,"oh":160,"w":2048,"h":80,"k":0.5,"anchor":[0,0],"bbox":[0,8,4095,151],"bytes":43194,"sha256":"1271bc5a3a69d8642f04553d7b01993c6f94782ed299e3f06dba895f6688f538"},
    {"key":"overlay/range-texture-a","file":"overlay/range-texture-a.webp","ow":2048,"oh":1024,"w":2048,"h":1024,"k":1,"anchor":[0,0],"bbox":[0,0,2047,1023],"bytes":392300,"sha256":"b04e23ce1775e7adffae23a54fe1db05c8fdce92c19b0c7496c34ce1f4d177b8"},
    {"key":"overlay/range-texture-b","file":"overlay/range-texture-b.webp","ow":2048,"oh":1024,"w":2048,"h":1024,"k":1,"anchor":[0,0],"bbox":[0,0,2047,1023],"bytes":276534,"sha256":"46dee4f74ba91a81853a5cea5dacfcaa8c1cde77fdbfa2d39ae176ce5c99a989"},
    {"key":"overlay/range-texture-c","file":"overlay/range-texture-c.webp","ow":2048,"oh":1024,"w":2048,"h":1024,"k":1,"anchor":[0,0],"bbox":[0,0,2047,1023],"bytes":257460,"sha256":"e23630ca0fab60f266583fc1e6ee223bb0f8e5bcf16719c52b49a7c448bd58d1"},
    {"key":"overlay/range-texture-d","file":"overlay/range-texture-d.webp","ow":2048,"oh":1024,"w":2048,"h":1024,"k":1,"anchor":[0,0],"bbox":[0,0,2047,1023],"bytes":196684,"sha256":"aedd6ce2a34f0836b5dcf7b0f5ab1cd1ba711a510f63fe7539b01e9878bcbd1c"},
    {"key":"overlay/strata-texture-a","file":"overlay/strata-texture-a.webp","ow":2048,"oh":512,"w":2048,"h":512,"k":1,"anchor":[0,0],"bbox":[0,0,2047,511],"bytes":51166,"sha256":"d4e0aa88d99d999095eaa74c5bd952fb6838a12c250fb7376fbfd7f801f5d588"},
    {"key":"overlay/strata-texture-b","file":"overlay/strata-texture-b.webp","ow":2048,"oh":512,"w":2048,"h":512,"k":1,"anchor":[0,0],"bbox":[0,0,2047,511],"bytes":31360,"sha256":"140e3a57d6c4207b03d32e97b8f8f020aa334a1d2ef1bdcc1b33c977a7caf783"},
    {"key":"overlay/sky-grain-a","file":"overlay/sky-grain-a.webp","ow":2048,"oh":2048,"w":2048,"h":2048,"k":1,"anchor":[0,0],"bbox":[0,0,2047,2047],"bytes":353858,"sha256":"42e03ec3a99fe1205bb2a8302f873d95b1fa2f4e6f21c55a7ac34e945ba431f5"},
    {"key":"overlay/glass-dust-a","file":"overlay/glass-dust-a.webp","ow":2048,"oh":1280,"w":1536,"h":960,"k":0.75,"anchor":[0,0],"bbox":[2048,1280,-1,-1],"bytes":8114,"sha256":"4cbb2900a4112689e9d1e392d660a590f0842d67f1ea18681c3b15cb351ea345"},
    {"key":"overlay/glass-dust-b","file":"overlay/glass-dust-b.webp","ow":2048,"oh":1280,"w":1536,"h":960,"k":0.75,"anchor":[0,0],"bbox":[0,9,2046,1270],"bytes":31454,"sha256":"09acf2b85eeaf0fc4ba190dae90f77e22b155493fdbfebd4d6ca6617ac4f87ca"},
    {"key":"overlay/sun-streak-a","file":"overlay/sun-streak-a.webp","ow":2048,"oh":1280,"w":1536,"h":960,"k":0.75,"anchor":[0,0],"bbox":[162,153,1614,1090],"bytes":141180,"sha256":"456a7d964b3f021bfdce9e3bad8fcbc4ec7f193a3897bd6c4c46259f3139d0d7"},
    {"key":"overlay/sun-streak-b","file":"overlay/sun-streak-b.webp","ow":2048,"oh":1280,"w":1536,"h":960,"k":0.75,"anchor":[0,0],"bbox":[170,141,1566,1102],"bytes":122426,"sha256":"afdfc5cd53e0ac8a922e658a000ef95f3dfa9c4ead2cf9050a61357105be5859"},
    {"key":"overlay/haze-strip-a","file":"overlay/haze-strip-a.webp","ow":4096,"oh":400,"w":2048,"h":200,"k":0.5,"anchor":[0,0],"bbox":[0,126,4095,276],"bytes":40102,"sha256":"b5f740b71800f4aa2f1977a09278c260f226014b17c4e3e1ce46598f9db99bc7"},
    {"key":"overlay/haze-strip-b","file":"overlay/haze-strip-b.webp","ow":4096,"oh":400,"w":2048,"h":200,"k":0.5,"anchor":[0,0],"bbox":[0,138,4095,278],"bytes":41262,"sha256":"a52f329597444fa1f053e410ea084ea4403b4f38fa791b0f36ed3b92553f7a12"},
  ]);
  // END TABLE

  const base = (() => { try { return new URL('./assets/terrain/', root.document.currentScript.src).href; } catch (_) { return null; } })();
  const byKey = new Map(TABLE.map(t => [t.key, t]));
  let state = 'idle', promise = null;
  const images = new Map(), derivedMap = new Map();
  function canvasOf(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let c = null;
    if (typeof root.OffscreenCanvas === 'function') c = new root.OffscreenCanvas(w, h);
    else if (root.document && root.document.createElement) c = root.document.createElement('canvas');
    if (!c) return null;
    c.width = w; c.height = h;
    return c;
  }
  function pixels(img) {
    const c = canvasOf(img.naturalWidth || img.width, img.naturalHeight || img.height), g = c && c.getContext('2d', {willReadFrequently: true});
    if (!g || typeof g.getImageData !== 'function') throw Error('no canvas to read pictures');
    g.drawImage(img, 0, 0);
    return {c, g, d: g.getImageData(0, 0, c.width, c.height)};
  }
  // A neutral-grey texture (mean 50 % grey) as one layer that does on any colour roughly what 'soft-light' does with it,
  // painted with ordinary source-over (so it can go into a transparent tile): white where the grey is over half, black
  // where it is under, alpha = |2 s - 1|. Drawn at globalAlpha ~ .45 it lightens / darkens a mid colour by about as much
  // as soft light would (the exact soft-light change depends on the colour under it, which a tile does not have).
  function softLayer(img) {
    const {c, g, d} = pixels(img), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const s = (p[i] + p[i + 1] + p[i + 2]) / 765, v = s > .5 ? 255 : 0;
      p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = Math.round(Math.abs(2 * s - 1) * 255);
    }
    g.putImageData(d, 0, 0);
    return c;
  }
  // a haze strip with its alpha stretched so its densest point is opaque (the look keeps its own strength in globalAlpha)
  function hazeLayer(img) {
    const {c, g, d} = pixels(img), p = d.data;
    let peak = 1;
    for (let i = 3; i < p.length; i += 4) if (p[i] > peak) peak = p[i];
    for (let i = 0; i < p.length; i += 4) { p[i] = p[i + 1] = p[i + 2] = 255; p[i + 3] = Math.min(255, Math.round(p[i + 3] * 255 / peak)); }
    g.putImageData(d, 0, 0);
    return c;
  }
  const DERIVED = [
    ...['a', 'b', 'c', 'd'].map(v => ['soft:range-' + v, 'overlay/range-texture-' + v, softLayer]),
    ...['a', 'b'].map(v => ['soft:strata-' + v, 'overlay/strata-texture-' + v, softLayer]),
    ...['a', 'b'].map(v => ['haze:' + v, 'overlay/haze-strip-' + v, hazeLayer])];
  function load() {
    if (promise) return promise;
    if (!base || typeof root.Image !== 'function' || !TABLE.length) { state = 'none'; return (promise = Promise.resolve(false)); }
    state = 'loading';
    promise = Promise.all(TABLE.map(t => {
      const img = new root.Image();
      img.decoding = 'async';
      img.src = base + t.file;
      return Promise.resolve(img.decode ? img.decode() : null).then(() => { images.set(t.key, img); });
    })).then(() => {
      for (const [name, key, make] of DERIVED) derivedMap.set(name, make(images.get(key)));
      state = 'ready';
      return true;
    }).catch(() => { state = 'failed'; images.clear(); derivedMap.clear(); return false; });
    return promise;
  }
  const api = Object.freeze({
    TABLE, ready: load, isReady: () => state === 'ready', state: () => state,
    get: key => { const t = byKey.get(key), img = state === 'ready' ? images.get(key) : null; return t && img ? Object.assign({img}, t) : null; },
    derived: name => state === 'ready' ? derivedMap.get(name) || null : null,
    files: () => TABLE.map(t => ({file: t.file, bytes: t.bytes, sha256: t.sha256}))
  });
  root.XinScoreTerrainAssets = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
