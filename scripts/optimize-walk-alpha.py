"""Recompress WebP transparency without re-encoding its existing colour bitstream.

Requires Pillow and Google's cwebp utility. Writes a new output directory only.
Every output must decode to the exact same RGBA pixels before it is accepted.
The ALPH/VP8 separation is defined in https://developers.google.com/speed/webp/docs/riff_container.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess

from PIL import Image


def chunks(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("Expected a WebP RIFF file")
    if struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
        raise ValueError("Unexpected RIFF length")
    entries = []
    offset = 12
    while offset + 8 <= len(data):
        size = struct.unpack_from("<I", data, offset + 4)[0]
        entries.append((data[offset:offset + 4], data[offset + 8:offset + 8 + size]))
        offset += 8 + size + (size % 2)
    if offset != len(data):
        raise ValueError("Unexpected WebP chunk boundary")
    return entries


def sha(data):
    return hashlib.sha256(data).hexdigest()


def optimize(source, output, encoder):
    original = source.read_bytes()
    original_chunks = chunks(original)
    colour = next(data for kind, data in original_chunks if kind == b"VP8 ")
    old_alpha = next(data for kind, data in original_chunks if kind == b"ALPH")
    image = Image.open(source).convert("RGBA")
    pixels = image.tobytes()
    intermediate = output / (source.stem + ".encoder.webp")
    # The temporary colour encoding is discarded. Only its lossless alpha is retained.
    subprocess.run(
        [str(encoder), "-quiet", "-m", "6", "-q", "0", "-alpha_q", "100",
         "-alpha_filter", "best", "-exact", str(source), "-o", str(intermediate)],
        check=True, capture_output=True,
        creationflags=0x08000000 if os.name == "nt" else 0,
    )
    alpha = next(data for kind, data in chunks(intermediate.read_bytes()) if kind == b"ALPH")
    # Preserve preprocessing/reserved flags while retaining the new compression/filter bits.
    alpha = bytes([(alpha[0] & 0x0f) | (old_alpha[0] & 0xf0)]) + alpha[1:]
    entries = [(kind, alpha if kind == b"ALPH" else data) for kind, data in original_chunks]
    body = b"WEBP" + b"".join(
        kind + struct.pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")
        for kind, data in entries
    )
    candidate = b"RIFF" + struct.pack("<I", len(body)) + body
    if Image.open(io.BytesIO(candidate)).convert("RGBA").tobytes() != pixels:
        raise ValueError(f"Decoded pixels changed: {source.name}")
    if next(data for kind, data in chunks(candidate) if kind == b"VP8 ") != colour:
        raise ValueError(f"Colour bitstream changed: {source.name}")
    accepted = candidate if len(candidate) < len(original) else original
    target = output / source.name
    with target.open("xb") as file:
        file.write(accepted)
    intermediate.unlink()
    return {
        "file": source.name,
        "width": image.width,
        "height": image.height,
        "beforeBytes": len(original),
        "afterBytes": len(accepted),
        "beforeSha256": sha(original),
        "afterSha256": sha(accepted),
        "rgbaSha256": sha(pixels),
        "colourBitstreamSha256": sha(colour),
        "rgbaIdentical": True,
        "colourBitstreamPreserved": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cwebp", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=[1, 2], default=2)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.input.resolve()):
        raise ValueError("Output must be separate from source artwork")
    sources = sorted(args.input.glob("*.webp"))
    if not sources:
        raise ValueError("No walking atlases found")
    args.output.mkdir(parents=True, exist_ok=False)
    version = subprocess.check_output([str(args.cwebp), "-version"], text=True).strip().splitlines()[0]
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(optimize, source, args.output, args.cwebp) for source in sources]
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(f"{len(results)}/{len(sources)} {result['file']}: "
                  f"{result['beforeBytes'] - result['afterBytes']} bytes saved; pixels identical", flush=True)
    results.sort(key=lambda result: result["file"])
    report = {
        "encoder": "cwebp " + version,
        "beforeBytes": sum(result["beforeBytes"] for result in results),
        "afterBytes": sum(result["afterBytes"] for result in results),
        "files": results,
    }
    (args.output / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: value for key, value in report.items() if key != "files"}), flush=True)


if __name__ == "__main__":
    main()
