export type AnimationStyle =
  | "pulse"
  | "breathe"
  | "pop"
  | "bounce"
  | "wiggle"
  | "spin"
  | "glow"
  | "radar"
  | "heartbeat"
  | "attention"
  | "float"
  | "floatHorizontal"
  | "blink"
  | "swing"
  | "wobble"
  | "zoomSpin"
  | "beacon"
  | "shimmer"
  | "elastic"
  | "floatDiagonal"
  | "orbit"
  | "tremble"
  | "doublePulse"
  | "tiltPulse"
  | "slide"
  | "slideRight"
  | "slideLeft"
  | "slideDown"
  | "slideUp"
  | "rubberBand"
  | "flashGlow"
  | "ringDraw"
  | "farZoomIn"
  | "breathingRing"
  | "pingDoubleRing"
  | "softLift"
  | "magnetPop"
  | "focusHalo"
  | "sweepGlow"
  | "compassNudge"
  | "vrGentlePulse"
  | "clickRipple"
  | "ringDrawReverse";

export type Easing =
  | "linear"
  | "sine"
  | "easeInOut"
  | "easeOut"
  | "spring";

export type OptimizationMode =
  | "quality"
  | "balanced"
  | "small"
  | "tiny"
  | "custom";

export interface AnimationSettings {
  style: AnimationStyle;
  duration: number;
  fps: number;
  delay: number;
  padding: number;
  exportScale: number;
  scaleAmount: number;
  minOpacity: number;
  rotation: number;
  bounce: number;
  shake: number;
  glowColor: string;
  glowBlur: number;
  glowOpacity: number;
  ringEnabled: boolean;
  ringColor: string;
  ringThickness: number;
  ringStartSize: number;
  ringExpansion: number;
  ringOpacity: number;
  easing: Easing;
  optimizationMode: OptimizationMode;
  colorLimit: number;
  background: string;
  filename: string;
}

export interface FrameState {
  iconScale: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  glow: number;
  sweep: number;
  ringScale: number;
  ringOpacity: number;
  ringDraw: number;
  secondRingScale: number;
  secondRingOpacity: number;
  secondRingDraw: number;
}

export const defaultSettings: AnimationSettings = {
  style: "pulse",
  duration: 1400,
  fps: 30,
  delay: 0,
  padding: 48,
  exportScale: 1,
  scaleAmount: 1.22,
  minOpacity: 0.72,
  rotation: 12,
  bounce: 14,
  shake: 8,
  glowColor: "#00c2ff",
  glowBlur: 22,
  glowOpacity: 0.55,
  ringEnabled: true,
  ringColor: "#00c2ff",
  ringThickness: 4,
  ringStartSize: 1,
  ringExpansion: 1.75,
  ringOpacity: 0.72,
  easing: "sine",
  optimizationMode: "balanced",
  colorLimit: 256,
  background: "#22313f",
  filename: "hotspot-animated"
};

export const animationLabels: Record<AnimationStyle, string> = {
  pulse: "Pulse",
  breathe: "Breathe",
  pop: "Pop",
  bounce: "Bounce",
  wiggle: "Wiggle",
  spin: "Spin",
  glow: "Glow",
  radar: "Radar Ring",
  heartbeat: "Heartbeat",
  attention: "Grab Attention",
  float: "Float",
  floatHorizontal: "Float Horizontal",
  blink: "Blink",
  swing: "Swing",
  wobble: "Wobble",
  zoomSpin: "Zoom Spin",
  beacon: "Beacon",
  shimmer: "Shimmer",
  elastic: "Elastic",
  floatDiagonal: "Float Diagonal",
  orbit: "Orbit",
  tremble: "Tremble",
  doublePulse: "Double Pulse",
  tiltPulse: "Tilt Pulse",
  slide: "Slide",
  slideRight: "Slide Right",
  slideLeft: "Slide Left",
  slideDown: "Slide Down",
  slideUp: "Slide Up",
  rubberBand: "Rubber Band",
  flashGlow: "Flash Glow",
  ringDraw: "Ring Draw",
  farZoomIn: "Far Zoom In",
  breathingRing: "Breathing Ring",
  pingDoubleRing: "Ping Double Ring",
  softLift: "Soft Lift",
  magnetPop: "Magnet Pop",
  focusHalo: "Focus Halo",
  sweepGlow: "Sweep Glow",
  compassNudge: "Compass Nudge",
  vrGentlePulse: "VR Gentle Pulse",
  clickRipple: "Click Me Ripple",
  ringDrawReverse: "Ring Draw Reverse"
};

