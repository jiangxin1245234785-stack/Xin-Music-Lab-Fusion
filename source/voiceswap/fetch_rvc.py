"""Download the community RVC models in `rvc_models.py` into the Applio addon.

    python -I source/voiceswap/fetch_rvc.py all
    python -I source/voiceswap/fetch_rvc.py miku iu
    python -I source/voiceswap/fetch_rvc.py --list

Each model lands in `<addon>/models/<name>/` as `model.pth`, `model.index` and `model.json`,
outside the repo with the rest of the addon. Run it with `-I`: what it reads is downloaded
from strangers.

That is also why nothing here trusts the download beyond what it has to:
- every file is checked against the sha256 pinned in the catalog before it is kept;
- an archive is never extracted — the one `.pth` and one `.index` wanted are read out of
  it by name and written under names chosen here, so a hostile member path goes nowhere;
- the checkpoint is opened with `weights_only=True`, as Applio itself opens it, which
  refuses a pickle that would run code instead of holding tensors.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
ADDON = Path(os.environ.get('XLD_APPLIO_ROOT') or REPO / 'runtime' / 'addons' / 'applio-v1')
sys.path.insert(0, str(HERE))

import rvc_models as catalog


def download(repo, revision, path, destination, attempts=4):
    """Fetch one file of a pinned revision, retrying the transient failures HF serves."""
    url = (f'https://huggingface.co/{repo}/resolve/{revision}/'
           + urllib.parse.quote(path))
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=60) as response, destination.open('wb') as out:
                shutil.copyfileobj(response, out, 1 << 20)
            return
        except OSError as error:
            if attempt == attempts:
                raise SystemExit(f'下载失败：{url}\n{error}')
            print(f'    第 {attempt} 次没下下来（{error}），{2 ** attempt}s 后重试', flush=True)
            time.sleep(2 ** attempt)


def sha256(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def pick_members(archive, wanted=None):
    """The inference checkpoint and the retrieval index inside a model archive.

    Some archives hold the same voice at several epochs; the catalog then names the one
    to take (`member`), and nothing else in the archive is read.

    Archives often also carry training checkpoints (`G_*.pth`, `D_*.pth`) and the small
    `trained_*.index`; the inference model is the other `.pth`, and the index to use is
    the `added_*` one — the same rule Applio applies when it rewrites "trained" to "added".
    """
    names = [n for n in archive.namelist() if not n.endswith('/')]
    stem = lambda n: n.replace('\\', '/').rsplit('/', 1)[-1]
    models = [n for n in names if n.lower().endswith('.pth')
              and not stem(n).startswith(('G_', 'D_'))]
    if wanted:
        models = [n for n in models if stem(n) == wanted]
    indexes = [n for n in names if n.lower().endswith('.index')]
    added = [n for n in indexes if stem(n).startswith('added')]
    indexes = added or [n for n in indexes if not stem(n).startswith('trained')] or indexes
    if len(models) != 1 or len(indexes) > 1:
        raise SystemExit(f'压缩包里认不出唯一的模型和索引：{names}')
    return models[0], (indexes[0] if indexes else None)


def describe(checkpoint_path):
    """Read what the checkpoint says about itself, refusing anything that is not tensors."""
    import torch

    cpt = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    if not isinstance(cpt, dict) or 'weight' not in cpt or 'config' not in cpt:
        raise SystemExit(f'{checkpoint_path} 不是 RVC 推理模型（缺 weight/config）')
    return {'sampleRate': int(cpt['config'][-1]), 'version': cpt.get('version', 'v1'),
            'f0': int(cpt.get('f0', 1)), 'vocoder': cpt.get('vocoder', 'HiFi-GAN'),
            'embedder': cpt.get('embedder_model') or 'contentvec',
            'epoch': cpt.get('epoch') or cpt.get('info')}


def fetch(name, recipe, root):
    target = root / name
    if (target / 'model.json').is_file():
        print(f'  {name:<10} 已有，跳过')
        return
    began = time.monotonic()
    with tempfile.TemporaryDirectory(dir=root) as scratch:
        scratch = Path(scratch)
        staged = scratch / 'staged'
        staged.mkdir()
        for number, (path, expected) in enumerate(recipe['sha256'].items()):
            local = scratch / f'download-{number}'
            print(f'  {name:<10} 下载 {path} …', flush=True)
            download(recipe['repo'], recipe['revision'], path, local)
            if sha256(local) != expected:
                raise SystemExit(f'{name}：{path} 的 sha256 和目录表里钉的不一致，没有保留')
            if 'archive' in recipe:
                with zipfile.ZipFile(local) as archive:
                    model, index = pick_members(archive, recipe.get('member'))
                    for member, kept in ((model, 'model.pth'), (index, 'model.index')):
                        if member:
                            with archive.open(member) as src, (staged / kept).open('wb') as dst:
                                shutil.copyfileobj(src, dst, 1 << 20)
                    picked = {'model': model, 'index': index}
            else:
                kept = 'model.pth' if path == recipe['model'] else 'model.index'
                local.replace(staged / kept)
                picked = {'model': recipe['model'], 'index': recipe.get('index')}

        record = dict(name=name, label=recipe['label'], repo=recipe['repo'],
                      revision=recipe['revision'], license=recipe['license'], who=recipe['who'],
                      octave=recipe['octave'], picked=picked,
                      sha256={p.name: sha256(p) for p in staged.iterdir()},
                      checkpoint=describe(staged / 'model.pth'),
                      fetched=time.strftime('%Y-%m-%d %H:%M'))
        (staged / 'model.json').write_text(json.dumps(record, ensure_ascii=False, indent=2),
                                           encoding='utf-8')
        if target.exists():
            shutil.rmtree(target)
        staged.replace(target)
    info = record['checkpoint']
    print(f'  {name:<10} {time.monotonic() - began:4.0f}s  {info["version"]} {info["sampleRate"]} Hz  '
          f'{info["vocoder"]}  embedder={info["embedder"]}  '
          f'{"有" if (target / "model.index").is_file() else "无"}索引', flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description='下载社区 RVC 模型到 Applio addon')
    parser.add_argument('names', nargs='*', help='模型名，或 all')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args(argv)

    root = ADDON / 'models'
    if args.list or not args.names:
        for name, recipe in catalog.MODELS.items():
            have = '' if (root / name / 'model.json').is_file() else '  （未下载）'
            print(f'  {name:<10} {recipe["label"]}  [{recipe["who"]} · {recipe["license"]}]{have}')
        return 0
    names = list(catalog.MODELS) if args.names == ['all'] else args.names
    unknown = [n for n in names if n not in catalog.MODELS]
    if unknown:
        raise SystemExit(f'未知模型：{", ".join(unknown)}；--list 看有哪些')
    if not ADDON.is_dir():
        raise SystemExit(f'找不到 Applio addon：{ADDON}（设 XLD_APPLIO_ROOT，或按 SPEC.md 装一次）')
    root.mkdir(exist_ok=True)
    for name in names:
        fetch(name, catalog.MODELS[name], root)
    return 0


if __name__ == '__main__':
    sys.exit(main())
