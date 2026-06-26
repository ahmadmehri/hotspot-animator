"""Additional export formats for the standalone Python app."""

from __future__ import annotations

import json
import math
import re
import zipfile
from pathlib import Path
from typing import Callable

from PIL import Image, features

from .render import (
    CompositeLayer,
    SequenceFrame,
    composite_canvas_size,
    composite_timeline,
    render_composite_frame,
    render_sequence_frame,
    sequence_canvas_size,
    sequence_timeline,
)
from .settings import AnimationSettings
from .styles import safe_filename

ProgressCallback = Callable[[str, int, int], None]


def render_composite_animation_frames(
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
        frames.append(render_composite_frame(layers, settings, time_ms, draw_background=False).convert("RGBA"))
    return frames, max(10, round(1000 / settings.fps))


def render_sequence_animation_frames(
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
        frames.append(render_sequence_frame(frames_in, settings, time_ms, draw_background=False).convert("RGBA"))
    return frames, max(10, round(1000 / settings.fps))


def render_sequence_still_frames(
    frames_in: list[SequenceFrame],
    settings: AnimationSettings,
    progress: ProgressCallback | None = None,
) -> tuple[list[Image.Image], int]:
    visible = [frame for frame in frames_in if frame.visible]
    if not visible:
        raise ValueError("Add at least one visible frame before exporting.")
    width, height = sequence_canvas_size(visible, settings.padding, settings.exportScale)
    center_x = width / 2
    center_y = height / 2
    frames: list[Image.Image] = []
    for index, frame in enumerate(visible):
        if progress:
            progress("Rendering frames", index + 1, len(visible))
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        image = frame.image.image.resize(
            (
                max(1, round(frame.image.width * frame.scale * settings.exportScale)),
                max(1, round(frame.image.height * frame.scale * settings.exportScale)),
            ),
            Image.Resampling.LANCZOS,
        )
        canvas.alpha_composite(image, (round(center_x - image.width / 2), round(center_y - image.height / 2)))
        frames.append(canvas)
    return frames, max(10, round(1000 / settings.fps))


def export_webp(
    frames: list[Image.Image],
    frame_duration: int,
    settings: AnimationSettings,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path).with_suffix(".webp")
    out.parent.mkdir(parents=True, exist_ok=True)
    if progress:
        progress("Encoding WebP", len(frames), len(frames))
    first, rest = frames[0], frames[1:]
    first.save(
        out,
        format="WEBP",
        save_all=True,
        append_images=rest,
        duration=[frame_duration] * len(frames),
        loop=0,
        lossless=settings.optimizationMode == "quality",
        quality=_webp_quality(settings),
        method=6,
    )
    return out


def export_gif(
    frames: list[Image.Image],
    frame_duration: int,
    settings: AnimationSettings,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path).with_suffix(".gif")
    out.parent.mkdir(parents=True, exist_ok=True)
    if progress:
        progress("Encoding GIF", len(frames), len(frames))
    palette_frames = [_gif_frame(frame, settings) for frame in frames]
    first, rest = palette_frames[0], palette_frames[1:]
    first.save(
        out,
        format="GIF",
        save_all=True,
        append_images=rest,
        duration=[frame_duration] * len(palette_frames),
        loop=0,
        disposal=2,
        optimize=False,
    )
    return out


def export_webm(
    frames: list[Image.Image],
    frame_duration: int,
    out_path: str | Path,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path).with_suffix(".webm")
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        import imageio.v3 as iio
        import numpy as np
    except Exception as exc:
        raise RuntimeError(
            "WebM export needs imageio, imageio-ffmpeg, and numpy. Install requirements.txt again."
        ) from exc

    if progress:
        progress("Encoding WebM", 0, len(frames))
    fps = max(1, round(1000 / max(1, frame_duration)))
    rgb_frames = [np.asarray(frame.convert("RGB")) for frame in frames]
    try:
        iio.imwrite(out, rgb_frames, fps=fps, codec="libvpx-vp9", macro_block_size=1)
    except Exception:
        iio.imwrite(out, rgb_frames, fps=fps, codec="libvpx", macro_block_size=1)
    if progress:
        progress("Encoding WebM", len(frames), len(frames))
    return out


def export_rotate_package(
    frames: list[Image.Image],
    settings: AnimationSettings,
    out_path: str | Path,
    base_name: str,
    progress: ProgressCallback | None = None,
) -> Path:
    out = Path(out_path).with_suffix(".zip")
    out.parent.mkdir(parents=True, exist_ok=True)
    folder_name = _safe_package_folder_name(base_name)
    root = f"rotate-viewers/{folder_name}"
    frame_ext = "webp" if _can_save_webp() else "png"
    frame_paths: list[str] = []
    digits = max(3, len(str(len(frames))))

    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, frame in enumerate(frames):
            if progress:
                progress("Writing rotate frames", index + 1, len(frames))
            frame_name = f"frame-{index + 1:0{digits}d}.{frame_ext}"
            frame_path = f"frames/{frame_name}"
            archive.writestr(
                f"{root}/{frame_path}",
                _encode_frame_bytes(frame, frame_ext, settings),
            )
            frame_paths.append(frame_path)

        config = {
            "name": folder_name,
            "width": frames[0].width,
            "height": frames[0].height,
            "frameCount": len(frames),
            "frameType": f"image/{frame_ext}",
            "dragPixelsPerFrame": 8,
            "minZoom": 1,
            "maxZoom": 4,
            "zoomStep": 0.12,
            "wrap": True,
            "preload": True,
            "frames": frame_paths,
        }
        archive.writestr(f"{root}/index.html", _rotate_viewer_html(folder_name))
        archive.writestr(f"{root}/rotate-viewer.css", _rotate_viewer_css())
        archive.writestr(f"{root}/rotate-viewer.js", _rotate_viewer_js())
        archive.writestr(f"{root}/config.json", json.dumps(config, indent=2))
        archive.writestr(f"{root}/README-3DVista.txt", _rotate_viewer_readme(folder_name))
    return out


def _webp_quality(settings: AnimationSettings) -> int:
    if settings.optimizationMode == "quality":
        return 100
    if settings.optimizationMode == "small":
        return 78
    if settings.optimizationMode == "tiny":
        return 62
    if settings.optimizationMode == "custom":
        return round(55 + (max(2, min(256, settings.colorLimit)) / 256) * 45)
    return 90


def _gif_frame(frame: Image.Image, settings: AnimationSettings) -> Image.Image:
    colors = 256
    if settings.optimizationMode == "small":
        colors = 128
    elif settings.optimizationMode == "tiny":
        colors = 64
    elif settings.optimizationMode == "custom":
        colors = max(2, min(256, round(settings.colorLimit)))
    return frame.convert("RGBA").quantize(colors=colors, method=Image.Quantize.FASTOCTREE)


def _can_save_webp() -> bool:
    try:
        return bool(features.check("webp"))
    except Exception:
        return "WEBP" in Image.registered_extensions().values()


def _encode_frame_bytes(frame: Image.Image, ext: str, settings: AnimationSettings) -> bytes:
    import io

    buffer = io.BytesIO()
    if ext == "webp":
        frame.save(buffer, format="WEBP", lossless=settings.optimizationMode == "quality", quality=_webp_quality(settings), method=6)
    else:
        frame.save(buffer, format="PNG")
    return buffer.getvalue()


def _safe_package_folder_name(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9._-]+", "-", safe_filename(name).lower()).strip("-")
    return cleaned[:80] or "hotspot-rotate"


def _rotate_viewer_html(title: str) -> str:
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} drag rotate</title>
    <link rel="stylesheet" href="rotate-viewer.css" />
  </head>
  <body>
    <main class="rotate-viewer" data-config="config.json">
      <div class="stage" role="application" aria-label="Drag to rotate">
        <img class="frame" alt="" draggable="false" />
        <div class="loading" aria-live="polite">Loading</div>
      </div>
    </main>
    <script src="rotate-viewer.js"></script>
  </body>
</html>
"""


def _rotate_viewer_css() -> str:
    return """html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  overflow: hidden;
  touch-action: none;
}