export function ease(value: number, easing: Easing) {
  const t = clamp01(value);
  if (easing === "linear") return t;
  if (easing === "easeOut") return 1 - Math.pow(1 - t, 3);
  if (easing === "easeInOut") {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  if (easing === "spring") {
    return clamp01(1 - Math.cos(t * Math.PI * 4.5) * Math.exp(-t * 5));
  }
  return (1 - Math.cos(t * Math.PI)) / 2;
}

export function frameState(progress: number, settings: AnimationSettings): FrameState {
  const p = clamp01(progress);
  const wave = ease(p, settings.easing);
  const sin = Math.sin(p * Math.PI * 2);
  const bounceCurve = Math.abs(Math.sin(p * Math.PI));
  const quickPulse = Math.abs(Math.sin(p * Math.PI * 4));
  const scaleDelta = Math.max(0, settings.scaleAmount - 1);
  const base: FrameState = {
    iconScale: 1,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    glow: 0,
    sweep: 0,
    ringScale: ringScaleAt(wave, settings),
    ringOpacity: (1 - wave) * settings.ringOpacity,
    ringDraw: 1,
    secondRingScale: ringScaleAt(0, settings),
    secondRingOpacity: 0,
    secondRingDraw: 1
  };

  if (settings.style === "pulse") {
    base.iconScale = 1 + wave * scaleDelta;
    base.opacity = 1 - wave * (1 - settings.minOpacity);
    base.glow = wave;
  }

  if (settings.style === "breathe") {
    base.iconScale = 1 + ((sin + 1) / 2) * scaleDelta;
    base.glow = (sin + 1) / 2;
  }

  if (settings.style === "pop") {
    const pop = p < 0.45 ? ease(p / 0.45, "easeOut") : 1 - ease((p - 0.45) / 0.55, "easeInOut") * 0.25;
    base.iconScale = 0.9 + pop * (settings.scaleAmount - 0.9);
    base.glow = pop;
  }

  if (settings.style === "bounce") {
    base.offsetY = -bounceCurve * settings.bounce;
    base.iconScale = 1 + bounceCurve * scaleDelta * 0.55;
  }

  if (settings.style === "wiggle") {
    base.rotation = Math.sin(p * Math.PI * 6) * settings.rotation;
    base.offsetX = Math.sin(p * Math.PI * 8) * settings.shake;
  }

  if (settings.style === "spin") {
    base.rotation = p * 360;
    base.iconScale = 1 + ((sin + 1) / 2) * scaleDelta * 0.4;
  }

  if (settings.style === "glow") {
    base.glow = (sin + 1) / 2;
    base.iconScale = 1 + base.glow * scaleDelta * 0.35;
  }

  if (settings.style === "radar") {
    base.glow = 0.25;
    base.ringScale = ringScaleAt(wave, settings);
    base.ringOpacity = (1 - wave) * settings.ringOpacity;
  }

  if (settings.style === "heartbeat") {
    const beatOne = Math.exp(-Math.pow((p - 0.18) / 0.08, 2));
    const beatTwo = Math.exp(-Math.pow((p - 0.36) / 0.1, 2)) * 0.75;
    const beat = Math.max(beatOne, beatTwo);
    base.iconScale = 1 + beat * scaleDelta;
    base.glow = beat;
    base.ringOpacity *= beat > 0.1 ? 1 : 0.25;
  }

  if (settings.style === "attention") {
    base.iconScale = 1 + bounceCurve * scaleDelta * 0.8;
    base.rotation = Math.sin(p * Math.PI * 6) * settings.rotation;
    base.offsetY = -bounceCurve * settings.bounce * 0.5;
    base.glow = Math.max(wave, bounceCurve) * 0.9;
  }

  if (settings.style === "float") {
    base.offsetY = -Math.sin(p * Math.PI * 2) * settings.bounce;
    base.iconScale = 1 + ((sin + 1) / 2) * scaleDelta * 0.3;
    base.glow = ((sin + 1) / 2) * 0.5;
    base.ringOpacity *= 0.35;
  }

  if (settings.style === "floatHorizontal") {
    base.offsetX = Math.sin(p * Math.PI * 2) * settings.shake;
    base.iconScale = 1 + ((sin + 1) / 2) * scaleDelta * 0.3;
    base.glow = ((sin + 1) / 2) * 0.5;
    base.ringOpacity *= 0.35;
  }

  if (settings.style === "blink") {
    const visible = Math.sin(p * Math.PI * 6) > -0.15 ? 1 : settings.minOpacity;
    base.opacity = visible;
    base.glow = visible < 1 ? 0.15 : 0.75;
    base.iconScale = visible < 1 ? 0.96 : 1 + scaleDelta * 0.35;
    base.ringOpacity *= visible;
  }

  if (settings.style === "swing") {
    base.rotation = Math.sin(p * Math.PI * 2) * settings.rotation * 1.8;
    base.offsetX = Math.sin(p * Math.PI * 2) * settings.shake * 0.35;
    base.glow = Math.abs(sin) * 0.45;
  }

  if (settings.style === "wobble") {
    base.offsetX = Math.sin(p * Math.PI * 6) * settings.shake;
    base.rotation = Math.sin(p * Math.PI * 6) * settings.rotation;
    base.scaleX = 1 + Math.sin(p * Math.PI * 4) * scaleDelta * 0.45;
    base.scaleY = 1 - Math.sin(p * Math.PI * 4) * scaleDelta * 0.25;
    base.glow = quickPulse * 0.55;
  }

  if (settings.style === "zoomSpin") {
    base.iconScale = 0.85 + wave * (settings.scaleAmount - 0.85);
    base.rotation = wave * settings.rotation * 3;
    base.opacity = settings.minOpacity + wave * (1 - settings.minOpacity);
    base.glow = wave;
  }

  if (settings.style === "beacon") {
    base.iconScale = 1 + quickPulse * scaleDelta * 0.35;
    base.glow = quickPulse;
    base.ringScale = ringScaleAt((p * 2) % 1, settings);
    base.ringOpacity = (1 - ((p * 2) % 1)) * settings.ringOpacity;
  }

  if (settings.style === "shimmer") {
    base.opacity = settings.minOpacity + (1 - settings.minOpacity) * (0.55 + quickPulse * 0.45);
    base.iconScale = 1 + quickPulse * scaleDelta * 0.22;
    base.offsetX = Math.sin(p * Math.PI * 2) * settings.shake * 0.25;
    base.glow = quickPulse;
  }

  if (settings.style === "elastic") {
    const elastic = Math.sin(p * Math.PI * 5) * Math.exp(-p * 2.2);
    base.scaleX = 1 + elastic * scaleDelta * 1.3;
    base.scaleY = 1 - elastic * scaleDelta * 0.8;
    base.iconScale = 1 + Math.abs(elastic) * scaleDelta * 0.45;
    base.glow = Math.abs(elastic);
    base.ringOpacity *= Math.abs(elastic) > 0.12 ? 1 : 0.35;
  }

  if (settings.style === "floatDiagonal") {
    const drift = Math.sin(p * Math.PI * 2);
    base.offsetX = drift * settings.shake;
    base.offsetY = -drift * settings.bounce;
    base.iconScale = 1 + ((sin + 1) / 2) * scaleDelta * 0.25;
    base.glow = ((sin + 1) / 2) * 0.45;
    base.ringOpacity *= 0.3;
  }

  if (settings.style === "orbit") {
    base.offsetX = Math.cos(p * Math.PI * 2) * settings.shake;
    base.offsetY = Math.sin(p * Math.PI * 2) * settings.bounce;
    base.rotation = Math.sin(p * Math.PI * 2) * settings.rotation * 0.5;
    base.glow = 0.35 + quickPulse * 0.45;
    base.ringOpacity *= 0.45;
  }

  if (settings.style === "tremble") {
    base.offsetX = Math.sin(p * Math.PI * 24) * settings.shake * 0.45;
    base.offsetY = Math.cos(p * Math.PI * 20) * settings.bounce * 0.25;
    base.rotation = Math.sin(p * Math.PI * 28) * settings.rotation * 0.45;
    base.glow = 0.3 + quickPulse * 0.45;
  }

  if (settings.style === "doublePulse") {
    const pulseOne = Math.exp(-Math.pow((p - 0.2) / 0.11, 2));
    const pulseTwo = Math.exp(-Math.pow((p - 0.62) / 0.14, 2));
    const pulse = Math.max(pulseOne, pulseTwo * 0.85);
    base.iconScale = 1 + pulse * scaleDelta;
    base.opacity = 1 - pulse * (1 - settings.minOpacity) * 0.55;
    base.glow = pulse;
    base.ringScale = ringScaleAt(pulse, settings);
    base.ringOpacity = (1 - pulse * 0.35) * pulse * settings.ringOpacity;
  }

  if (settings.style === "tiltPulse") {
    base.iconScale = 1 + wave * scaleDelta;
    base.rotation = Math.sin(p * Math.PI * 2) * settings.rotation;
    base.glow = wave;
    base.opacity = 1 - wave * (1 - settings.minOpacity) * 0.45;
  }

  if (settings.style === "slide") {
    const slide = Math.sin(p * Math.PI * 2);
    base.offsetX = slide * settings.shake;
    base.opacity = settings.minOpacity + (1 - settings.minOpacity) * (1 - Math.abs(slide) * 0.35);
    base.iconScale = 1 + (1 - Math.abs(slide)) * scaleDelta * 0.35;
    base.glow = 1 - Math.abs(slide);
    base.ringOpacity *= 0.25;
  }

  if (settings.style === "slideRight") {
    const enter = ease(p, settings.easing);
    base.offsetX = (enter - 1) * settings.shake;
    base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity);
    base.iconScale = 0.92 + enter * (settings.scaleAmount - 0.92);
    base.glow = enter;
    base.ringOpacity *= enter;
  }

  if (settings.style === "slideLeft") {
    const enter = ease(p, settings.easing);
    base.offsetX = (1 - enter) * settings.shake;
    base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity);
    base.iconScale = 0.92 + enter * (settings.scaleAmount - 0.92);
    base.glow = enter;
    base.ringOpacity *= enter;
  }

  if (settings.style === "slideDown") {
    const enter = ease(p, settings.easing);
    base.offsetY = (enter - 1) * settings.bounce;
    base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity);
    base.iconScale = 0.92 + enter * (settings.scaleAmount - 0.92);
    base.glow = enter;
    base.ringOpacity *= enter;
  }

  if (settings.style === "slideUp") {
    const enter = ease(p, settings.easing);
    base.offsetY = (1 - enter) * settings.bounce;
    base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity);
    base.iconScale = 0.92 + enter * (settings.scaleAmount - 0.92);
    base.glow = enter;
    base.ringOpacity *= enter;
  }

  if (settings.style === "rubberBand") {
    const snap = Math.sin(p * Math.PI * 6) * Math.exp(-p * 2.8);
    base.scaleX = 1 + snap * scaleDelta * 1.6;
    base.scaleY = 1 - snap * scaleDelta;
    base.offsetX = Math.sin(p * Math.PI * 2) * settings.shake * 0.25;
    base.glow = Math.abs(snap);
  }

  if (settings.style === "flashGlow") {
    const flash = Math.pow(quickPulse, 4);
    base.iconScale = 1 + flash * scaleDelta * 0.55;
    base.opacity = settings.minOpacity + (1 - settings.minOpacity) * (0.65 + flash * 0.35);
    base.glow = flash;
    base.ringOpacity = flash * settings.ringOpacity;
    base.ringScale = ringScaleAt(flash, settings);
  }

  if (settings.style === "ringDraw") {
    const draw = ease(p, settings.easing);
    base.ringScale = ringScaleAt(0, settings);
    base.ringDraw = draw;
    base.ringOpacity = (draw < 0.92 ? 1 : 1 - ease((draw - 0.92) / 0.08, "easeOut") * 0.35) * settings.ringOpacity;
    base.iconScale = 1 + Math.sin(p * Math.PI) * scaleDelta * 0.25;
    base.glow = draw;
  }

  if (settings.style === "farZoomIn") {
    const enter = ease(p, settings.easing);
    const startScale = Math.max(0.08, 1 / Math.max(1.2, settings.scaleAmount * 2.2));
    base.iconScale = startScale + enter * (settings.scaleAmount - startScale);
    base.opacity = settings.minOpacity + enter * (1 - settings.minOpacity);
    base.glow = enter;
    base.ringScale = ringScaleAt(enter, settings);
    base.ringOpacity *= enter;
  }

  if (settings.style === "breathingRing") {
    const breathe = (sin + 1) / 2;
    base.iconScale = 1 + breathe * scaleDelta * 0.15;
    base.glow = breathe * 0.45;
    base.ringScale = ringScaleAt(breathe, settings);
    base.ringOpacity = (0.45 + breathe * 0.45) * settings.ringOpacity;
  }

  if (settings.style === "pingDoubleRing") {
    const first = p;
    const second = (p + 0.5) % 1;
    base.ringScale = ringScaleAt(first, settings);
    base.ringOpacity = (1 - first) * settings.ringOpacity;
    base.secondRingScale = ringScaleAt(second, settings);
    base.secondRingOpacity = (1 - second) * settings.ringOpacity * 0.75;
    base.glow = Math.max(1 - first, 1 - second) * 0.55;
    base.iconScale = 1 + quickPulse * scaleDelta * 0.16;
  }

  if (settings.style === "softLift") {
    const lift = Math.sin(p * Math.PI);
    base.offsetY = -lift * settings.bounce;
    base.iconScale = 1 + lift * scaleDelta * 0.2;
    base.glow = lift * 0.45;
    base.ringOpacity *= 0.25 + lift * 0.35;
  }

  if (settings.style === "magnetPop") {
    const pop = ease(p, "easeOut");
    const overshoot = Math.sin(p * Math.PI * 3) * Math.exp(-p * 4);
    base.iconScale = 0.72 + pop * (settings.scaleAmount - 0.72) + overshoot * scaleDelta * 0.7;
    base.opacity = settings.minOpacity + pop * (1 - settings.minOpacity);
    base.glow = pop;
    base.ringOpacity *= pop;
  }

  if (settings.style === "focusHalo") {
    const focus = (sin + 1) / 2;
    base.glow = focus;
    base.ringScale = ringScaleAt(focus * 0.35, settings);
    base.ringOpacity = (0.35 + focus * 0.65) * settings.ringOpacity;
    base.iconScale = 1 + focus * scaleDelta * 0.12;
  }

  if (settings.style === "sweepGlow") {
    base.sweep = p;
    base.glow = 0.25 + quickPulse * 0.35;
    base.iconScale = 1 + quickPulse * scaleDelta * 0.12;
    base.ringOpacity *= 0.25;
  }

  if (settings.style === "compassNudge") {
    const phase = Math.floor(p * 4);
    const local = Math.sin((p * 4 - phase) * Math.PI);
    const distanceX = settings.shake * local;
    const distanceY = settings.bounce * local;
    if (phase === 0) base.offsetY = -distanceY;
    if (phase === 1) base.offsetX = distanceX;
    if (phase === 2) base.offsetY = distanceY;
    if (phase === 3) base.offsetX = -distanceX;
    base.iconScale = 1 + local * scaleDelta * 0.18;
    base.glow = local * 0.5;
  }

  if (settings.style === "vrGentlePulse") {
    const gentle = (sin + 1) / 2;
    base.iconScale = 1 + gentle * Math.min(scaleDelta, 0.12);
    base.opacity = 0.88 + gentle * 0.12;
    base.glow = gentle * 0.3;
    base.ringOpacity *= 0.25;
  }

  if (settings.style === "clickRipple") {
    const ripple = ease(p, "easeOut");
    base.ringScale = ringScaleAt(ripple, settings);
    base.ringOpacity = (1 - ripple) * settings.ringOpacity;
    base.iconScale = 1 + Math.sin(p * Math.PI) * scaleDelta * 0.22;
    base.glow = 1 - ripple;
  }

  if (settings.style === "ringDrawReverse") {
    const draw = ease(p, settings.easing);
    base.ringScale = ringScaleAt(0, settings);
    base.ringDraw = 1 - draw;
    base.ringOpacity = (draw < 0.92 ? 1 : 1 - ease((draw - 0.92) / 0.08, "easeOut") * 0.35) * settings.ringOpacity;
    base.iconScale = 1 + Math.sin(p * Math.PI) * scaleDelta * 0.2;
    base.glow = 1 - draw * 0.4;
  }

  if (
    !settings.ringEnabled &&
    settings.style !== "radar" &&
    settings.style !== "beacon" &&
    settings.style !== "ringDraw" &&
    settings.style !== "ringDrawReverse" &&
    settings.style !== "pingDoubleRing" &&
    settings.style !== "clickRipple" &&
    settings.style !== "breathingRing" &&
    settings.style !== "focusHalo"
  ) {
    base.ringOpacity = 0;
    base.secondRingOpacity = 0;
  }

  return base;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function ringScaleAt(progress: number, settings: AnimationSettings) {
  const start = Math.max(0.05, settings.ringStartSize);
  const end = Math.max(0.05, settings.ringExpansion);
  return start + clamp01(progress) * (end - start);
}
