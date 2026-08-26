#!/usr/bin/env python3
"""Fail CI if public hero sources are unavailable, undersized, or portrait-like."""
from __future__ import annotations
import struct
import urllib.request
from pathlib import Path

ASSET_FILE = Path("frontend/src/components/public/heroAssets.ts")
EXPECTED = {
    "home": 4622108,
    "student": 18012463,
    "school": 35551059,
    "parent": 8054840,
    "learn": 4308093,
    "competition": 6208709,
    "communities": 20556421,
    "admin": 4308104,
}
MIN_WIDTH = 2400
MIN_HEIGHT = 1200
MIN_BYTES = 120_000
MIN_RATIO = 1.35
MAX_RATIO = 2.40

def jpeg_size(data: bytes) -> tuple[int, int]:
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("response is not JPEG")
    i = 2
    sof = {0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF}
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        while i < len(data) and data[i] == 0xFF:
            i += 1
        marker = data[i]
        i += 1
        if marker in {0xD8, 0xD9}:
            continue
        if i + 2 > len(data):
            break
        length = struct.unpack(">H", data[i:i+2])[0]
        if marker in sof:
            if i + 7 > len(data):
                break
            height, width = struct.unpack(">HH", data[i+3:i+7])
            return width, height
        if length < 2:
            break
        i += length
    raise ValueError("JPEG dimensions not found")

text = ASSET_FILE.read_text(encoding="utf-8")
for key, photo_id in EXPECTED.items():
    token = f"{key}: pexels({photo_id})"
    if token not in text:
        raise SystemExit(f"FAILED: {token} is missing from {ASSET_FILE}")

for key, photo_id in EXPECTED.items():
    url = f"https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w=3840&fm=jpg"
    req = urllib.request.Request(url, headers={"User-Agent": "VidyaSetu-CI/1.0", "Accept": "image/jpeg"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            content_type = response.headers.get("Content-Type", "")
    except Exception as exc:
        raise SystemExit(f"FAILED: {key} hero source could not be downloaded: {exc}") from exc
    if "image/" not in content_type:
        raise SystemExit(f"FAILED: {key} returned {content_type!r}, not an image")
    if len(data) < MIN_BYTES:
        raise SystemExit(f"FAILED: {key} image is suspiciously small: {len(data)} bytes")
    try:
        width, height = jpeg_size(data)
    except ValueError as exc:
        raise SystemExit(f"FAILED: {key}: {exc}") from exc
    ratio = width / height
    print(f"{key:12} {width}x{height}  {len(data)/1024:.0f} KB  ratio={ratio:.2f}")
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise SystemExit(f"FAILED: {key} is below {MIN_WIDTH}x{MIN_HEIGHT}: {width}x{height}")
    if not (MIN_RATIO <= ratio <= MAX_RATIO):
        raise SystemExit(f"FAILED: {key} is not wide/environmental enough: ratio={ratio:.2f}")

print("Hero source quality gate passed.")
