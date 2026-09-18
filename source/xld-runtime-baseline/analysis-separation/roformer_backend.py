"""Pinned BS-RoFormer model; CPU overlap-add keeps long songs off GPU memory.

Window/padding follow openmirlab/bs-roformer-infer utils.demix_track at
90346ad4a4db7334f3378054a46adf7280b72f73 (MIT). Accumulation stays on CPU,
the common window counter is one-dimensional, and invalid samples fail visibly.
"""
import hashlib
import importlib.metadata
import os
from pathlib import Path

CODE_REVISION = "90346ad4a4db7334f3378054a46adf7280b72f73"


def model_directory():
    return Path(os.environ.get("XLD_ROFORMER_MODELS", "D:/Caches/codex/models/xld-roformer"))


def verified_file(item):
    file = model_directory() / item["file"]
    digest = hashlib.sha256()
    with file.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != item["sha256"]:
        raise ValueError("RoFormer 模型文件校验失败：" + file.name)
    return file


def separate(mix, profile, device, notify):
    import numpy as np
    import torch
    import yaml
    from contextlib import nullcontext
    from ml_collections import ConfigDict
    from bs_roformer.inference import SafeLoaderWithTuple
    from bs_roformer.utils import get_model_from_config, load_checkpoint_state

    checkpoint, config_file = verified_file(profile["checkpoint"]), verified_file(profile["config"])
    config = ConfigDict(yaml.load(config_file.read_text(encoding="utf-8"), Loader=SafeLoaderWithTuple))
    options = profile["options"]
    if config.audio.sample_rate != 44100 or config.audio.chunk_size != options["chunkSize"] or config.inference.num_overlap != options["numOverlap"]:
        raise ValueError("RoFormer 配置与分轨参数不一致")
    model = get_model_from_config("bs_roformer", config)
    model.load_state_dict(load_checkpoint_state(checkpoint, map_location="cpu"), strict=True)
    model.to(device).eval()
    names = list(config.training.instruments)
    frames = mix.shape[-1]
    chunk_size = options["chunkSize"]
    step, fade = chunk_size // options["numOverlap"], chunk_size // 10
    border = chunk_size - step
    padded = frames > 2 * border and border > 0
    if padded:
        mix = torch.nn.functional.pad(mix, (border, border), mode="reflect")
    total = mix.shape[-1]
    result = np.zeros((len(names), 2, total), dtype=np.float32)
    counter = np.zeros(total, dtype=np.float32)
    window = np.ones(chunk_size, dtype=np.float32)
    window[:fade] = np.linspace(0, 1, fade)
    window[-fade:] = np.linspace(1, 0, fade)
    count = (total + step - 1) // step
    with torch.inference_mode():
        for index, start in enumerate(range(0, total, step)):
            part = mix[:, start:start + chunk_size]
            length = part.shape[-1]
            if length < chunk_size:
                part = torch.nn.functional.pad(part, (0, chunk_size - length), mode="reflect" if length > chunk_size // 2 + 1 else "constant")
            precision = torch.autocast("cuda") if device == "cuda" else nullcontext()
            with precision:
                predicted = model(part[None].to(device))[0]
            values = predicted[..., :length].float().cpu().numpy()
            if not np.isfinite(values).all():
                raise ValueError("RoFormer 输出包含无效采样")
            weights = window.copy()
            if start == 0:
                weights[:fade] = 1
            elif start + chunk_size >= total:
                weights[-fade:] = 1
            result[..., start:start + length] += values * weights[:length]
            counter[start:start + length] += weights[:length]
            del predicted, values
            notify(f"BS-RoFormer 分轨 {index + 1}/{count}", .12 + .73 * (index + 1) / count, "separate")
    if np.any(counter <= 0):
        raise ValueError("RoFormer 分块边界不完整")
    result /= counter
    if padded:
        result = result[..., border:-border]
    if result.shape != (6, 2, frames):
        raise ValueError("RoFormer 输出时长或声部数量不一致")
    backend = {"name": "bs-roformer-infer", "version": importlib.metadata.version("bs-roformer-infer"),
               "codeRevision": CODE_REVISION, "checkpointSha256": profile["checkpoint"]["sha256"],
               "configSha256": profile["config"]["sha256"], "accumulation": "cpu"}
    return names, torch.from_numpy(result), backend
