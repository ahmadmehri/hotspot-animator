"""3DVista export profiles and tour-friendly warnings."""

from __future__ import annotations

from dataclasses import replace

from .render import ClippingReport, optimization_color_count
from .settings import AnimationSettings


TOUR_PROFILES: dict[str, tuple[str, dict]] = {
    "custom": ("Custom", {}),
    "small": ("3DVista Small Hotspot", {
        "fps": 24, "padding": 32, "exportScale": 0.75, "scaleAmount": 1.14,
        "bounce": 10, "shake": 10, "glowBlur": 12, "glowOpacity": 0.35,
        "ringThickness": 3, "ringStartSize": 0.75, "ringExpansion": 1.45,
        "ringOpacity": 0.55, "optimizationMode": "small", "colorLimit": 128,
    }),
    "medium": ("3DVista Medium Hotspot", {
        "fps": 24, "padding": 44, "exportScale": 1, "scaleAmount": 1.2,
        "bounce": 16, "shake": 16, "glowBlur": 18, "glowOpacity": 0.48,
        "ringThickness": 4, "ringStartSize": 0.95, "ringExpansion": 1.75,
        "ringOpacity": 0.7, "optimizationMode": "balanced", "colorLimit": 256,
    }),
    "large": ("3DVista Large Hotspot", {
        "fps": 30, "padding": 64, "exportScale": 1.35, "scaleAmount": 1.24,
        "bounce": 20, "shake": 20, "glowBlur": 24, "glowOpacity": 0.55,
        "ringThickness": 5, "ringStartSize": 1, "ringExpansion": 1.95,
        "ringOpacity": 0.78, "optimizationMode": "balanced", "colorLimit": 256,
    }),
    "vrSafe": ("VR-Safe Subtle", {
        "style": "breathe", "duration": 1800, "fps": 20, "padding": 36,
        "exportScale": 0.85, "scaleAmount": 1.1, "rotation": 0, "bounce": 6,
        "shake": 6, "glowBlur": 10, "glowOpacity": 0.28, "ringEnabled": False,
        "optimizationMode": "small", "colorLimit": 128,
    }),
    "highAttention": ("High-Attention Callout", {
        "style": "ringDraw", "duration": 1200, "fps": 30, "padding": 72,
        "exportScale": 1.15, "scaleAmount": 1.28, "rotation": 10, "bounce": 20,
        "shake": 20, "glowBlur": 26, "glowOpacity": 0.72, "ringEnabled": True,
        "ringThickness": 5, "ringStartSize": 0.35, "ringExpansion": 1.9,
        "ringOpacity": 0.9, "optimizationMode": "balanced", "colorLimit": 256,
    }),
    "lowFileSize": ("Low File Size Tour", {
        "duration": 1100, "fps": 16, "padding": 28, "exportScale": 0.75,
        "scaleAmount": 1.12, "rotation": 6, "bounce": 8, "shake": 8,
        "glowBlur": 8, "glowOpacity": 0.3, "ringThickness": 3,
        "ringExpansion": 1.35, "ringOpacity": 0.45, "optimizationMode": "tiny",
        "colorLimit": 64,
    }),
}


def apply_tour_profile(settings: AnimationSettings, profile_id: str) -> AnimationSettings:
    changes = TOUR_PROFILES.get(profile_id, ("", {}))[1]
    return replace(settings, **changes) if changes else settings


def tour_warnings(settings: AnimationSettings, clipping: ClippingReport | None) -> list[str]:
    warnings: list[str] = []
    max_dimension = max(clipping.width, clipping.height) if clipping else 0
    frame_count = round((settings.duration / 1000) * settings.fps)
    movement = max(settings.bounce, settings.shake)
    color_count = optimization_color_count(settings)

    if settings.fps > 30:
        warnings.append("High FPS may increase APNG size and tour loading cost.")
    if frame_count > 75:
        warnings.append("Long/high-frame animation may feel heavy in mobile tours.")
    if max_dimension > 420:
        warnings.append("Large export dimensions may slow tour loading.")
    if movement > 80:
        warnings.append("Large movement can be distracting in VR tours.")
    if settings.rotation > 45:
        warnings.append("Strong rotation may be uncomfortable in VR.")
    if settings.scaleAmount > 1.7:
        warnings.append("Large scaling can feel aggressive for navigation.")
    if settings.glowBlur > 45 or settings.ringExpansion > 3.5:
        warnings.append("Large glow/ring effects need more padding and bigger APNGs.")
    if color_count == 0:
        warnings.append("Quality mode is lossless and can create larger APNGs.")
    return warnings
