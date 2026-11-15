"""Serve the built listening page on 127.0.0.1 for a local look before publishing.

    <envs/basic>/python.exe -X utf8 source/scoreview/tools/serve_page.py [--port 8771]

The standard library's file server ignores `Range` requests, and an `<audio>` element can
only seek in a file whose server honours them; the place the page is published does. So
this is `http.server` plus byte ranges and nothing else. It binds to localhost only, serves
`work/scoreview-20261110/page` and never caches, so a rebuild shows on reload.
"""
import argparse
import http.server
import io
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from make_layers import load_config  # noqa: E402


#: What the Artifact publisher wraps a page in (the page file itself starts at <title>), so
#: the local look has the same doctype, charset, viewport and reset as the published one.
SKELETON = ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);'
            'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}'
            'img{max-width:100%}[hidden]{display:none!important}</style></head><body>')


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        self.span = None
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if path.endswith('.html') and os.path.isfile(path):
            body = (SKELETON + Path(path).read_text(encoding='utf-8') + '</body></html>').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        if not header or not os.path.isfile(path):
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
        size = os.path.getsize(path)
        if not match or (not match.group(1) and not match.group(2)):
            return super().send_head()
        if match.group(1):
            start = int(match.group(1))
            end = min(int(match.group(2)), size - 1) if match.group(2) else size - 1
        else:
            start, end = max(0, size - int(match.group(2))), size - 1
        if start > end or start >= size:
            self.send_error(416, 'Requested Range Not Satisfiable')
            return None
        handle = open(path, 'rb')
        handle.seek(start)
        self.span = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.span))
        self.end_headers()
        return handle

    def copyfile(self, source, output):
        if self.span is None:
            return super().copyfile(source, output)
        left = self.span
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            output.write(chunk)
            left -= len(chunk)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def main(argv=None):
    parser = argparse.ArgumentParser(description='本地预览试听页')
    parser.add_argument('--port', type=int, default=8771)
    args = parser.parse_args(argv)
    root = load_config()['pageRoot']
    if not (root / 'index.html').is_file():
        raise SystemExit(f'{root} 里还没有 index.html，先跑 build_page.py')
    handler = lambda *a, **k: RangeHandler(*a, directory=str(root), **k)
    with http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'http://127.0.0.1:{args.port}/  ←  {root}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    sys.exit(main())
