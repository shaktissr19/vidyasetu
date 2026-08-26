#!/usr/bin/env python3
"""Fail CI if approved local public PNG assets are missing, duplicated, undersized, or portrait-like."""
from __future__ import annotations

import hashlib
import struct
from pathlib import Path

HERO_ROOT = Path("frontend/public/images/heroes")
CARD_ROOT = Path("frontend/public/images/home-cards")
HEROES = {
    "home": HERO_ROOT / "home-hero.png",
    "student": HERO_ROOT / "students-hero.png",
    "school": HERO_ROOT / "schools-hero.png",
    "parent": HERO_ROOT / "parents-hero.png",
    "learn": HERO_ROOT / "learn-hero.png",
    "competition": HERO_ROOT / "competition-hero.png",
    "communities": HERO_ROOT / "communities-hero.png",
    "admin": HERO_ROOT / "platform-admin-hero.png",
}
HOME_CARDS = {
    "home-student": CARD_ROOT / "home-students.png",
    "home-school": CARD_ROOT / "home-schools.png",
    "home-parent": CARD_ROOT / "home-parents.png",
    "home-learning": CARD_ROOT / "home-learning.png",
    "home-competition": CARD_ROOT / "home-competitions.png",
    "home-communities": CARD_ROOT / "home-communities.png",
}

HERO_MIN_WIDTH = 2000
HERO_MIN_HEIGHT = 1000
CARD_MIN_WIDTH = 900
CARD_MIN_HEIGHT = 480
MIN_RATIO = 1.35
MAX_RATIO = 2.40


def png_size(data: bytes) -> tuple[int, int]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("file is not PNG")
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ValueError("PNG IHDR is missing")
    return struct.unpack(">II", data[16:24])


def validate(label: str, path: Path, min_width: int, min_height: int) -> str:
    if not path.is_file():
        raise SystemExit(f"FAILED: required approved image is missing: {path}")
    data = path.read_bytes()
    if len(data) < 25_000:
        raise SystemExit(f"FAILED: {label} image is suspiciously small: {len(data)} bytes")
    try:
        width, height = png_size(data)
    except ValueError as exc:
        raise SystemExit(f"FAILED: {label}: {exc}") from exc
    ratio = width / height
    print(f"{label:20} {width}x{height}  {len(data)/1024:.0f} KB  ratio={ratio:.2f}")
    if width < min_width or height < min_height:
        raise SystemExit(f"FAILED: {label} is below {min_width}x{min_height}: {width}x{height}")
    if not (MIN_RATIO <= ratio <= MAX_RATIO):
        raise SystemExit(f"FAILED: {label} is not a suitable landscape composition: ratio={ratio:.2f}")
    return hashlib.sha256(data).hexdigest()


hashes: dict[str, str] = {}
for key, path in HEROES.items():
    hashes[key] = validate(key, path, HERO_MIN_WIDTH, HERO_MIN_HEIGHT)
for key, path in HOME_CARDS.items():
    hashes[key] = validate(key, path, CARD_MIN_WIDTH, CARD_MIN_HEIGHT)

seen: dict[str, str] = {}
for label, digest in hashes.items():
    if digest in seen:
        raise SystemExit(f"FAILED: duplicate public image detected: {label} is identical to {seen[digest]}")
    seen[digest] = label

print("Local PNG public image quality and uniqueness gate passed.")
