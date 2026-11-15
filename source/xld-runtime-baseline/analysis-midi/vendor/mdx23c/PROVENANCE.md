# MDX23C (TFC-TDF-Net v3) model code

Repository: https://github.com/ZFTurbo/Music-Source-Separation-Training (MIT, see LICENSE)
File: models/mdx23c_tfc_tdf_v3.py, fetched 2026-09-18 from the main branch (upstream SHA-256 of the fetched file: 7,121 bytes, see work/drums-stems-20260918/HANDOFF.md).
Modification: the import `from utils.model_utils import prefer_target_instrument` is replaced by an inlined copy of that two-line helper so the module depends on torch only. Architecture, STFT and forward pass are unchanged.

Weights are NOT vendored. The DrumSep 6-stem checkpoint (aufr33 & jarredou, CC BY-NC-ND 4.0) lives in runtime/addons/drumsep-v1 and is resolved through XLD_DRUMSEP_ROOT; see that addon's manifest for provenance.
