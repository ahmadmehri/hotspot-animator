"""Tiny color and string helpers used by the renderer and UI."""

from __future__ import annotations


def parse_hex(color: str) -> tuple:
    """Parse a hex color string (#rgb, #rrggbb, or #rrggbbaa) into an (r, g, b, a) tuple.

    Each channel is 0-255. Accepts an alpha channel if present.
    Falls back to opaque white for unparseable input.
    """
    if not isinstance(color, str):
        return (255, 255, 255, 255)
    s = color.strip()
    if s.startswith("#"):
        s = s[1:]
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) == 6:
        try:
            r = int(s[0:2], 16)
            g = int(s[2:4], 16)
            b = int(s[4:6], 16)
            return (r, g, b, 255)
        except ValueError:
            return (255, 255, 255, 255)
    if len(s) == 8:
        try:
            r = int(s[0:2], 16)
            g = int(s[2:4], 16)
            b = int(s[4:6], 16)
            a = int(s[6:8], 16)
            return (r, g, b, a)
        except ValueError:
            return (255, 255, 255, 255)
    return (255, 255, 255, 255)


def hex_with_alpha(color: str, alpha: float) -> tuple:
    """Parse a hex color and combine it with a 0-1 alpha, returning an (r, g, b, a) tuple."""
    r, g, b, a = parse_hex(color)
    out_a = int(round(a * max(0.0, min(1.0, alpha))))
    return (r, g, b, out_a)


def format_bytes(n: int) -> str:
    """Format a byte count as a human-readable string."""
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / 1024 / 1024:.2f} MB"


def safe_filename(name: str) -> str:
    """Sanitize a user-provided filename: strip path separators and control chars."""
    cleaned = "".join(
        ch if (ch.isprintable() and ch not in '<>:"/\\|?*') else "-"
        for ch in name
    )
    cleaned = " ".join(cleaned.split()).strip()
    return cleaned or "hotspot"
