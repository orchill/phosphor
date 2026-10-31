#!/usr/bin/env python3
"""Generate deterministic E2E fixtures (PDFs + PNGs) into frontend/e2e/.fixtures.

Run with the backend venv Python (PyMuPDF + Pillow available):
    .venv/Scripts/python.exe scripts/gen_e2e_fixtures.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import fitz
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "frontend" / "e2e" / ".fixtures"


def make_pdf(name: str, pages: int, marker: str) -> None:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=420, height=300)
        page.insert_text((50, 80), f"{marker} page {i + 1}/{pages}",
                         fontsize=24, fontname="helv", color=(0.1, 0.5, 0.2))
        # a small incompressible-ish content block
        page.draw_rect(fitz.Rect(50, 120, 360, 240), color=(0.2, 0.6, 0.3), width=1.2)
    doc.save(OUT / name, deflate=True)
    doc.close()


def make_png(name: str, color, size=(320, 240)) -> None:
    Image.new("RGB", size, color).save(OUT / name, format="PNG")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    make_pdf("a.pdf", 3, "ALPHA")
    make_pdf("b.pdf", 2, "BETA")
    make_png("red.png", (220, 40, 40))
    make_png("blue.png", (40, 90, 220))
    print(f"fixtures written to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
