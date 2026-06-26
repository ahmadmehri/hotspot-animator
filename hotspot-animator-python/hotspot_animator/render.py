"""Pillow-based renderer for Hotspot Animator.

Port of `src/render.ts`. The math (`frameState`) lives in `animation.py`.
This module:

- `analyze_clipping(image, settings)` - pure math, no PIL needed.
- `render_frame(image, settings, progress, draw_background=False)` - returns a
  fully-composed RGBA `PIL.Image` for the given progress value.

The output canvas is always `(image.width + padding*2) * exportScale` on each
side. The icon is placed at the center, with `offsetX` / `offsetY` translated
by `exportScale`.

When `draw_background=True` (preview only), a checker pattern is drawn under
the icon. Exported APNGs are always transparent.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

from .animation import FrameState, frame_state
from .settings import AnimationSettings, RING_FORCED_STYLES
from .styles import hex_with_alpha, parse_hex


# SourceImage is the in-memory equivalent of the React `SourceImage`.

@dataclass
class SourceImage:
    image: Image.Image       # RGBA, full source image
    width: int
    height: int
    name: str
    display_name: str = ""


@dataclass
class CompositeLayer:
    image: SourceImage
    settings: AnimationSettings
    x: float = 0.0
    y: float = 0.0
    scale: float = 1.0
    visible: bool = True


@dataclass
class SequenceFrame:
    image: SourceImage
    scale: float = 1.0
    hold_ms: int = 900
    transition: str = "crossfade"
    transition_ms: int = 400
    visible: bool = True


@dataclass
class Timeline:
    period_ms: int
    frame_count: int
    exact: bool = True


# Clipping analysis -----------------------------------------------------------

@dataclass
class ClippingReport:
    isClipping: bool
    requiredPadding: int
    shortage: int
    width: int
    height: int


def analyze_clipping(image: SourceImage, settings: AnimationSettings) -> ClippingReport:
    """Port of `analyzeClipping` from `src/render.ts`."""
    samples = max(24, round((settings.duration / 1000) * settings.fps))
    half_width = (image.width * settings.exportScale) / 2
    half_height = (image.height * settings.exportScale) / 2
    max_extra_x = 0.0
    max_extra_y = 0.0

    for i in range(samples):
        state = frame_state(i / samples, settings)
        scale_x = state.iconScale * state.scaleX
        scale_y = state.iconScale * state.scaleY
        extra_x = abs(state.offsetX * settings.exportScale) + max(0.0, half_width * scale_x - half_width)
        extra_y = abs(state.offsetY * settings.exportScale) + max(0.0, half_height * scale_y - half_height)
        max_extra_x = max(max_extra_x, extra_x)
        max_extra_y = max(max_extra_y, extra_y)

    glow_extra = settings.glowBlur * settings.exportScale * settings.glowOpacity
    ring_radius = (max(image.width, image.height) * settings.exportScale) / 2
    ring_on = (
        settings.ringEnabled
        or settings.style in RING_FORCED_STYLES
    )
    ring_extra = 0.0
    if ring_on:
        ring_extra = max(
            0.0,
            ring_radius * max(settings.ringStartSize, settings.ringExpansion) - ring_radius,
        ) + settings.ringThickness * settings.exportScale

    required_padding = math.ceil(max(max_extra_x, max_extra_y, glow_extra, ring_extra))
    current_padding = math.ceil(settings.padding * settings.exportScale)
    shortage = max(0, required_padding - current_padding)

    return ClippingReport(
        isClipping=shortage > 0,
        requiredPadding=math.ceil(required_padding / settings.exportScale) if settings.exportScale else 0,
        shortage=math.ceil(shortage / settings.exportScale) if settings.exportScale else 0,
        width=math.ceil((image.width + settings.padding * 2) * settings.exportScale),
        height=math.ceil((image.height + settings.padding * 2) * settings.exportScale),
    )


# Optimization helpers -------------------------------------------------------

def optimization_color_count(settings: AnimationSettings) -> int:
    if settings.optimizationMode == "quality":
        return 0
    if settings.optimizationMode == "balanced":
        return 256
    if settings.optimizationMode == "small":
        return 128
    if settings.optimizationMode == "tiny":
        return 64
    return max(2, min(256, round(settings.colorLimit)))


def optimization_label(settings: AnimationSettings) -> str:
    colors = optimization_color_count(settings)
    if colors == 0:
        return "Lossless RGBA"
    return f"{colors} colors"


# Composite / sequence helpers ----------------------------------------------

SEQ_MIN_SEGMENT_MS = 30


def _gcd(a: int, b: int) -> int:
    a = abs(round(a))
    b = abs(round(b))
    while b:
        a, b = b, a % b
    return a


def _lcm(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return abs(a * b) // _gcd(a, b)


def _layer_progress_at(settings: AnimationSettings, time_ms: float) -> float:
    cycle = settings.duration + settings.delay
    if cycle <= 0:
        return 0
    elapsed = ((time_ms % cycle) + cycle) % cycle
    if elapsed > settings.duration or settings.duration <= 0:
        return 0
    return elapsed / settings.duration


def composite_timeline(layers: list[CompositeLayer], fps: int, cap_ms: int = 20000, max_frames: int = 600) -> Timeline:
    visible = [layer for layer in layers if layer.visible]
    if not visible:
        return Timeline(0, 0, True)
    periods = [
        max(1, round(layer.settings.duration + layer.settings.delay))
        for layer in visible
        if layer.settings.style != "none"
    ]
    if not periods:
        return Timeline(1000, 2, True)
    period = periods[0]
    for item in periods[1:]:
        period = _lcm(period, item)
    exact = True
    if period > cap_ms:
        period = max(periods)
        exact = False
    frame_count = max(2, round((period / 1000) * fps))
    if frame_count > max_frames:
        frame_count = max_frames
        exact = False
    return Timeline(period, frame_count, exact)


def _layer_required_padding(layer: CompositeLayer, export_scale: float, base_padding: int) -> int:
    scaled_settings = replace(layer.settings, exportScale=max(0.01, export_scale * layer.scale), padding=base_padding)
    clipping = analyze_clipping(layer.image, scaled_settings)
    return max(base_padding, clipping.requiredPadding)


def composite_canvas_size(layers: list[CompositeLayer], padding: int, export_scale: float) -> tuple[int, int]:
    visible = [layer for layer in layers if layer.visible]
    if not visible:
        return (1, 1)
    half_w = 0.0
    half_h = 0.0
    for layer in visible:
        layer_scale = max(0.01, layer.scale)
        layer_padding = _layer_required_padding(layer, export_scale, padding)
        half_layer_w = (layer.image.width * layer_scale) / 2 + layer_padding * layer_scale
        half_layer_h = (layer.image.height * layer_scale) / 2 + layer_padding * layer_scale
        half_w = max(half_w, abs(layer.x) + half_layer_w)
        half_h = max(half_h, abs(layer.y) + half_layer_h)
    return (
        max(1, math.ceil((half_w * 2 + padding * 2) * export_scale)),
        max(1, math.ceil((half_h * 2 + padding * 2) * export_scale)),
    )


def _sequence_segments(frames: list[SequenceFrame]) -> tuple[list[dict], int]:
    visible = [frame for frame in frames if frame.visible]
    segs: list[dict] = []
    for frame in visible:
        hold = max(0, int(frame.hold_ms))
        trans = 0 if frame.transition == "cut" else max(0, int(frame.transition_ms))
        total = hold + trans
        if total < SEQ_MIN_SEGMENT_MS:
            hold += SEQ_MIN_SEGMENT_MS - total
        segs.append({"hold": hold, "trans": trans, "frame": frame, "transition": frame.transition})
    period = sum(seg["hold"] + seg["trans"] for seg in segs)
    return segs, period


def sequence_timeline(frames: list[SequenceFrame], fps: int, max_frames: int = 600) -> Timeline:
    segs, period = _sequence_segments(frames)
    if not segs:
        return Timeline(0, 0, True)
    frame_count = max(2, round((period / 1000) * fps))
    exact = True
    if frame_count > max_frames:
        frame_count = max_frames
        exact = False
    return Timeline(period, frame_count, exact)


def sequence_canvas_size(frames: list[SequenceFrame], padding: int, export_scale: float) -> tuple[int, int]:
    visible = [frame for frame in frames if frame.visible]
    if not visible:
        return (1, 1)
    width = max(frame.image.width * max(0.01, frame.scale) for frame in visible)
    height = max(frame.image.height * max(0.01, frame.scale) for frame in visible)
    return (
        max(1, math.ceil((width + padding * 2) * export_scale)),
        max(1, math.ceil((height + padding * 2) * export_scale)),
    )


# Internal helpers -----------------------------------------------------------

def _make_checkerboard(width: int, height: int, background: str) -> Image.Image:
    """Build a checker-pattern preview background. Used only for previews."""
    bg = parse_hex(background)
    img = Image.new("RGBA", (width, height), bg)
    draw = ImageDraw.Draw(img)
    tile = 16
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                draw.rectangle([x, y, x + tile, y + tile], fill=(255, 255, 255, 30))
            else:
                draw.rectangle([x, y, x + tile, y + tile], fill=(0, 0, 0, 30))
    return img


def _new_canvas(width: int, height: int, background: str, draw_background: bool) -> Image.Image:
    if draw_background:
        return _make_checkerboard(width, height, background)
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def _draw_contained(canvas: Image.Image, source: SourceImage, scale: float, center_x: float, center_y: float, alpha: float = 1.0) -> None:
    width = max(1, int(round(source.width * scale)))
    height = max(1, int(round(source.height * scale)))
    img = source.image.resize((width, height), Image.Resampling.LANCZOS)
    img = _apply_opacity(img, alpha)
    canvas.alpha_composite(img, dest=(int(round(center_x - width / 2)), int(round(center_y - height / 2))))


def _dissolve_reveal(image: Image.Image, progress: float) -> Image.Image:
    p = _clamp01(progress)
    out = image.copy()
    w, h = out.size
    cell = max(3, int(min(w, h) // 48))
    r, g, b, a = out.split()
    draw = ImageDraw.Draw(a)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if _noise_at(x, y) > p:
                draw.rectangle([x, y, x + cell + 1, y + cell + 1], fill=0)
    return Image.merge("RGBA", (r, g, b, a))


def _masked_canvas(image: Image.Image, region) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    region(draw, image.width, image.height)
    r, g, b, a = image.split()
    a = ImageChops_multiply(a, mask)
    return Image.merge("RGBA", (r, g, b, a))


def _transition_frame(
    from_frame: SequenceFrame,
    to_frame: SequenceFrame,
    width: int,
    height: int,
    export_scale: float,
    progress: float,
    transition: str,
) -> Image.Image:
    p = _clamp01(progress)
    center_x = width / 2
    center_y = height / 2
    if transition in {"crossfade", "cut"}:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        _draw_contained(canvas, from_frame.image, export_scale * from_frame.scale, center_x, center_y, 1 - p)
        _draw_contained(canvas, to_frame.image, export_scale * to_frame.scale, center_x, center_y, p)
        return canvas

    if transition == "dissolve":
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        _draw_contained(canvas, from_frame.image, export_scale * from_frame.scale, center_x, center_y, 1 - p * 0.15)
        to_canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        _draw_contained(to_canvas, to_frame.image, export_scale * to_frame.scale, center_x, center_y, 1)
        canvas.alpha_composite(_dissolve_reveal(to_canvas, p))
        return canvas

    from_canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    to_canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    _draw_contained(from_canvas, from_frame.image, export_scale * from_frame.scale, center_x, center_y, 1)
    _draw_contained(to_canvas, to_frame.image, export_scale * to_frame.scale, center_x, center_y, 1)

    if transition == "wipeRight":
        to_part = _masked_canvas(to_canvas, lambda draw, w, h: draw.rectangle([0, 0, w * p, h], fill=255))
        from_part = _masked_canvas(from_canvas, lambda draw, w, h: draw.rectangle([w * p, 0, w, h], fill=255))
    elif transition == "wipeLeft":
        to_part = _masked_canvas(to_canvas, lambda draw, w, h: draw.rectangle([w * (1 - p), 0, w, h], fill=255))
        from_part = _masked_canvas(from_canvas, lambda draw, w, h: draw.rectangle([0, 0, w * (1 - p), h], fill=255))
    elif transition == "wipeDown":
        to_part = _masked_canvas(to_canvas, lambda draw, w, h: draw.rectangle([0, 0, w, h * p], fill=255))
        from_part = _masked_canvas(from_canvas, lambda draw, w, h: draw.rectangle([0, h * p, w, h], fill=255))
    elif transition == "wipeUp":
        to_part = _masked_canvas(to_canvas, lambda draw, w, h: draw.rectangle([0, h * (1 - p), w, h], fill=255))
        from_part = _masked_canvas(from_canvas, lambda draw, w, h: draw.rectangle([0, 0, w, h * (1 - p)], fill=255))
    else:
        radius = math.hypot(width, height) * 0.5 * p
        to_part = _masked_canvas(to_canvas, lambda draw, w, h: draw.ellipse([center_x - radius, center_y - radius, center_x + radius, center_y + radius], fill=255))
        from_part = from_canvas

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(from_part)
    canvas.alpha_composite(to_part)
    return canvas


def _transform_icon(
    image: Image.Image,
    scale_x: float,
    scale_y: float,
    rotation: float,
) -> Image.Image:
    """Apply non-uniform scale + rotation to the source icon. Returns a new image."""
    src = image
    if abs(scale_x - 1.0) > 0.001 or abs(scale_y - 1.0) > 0.001:
        new_w = max(1, int(round(src.width * abs(scale_x))))
        new_h = max(1, int(round(src.height * abs(scale_y))))
        src = src.resize((new_w, new_h), Image.BICUBIC)
    if abs(rotation) > 0.01:
        src = src.rotate(rotation, resample=Image.BICUBIC, expand=True)
    return src


def _apply_opacity(image: Image.Image, opacity: float) -> Image.Image:
    if opacity >= 0.999:
        return image
    r, g, b, a = image.split()
    a = a.point(lambda v: int(round(v * max(0.0, min(1.0, opacity)))))
    return Image.merge("RGBA", (r, g, b, a))


def _prepare_masked_source(image: Image.Image, state: FrameState) -> Image.Image:
    """Apply icon-local wipe/iris/dissolve masks before scale and rotation."""
    src = image.convert("RGBA")
    progress = _clamp01(state.maskProgress)
    fully_hidden = (
        (state.maskDirection != "none" and progress <= 0)
        or (state.maskDirection == "centerIn" and progress >= 1)
        or state.dissolve >= 1
    )
    if fully_hidden:
        return Image.new("RGBA", src.size, (0, 0, 0, 0))

    if state.maskDirection != "none" and progress < 1:
        src = _apply_mask(src, state.maskDirection, progress)

    if state.dissolve > 0:
        src = _apply_dissolve(src, _clamp01(state.dissolve))

    return src


def _apply_mask(image: Image.Image, direction: str, progress: float) -> Image.Image:
    w, h = image.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)

    if direction == "leftToRight":
        draw.rectangle([0, 0, round(w * progress), h], fill=255)
    elif direction == "rightToLeft":
        draw.rectangle([round(w * (1 - progress)), 0, w, h], fill=255)
    elif direction == "topToBottom":
        draw.rectangle([0, 0, w, round(h * progress)], fill=255)
    elif direction == "bottomToTop":
        draw.rectangle([0, round(h * (1 - progress)), w, h], fill=255)
    elif direction == "centerOut":
        radius = math.hypot(w, h) * 0.5 * progress
        draw.ellipse([w / 2 - radius, h / 2 - radius, w / 2 + radius, h / 2 + radius], fill=255)
    elif direction == "centerIn":
        radius = math.hypot(w, h) * 0.5 * (1 - progress)
        draw.ellipse([w / 2 - radius, h / 2 - radius, w / 2 + radius, h / 2 + radius], fill=255)
    else:
        return image

    r, g, b, a = image.split()
    a = ImageChops_multiply(a, mask)
    return Image.merge("RGBA", (r, g, b, a))


def _apply_dissolve(image: Image.Image, amount: float) -> Image.Image:
    w, h = image.size
    cell = max(3, int(min(w, h) // 14))
    r, g, b, a = image.split()
    draw = ImageDraw.Draw(a)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if _noise_at(x, y) < amount:
                draw.rectangle([x, y, x + cell, y + cell], fill=0)
    return Image.merge("RGBA", (r, g, b, a))


def _noise_at(x: int, y: int) -> float:
    value = math.sin((x + 13) * 12.9898 + (y + 7) * 78.233) * 43758.5453
    return value - math.floor(value)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _draw_ring(
    canvas: Image.Image,
    center_x: float,
    center_y: float,
    radius: float,
    draw_amount: float,
    opacity: float,
    settings: AnimationSettings,
    scale: float,
) -> None:
    """Draw a single attention ring at the given center/radius. Direct port of
    the canvas `arc` call from `renderHotspotFrame`."""
    if opacity <= 0 or radius <= 0:
        return
    rgba = hex_with_alpha(settings.ringColor, opacity)
    line_w = max(1, int(round(settings.ringThickness * scale)))
    # The ring "draw" goes from -90 deg clockwise by `draw_amount * 360`.
    # Pillow's arc uses degrees, 0 = 3-o'clock, increasing clockwise.
    start_deg = -90
    end_deg = start_deg + 360 * draw_amount
    bbox = [
        center_x - radius,
        center_y - radius,
        center_x + radius,
        center_y + radius,
    ]
    # Pillow's arc, when end < start, draws a counter-clockwise arc.
    draw = ImageDraw.Draw(canvas)
    if abs(draw_amount - 1.0) < 0.001:
        # Full circle: use ellipse outline, which renders cleanly.
        draw.ellipse(bbox, outline=rgba, width=line_w)
    else:
        draw.arc(bbox, start=start_deg, end=end_deg, fill=rgba, width=line_w)


def _tint_with_color(rgba_img: Image.Image, color_rgba: tuple) -> Image.Image:
    """Tint an RGBA image with the given color, preserving alpha.

    Used for the glow: blur the icon, then tint it with the glow color. The
    final result keeps the original alpha shape but with the chosen color.
    """
    r, g, b, a = rgba_img.split()
    cr, cg, cb, ca = color_rgba
    # Multiply the original RGB (which acts as a luminance mask) with the color.
    rr = r.point(lambda v, cr=cr: int(round((v / 255.0) * cr)))
    rg = g.point(lambda v, cg=cg: int(round((v / 255.0) * cg)))
    rb = b.point(lambda v, cb=cb: int(round((v / 255.0) * cb)))
    # Reuse the original alpha.
    return Image.merge("RGBA", (rr, rg, rb, a))


def _sweep_overlay(
    icon_size: tuple,
    sweep: float,
) -> Image.Image:
    """Build a horizontal sweep highlight gradient the size of the icon.

    A bright band moves across the icon as `sweep` goes from 0 to 1.
    """
    w, h = icon_size
    if w <= 0 or h <= 0:
        return Image.new("RGBA", (max(1, w), max(1, h)), (0, 0, 0, 0))
    # Use a luminance gradient (0..255) horizontally.
    grad = Image.new("L", (w, 1))
    pixels = grad.load()
    band_start = int(sweep * w - w * 0.25)
    band_end = int(sweep * w + w * 0.25)
    for x in range(w):
        if x < band_start or x > band_end:
            pixels[x, 0] = 0
        else:
            # 0..1 in [band_start, band_end], 0 -> 0, 1 -> 230
            t = (x - band_start) / max(1, band_end - band_start)
            pixels[x, 0] = int(round(min(1.0, 1.0 - abs(2 * t - 1)) * 230))
    grad = grad.resize((w, h), Image.BICUBIC)
    # Convert luminance to a white-with-alpha gradient.
    white = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    wp = white.load()
    gp = grad.load()
    for y in range(h):
        for x in range(w):
            v = gp[x, y]
            wp[x, y] = (255, 255, 255, v)
    return white


# Main render entry point -----------------------------------------------------

def render_frame(
    image: SourceImage,
    settings: AnimationSettings,
    progress: float,
    draw_background: bool = False,
) -> Image.Image:
    """Render a single frame at the given progress value. Returns RGBA."""
    state: FrameState = frame_state(progress, settings)
    scale = settings.exportScale
    width = max(1, int(math.ceil((image.width + settings.padding * 2) * scale)))
    height = max(1, int(math.ceil((image.height + settings.padding * 2) * scale)))
    center_x = width / 2.0
    center_y = height / 2.0
    base_radius = max(image.width, image.height) * scale / 2.0

    if draw_background:
        canvas = _make_checkerboard(width, height, settings.background)
    else:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    # --- RINGS --------------------------------------------------------------
    if state.ringOpacity > 0:
        _draw_ring(
            canvas,
            center_x, center_y,
            base_radius * state.ringScale,
            state.ringDraw,
            state.ringOpacity,
            settings,
            scale,
        )
    if state.secondRingOpacity > 0:
        _draw_ring(
            canvas,
            center_x, center_y,
            base_radius * state.secondRingScale,
            state.secondRingDraw,
            state.secondRingOpacity,
            settings,
            scale,
        )

    # --- GLOW ---------------------------------------------------------------
    if (
        state.glow > 0
        and settings.glowOpacity > 0
        and settings.glowBlur > 0
    ):
        glow_alpha = state.glow * settings.glowOpacity
        glow_radius = max(0.1, settings.glowBlur * scale)
        # Build a small layer, draw the icon, blur it, tint it with glow color.
        glow_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        glow_source = _prepare_masked_source(image.image, state)
        transformed = _transform_icon(
            glow_source,
            state.iconScale * state.scaleX,
            state.iconScale * state.scaleY,
            state.rotation,
        )
        transformed = _apply_opacity(transformed, glow_alpha)
        ox = int(round(center_x + state.offsetX * scale - transformed.width / 2))
        oy = int(round(center_y + state.offsetY * scale - transformed.height / 2))
        glow_layer.alpha_composite(transformed, dest=(ox, oy))
        blurred = glow_layer.filter(ImageFilter.GaussianBlur(radius=glow_radius))
        tinted = _tint_with_color(blurred, hex_with_alpha(settings.glowColor, 1.0))
        # Composite the glow underneath the icon by using screen-like blend.
        canvas = Image.alpha_composite(canvas, tinted)

    # --- ICON ---------------------------------------------------------------
    icon_source = _prepare_masked_source(image.image, state)
    icon = _transform_icon(
        icon_source,
        state.iconScale * state.scaleX,
        state.iconScale * state.scaleY,
        state.rotation,
    )
    icon = _apply_opacity(icon, state.opacity)
    ix = int(round(center_x + state.offsetX * scale - icon.width / 2))
    iy = int(round(center_y + state.offsetY * scale - icon.height / 2))
    icon_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    icon_layer.alpha_composite(icon, dest=(ix, iy))
    canvas = Image.alpha_composite(canvas, icon_layer)

    # --- SWEEP OVERLAY ------------------------------------------------------
    if state.sweep > 0:
        sweep_layer = _sweep_overlay((icon.width, icon.height), state.sweep)
        sweep_layer = _apply_opacity(sweep_layer, state.sweepOpacity)
        # Mask the sweep to the icon shape, then composite it on top.
        # Use the icon's alpha as a mask, then place the masked sweep at (ix, iy).
        mask = icon.split()[3]  # alpha channel
        masked = Image.new("RGBA", icon.size, (0, 0, 0, 0))
        # Screen blend: combine mask alpha with sweep alpha.
        sweep_alpha = sweep_layer.split()[3]
        screen = ImageChops_screen_compose(mask, sweep_alpha)
        masked = Image.merge("RGBA", (
            Image.new("L", icon.size, 255),
            Image.new("L", icon.size, 255),
            Image.new("L", icon.size, 255),
            screen,
        ))
        # Place masked at icon offset.
        sweep_canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        sweep_canvas.paste(masked, (ix, iy), masked)
        canvas = Image.alpha_composite(canvas, sweep_canvas)

    return canvas


def render_composite_frame(
    layers: list[CompositeLayer],
    doc: AnimationSettings,
    time_ms: float,
    draw_background: bool = False,
) -> Image.Image:
    width, height = composite_canvas_size(layers, doc.padding, doc.exportScale)
    canvas = _new_canvas(width, height, doc.background, draw_background)
    center_x = width / 2
    center_y = height / 2

    for layer in layers:
        if not layer.visible:
            continue
        progress = _layer_progress_at(layer.settings, time_ms)
        layer_padding = _layer_required_padding(layer, doc.exportScale, doc.padding)
        layer_settings = replace(
            layer.settings,
            exportScale=max(0.01, doc.exportScale * layer.scale),
            padding=layer_padding,
            background=doc.background,
        )
        frame = render_frame(layer.image, layer_settings, progress, draw_background=False)
        x = int(round(center_x + layer.x * doc.exportScale - frame.width / 2))
        y = int(round(center_y + layer.y * doc.exportScale - frame.height / 2))
        canvas.alpha_composite(frame, dest=(x, y))
    return canvas


def render_sequence_frame(
    frames: list[SequenceFrame],
    doc: AnimationSettings,
    time_ms: float,
    draw_background: bool = False,
) -> Image.Image:
    width, height = sequence_canvas_size(frames, doc.padding, doc.exportScale)
    canvas = _new_canvas(width, height, doc.background, draw_background)
    center_x = width / 2
    center_y = height / 2
    segs, period = _sequence_segments(frames)
    if not segs:
        return canvas
    if period <= 0:
        frame = segs[0]["frame"]
        _draw_contained(canvas, frame.image, doc.exportScale * frame.scale, center_x, center_y, 1)
        return canvas

    t = ((time_ms % period) + period) % period
    for index, seg in enumerate(segs):
        frame = seg["frame"]
        if t < seg["hold"]:
            _draw_contained(canvas, frame.image, doc.exportScale * frame.scale, center_x, center_y, 1)
            return canvas
        t -= seg["hold"]
        if t < seg["trans"]:
            progress = t / seg["trans"] if seg["trans"] > 0 else 1
            next_frame = segs[(index + 1) % len(segs)]["frame"]
            transition_canvas = _transition_frame(
                frame,
                next_frame,
                width,
                height,
                doc.exportScale,
                progress,
                seg["transition"],
            )
            canvas.alpha_composite(transition_canvas)
            return canvas
        t -= seg["trans"]

    last = segs[-1]["frame"]
    _draw_contained(canvas, last.image, doc.exportScale * last.scale, center_x, center_y, 1)
    return canvas


# Helper: combine two alpha channels with a "screen" blend. ------------------

class ImageChops:
    """Subset of PIL's ImageChops for the screen-blend we need for the sweep."""

    @staticmethod
    def screen_compose(a: Image.Image, b: Image.Image) -> Image.Image:
        """out = 1 - (1-a)*(1-b), 8-bit alpha math. Both inputs must be L mode."""
        if a.size != b.size:
            b = b.resize(a.size, Image.BICUBIC)
        return ImageChops._screen(a, b)

    @staticmethod
    def _screen(a: Image.Image, b: Image.Image) -> Image.Image:
        out = Image.new("L", a.size)
        ap = a.load()
        bp = b.load()
        op = out.load()
        w, h = a.size
        for y in range(h):
            for x in range(w):
                av = ap[x, y] / 255.0
                bv = bp[x, y] / 255.0
                op[x, y] = int(round((1.0 - (1.0 - av) * (1.0 - bv)) * 255.0))
        return out


def ImageChops_screen_compose(a: Image.Image, b: Image.Image) -> Image.Image:
    return ImageChops.screen_compose(a, b)


def ImageChops_multiply(a: Image.Image, b: Image.Image) -> Image.Image:
    if a.size != b.size:
        b = b.resize(a.size, Image.BICUBIC)
    out = Image.new("L", a.size)
    ap = a.load()
    bp = b.load()
    op = out.load()
    w, h = a.size
    for y in range(h):
        for x in range(w):
            op[x, y] = int(round((ap[x, y] / 255.0) * (bp[x, y] / 255.0) * 255.0))
    return out