* {
  box-sizing: border-box;
}

.rotate-viewer {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  user-select: none;
}

.stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  cursor: grab;
  outline: none;
  touch-action: none;
}

.stage:active {
  cursor: grabbing;
}

.frame {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
  transform: translate(var(--pan-x, 0px), var(--pan-y, 0px)) scale(var(--zoom, 1));
  transform-origin: center center;
  will-change: transform;
}

.loading {
  position: absolute;
  inset: auto 12px 12px auto;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(16, 24, 32, 0.72);
  color: #fff;
  font: 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.is-ready .loading {
  display: none;
}
"""


def _rotate_viewer_js() -> str:
    return """"use strict";

(async function () {
  const root = document.querySelector(".rotate-viewer");
  const stage = document.querySelector(".stage");
  const image = document.querySelector(".frame");
  if (!root || !stage || !image) return;

  const configPath = root.getAttribute("data-config") || "config.json";
  const config = await fetch(configPath).then((response) => {
    if (!response.ok) throw new Error("Could not load rotate viewer config.");
    return response.json();
  });

  const frames = Array.isArray(config.frames) ? config.frames : [];
  if (frames.length === 0) throw new Error("Rotate viewer has no frames.");

  let index = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let accumulator = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const dragPixelsPerFrame = Math.max(1, Number(config.dragPixelsPerFrame) || 8);
  const minZoom = Math.max(0.25, Number(config.minZoom) || 1);
  const maxZoom = Math.max(minZoom, Number(config.maxZoom) || 4);
  const zoomStep = Math.max(0.02, Number(config.zoomStep) || 0.12);
  const wrap = config.wrap !== false;

  function normalize(nextIndex) {
    if (wrap) return ((nextIndex % frames.length) + frames.length) % frames.length;
    return Math.max(0, Math.min(frames.length - 1, nextIndex));
  }

  function show(nextIndex) {
    index = normalize(nextIndex);
    image.src = frames[index];
  }

  function step(amount) {
    if (amount !== 0) show(index + amount);
  }

  function applyTransform() {
    if (zoom <= minZoom + 0.001) {
      zoom = minZoom;
      panX = 0;
      panY = 0;
    }
    image.style.setProperty("--zoom", String(zoom));
    image.style.setProperty("--pan-x", panX + "px");
    image.style.setProperty("--pan-y", panY + "px");
  }

  function changeZoom(direction) {
    const factor = 1 + zoomStep * direction;
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom * factor));
    applyTransform();
  }

  function preload() {
    if (config.preload === false) return;
    frames.forEach((src) => {
      const preloaded = new Image();
      preloaded.src = src;
    });
  }

  stage.tabIndex = 0;
  stage.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    accumulator = 0;
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    if (zoom > minZoom + 0.001) {
      panX += event.clientX - lastX;
      panY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      applyTransform();
      event.preventDefault();
      return;
    }
    accumulator += lastX - event.clientX;
    lastX = event.clientX;
    lastY = event.clientY;
    const frameDelta = Math.trunc(accumulator / dragPixelsPerFrame);
    if (frameDelta !== 0) {
      step(frameDelta);
      accumulator -= frameDelta * dragPixelsPerFrame;
    }
    event.preventDefault();
  });

  function endDrag(event) {
    dragging = false;
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("wheel", (event) => {
    changeZoom(event.deltaY < 0 ? 1 : -1);
    event.preventDefault();
  }, { passive: false });

  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      step(1);
      event.preventDefault();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      step(-1);
      event.preventDefault();
    }
  });

  image.addEventListener("load", () => {
    root.classList.add("is-ready");
  }, { once: true });

  show(0);
  applyTransform();
  preload();
})().catch((error) => {
  const loading = document.querySelector(".loading");
  if (loading) loading.textContent = error && error.message ? error.message : "Viewer failed";
});
"""


def _rotate_viewer_readme(folder_name: str) -> str:
    return f"""3DVista Drag Rotate Package

Controls:
- Drag left/right to rotate.
- Use the mouse wheel to zoom in/out.
- Drag while zoomed in to pan.
- Use arrow keys to step through frames.

HOW TO INSTALL IT INTO A PUBLISHED 3DVISTA TOUR

1. Publish your 3DVista tour to a folder.
2. Copy the "rotate-viewers" folder from this ZIP into the tour's "media" folder.
3. In 3DVista, call this viewer with a relative path such as:

   media/rotate-viewers/{folder_name}/index.html

HOW TO PREVIEW LOCALLY

1. Open the published tour folder in Windows File Explorer.
2. Click the address bar at the top of File Explorer.
3. Type:

   powershell

4. Press Enter. PowerShell will open directly in that folder.
5. Start the local server:

   python -m http.server 8080

6. Open the full tour in your browser:

   http://localhost:8080/index.htm
"""
