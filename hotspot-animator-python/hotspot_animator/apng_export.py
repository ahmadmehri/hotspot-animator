"""APNG export helpers."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable

from PIL import Image

from .render import (
    CompositeLayer,
    SequenceFrame,
    SourceImage,
    composite_timeline,
    render_composite_frame,
    render_frame,
    render_sequence_frame,
    sequence_timeline,
    optimization_color_count,
)
from .settings import AnimationSettings

ProgressCallback = Callable[[str, int, int], None]


def render_apng_frames(
    source: SourceImage,
    settings: AnimationSettings,
    progress: ProgressCallback | None = None,
) -> tuple[list[Image.Image], int]:
    """Render all frames for an APNG and return frames plus frame duration."""
    frame_count = max(1, round((settings.duration / 1000) * settings.fps))
    delay_frames = max(0, round((settings.delay / 1000) * settings.fps))
    total = frame_count + delay_frames
    frames: list[Image.Image] = []

    for index in range(frame_count):
      if progress:
          progress("Rendering frames", index + 1, total)
      frame = render_frame(source, settings, index / frame_count, draw_background=False)
      frames.append(_maybe_quantize(frame, settings))

    if delay_frames:
        hold = frames[-1].copy()
        for index in range(delay_frames):
            if progress:
                progress("Adding delay", frame_count + index + 1, total)
            frames.append(hold.copy())

    frame_duration = max(10, round(settings.duration / frame_count))
    return frames, frame_duration


def export_apng(
    source: SourceImage,
    settings: AnimationSettings,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    """Export a real animated PNG using Pillow's APNG support."""
    out = Path(out_path)
    if out.suffix.lower() != ".apng":
        out = out.with_suffix(".apng")
    out.parent.mkdir(parents=True, exist_ok=True)

    frames, frame_duration = render_apng_frames(source, settings, progress)
    if progress:
        progress("Encoding APNG", len(frames), len(frames))

    first, rest = frames[0], frames[1:]
    first.save(
        out,
        format="PNG",
        save_all=True,
        append_images=rest,
        duration=[frame_duration] * len(frames),
        loop=0,
        disposal=2,
        optimize=False,
    )
    return out


def render_composite_apng_frames(
    layers: list[CompositeLayer],
    settings: AnimationSettings,
    progress: ProgressCallback | None = None,
) -> tuple[list[Image.Image], int]:
    visible = [layer for layer in layers if layer.visible]
    if not visible:
        raise ValueError("Add at least one visible layer before exporting.")
    timeline = composite_timeline(layers, settings.fps)
    frames: list[Image.Image] = []
    for index in range(timeline.frame_count):
        if progress:
            progress("Rendering frames", index + 1, timeline.frame_count)
        time_ms = (index / max(1, timeline.frame_count)) * timeline.period_ms
        frame = render_composite_frame(layers, settings, time_ms, draw_background=False)
        frames.append(_maybe_quantize(frame, settings))
    frame_duration = max(10, round(1000 / settings.fps))
    return frames, frame_duration


def export_composite_apng(
    layers: list[CompositeLayer],
    settings: AnimationSettings,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path)
    if out.suffix.lower() != ".apng":
        out = out.with_suffix(".apng")
    out.parent.mkdir(parents=True, exist_ok=True)
    frames, frame_duration = render_composite_apng_frames(layers, settings, progress)
    if progress:
        progress("Encoding APNG", len(frames), len(frames))
    first, rest = frames[0], frames[1:]
    first.save(
        out,
        format="PNG",
        save_all=True,
        append_images=rest,
        duration=[frame_duration] * len(frames),
        loop=0,
        disposal=2,
        optimize=False,
    )
    return out


def render_sequence_apng_frames(
    frames_in: list[SequenceFrame],
    settings: AnimationSettings,
    progress: ProgressCallback | None = None,
) -> tuple[list[Image.Image], int]:
    visible = [frame for frame in frames_in if frame.visible]
    if not visible:
        raise ValueError("Add at least one visible frame before exporting.")
    timeline = sequence_timeline(frames_in, settings.fps)
    frames: list[Image.Image] = []
    for index in range(timeline.frame_count):
        if progress:
            progress("Rendering frames", index + 1, timeline.frame_count)
        time_ms = (index / max(1, timeline.frame_count)) * timeline.period_ms
        frame = render_sequence_frame(frames_in, settings, time_ms, draw_background=False)
        frames.append(_maybe_quantize(frame, settings))
    frame_duration = max(10, round(1000 / settings.fps))
    return frames, frame_duration


def export_sequence_apng(
    frames_in: list[SequenceFrame],
    settings: AnimationSettings,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path)
    if out.suffix.lower() != ".apng":
        out = out.with_suffix(".apng")
    out.parent.mkdir(parents=True, exist_ok=True)
    frames, frame_duration = render_sequence_apng_frames(frames_in, settings, progress)
    if progress:
        progress("Encoding APNG", len(frames), len(frames))
    first, rest = frames[0], frames[1:]
    first.save(
        out,
        format="PNG",
        save_all=True,
        append_images=rest,
        duration=[frame_duration] * len(frames),
        loop=0,
        disposal=2,
        optimize=False,
    )
    return out


def _maybe_quantize(frame: Image.Image, settings: AnimationSettings) -> Image.Image:
    colors = optimization_color_count(settings)
    if colors <= 0:
        return frame.convert("RGBA")

    # Quantizing RGBA with FASTOCTREE preserves transparency reasonably well and
    # gives smaller APNGs. Convert back to RGBA for safer APNG encoding.
    quantized = frame.quantize(colors=max(2, min(256, colors)), method=Image.Quantize.FASTOCTREE)
    return quantized.convert("RGBA")
