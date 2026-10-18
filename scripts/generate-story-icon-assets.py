"""Generate the ordered native launcher-icon sequence from its source artwork."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
STAGE_DIR = ROOT / "store-assets/icon-progression"
SEQUENCE_FILE = STAGE_DIR / "sequence.json"
IOS_ASSETS = ROOT / "ios/App/App/Assets.xcassets"
ANDROID_RES = ROOT / "android/app/src/main/res"
ANDROID_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def generate_primary_icons(image: Image.Image) -> None:
    app_icon = IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png"
    save_png(ImageOps.fit(image.convert("RGB"), (1024, 1024), Image.Resampling.LANCZOS), app_icon)

    for density, size in ANDROID_SIZES.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        icon = ImageOps.fit(image.convert("RGBA"), (size, size), Image.Resampling.LANCZOS)
        save_png(icon, directory / "ic_launcher.png")
        save_png(icon, directory / "ic_launcher_round.png")
        save_png(adaptive_foreground(image, FOREGROUND_SIZES[density]), directory / "ic_launcher_foreground.png")


def generate_ios_alternates(images: list[Image.Image]) -> None:
    for stage, image in enumerate(images[1:], start=2):
        icon_set_name = f"StoryIconStage{stage:02d}"
        icon_set_dir = IOS_ASSETS / f"{icon_set_name}.appiconset"
        filename = f"{icon_set_name}.png"
        save_png(ImageOps.fit(image.convert("RGB"), (1024, 1024), Image.Resampling.LANCZOS), icon_set_dir / filename)
        contents = {
            "images": [
                {
                    "filename": filename,
                    "idiom": "universal",
                    "platform": "ios",
                    "size": "1024x1024",
                }
            ],
            "info": {"author": "xcode", "version": 1},
        }
        (icon_set_dir / "Contents.json").write_text(
            json.dumps(contents, indent=2) + "\n", encoding="utf-8"
        )


def adaptive_foreground(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark_size = round(size * 0.72)
    mark = ImageOps.fit(source.convert("RGBA"), (mark_size, mark_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark_size) // 2, (size - mark_size) // 2))
    return canvas


def generate_android_icons(images: list[Image.Image]) -> None:
    anydpi = ANDROID_RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)

    for stage, image in enumerate(images, start=1):
        resource_name = f"story_icon_stage_{stage:02d}"
        for density, size in ANDROID_SIZES.items():
            directory = ANDROID_RES / f"mipmap-{density}"
            save_png(
                ImageOps.fit(image.convert("RGBA"), (size, size), Image.Resampling.LANCZOS),
                directory / f"{resource_name}.png",
            )
            foreground_size = FOREGROUND_SIZES[density]
            save_png(
                adaptive_foreground(image, foreground_size),
                directory / f"{resource_name}_foreground.png",
            )

        adaptive_xml = f'''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/{resource_name}_foreground" />
</adaptive-icon>
'''
        (anydpi / f"{resource_name}.xml").write_text(adaptive_xml, encoding="utf-8")


def main() -> None:
    sequence = json.loads(SEQUENCE_FILE.read_text(encoding="utf-8"))
    stages = sequence.get("stages")
    if not isinstance(stages, list) or not stages:
        raise ValueError(f"Story icon sequence must define stages: {SEQUENCE_FILE}")
    source_order = [stage.get("source") for stage in stages]
    if source_order != sequence.get("sourceOrder"):
        raise ValueError("Story icon stages do not match the declared source order.")

    images: list[Image.Image] = []
    for stage in stages:
        filename = stage.get("file")
        path = STAGE_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(f"Missing story icon stage: {path}")
        with Image.open(path) as image:
            image.load()
            if image.width != image.height:
                raise ValueError(f"Story icon stage must be square: {path}")
            images.append(image.copy())

    generate_primary_icons(images[0])
    generate_ios_alternates(images)
    generate_android_icons(images)
    print(f"Generated the {len(images)}-stage native icon sequence in the declared order.")


if __name__ == "__main__":
    main()
