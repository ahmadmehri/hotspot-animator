import UPNG from "upng-js";
import { AnimationSettings, FrameState, OptimizationMode, frameState } from "./animation";

export interface SourceImage {
  element: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  previewUrl: string;
}

export interface ExportProgress {
  phase: "rendering" | "encoding" | "done";
  completed: number;
  total: number;
  percent: number;
}

export interface ClippingReport {
  isClipping: boolean;
  requiredPadding: number;
  shortage: number;
  width: number;
  height: number;
}

export function analyzeClipping(image: SourceImage, settings: AnimationSettings): ClippingReport {
  const samples = Math.max(24, Math.round((settings.duration / 1000) * settings.fps));
  const halfWidth = (image.width * settings.exportScale) / 2;
  const halfHeight = (image.height * settings.exportScale) / 2;
  let maxExtraX = 0;
  let maxExtraY = 0;

  for (let index = 0; index < samples; index += 1) {
    const state = frameState(index / samples, settings);
    const scaleX = state.iconScale * state.scaleX;
    const scaleY = state.iconScale * state.scaleY;
    const extraX = Math.abs(state.offsetX * settings.exportScale) + Math.max(0, halfWidth * scaleX - halfWidth);
    const extraY = Math.abs(state.offsetY * settings.exportScale) + Math.max(0, halfHeight * scaleY - halfHeight);
    maxExtraX = Math.max(maxExtraX, extraX);
    maxExtraY = Math.max(maxExtraY, extraY);
  }

  const glowExtra = settings.glowBlur * settings.exportScale * settings.glowOpacity;
  const ringRadius = (Math.max(image.width, image.height) * settings.exportScale) / 2;
  const ringExtra =
    (settings.ringEnabled ||
    settings.style === "radar" ||
    settings.style === "beacon" ||
    settings.style === "ringDraw" ||
    settings.style === "ringDrawReverse" ||
    settings.style === "pingDoubleRing" ||
    settings.style === "clickRipple" ||
    settings.style === "breathingRing" ||
    settings.style === "focusHalo" ||
    settings.style === "quietHalo" ||
    settings.style === "slowBloom")
      ? Math.max(0, ringRadius * Math.max(settings.ringStartSize, settings.ringExpansion) - ringRadius) +
        settings.ringThickness * settings.exportScale
      : 0;
  const requiredPadding = Math.ceil(Math.max(maxExtraX, maxExtraY, glowExtra, ringExtra));
  const currentPadding = Math.ceil(settings.padding * settings.exportScale);
  const shortage = Math.max(0, requiredPadding - currentPadding);

  return {
    isClipping: shortage > 0,
    requiredPadding: Math.ceil(requiredPadding / settings.exportScale),
    shortage: Math.ceil(shortage / settings.exportScale),
    width: Math.ceil((image.width + settings.padding * 2) * settings.exportScale),
    height: Math.ceil((image.height + settings.padding * 2) * settings.exportScale)
  };
}

export type PreviewBg = "checker" | "light" | "dark" | "custom";

export function renderHotspotFrame(
  context: CanvasRenderingContext2D,
  image: SourceImage,
  settings: AnimationSettings,
  progress: number,
  previewBackground: boolean | PreviewBg = false
) {
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (previewBackground) {
    const mode: PreviewBg = previewBackground === true ? "checker" : previewBackground;
    drawPreviewBackground(context, mode, settings.background);
  }

  drawLayer(context, image, settings, progress, settings.exportScale, canvas.width / 2, canvas.height / 2);
}

