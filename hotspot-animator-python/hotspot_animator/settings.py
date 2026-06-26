"""Animation settings, defaults, and animation-style labels.

Direct port of `src/animation.ts` (types + defaultSettings + animationLabels only).
The math lives in `animation.py`; this file is the data.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Dict

# Type aliases (string literal types) ----------------------------------------

AnimationStyle = Literal[
    "none", "pulse", "breathe", "pop", "bounce", "wiggle", "spin", "glow",
    "radar", "heartbeat", "attention", "float", "floatHorizontal",
    "blink", "swing", "wobble", "zoomSpin", "beacon", "shimmer",
    "elastic", "floatDiagonal", "orbit", "tremble", "doublePulse",
    "tiltPulse", "slide", "slideRight", "slideLeft", "slideDown",
    "slideUp", "rubberBand", "flashGlow", "ringDraw", "farZoomIn",
    "breathingRing", "pingDoubleRing", "softLift", "magnetPop",
    "focusHalo", "sweepGlow", "compassNudge", "vrGentlePulse",
    "clickRipple", "ringDrawReverse", "velvetBreath", "silkDrift",
    "quietHalo", "pearlShimmer", "calmOrbit", "slowBloom",
    "softDisappear", "softDissolve", "shapeRightToLeft",
    "shapeLeftToRight", "shapeTopDown", "shapeBottomUp",
    "revealLeftToRight", "revealRightToLeft", "revealTopDown",
    "revealBottomUp", "irisDisappear", "irisReveal",
]

Easing = Literal["linear", "sine", "easeInOut", "easeOut", "spring"]
OptimizationMode = Literal["quality", "balanced", "small", "tiny", "custom"]


# Settings -------------------------------------------------------------------

@dataclass
class AnimationSettings:
    style: AnimationStyle = "pulse"
    duration: int = 1400            # ms
    fps: int = 30
    delay: int = 0                  # ms
    padding: int = 48               # px
    exportScale: float = 1.0
    scaleAmount: float = 1.22
    minOpacity: float = 0.72
    rotation: float = 12.0          # degrees
    bounce: float = 14.0            # px (vertical distance)
    shake: float = 8.0              # px (horizontal distance)
    glowColor: str = "#00c2ff"
    glowBlur: float = 22.0
    glowOpacity: float = 0.55
    ringEnabled: bool = True
    ringColor: str = "#00c2ff"
    ringThickness: float = 4.0
    ringStartSize: float = 1.0
    ringExpansion: float = 1.75
    ringOpacity: float = 0.72
    easing: Easing = "sine"
    optimizationMode: OptimizationMode = "balanced"
    colorLimit: int = 256
    background: str = "#22313f"
    filename: str = "hotspot-animated"


def default_settings() -> AnimationSettings:
    """Return a fresh default-settings object."""
    return AnimationSettings()


# Animation labels (matches the React source) --------------------------------

ANIMATION_LABELS: Dict[str, str] = {
    "none": "None (Fixed)",
    "pulse": "Pulse",
    "breathe": "Breathe",
    "pop": "Pop",
    "bounce": "Bounce",
    "wiggle": "Wiggle",
    "spin": "Spin",
    "glow": "Glow",
    "radar": "Radar Ring",
    "heartbeat": "Heartbeat",
    "attention": "Grab Attention",
    "float": "Float",
    "floatHorizontal": "Float Horizontal",
    "blink": "Blink",
    "swing": "Swing",
    "wobble": "Wobble",
    "zoomSpin": "Zoom Spin",
    "beacon": "Beacon",
    "shimmer": "Shimmer",
    "elastic": "Elastic",
    "floatDiagonal": "Float Diagonal",
    "orbit": "Orbit",
    "tremble": "Tremble",
    "doublePulse": "Double Pulse",
    "tiltPulse": "Tilt Pulse",
    "slide": "Slide",
    "slideRight": "Slide Right",
    "slideLeft": "Slide Left",
    "slideDown": "Slide Down",
    "slideUp": "Slide Up",
    "rubberBand": "Rubber Band",
    "flashGlow": "Flash Glow",
    "ringDraw": "Ring Draw",
    "farZoomIn": "Far Zoom In",
    "breathingRing": "Breathing Ring",
    "pingDoubleRing": "Ping Double Ring",
    "softLift": "Soft Lift",
    "magnetPop": "Magnet Pop",
    "focusHalo": "Focus Halo",
    "sweepGlow": "Sweep Glow",
    "compassNudge": "Compass Nudge",
    "vrGentlePulse": "VR Gentle Pulse",
    "clickRipple": "Click Me Ripple",
    "ringDrawReverse": "Ring Draw Reverse",
    "velvetBreath": "Velvet Breath",
    "silkDrift": "Silk Drift",
    "quietHalo": "Quiet Halo",
    "pearlShimmer": "Pearl Shimmer",
    "calmOrbit": "Calm Orbit",
    "slowBloom": "Slow Bloom",
    "softDisappear": "Soft Disappear",
    "softDissolve": "Soft Dissolve",
    "shapeRightToLeft": "Shape Right to Left",
    "shapeLeftToRight": "Shape Left to Right",
    "shapeTopDown": "Shape Top Down",
    "shapeBottomUp": "Shape Bottom Up",
    "revealLeftToRight": "Reveal Left to Right",
    "revealRightToLeft": "Reveal Right to Left",
    "revealTopDown": "Reveal Top Down",
    "revealBottomUp": "Reveal Bottom Up",
    "irisDisappear": "Iris Disappear",
    "irisReveal": "Iris Reveal",
}


# Ordered list of every style (used by the dropdown) -------------------------

ALL_STYLES: list = list(ANIMATION_LABELS.keys())


# Style groups (Subtle/VR Safe, Pulse/Attention, Ring Effects, Movement,
# Energetic) — used to label groups in the animation-style dropdown.
# Each group lists styles, and the UI sorts them alphabetically by label.

STYLE_GROUPS: list = [
    ("No Animation", [
        "none",
    ]),
    ("Subtle / VR Safe", [
        "breathe", "breathingRing", "focusHalo", "softLift", "vrGentlePulse",
    ]),
    ("Gentle / Elegant", [
        "calmOrbit", "pearlShimmer", "quietHalo", "silkDrift",
        "slowBloom", "velvetBreath",
    ]),
    ("Disappear / Reveal", [
        "irisDisappear", "irisReveal", "revealBottomUp",
        "revealLeftToRight", "revealRightToLeft", "revealTopDown",
        "shapeBottomUp", "shapeLeftToRight", "shapeRightToLeft",
        "shapeTopDown", "softDisappear", "softDissolve",
    ]),
    ("Pulse / Attention", [
        "beacon", "clickRipple", "doublePulse", "flashGlow", "heartbeat",
        "magnetPop", "pingDoubleRing", "pop", "pulse",
    ]),
    ("Ring Effects", [
        "radar", "ringDraw", "ringDrawReverse",
    ]),
    ("Movement", [
        "bounce", "compassNudge", "float", "floatDiagonal", "floatHorizontal",
        "orbit", "slide", "slideDown", "slideLeft", "slideRight", "slideUp",
    ]),
    ("Energetic", [
        "attention", "elastic", "farZoomIn", "rubberBand", "shimmer", "spin",
        "sweepGlow", "swing", "tremble", "wiggle", "wobble", "zoomSpin",
    ]),
]


# Animation capabilities ------------------------------------------------------
# Mirrors the `capabilities` map from App.tsx. For each capability, lists the
# styles that USE that capability. Used to enable/disable sliders per style.

CAPABILITIES: Dict[str, list] = {
    "scale": [
        "pulse", "breathe", "pop", "bounce", "spin", "glow", "heartbeat",
        "attention", "float", "floatHorizontal", "blink", "wobble", "zoomSpin",
        "beacon", "shimmer", "elastic", "floatDiagonal", "doublePulse",
        "tiltPulse", "rubberBand", "flashGlow", "ringDraw", "farZoomIn",
        "breathingRing", "pingDoubleRing", "softLift", "magnetPop",
        "focusHalo", "sweepGlow", "compassNudge", "vrGentlePulse",
        "clickRipple", "ringDrawReverse", "velvetBreath", "silkDrift",
        "quietHalo", "pearlShimmer", "calmOrbit", "slowBloom",
        "softDisappear",
    ],
    "opacity": [
        "pulse", "blink", "zoomSpin", "shimmer", "doublePulse", "tiltPulse",
        "flashGlow", "farZoomIn", "magnetPop", "vrGentlePulse",
        "velvetBreath", "slowBloom", "softDisappear", "softDissolve",
        "shapeRightToLeft", "shapeLeftToRight", "shapeTopDown",
        "shapeBottomUp", "revealLeftToRight", "revealRightToLeft",
        "revealTopDown", "revealBottomUp", "irisDisappear", "irisReveal",
    ],
    "rotation": [
        "wiggle", "spin", "attention", "swing", "wobble", "zoomSpin", "orbit",
        "tremble", "tiltPulse", "calmOrbit",
    ],
    "vertical": [
        "bounce", "attention", "float", "floatDiagonal", "orbit", "tremble",
        "slideDown", "slideUp", "softLift", "compassNudge", "silkDrift",
        "calmOrbit",
    ],
    "horizontal": [
        "wiggle", "floatHorizontal", "swing", "wobble", "shimmer",
        "floatDiagonal", "orbit", "tremble", "slide", "slideRight",
        "slideLeft", "rubberBand", "compassNudge", "silkDrift", "calmOrbit",
    ],
    "glow": [
        "pulse", "breathe", "pop", "glow", "radar", "heartbeat", "attention",
        "float", "floatHorizontal", "blink", "swing", "wobble", "zoomSpin",
        "beacon", "shimmer", "elastic", "floatDiagonal", "orbit", "tremble",
        "doublePulse", "tiltPulse", "rubberBand", "flashGlow", "ringDraw",
        "farZoomIn", "breathingRing", "pingDoubleRing", "softLift",
        "magnetPop", "focusHalo", "sweepGlow", "compassNudge",
        "vrGentlePulse", "clickRipple", "ringDrawReverse", "velvetBreath",
        "silkDrift", "quietHalo", "pearlShimmer", "calmOrbit", "slowBloom",
        "softDisappear", "softDissolve", "shapeRightToLeft",
        "shapeLeftToRight", "shapeTopDown", "shapeBottomUp",
        "revealLeftToRight", "revealRightToLeft", "revealTopDown",
        "revealBottomUp", "irisDisappear", "irisReveal",
    ],
}


def supports(capability: str, style: str) -> bool:
    """Return True if the given style uses the given capability."""
    return style in CAPABILITIES.get(capability, [])


# Styles where the ring is always on (the user can't disable it) ------------

RING_FORCED_STYLES: set = {
    "radar", "beacon", "ringDraw", "ringDrawReverse", "pingDoubleRing",
    "clickRipple", "breathingRing", "focusHalo", "quietHalo", "slowBloom",
}


def is_ring_forced(style: str) -> bool:
    return style in RING_FORCED_STYLES
