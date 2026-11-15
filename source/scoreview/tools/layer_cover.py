"""The album cover for the score view's backdrop, small enough to travel inside the model.

    python layer_cover.py <folder that holds the original audio file> <out.json>

Looks for a picture beside the original file (cover / folder / front / album, jpg or png;
failing that the only picture in the folder), shrinks it and writes it as a data URI. The
record carries the picture's file name but never the folder: models are published.
Needs Pillow, so it runs in an environment that has it (make_layers.py picks one).
Exit code 3 means "this song has no cover picture", which is not an error.
"""
import base64
import io
import json
import sys
from pathlib import Path

from PIL import Image

NAMES = ('cover', 'folder', 'front', 'album')
KINDS = ('.jpg', '.jpeg', '.png', '.webp')
#: The cover is drawn faded and scaled up to the whole canvas; more pixels than this are not seen.
SIDE = 480
QUALITY = 72


def find(folder):
    pictures = sorted(item for item in folder.iterdir() if item.is_file() and item.suffix.lower() in KINDS)
    for name in NAMES:
        for item in pictures:
            if item.stem.lower() == name:
                return item
    return pictures[0] if len(pictures) == 1 else None


def shrink(path):
    image = Image.open(path).convert('RGB')
    image.thumbnail((SIDE, SIDE), Image.LANCZOS)
    packed = io.BytesIO()
    image.save(packed, 'JPEG', quality=QUALITY, optimize=True)
    return image.size, packed.getvalue()


def main(argv):
    folder, out = Path(argv[1]), Path(argv[2])
    picture = find(folder)
    if not picture:
        print('这首歌的原文件旁边没有封面图片')
        return 3
    (width, height), data = shrink(picture)
    record = {'src': 'data:image/jpeg;base64,' + base64.b64encode(data).decode('ascii'),
              'width': width, 'height': height, 'file': picture.name, 'bytes': len(data)}
    out.write_text(json.dumps(record), encoding='utf-8')
    print(f'封面：{picture.name} → {width}×{height}，{len(data) // 1024} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
