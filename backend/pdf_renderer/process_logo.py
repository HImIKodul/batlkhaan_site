#!/usr/bin/env python3
"""Company-logo intake. Reads ONE untrusted image from stdin and either rejects it (exit 2, one-line reason on stderr)
or writes a normalised PNG to --output and a JSON description to stdout.

Policy (all enforced here, never trusted from the client):
  * the real format is decided by decoding with Pillow, not by file name or declared content type; only PNG, JPEG and WebP are accepted
  * size limits: input <= MAX_BYTES, decoded pixels <= MAX_PIXELS (decompression-bomb guard), each side between MIN_SIDE and MAX_SIDE
  * animated images (more than one frame) are rejected
  * the image is fully decoded (Image.load) and then RE-ENCODED from raw pixels as a new PNG: every metadata block (EXIF, XMP, ICC, text chunks,
    trailing data, embedded files, polyglot payloads) is dropped; transparency is kept; the result is scaled to fit OUT_BOX x OUT_BOX
  * the output carries no attacker-chosen bytes beyond pixel values."""
import argparse
import hashlib
import json
import sys
from io import BytesIO

from PIL import Image, ImageOps

MAX_BYTES = 1_500_000
MAX_PIXELS = 16_000_000
MIN_SIDE = 32
MAX_SIDE = 4096
OUT_BOX = 512
ALLOWED = {"PNG", "JPEG", "WEBP"}


def reject(reason):
    sys.stderr.write(reason + "\n")
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    raw = sys.stdin.buffer.read(MAX_BYTES + 1)
    if not raw:
        reject("EMPTY")
    if len(raw) > MAX_BYTES:
        reject("TOO_LARGE")
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        probe = Image.open(BytesIO(raw))
        fmt = probe.format
        if fmt not in ALLOWED:
            reject("UNSUPPORTED_FORMAT")
        w, h = probe.size
        if w * h > MAX_PIXELS:
            reject("TOO_MANY_PIXELS")
        if w < MIN_SIDE or h < MIN_SIDE:
            reject("TOO_SMALL")
        if w > MAX_SIDE or h > MAX_SIDE:
            reject("DIMENSIONS_TOO_LARGE")
        if getattr(probe, "n_frames", 1) > 1 or getattr(probe, "is_animated", False):
            reject("ANIMATED")
        probe.verify()
        img = Image.open(BytesIO(raw))
        img.load()
    except SystemExit:
        raise
    except Exception:
        reject("NOT_A_VALID_IMAGE")
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if has_alpha else "RGB")
    img.thumbnail((OUT_BOX, OUT_BOX), Image.LANCZOS)
    clean = Image.new(img.mode, img.size)
    clean.paste(img)
    out = BytesIO()
    clean.save(out, format="PNG", optimize=True)
    data = out.getvalue()
    with open(args.output, "wb") as fh:
        fh.write(data)
    sys.stdout.write(json.dumps({"mimeType": "image/png", "width": clean.size[0], "height": clean.size[1], "byteSize": len(data), "sha256": hashlib.sha256(data).hexdigest(), "sourceFormat": fmt, "hasAlpha": has_alpha}))


if __name__ == "__main__":
    main()
