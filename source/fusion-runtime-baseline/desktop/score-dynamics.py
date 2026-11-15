"""One read-only, cancellable XML score dynamics job; outputs velocity arrays only."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace


def digest(file):
    value = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('request', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text(encoding='utf-8'))
    if args.output.exists() or request.get('schemaVersion') != 1:
        raise ValueError('invalid dynamics request or existing output')
    algorithm = Path(request['algorithmPath'])
    if digest(algorithm) != request['algorithmSha']:
        raise ValueError('dynamics-algorithm-changed')
    sys.path.insert(0, str(algorithm.parent))
    import velocity
    results = {}
    total = len(request['inputs'])
    for index, item in enumerate(request['inputs']):
        print(json.dumps({'completed': index, 'total': total, 'stem': item['stem']}), flush=True)
        if digest(item['notesFile']) != item['notesSha'] or digest(item['audioPath']) != item['audioSha']:
            raise ValueError('dynamics-source-changed')
        body = json.loads(Path(item['notesFile']).read_text(encoding='utf-8'))
        notes = [SimpleNamespace(**note) for note in body['notes']]
        before = [(n.start, n.end, n.pitch) for n in notes]
        if len(notes) != item['count']:
            raise ValueError('dynamics-note-count-changed')
        midi = SimpleNamespace(instruments=[SimpleNamespace(notes=notes)])
        summary = velocity.apply(midi, item['audioPath'], item['options'], group_by_pitch=item['stem'] == 'drums')
        values = [int(n.velocity) for n in notes]
        if before != [(n.start, n.end, n.pitch) for n in notes] or any(v < 1 or v > 127 for v in values):
            raise ValueError('dynamics-output-invalid')
        results[item['stem']] = {'originalDataSha': item['dataSha'], 'velocities': values, 'summary': summary}
        print(json.dumps({'completed': index + 1, 'total': total, 'stem': item['stem']}), flush=True)
    args.output.write_text(json.dumps({'schemaVersion': 1, 'stems': results}), encoding='utf-8')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        raise SystemExit(1)
