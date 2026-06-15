import UPNG from "upng-js";
import { AnimationSettings, frameState } from "./animation";

export interface SourceImage {
  element: HTMLImageElement;
  width: number;
  height: number;
  name: string;
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
    settings.style === "focusHalo")
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

export function renderHotspotFrame(
  context: CanvasRenderingContext2D,
  image: SourceImage,
  settings: AnimationSettings,
  progress: number,
  previewBackground = false
) {
  const canvas = context.canvas;
  const state = frameState(progress, settings);
  const scale = settings.exportScale;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  const baseRadius = Math.max(imageWidth, imageHeight) / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);

  if (previewBackground) {
    drawCheckerboard(context, settings.background);
  }

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
    context.drawImage(image.element, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    context.restore();
  }

  context.save();
  context.translate(centerX + state.offsetX * scale, centerY + state.offsetY * scale);
  context.rotate((state.rotation * Math.PI) / 180);
  context.scale(state.iconScale * state.scaleX, state.iconScale * state.scaleY);
  context.globalAlpha = state.opacity;
  context.drawImage(image.element, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  context.restore();

  if (state.sweep > 0) {
    context.save();
    context.translate(centerX + state.offsetX * scale, centerY + state.offsetY * scale);
    context.rotate((state.rotation * Math.PI) / 180);
    context.scale(state.iconScale * state.scaleX, state.iconScale * state.scaleY);
    context.globalAlpha = 0.55;
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

export function optimizationColorCount(settings: AnimationSettings) {
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

function drawCheckerboard(context: CanvasRenderingContext2D, background: string) {
  const canvas = context.canvas;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const size = 16;
  context.globalAlpha = 0.18;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      context.fillStyle = (x / size + y / size) % 2 === 0 ? "#ffffff" : "#000000";
      context.fillRect(x, y, size, size);
    }
  }
  context.globalAlpha = 1;
}
