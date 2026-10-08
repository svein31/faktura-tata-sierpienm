#!/usr/bin/env python3
"""Recreate the locally hosted UI font subsets from the existing licensed Inter files.

Run with fontTools[woff] installed in a development-only Python environment;
the application and CI build require no Python or network font downloads.
"""

import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


def write_subset(source: Path, destination: Path, unicode_ranges: str) -> set[int]:
    font = TTFont(source, lazy=False, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=subset.parse_unicodes(unicode_ranges))
    worker.subset(font)
    # OFL derivatives use their own family name and retain the original copyright.
    for name in font["name"].names:
        if name.nameID in {1, 3, 4, 6, 16, 25}:
            family = "FakturaProstoSans" if name.nameID in {3, 6, 25} else "FakturaProsto Sans"
            name.string = family.encode(name.getEncoding())
    font.flavor = "woff2"
    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(destination)
    return set(font.getBestCmap())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--latin-source", type=Path, required=True)
    parser.add_argument("--extended-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("src/app/fonts"))
    args = parser.parse_args()
    latin = write_subset(args.latin_source, args.output / "fakturaprosto-sans-latin-variable.woff2",
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
        "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
    extended = write_subset(args.extended_source, args.output / "fakturaprosto-sans-extended-variable.woff2",
        "U+0100-017F,U+20A0-20AB")
    assert all(ord(char) in latin | extended for char in "Zażółć gęślą jaźń 0123456789 € zł – …")
    for filename in sorted(args.output.glob("*.woff2")):
        print(f"{filename}: {filename.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
