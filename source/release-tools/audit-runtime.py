"""Report actual imports under isolated Python, not just package availability."""
import importlib
import importlib.metadata
import json
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
modules = sys.argv[2:]
loaded = {}
for name in modules:
    if name == 'msaf':
        spec = importlib.util.spec_from_file_location('xld_msaf_adapter', root / 'scripts/analysis/runner.py')
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        adapter.patch_legacy_msaf_runtime()
    module = importlib.import_module(name)
    loaded[name] = str(Path(module.__file__).resolve()) if module.__file__ else None
paths = [str(Path(item).resolve()) for item in sys.path if item]
imported = [str(Path(module.__file__).resolve()) for name, module in list(sys.modules.items()) if getattr(module, '__file__', None) and not module.__file__.startswith('<') and Path(module.__file__).is_file() and Path(module.__file__).resolve() != Path(__file__).resolve()]
external = sorted({item for item in paths + imported if not Path(item).is_relative_to(root)})
versions = sorted({(dist.metadata.get('Name', '?'), dist.version) for dist in importlib.metadata.distributions()})
print(json.dumps({'ok': not external, 'executable': sys.executable, 'version': sys.version, 'isolated': sys.flags.isolated, 'paths': paths, 'modules': loaded, 'external': external, 'packages': versions}))
raise SystemExit(bool(external))
