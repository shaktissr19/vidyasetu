#!/usr/bin/env python3
"""Validate the local PNGs supplied for the current production visual preview."""
from __future__ import annotations

import hashlib
import struct
from pathlib import Path

READY = {
    "home": (Path("frontend/public/images/heroes/home-hero.png"), 1600, 900, 1.35),
    "student": (Path("frontend/public/images/heroes/students-hero.png"), 1600, 900, 1.35),
    "school": (Path("frontend/public/images/heroes/schools-hero.png"), 1600, 900, 1.35),
    "learn": (Path("frontend/public/images/heroes/learn-hero.png"), 1600, 900, 1.35),
    "home-parent-card": (Path("frontend/public/images/home-cards/home-parents.png"), 1200, 800, 1.25),
}
MAX_RATIO = 2.40


def png_size(data: bytes) -> tuple[int, int]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("file is not PNG")
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ValueError("PNG IHDR is missing")
    return struct.unpack(">II", data[16:24])


def validate(label: str, path: Path, min_width: int, min_height: int, min_ratio: float) -> str:
    if not path.is_file():
        raise SystemExit(f"FAILED: preview image is missing: {path}")
    data = path.read_bytes()
    if len(data) < 25_000:
        raise SystemExit(f"FAILED: {label} is suspiciously small: {len(data)} bytes")
    try:
        width, height = png_size(data)
    except ValueError as exc:
        raise SystemExit(f"FAILED: {label}: {exc}") from exc
    ratio = width / height
    print(f"{label:20} {width}x{height}  {len(data)/1024:.0f} KB  ratio={ratio:.2f}")
    if width < min_width or height < min_height:
        raise SystemExit(f"FAILED: {label} is below preview threshold {min_width}x{min_height}: {width}x{height}")
    if not (min_ratio <= ratio <= MAX_RATIO):
        raise SystemExit(f"FAILED: {label} is not suitable for its landscape slot: ratio={ratio:.2f}")
    return hashlib.sha256(data).hexdigest()


seen: dict[str, str] = {}
for label, (path, min_width, min_height, min_ratio) in READY.items():
    digest = validate(label, path, min_width, min_height, min_ratio)
    if digest in seen:
        raise SystemExit(f"FAILED: duplicate preview image: {label} is identical to {seen[digest]}")
    seen[digest] = label

print("Partial production PNG preview gate passed.")
