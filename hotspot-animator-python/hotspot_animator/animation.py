"""Frame-state math, port of `src/animation.ts`.

The math is intentionally line-for-line. The same easing functions, the same
per-style if/elif chain (rewritten as a Python `match` for readability), the
same per-frame constants. The output `FrameState` is consumed by the renderer
in `render.py`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Union

from .settings import AnimationSettings, Easing


@dataclass
class FrameState:
    iconScale: float = 1.0
    scaleX: float = 1.0
    scaleY: float = 1.0
    opacity: float = 1.0
    rotation: float = 0.0       # degrees
    offsetX: float = 0.0        # px, pre-exportScale
    offsetY: float = 0.0        # px, pre-exportScale
    glow: float = 0.0
    sweep: float = 0.0
    ringScale: float = 1.0
    ringOpacity: float = 0.0
    ringDraw: float = 1.0
    sweepOpacity: float = 0.55
    maskDirection: str = "none"
    maskProgress: float = 1.0
    dissolve: float = 0.0
    secondRingScale: float = 1.0
    secondRingOpacity: float = 0.0
    secondRingDraw: float = 1.0


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def ease(value: float, easing: Union[Easing, str]) -> float:
    """Easing function. Direct port of the JS `ease` function."""
    t = _clamp01(value)
    if easing == "linear":
        return t
    if easing == "easeOut":
        return 1 - (1 - t) ** 3
    if easing == "easeInOut":
        return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
    if easing == "spring":
        return _clamp01(1 - math.cos(t * math.pi * 4.5) * math.exp(-t * 5))
    # default: sine
    return (1 - math.cos(t * math.pi)) / 2


def _ring_scale_at(progress: float, settings: AnimationSettings) -> float:
    start = max(0.05, settings.ringStartSize)
    end = max(0.05, settings.ringExpansion)
    return start + _clamp01(progress) * (end - start)


def frame_state(progress: float, settings: AnimationSettings) -> FrameState:
    """Compute the per-frame state for a given progress value in [0, 1].

    Direct port of `frameState` from `src/animation.ts`. The translation
    preserves every coefficient, every sine frequency, every clamp.
    """
    if settings.style == "none":
        return FrameState()

    p = _clamp01(progress)
    wave = ease(p, settings.easing)
    sin_v = math.sin(p * math.pi * 2)
    soft_wave = (1 - math.cos(p * math.pi * 2)) / 2
    bounce_curve = abs(math.sin(p * math.pi))
    quick_pulse = abs(math.sin(p * math.pi * 4))
    scale_delta = max(0.0, settings.scaleAmount - 1)

    base = FrameState(
        iconScale=1.0,
        scaleX=1.0,
        scaleY=1.0,
        opacity=1.0,
        rotation=0.0,
        offsetX=0.0,
        offsetY=0.0,
        glow=0.0,
        sweep=0.0,
        ringScale=_ring_scale_at(wave, settings),
        ringOpacity=(1 - wave) * settings.ringOpacity,
        ringDraw=1.0,
        sweepOpacity=0.55,
        maskDirection="none",
        maskProgress=1.0,
        dissolve=0.0,
        secondRingScale=_ring_scale_at(0, settings),
        secondRingOpacity=0.0,
        secondRingDraw=1.0,
    )

    style = settings.style

    if style == "pulse":
        base.iconScale = 1 + wave * scale_delta
        base.opacity = 1 - wave * (1 - settings.minOpacity)
        base.glow = wave
    elif style == "breathe":
        base.iconScale = 1 + ((sin_v + 1) / 2) * scale_delta
        base.glow = (sin_v + 1) / 2
    elif style == "pop":
        if p < 0.45:
            pop = ease(p / 0.45, "easeOut")
        else:
            pop = 1 - ease((p - 0.45) / 0.55, "easeInOut") * 0.25
        base.iconScale = 0.9 + pop * (settings.scaleAmount - 0.9)
        base.glow = pop
    elif style == "bounce":
        base.offsetY = -bounce_curve * settings.bounce
        base.iconScale = 1 + bounce_curve * scale_delta * 0.55
    elif style == "wiggle":
        base.rotation = math.sin(p * math.pi * 6) * settings.rotation
        base.offsetX = math.sin(p * math.pi * 8) * settings.shake
    elif style == "spin":
        base.rotation = p * 360
        base.iconScale = 1 + ((sin_v + 1) / 2) * scale_delta * 0.4
    elif style == "glow":
        base.glow = (sin_v + 1) / 2
        base.iconScale = 1 + base.glow * scale_delta * 0.35
    elif style == "radar":
        base.glow = 0.25
        base.ringScale = _ring_scale_at(wave, settings)
        base.ringOpacity = (1 - wave) * settings.ringOpacity
    elif style == "heartbeat":
        beat_one = math.exp(-((p - 0.18) / 0.08) ** 2)
        beat_two = math.exp(-((p - 0.36) / 0.1) ** 2) * 0.75
        beat = max(beat_one, beat_two)
        base.iconScale = 1 + beat * scale_delta
        base.glow = beat
        base.ringOpacity *= 1 if beat > 0.1 else 0.25
    elif style == "attention":
        base.iconScale = 1 + bounce_curve * scale_delta * 0.8
        base.rotation = math.sin(p * math.pi * 6) * settings.rotation
        base.offsetY = -bounce_curve * settings.bounce * 0.5
        base.glow = max(wave, bounce_curve) * 0.9
    elif style == "float":
        base.offsetY = -math.sin(p * math.pi * 2) * settings.bounce
        base.iconScale = 1 + ((sin_v + 1) / 2) * scale_delta * 0.3
        base.glow = ((sin_v + 1) / 2) * 0.5
        base.ringOpacity *= 0.35
    elif style == "floatHorizontal":
        base.offsetX = math.sin(p * math.pi * 2) * settings.shake
        base.iconScale = 1 + ((sin_v + 1) / 2) * scale_delta * 0.3
        base.glow = ((sin_v + 1) / 2) * 0.5
        base.ringOpacity *= 0.35
    elif style == "blink":
        visible = 1.0 if math.sin(p * math.pi * 6) > -0.15 else settings.minOpacity
        base.opacity = visible
        base.glow = 0.15 if visible < 1 else 0.75
        base.iconScale = 0.96 if visible < 1 else 1 + scale_delta * 0.35
        base.ringOpacity *= visible
    elif style == "swing":
        base.rotation = math.sin(p * math.pi * 2) * settings.rotation * 1.8
        base.offsetX = math.sin(p * math.pi * 2) * settings.shake * 0.35
        base.glow = abs(sin_v) * 0.45
    elif style == "wobble":
        base.offsetX = math.sin(p * math.pi * 6) * settings.shake
        base.rotation = math.sin(p * math.pi * 6) * settings.rotation
        base.scaleX = 1 + math.sin(p * math.pi * 4) * scale_delta * 0.45
        base.scaleY = 1 - math.sin(p * math.pi * 4) * scale_delta * 0.25
        base.glow = quick_pulse * 0.55
    elif style == "zoomSpin":
        base.iconScale = 0.85 + wave * (settings.scaleAmount - 0.85)
        base.rotation = wave * settings.rotation * 3
        base.opacity = settings.minOpacity + wave * (1 - settings.minOpacity)
        base.glow = wave
    elif style == "beacon":
        base.iconScale = 1 + quick_pulse * scale_delta * 0.35
        base.glow = quick_pulse
        base.ringScale = _ring_scale_at((p * 2) % 1, settings)
        base.ringOpacity = (1 - ((p * 2) % 1)) * settings.ringOpacity
    elif style == "shimmer":
        base.opacity = settings.minOpacity + (1 - settings.minOpacity) * (0.55 + quick_pulse * 0.45)
        base.iconScale = 1 + quick_pulse * scale_delta * 0.22
        base.offsetX = math.sin(p * math.pi * 2) * settings.shake * 0.25
        base.glow = quick_pulse
    elif style == "elastic":
        elastic_v = math.sin(p * math.pi * 5) * math.exp(-p * 2.2)
        base.scaleX = 1 + elastic_v * scale_delta * 1.3
        base.scaleY = 1 - elastic_v * scale_delta * 0.8
        base.iconScale = 1 + abs(elastic_v) * scale_delta * 0.45
        base.glow = abs(elastic_v)
        base.ringOpacity *= 1 if abs(elastic_v) > 0.12 else 0.35
    elif style == "floatDiagonal":
        drift = math.sin(p * math.pi * 2)
        base.offsetX = drift * settings.shake
        base.offsetY = -drift * settings.bounce
        base.iconScale = 1 + ((sin_v + 1) / 2) * scale_delta * 0.25
        base.glow = ((sin_v + 1) / 2) * 0.45
        base.ringOpacity *= 0.3
    elif style == "orbit":
        base.offsetX = math.cos(p * math.pi * 2) * settings.shake
        base.offsetY = math.sin(p * math.pi * 2) * settings.bounce
        base.rotation = math.sin(p * math.pi * 2) * settings.rotation * 0.5
        base.glow = 0.35 + quick_pulse * 0.45
        base.ringOpacity *= 0.45
    elif style == "tremble":
        base.offsetX = math.sin(p * math.pi * 24) * settings.shake * 0.45
        base.offsetY = math.cos(p * math.pi * 20) * settings.bounce * 0.25
        base.rotation = math.sin(p * math.pi * 28) * settings.rotation * 0.45
        base.glow = 0.3 + quick_pulse * 0.45
    elif style == "doublePulse":
        pulse_one = math.exp(-((p - 0.2) / 0.11) ** 2)
        pulse_two = math.exp(-((p - 0.62) / 0.14) ** 2)
        pulse = max(pulse_one, pulse_two * 0.85)
        base.iconScale = 1 + pulse * scale_delta
        base.opacity = 1 - pulse * (1 - settings.minOpacity) * 0.55
        base.glow = pulse
        base.ringScale = _ring_scale_at(pulse, settings)
        base.ringOpacity = (1 - pulse * 0.35) * pulse * settings.ringOpacity
    elif style == "tiltPulse":
        base.iconScale = 1 + wave * scale_delta
        base.rotation = math.sin(p * math.pi * 2) * settings.rotation
        base.glow = wave
        base.opacity = 1 - wave * (1 - settings.minOpacity) * 0.45
    elif style == "slide":
        slide_v = math.sin(p * math.pi * 2)
        base.offsetX = slide_v * settings.shake
        base.opacity = 1
        base.iconScale = 1
        base.glow = 0
        base.ringOpacity = 0
        base.secondRingOpacity = 0
    elif style == "slideRight":
        enter = ease(p, settings.easing)
        base.offsetX = (enter - 1) * settings.shake
        base.opacity = 1
        base.iconScale = 1
        base.glow = 0
        base.ringOpacity = 0
        base.secondRingOpacity = 0
    elif style == "slideLeft":
        enter = ease(p, settings.easing)
        base.offsetX = (1 - enter) * settings.shake
        base.opacity = 1
        base.iconScale = 1
        base.glow = 0
        base.ringOpacity = 0
        base.secondRingOpacity = 0
    elif style == "slideDown":
        enter = ease(p, settings.easing)
        base.offsetY = (enter - 1) * settings.bounce
        base.opacity = 1
        base.iconScale = 1
        base.glow = 0
        base.ringOpacity = 0
        base.secondRingOpacity = 0
    elif style == "slideUp":
        enter = ease(p, settings.easing)
        base.offsetY = (1 - enter) * settings.bounce
        base.opacity = 1
        base.iconScale = 1
        base.glow = 0
        base.ringOpacity = 0
        base.secondRingOpacity = 0
    elif style == "rubberBand":
        snap = math.sin(p * math.pi * 6) * math.exp(-p * 2.8)
        base.scaleX = 1 + snap * scale_delta * 1.6
        base.scaleY = 1 - snap * scale_delta
        base.offsetX = math.sin(p * math.pi * 2) * settings.shake * 0.25
        base.glow = abs(snap)
    elif style == "flashGlow":
        flash = quick_pulse ** 4
        base.iconScale = 1 + flash * scale_delta * 0.55
        base.opacity = settings.minOpacity + (1 - settings.minOpacity) * (0.65 + flash * 0.35)
        base.glow = flash
        base.ringOpacity = flash * settings.ringOpacity
        base.ringScale = _ring_scale_at(flash, settings)
    elif style == "ringDraw":
        draw = ease(p, settings.easing)
        base.ringScale = _ring_scale_at(0, settings)
        base.ringDraw = draw
        base.ringOpacity = (1 if draw < 0.92 else 1 - ease((draw - 0.92) / 0.08, "easeOut") * 0.35) * settings.ringOpacity
        base.iconScale = 1 + math.sin(p * math.pi) * scale_delta * 0.25
        base.glow = draw
    elif style == "farZoomIn":
        enter = ease(p, settings.easing)
        start_scale = max(0.08, 1 / max(1.2, settings.scaleAmount * 2.2))
        base.iconScale = start_scale + enter * (settings.scaleAmount - start_scale)
        base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity)
        base.glow = enter
        base.ringScale = _ring_scale_at(enter, settings)
        base.ringOpacity *= enter
    elif style == "breathingRing":
        breathe = (sin_v + 1) / 2
        base.iconScale = 1 + breathe * scale_delta * 0.15
        base.glow = breathe * 0.45
        base.ringScale = _ring_scale_at(breathe, settings)
        base.ringOpacity = (0.45 + breathe * 0.45) * settings.ringOpacity
    elif style == "pingDoubleRing":
        first = p
        second = (p + 0.5) % 1
        base.ringScale = _ring_scale_at(first, settings)
        base.ringOpacity = (1 - first) * settings.ringOpacity
        base.secondRingScale = _ring_scale_at(second, settings)
        base.secondRingOpacity = (1 - second) * settings.ringOpacity * 0.75
        base.glow = max(1 - first, 1 - second) * 0.55
        base.iconScale = 1 + quick_pulse * scale_delta * 0.16
    elif style == "softLift":
        lift = math.sin(p * math.pi)
        base.offsetY = -lift * settings.bounce
        base.iconScale = 1 + lift * scale_delta * 0.2
        base.glow = lift * 0.45
        base.ringOpacity *= 0.25 + lift * 0.35
    elif style == "magnetPop":
        pop = ease(p, "easeOut")
        overshoot = math.sin(p * math.pi * 3) * math.exp(-p * 4)
        base.iconScale = 0.72 + pop * (settings.scaleAmount - 0.72) + overshoot * scale_delta * 0.7
        base.opacity = settings.minOpacity + pop * (1 - settings.minOpacity)
        base.glow = pop
        base.ringOpacity *= pop
    elif style == "focusHalo":
        focus = (sin_v + 1) / 2
        base.glow = focus
        base.ringScale = _ring_scale_at(focus * 0.35, settings)
        base.ringOpacity = (0.35 + focus * 0.65) * settings.ringOpacity
        base.iconScale = 1 + focus * scale_delta * 0.12
    elif style == "sweepGlow":
        base.sweep = p
        base.glow = 0.25 + quick_pulse * 0.35
        base.iconScale = 1 + quick_pulse * scale_delta * 0.12
        base.ringOpacity *= 0.25
    elif style == "compassNudge":
        phase = int(p * 4)
        local = math.sin((p * 4 - phase) * math.pi)
        distance_x = settings.shake * local
        distance_y = settings.bounce * local
        if phase == 0:
            base.offsetY = -distance_y
        elif phase == 1:
            base.offsetX = distance_x
        elif phase == 2:
            base.offsetY = distance_y
        elif phase == 3:
            base.offsetX = -distance_x
        base.iconScale = 1 + local * scale_delta * 0.18
        base.glow = local * 0.5
    elif style == "vrGentlePulse":
        gentle = (sin_v + 1) / 2
        base.iconScale = 1 + gentle * min(scale_delta, 0.12)
        base.opacity = 0.88 + gentle * 0.12
        base.glow = gentle * 0.3
        base.ringOpacity *= 0.25
    elif style == "clickRipple":
        ripple = ease(p, "easeOut")
        base.ringScale = _ring_scale_at(ripple, settings)
        base.ringOpacity = (1 - ripple) * settings.ringOpacity
        base.iconScale = 1 + math.sin(p * math.pi) * scale_delta * 0.22
        base.glow = 1 - ripple
    elif style == "ringDrawReverse":
        draw = ease(p, settings.easing)
        base.ringScale = _ring_scale_at(0, settings)
        base.ringDraw = 1 - draw
        base.ringOpacity = (1 if draw < 0.92 else 1 - ease((draw - 0.92) / 0.08, "easeOut") * 0.35) * settings.ringOpacity
        base.iconScale = 1 + math.sin(p * math.pi) * scale_delta * 0.2
        base.glow = 1 - draw * 0.4
    elif style == "velvetBreath":
        base.iconScale = 1 + soft_wave * min(scale_delta, 0.1)
        base.opacity = 0.94 + soft_wave * 0.06
        base.glow = soft_wave * 0.28
        base.ringOpacity *= 0.12 + soft_wave * 0.18
    elif style == "silkDrift":
        drift = math.sin(p * math.pi * 2)
        lift = math.sin(p * math.pi * 2 + math.pi / 4)
        base.offsetX = drift * settings.shake * 0.35
        base.offsetY = -lift * settings.bounce * 0.26
        base.iconScale = 1 + soft_wave * min(scale_delta, 0.05)
        base.glow = 0.1 + soft_wave * 0.18
        base.ringOpacity *= 0.12
    elif style == "quietHalo":
        base.iconScale = 1 + soft_wave * min(scale_delta, 0.06)
        base.glow = soft_wave * 0.24
        base.ringScale = _ring_scale_at(soft_wave * 0.34, settings)
        base.ringOpacity = (0.18 + soft_wave * 0.34) * settings.ringOpacity
    elif style == "pearlShimmer":
        shimmer = math.sin(p * math.pi)
        base.sweep = p
        base.sweepOpacity = 0.22
        base.iconScale = 1 + shimmer * min(scale_delta, 0.04)
        base.glow = 0.1 + shimmer * 0.2
        base.ringOpacity *= 0.08
    elif style == "calmOrbit":
        angle = p * math.pi * 2
        base.offsetX = math.cos(angle) * settings.shake * 0.22
        base.offsetY = math.sin(angle) * settings.bounce * 0.18
        base.rotation = math.sin(angle) * settings.rotation * 0.12
        base.iconScale = 1 + soft_wave * min(scale_delta, 0.04)
        base.glow = 0.12 + soft_wave * 0.18
        base.ringOpacity *= 0.14
    elif style == "slowBloom":
        bloom = math.sin(p * math.pi)
        base.iconScale = 1 + bloom * min(scale_delta, 0.08)
        base.opacity = 0.9 + bloom * 0.1
        base.glow = bloom * 0.36
        base.ringScale = _ring_scale_at(bloom * 0.5, settings)
        base.ringOpacity = bloom * settings.ringOpacity * 0.42
    elif style == "softDisappear":
        fade = ease(p, settings.easing)
        base.opacity = 1 - fade * (1 - settings.minOpacity)
        base.iconScale = 1 - fade * min(scale_delta, 0.08)
        base.glow = (1 - fade) * 0.28
        base.ringOpacity *= 1 - fade
    elif style == "softDissolve":
        dissolve = ease(p, settings.easing)
        base.opacity = 1 - dissolve * (1 - settings.minOpacity) * 0.35
        base.dissolve = dissolve
        base.glow = (1 - dissolve) * 0.25
        base.ringOpacity *= 1 - dissolve
    elif style == "shapeRightToLeft":
        visible = 1 - ease(p, settings.easing)
        base.maskDirection = "leftToRight"
        base.maskProgress = visible
        base.opacity = settings.minOpacity + visible * (1 - settings.minOpacity)
        base.glow = visible * 0.22
        base.ringOpacity *= visible
    elif style == "shapeLeftToRight":
        visible = 1 - ease(p, settings.easing)
        base.maskDirection = "rightToLeft"
        base.maskProgress = visible
        base.opacity = settings.minOpacity + visible * (1 - settings.minOpacity)
        base.glow = visible * 0.22
        base.ringOpacity *= visible
    elif style == "shapeTopDown":
        visible = 1 - ease(p, settings.easing)
        base.maskDirection = "bottomToTop"
        base.maskProgress = visible
        base.opacity = settings.minOpacity + visible * (1 - settings.minOpacity)
        base.glow = visible * 0.22
        base.ringOpacity *= visible
    elif style == "shapeBottomUp":
        visible = 1 - ease(p, settings.easing)
        base.maskDirection = "topToBottom"
        base.maskProgress = visible
        base.opacity = settings.minOpacity + visible * (1 - settings.minOpacity)
        base.glow = visible * 0.22
        base.ringOpacity *= visible
    elif style == "revealLeftToRight":
        reveal = ease(p, settings.easing)
        base.maskDirection = "leftToRight"
        base.maskProgress = reveal
        base.opacity = settings.minOpacity + reveal * (1 - settings.minOpacity)
        base.glow = reveal * 0.26
        base.ringOpacity *= reveal
    elif style == "revealRightToLeft":
        reveal = ease(p, settings.easing)
        base.maskDirection = "rightToLeft"
        base.maskProgress = reveal
        base.opacity = settings.minOpacity + reveal * (1 - settings.minOpacity)
        base.glow = reveal * 0.26
        base.ringOpacity *= reveal
    elif style == "revealTopDown":
        reveal = ease(p, settings.easing)
        base.maskDirection = "topToBottom"
        base.maskProgress = reveal
        base.opacity = settings.minOpacity + reveal * (1 - settings.minOpacity)
        base.glow = reveal * 0.26
        base.ringOpacity *= reveal
    elif style == "revealBottomUp":
        reveal = ease(p, settings.easing)
        base.maskDirection = "bottomToTop"
        base.maskProgress = reveal
        base.opacity = settings.minOpacity + reveal * (1 - settings.minOpacity)
        base.glow = reveal * 0.26
        base.ringOpacity *= reveal
    elif style == "irisDisappear":
        close = ease(p, settings.easing)
        visible = 1 - close
        base.maskDirection = "centerIn"
        base.maskProgress = close
        base.opacity = settings.minOpacity + visible * (1 - settings.minOpacity)
        base.glow = visible * 0.25
        base.ringOpacity *= visible
    elif style == "irisReveal":
        open_v = ease(p, settings.easing)
        base.maskDirection = "centerOut"
        base.maskProgress = open_v
        base.opacity = settings.minOpacity + open_v * (1 - settings.minOpacity)
        base.glow = open_v * 0.25
        base.ringOpacity *= open_v

    # If the ring is not enabled and the style doesn't force it, kill the ring.
    from .settings import RING_FORCED_STYLES
    if (not settings.ringEnabled) and (style not in RING_FORCED_STYLES):
        base.ringOpacity = 0
        base.secondRingOpacity = 0

    return base