// Draw a single animated image (ring + glow + image + sweep) centred at
// (centerX, centerY). Does NOT clear or fill the canvas, so it can be called
// repeatedly to composite a stack of layers.
function drawLayer(
  context: CanvasRenderingContext2D,
  image: SourceImage,
  settings: AnimationSettings,
  progress: number,
  scale: number,
  centerX: number,
  centerY: number
) {
  const state = frameState(progress, settings);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  const baseRadius = Math.max(imageWidth, imageHeight) / 2;

  context.save();
  context.translate(centerX, centerY);
  if (state.ringOpacity > 0) {
    drawRing(context, baseRadius * state.ringScale, state.ringDraw, state.ringOpacity, settings, scale);
  }
  if (state.secondRingOpacity > 0) {
    drawRing(context, baseRadius * state.secondRingScale, state.secondRingDraw, state.secondRingOpacity, settings, scale);
  }
  context.restore();

  if (state.glow > 0 && settings.glowOpacity > 0 && settings.glowBlur > 0) {
    context.save();
    context.translate(centerX + state.offsetX * scale, centerY + state.offsetY * scale);
    context.rotate((state.rotation * Math.PI) / 180);
    context.scale(state.iconScale * state.scaleX, state.iconScale * state.scaleY);
    context.globalAlpha = state.glow * settings.glowOpacity;
    context.shadowColor = settings.glowColor;
    context.shadowBlur = settings.glowBlur * scale;
    drawMaskedImage(context, image.element, imageWidth, imageHeight, state);
    context.restore();
  }

  context.save();
  context.translate(centerX + state.offsetX * scale, centerY + state.offsetY * scale);
  context.rotate((state.rotation * Math.PI) / 180);
  context.scale(state.iconScale * state.scaleX, state.iconScale * state.scaleY);
  context.globalAlpha = state.opacity;
  drawMaskedImage(context, image.element, imageWidth, imageHeight, state);
  context.restore();

  if (state.sweep > 0) {
    context.save();
    context.translate(centerX + state.offsetX * scale, centerY + state.offsetY * scale);
    context.rotate((state.rotation * Math.PI) / 180);
    context.scale(state.iconScale * state.scaleX, state.iconScale * state.scaleY);
    context.globalAlpha = state.sweepOpacity;
    context.globalCompositeOperation = "source-atop";
    const sweepX = -imageWidth / 2 + imageWidth * state.sweep;
    const gradient = context.createLinearGradient(sweepX - imageWidth * 0.25, 0, sweepX + imageWidth * 0.25, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(-imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    context.restore();
  }
}

// ---- Multi-layer compositing ----

export interface CompositeLayer {
  image: SourceImage;
  settings: AnimationSettings;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

export interface CompositeDoc {
  fps: number;
  padding: number;
  exportScale: number;
  optimizationMode: OptimizationMode;
  colorLimit: number;
  background: string;
}

// Progress (0..1) of one layer at absolute time `timeMs`, honouring its own
// duration + delay loop (held at progress 0 during the delay tail).
function layerProgressAt(settings: AnimationSettings, timeMs: number) {
  const cycle = settings.duration + settings.delay;
  if (cycle <= 0) return 0;
  const elapsed = ((timeMs % cycle) + cycle) % cycle;
  if (elapsed > settings.duration || settings.duration <= 0) return 0;
  return elapsed / settings.duration;
}

export function renderCompositeFrame(
  context: CanvasRenderingContext2D,
  layers: CompositeLayer[],
  exportScale: number,
  background: string,
  timeMs: number,
  previewBackground: boolean | PreviewBg = false
) {
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (previewBackground) {
    const mode: PreviewBg = previewBackground === true ? "checker" : previewBackground;
    drawPreviewBackground(context, mode, background);
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const progress = layerProgressAt(layer.settings, timeMs);
    drawLayer(
      context,
      layer.image,
      layer.settings,
      progress,
      exportScale * layer.scale,
      centerX + layer.x * exportScale,
      centerY + layer.y * exportScale
    );
  }
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function lcm(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

export interface CompositeTimeline {
  periodMs: number;
  frameCount: number;
  exact: boolean;
}

// Combined loop length = least-common-multiple of every visible layer's
// (duration + delay). Capped so mismatched durations can't explode the frame
// count; `exact` reports whether the cap forced a non-seamless loop.
export function compositeTimeline(
  layers: CompositeLayer[],
  fps: number,
  capMs = 20000,
  maxFrames = 600
): CompositeTimeline {
  const visible = layers.filter((layer) => layer.visible);
  if (visible.length === 0) return { periodMs: 0, frameCount: 0, exact: true };

  // Fixed (style "none") layers never move, so they don't constrain the loop.
  const periods = visible
    .filter((layer) => layer.settings.style !== "none")
    .map((layer) => Math.max(1, Math.round(layer.settings.duration + layer.settings.delay)));
  // Every visible layer is fixed → a short static loop still exports cleanly.
  if (periods.length === 0) return { periodMs: 1000, frameCount: 2, exact: true };

  let period = periods[0];
  for (let index = 1; index < periods.length; index += 1) {
    period = lcm(period, periods[index]);
  }

  let exact = true;
  if (period > capMs) {
    period = Math.max(...periods);
    exact = false;
  }

  let frameCount = Math.max(2, Math.round((period / 1000) * fps));
  if (frameCount > maxFrames) {
    frameCount = maxFrames;
    exact = false;
  }

  return { periodMs: period, frameCount, exact };
}

// Half extent (in source px, pre-scale) a layer can occupy from its own centre,
// including animation motion, scale-up, ring and glow.
function layerExtent(image: SourceImage, settings: AnimationSettings, layerScale = 1) {
  const baseHalfW = (image.width * layerScale) / 2;
  const baseHalfH = (image.height * layerScale) / 2;
  const samples = 24;
  let extraX = 0;
  let extraY = 0;
  for (let index = 0; index < samples; index += 1) {
    const state = frameState(index / samples, settings);
    const scaleX = state.iconScale * state.scaleX;
    const scaleY = state.iconScale * state.scaleY;
    extraX = Math.max(extraX, Math.abs(state.offsetX) * layerScale + Math.max(0, baseHalfW * scaleX - baseHalfW));
    extraY = Math.max(extraY, Math.abs(state.offsetY) * layerScale + Math.max(0, baseHalfH * scaleY - baseHalfH));
  }

  const ringActive =
    settings.ringEnabled ||
    settings.style === "radar" ||
    settings.style === "beacon" ||
    settings.style === "ringDraw" ||
    settings.style === "ringDrawReverse" ||
    settings.style === "pingDoubleRing" ||
    settings.style === "clickRipple" ||
    settings.style === "breathingRing" ||
    settings.style === "focusHalo" ||
    settings.style === "quietHalo" ||
    settings.style === "slowBloom";
  const ringRadius = (Math.max(image.width, image.height) * layerScale) / 2;
  const ringExtra = ringActive
    ? Math.max(0, ringRadius * Math.max(settings.ringStartSize, settings.ringExpansion) - ringRadius) +
      settings.ringThickness * layerScale
    : 0;
  const glowExtra = settings.glowBlur * settings.glowOpacity * layerScale;

  return {
    halfW: baseHalfW + Math.max(extraX, ringExtra, glowExtra),
    halfH: baseHalfH + Math.max(extraY, ringExtra, glowExtra)
  };
}

export function compositeCanvasSize(layers: CompositeLayer[], padding: number, exportScale: number) {
  const visible = layers.filter((layer) => layer.visible);
  if (visible.length === 0) return { width: 1, height: 1 };

  let halfW = 0;
  let halfH = 0;
  for (const layer of visible) {
    const extent = layerExtent(layer.image, layer.settings, layer.scale);
    halfW = Math.max(halfW, Math.abs(layer.x) + extent.halfW);
    halfH = Math.max(halfH, Math.abs(layer.y) + extent.halfH);
  }

  return {
    width: Math.max(1, Math.ceil((halfW * 2 + padding * 2) * exportScale)),
    height: Math.max(1, Math.ceil((halfH * 2 + padding * 2) * exportScale))
  };
}

export async function exportCompositeApng(
  layers: CompositeLayer[],
  doc: CompositeDoc,
  onProgress?: (progress: ExportProgress) => void
) {
  const visible = layers.filter((layer) => layer.visible);
  if (visible.length === 0) throw new Error("Add at least one visible layer before exporting.");

  const { periodMs, frameCount } = compositeTimeline(layers, doc.fps);
  const { width, height } = compositeCanvasSize(layers, doc.padding, doc.exportScale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create canvas renderer.");

  const buffers: ArrayBuffer[] = [];
  const delays: number[] = [];
  const delayMs = Math.max(10, Math.round(1000 / doc.fps));

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = (index / frameCount) * periodMs;
    renderCompositeFrame(context, layers, doc.exportScale, doc.background, timeMs, false);
    buffers.push(context.getImageData(0, 0, width, height).data.buffer.slice(0));
    delays.push(delayMs);
    onProgress?.({
      phase: "rendering",
      completed: index + 1,
      total: frameCount,
      percent: Math.round(((index + 1) / frameCount) * 82)
    });
    if (index % 4 === 0) await nextFrame();
  }

  onProgress?.({ phase: "encoding", completed: frameCount, total: frameCount, percent: 92 });
  await nextFrame();
  const colors = optimizationColorCount({ optimizationMode: doc.optimizationMode, colorLimit: doc.colorLimit });
  const encoded = UPNG.encode(buffers, width, height, colors, delays);
  if (!hasPngChunk(encoded, "acTL") || !hasPngChunk(encoded, "fcTL")) {
    throw new Error("The encoder produced a static PNG instead of an animated PNG.");
  }
  onProgress?.({ phase: "done", completed: frameCount, total: frameCount, percent: 100 });
  return new Blob([encoded], { type: "image/apng" });
}

function drawMaskedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  state: FrameState
) {
  const progress = clamp01(state.maskProgress);
  const hasClip = state.maskDirection !== "none" && progress > 0 && progress < 1;
  const fullyHidden =
    (state.maskDirection !== "none" && progress <= 0) ||
    (state.maskDirection === "centerIn" && progress >= 1) ||
    state.dissolve >= 1;

  if (fullyHidden) return;

  if (!hasClip && state.dissolve <= 0) {
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = Math.max(1, Math.ceil(width));
  offscreen.height = Math.max(1, Math.ceil(height));
  const offscreenContext = offscreen.getContext("2d");
  if (!offscreenContext) {
    context.drawImage(image, -width / 2, -height / 2, width, height);
    return;
  }

  offscreenContext.save();
  applyMask(offscreenContext, offscreen.width, offscreen.height, state.maskDirection, progress);
  offscreenContext.drawImage(image, 0, 0, offscreen.width, offscreen.height);
  offscreenContext.restore();

  if (state.dissolve > 0) {
    applyDissolve(offscreenContext, offscreen.width, offscreen.height, clamp01(state.dissolve));
  }

  context.drawImage(offscreen, -width / 2, -height / 2, width, height);
}

function applyMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  direction: FrameState["maskDirection"],
  progress: number
) {
  if (direction === "none") return;

  context.beginPath();
  if (direction === "leftToRight") {
    context.rect(0, 0, width * progress, height);
  }
  if (direction === "rightToLeft") {
    context.rect(width * (1 - progress), 0, width * progress, height);
  }
  if (direction === "topToBottom") {
    context.rect(0, 0, width, height * progress);
  }
  if (direction === "bottomToTop") {
    context.rect(0, height * (1 - progress), width, height * progress);
  }
  if (direction === "centerOut") {
    context.arc(width / 2, height / 2, Math.hypot(width, height) * 0.5 * progress, 0, Math.PI * 2);
  }
  if (direction === "centerIn") {
    context.arc(width / 2, height / 2, Math.hypot(width, height) * 0.5 * (1 - progress), 0, Math.PI * 2);
  }
  context.clip();
}

function applyDissolve(context: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  const cell = Math.max(3, Math.floor(Math.min(width, height) / 14));
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "rgba(0, 0, 0, 0.94)";
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (noiseAt(x, y) < amount) {
        context.fillRect(x, y, cell + 1, cell + 1);
      }
    }
  }
  context.restore();
}

function noiseAt(x: number, y: number) {
  const value = Math.sin((x + 13) * 12.9898 + (y + 7) * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function drawRing(
  context: CanvasRenderingContext2D,
  radius: number,
  drawAmount: number,
  opacity: number,
  settings: AnimationSettings,
  scale: number
) {
  context.globalAlpha = opacity;
  context.strokeStyle = settings.ringColor;
  context.lineWidth = Math.max(1, settings.ringThickness * scale);
  context.lineCap = "round";
  context.beginPath();
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * drawAmount;
  context.arc(0, 0, radius, start, end, drawAmount < 0);
  context.stroke();
}

export async function exportApng(
  image: SourceImage,
  settings: AnimationSettings,
  onProgress?: (progress: ExportProgress) => void
) {
  const frameCount = Math.max(2, Math.round((settings.duration / 1000) * settings.fps));
  const delayMs = Math.max(10, Math.round(1000 / settings.fps));
  const width = Math.ceil((image.width + settings.padding * 2) * settings.exportScale);
  const height = Math.ceil((image.height + settings.padding * 2) * settings.exportScale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create canvas renderer.");

  const buffers: ArrayBuffer[] = [];
  const delays: number[] = [];
  const totalFrames = frameCount + (settings.delay > 0 ? 1 : 0);
  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / frameCount;
    renderHotspotFrame(context, image, settings, progress, false);
    const data = context.getImageData(0, 0, width, height);
    buffers.push(data.data.buffer.slice(0));
    delays.push(delayMs);
    onProgress?.({
      phase: "rendering",
      completed: index + 1,
      total: totalFrames,
      percent: Math.round(((index + 1) / totalFrames) * 82)
    });

    if (index % 4 === 0) {
      await nextFrame();
    }
  }

  if (settings.delay > 0) {
    renderHotspotFrame(context, image, settings, 0, false);
    const idle = context.getImageData(0, 0, width, height).data.buffer.slice(0);
    buffers.push(idle);
    delays.push(settings.delay);
    onProgress?.({
      phase: "rendering",
      completed: totalFrames,
      total: totalFrames,
      percent: 82
    });
  }

  onProgress?.({ phase: "encoding", completed: totalFrames, total: totalFrames, percent: 92 });
  await nextFrame();
  const encoded = UPNG.encode(buffers, width, height, optimizationColorCount(settings), delays);
  if (!hasPngChunk(encoded, "acTL") || !hasPngChunk(encoded, "fcTL")) {
    throw new Error("The encoder produced a static PNG instead of an animated PNG.");
  }
  onProgress?.({ phase: "done", completed: totalFrames, total: totalFrames, percent: 100 });
  return new Blob([encoded], { type: "image/apng" });
}

// ---- Sequence (slideshow) mode: play images one after another ----

export type SeqTransition =
  | "cut"
  | "crossfade"
  | "dissolve"
  | "wipeLeft"
  | "wipeRight"
  | "wipeUp"
  | "wipeDown"
  | "iris";

export interface SequenceFrame {
  image: SourceImage;
  scale: number;
  holdMs: number;
  transition: SeqTransition;
  transitionMs: number;
  visible: boolean;
}

export function sequenceCanvasSize(frames: SequenceFrame[], padding: number, exportScale: number) {
  const visible = frames.filter((frame) => frame.visible);
  if (visible.length === 0) return { width: 1, height: 1 };
  let width = 0;
  let height = 0;
  for (const frame of visible) {
    width = Math.max(width, frame.image.width * frame.scale);
    height = Math.max(height, frame.image.height * frame.scale);
  }
  return {
    width: Math.max(1, Math.ceil((width + padding * 2) * exportScale)),
    height: Math.max(1, Math.ceil((height + padding * 2) * exportScale))
  };
}

// Smallest time a single frame can occupy, so a frame is never literally 0 ms
// (which would make it invisible) — but small enough that near-zero timings
// stay snappy. Used identically by the timeline and the renderer so they agree.
const SEQ_MIN_SEGMENT_MS = 30;

interface SeqSegment {
  hold: number;
  trans: number;
  transition: SeqTransition;
  image: SourceImage;
  scale: number;
}

function sequenceSegments(frames: SequenceFrame[]): { segs: SeqSegment[]; period: number } {
  const visible = frames.filter((frame) => frame.visible);
  const segs: SeqSegment[] = visible.map((frame) => {
    const hold = Math.max(0, frame.holdMs);
    const trans = frame.transition === "cut" ? 0 : Math.max(0, frame.transitionMs);
    const total = hold + trans;
    // Pad only when a frame would otherwise be too short to ever render.
    const paddedHold = total < SEQ_MIN_SEGMENT_MS ? hold + (SEQ_MIN_SEGMENT_MS - total) : hold;
    return { hold: paddedHold, trans, transition: frame.transition, image: frame.image, scale: frame.scale };
  });
  const period = segs.reduce((sum, seg) => sum + seg.hold + seg.trans, 0);
  return { segs, period };
}

export function sequenceTimeline(frames: SequenceFrame[], fps: number, maxFrames = 600): CompositeTimeline {
  const { segs, period } = sequenceSegments(frames);
  if (segs.length === 0) return { periodMs: 0, frameCount: 0, exact: true };

  let frameCount = Math.max(2, Math.round((period / 1000) * fps));
  let exact = true;
  if (frameCount > maxFrames) {
    frameCount = maxFrames;
    exact = false;
  }
  return { periodMs: period, frameCount, exact };
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: SourceImage,
  scale: number,
  centerX: number,
  centerY: number,
  alpha: number
) {
  const width = image.width * scale;
  const height = image.height * scale;
  context.save();
  context.globalAlpha = alpha;
  context.drawImage(image.element, centerX - width / 2, centerY - height / 2, width, height);
  context.restore();
}

function drawTransition(
  context: CanvasRenderingContext2D,
  from: SourceImage,
  to: SourceImage,
  fromScale: number,
  toScale: number,
  progress: number,
  transition: SeqTransition,
  centerX: number,
  centerY: number
) {
  const canvas = context.canvas;
  const W = canvas.width;
  const H = canvas.height;
  const p = Math.max(0, Math.min(1, progress));

  if (transition === "crossfade" || transition === "cut") {
    drawContained(context, from, fromScale, centerX, centerY, 1 - p);
    drawContained(context, to, toScale, centerX, centerY, p);
    return;
  }

  if (transition === "dissolve") {
    drawContained(context, from, fromScale, centerX, centerY, 1 - p * 0.15);
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const oc = off.getContext("2d");
    if (oc) {
      drawContained(oc, to, toScale, centerX, centerY, 1);
      const cell = Math.max(3, Math.floor(Math.min(W, H) / 48));
      oc.globalCompositeOperation = "destination-out";
      oc.fillStyle = "rgba(0,0,0,1)";
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          if (noiseAt(x, y) > p) oc.fillRect(x, y, cell + 1, cell + 1);
        }
      }
      context.drawImage(off, 0, 0);
    } else {
      drawContained(context, to, toScale, centerX, centerY, p);
    }
    return;
  }

  // Wipe / iris: split the canvas so `to` occupies the revealed region and
  // `from` the remainder (no double-draw in the overlap).
  const reveal = (region: () => void) => {
    context.save();
    context.beginPath();
    region();
    context.clip();
    drawContained(context, to, toScale, centerX, centerY, 1);
    context.restore();
  };
  const remainder = (region: () => void) => {
    context.save();
    context.beginPath();
    region();
    context.clip();
    drawContained(context, from, fromScale, centerX, centerY, 1);
    context.restore();
  };

  if (transition === "wipeRight") {
    reveal(() => context.rect(0, 0, W * p, H));
    remainder(() => context.rect(W * p, 0, W * (1 - p), H));
  } else if (transition === "wipeLeft") {
    reveal(() => context.rect(W * (1 - p), 0, W * p, H));
    remainder(() => context.rect(0, 0, W * (1 - p), H));
  } else if (transition === "wipeDown") {
    reveal(() => context.rect(0, 0, W, H * p));
    remainder(() => context.rect(0, H * p, W, H * (1 - p)));
  } else if (transition === "wipeUp") {
    reveal(() => context.rect(0, H * (1 - p), W, H * p));
    remainder(() => context.rect(0, 0, W, H * (1 - p)));
  } else {
    // iris: growing circle reveals `to`
    const radius = Math.hypot(W, H) * 0.5 * p;
    drawContained(context, from, fromScale, centerX, centerY, 1);
    reveal(() => context.arc(centerX, centerY, radius, 0, Math.PI * 2));
  }
}

export function renderSequenceFrame(
  context: CanvasRenderingContext2D,
  frames: SequenceFrame[],
  exportScale: number,
  background: string,
  timeMs: number,
  previewBackground: boolean | PreviewBg = false
) {
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (previewBackground) {
    const mode: PreviewBg = previewBackground === true ? "checker" : previewBackground;
    drawPreviewBackground(context, mode, background);
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  const { segs, period } = sequenceSegments(frames);
  if (segs.length === 0) return;
  if (period <= 0) {
    drawContained(context, segs[0].image, exportScale * segs[0].scale, centerX, centerY, 1);
    return;
  }

  let t = ((timeMs % period) + period) % period;
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    if (t < seg.hold) {
      drawContained(context, seg.image, exportScale * seg.scale, centerX, centerY, 1);
      return;
    }
    t -= seg.hold;
    if (t < seg.trans) {
      const progress = seg.trans > 0 ? t / seg.trans : 1;
      const next = segs[(i + 1) % segs.length];
      drawTransition(
        context,
        seg.image,
        next.image,
        exportScale * seg.scale,
        exportScale * next.scale,
        progress,
        seg.transition,
        centerX,
        centerY
      );
      return;
    }
    t -= seg.trans;
  }
  const last = segs[segs.length - 1];
  drawContained(context, last.image, exportScale * last.scale, centerX, centerY, 1);
}

export async function exportSequenceApng(
  frames: SequenceFrame[],
  doc: CompositeDoc,
  onProgress?: (progress: ExportProgress) => void
) {
  const visible = frames.filter((frame) => frame.visible);
  if (visible.length === 0) throw new Error("Add at least one frame before exporting.");

  const { periodMs, frameCount } = sequenceTimeline(frames, doc.fps);
  const { width, height } = sequenceCanvasSize(frames, doc.padding, doc.exportScale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create canvas renderer.");

  const buffers: ArrayBuffer[] = [];
  const delays: number[] = [];
  const delayMs = Math.max(10, Math.round(1000 / doc.fps));

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = (index / frameCount) * periodMs;
    renderSequenceFrame(context, frames, doc.exportScale, doc.background, timeMs, false);
    buffers.push(context.getImageData(0, 0, width, height).data.buffer.slice(0));
    delays.push(delayMs);
    onProgress?.({
      phase: "rendering",
      completed: index + 1,
      total: frameCount,
      percent: Math.round(((index + 1) / frameCount) * 82)
    });
    if (index % 4 === 0) await nextFrame();
  }

  onProgress?.({ phase: "encoding", completed: frameCount, total: frameCount, percent: 92 });
  await nextFrame();
  const colors = optimizationColorCount({ optimizationMode: doc.optimizationMode, colorLimit: doc.colorLimit });
  const encoded = UPNG.encode(buffers, width, height, colors, delays);
  if (!hasPngChunk(encoded, "acTL") || !hasPngChunk(encoded, "fcTL")) {
    throw new Error("The encoder produced a static PNG instead of an animated PNG.");
  }
  onProgress?.({ phase: "done", completed: frameCount, total: frameCount, percent: 100 });
  return new Blob([encoded], { type: "image/apng" });
}

export function optimizationColorCount(settings: Pick<AnimationSettings, "optimizationMode" | "colorLimit">) {
  if (settings.optimizationMode === "quality") return 0;
  if (settings.optimizationMode === "balanced") return 256;
  if (settings.optimizationMode === "small") return 128;
  if (settings.optimizationMode === "tiny") return 64;
  return Math.max(2, Math.min(256, Math.round(settings.colorLimit)));
}

export function optimizationLabel(settings: AnimationSettings) {
  const colors = optimizationColorCount(settings);
  if (colors === 0) return "Lossless RGBA";
  return `${colors} colors`;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function hasPngChunk(buffer: ArrayBuffer, chunkName: string) {
  const bytes = new Uint8Array(buffer);
  const chunk = new TextEncoder().encode(chunkName);
  for (let index = 8; index <= bytes.length - chunk.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < chunk.length; offset += 1) {
      if (bytes[index + offset] !== chunk[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function drawPreviewBackground(context: CanvasRenderingContext2D, mode: PreviewBg, customColor: string) {
  const canvas = context.canvas;

  if (mode === "checker") {
    // Neutral transparency checker (independent of the custom color) so the
    // user sees exactly which pixels are transparent in the exported APNG.
    const size = 16;
    for (let y = 0; y < canvas.height; y += size) {
      for (let x = 0; x < canvas.width; x += size) {
        context.fillStyle = (x / size + y / size) % 2 === 0 ? "#ffffff" : "#d7dde1";
        context.fillRect(x, y, size, size);
      }
    }
    return;
  }

  const solid = mode === "light" ? "#f2f5f6" : mode === "dark" ? "#1d262e" : customColor;
  context.fillStyle = solid;
  context.fillRect(0, 0, canvas.width, canvas.height);
}
