import { AnimationSettings } from "./animation";
import { ClippingReport, optimizationColorCount } from "./render";

export type TourProfileId =
  | "custom"
  | "small"
  | "medium"
  | "large"
  | "vrSafe"
  | "highAttention"
  | "lowFileSize";

export interface TourProfile {
  id: TourProfileId;
  name: string;
  settings?: Partial<AnimationSettings>;
}

export const tourProfiles: TourProfile[] = [
  { id: "custom", name: "Custom" },
  {
    id: "small",
    name: "3DVista Small Hotspot",
    settings: {
      fps: 24,
      padding: 32,
      exportScale: 0.75,
      scaleAmount: 1.14,
      bounce: 10,
      shake: 10,
      glowBlur: 12,
      glowOpacity: 0.35,
      ringThickness: 3,
      ringStartSize: 0.75,
      ringExpansion: 1.45,
      ringOpacity: 0.55,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "medium",
    name: "3DVista Medium Hotspot",
    settings: {
      fps: 24,
      padding: 44,
      exportScale: 1,
      scaleAmount: 1.2,
      bounce: 16,
      shake: 16,
      glowBlur: 18,
      glowOpacity: 0.48,
      ringThickness: 4,
      ringStartSize: 0.95,
      ringExpansion: 1.75,
      ringOpacity: 0.7,
      optimizationMode: "balanced",
      colorLimit: 256
    }
  },
  {
    id: "large",
    name: "3DVista Large Hotspot",
    settings: {
      fps: 30,
      padding: 64,
      exportScale: 1.35,
      scaleAmount: 1.24,
      bounce: 20,
      shake: 20,
      glowBlur: 24,
      glowOpacity: 0.55,
      ringThickness: 5,
      ringStartSize: 1,
      ringExpansion: 1.95,
      ringOpacity: 0.78,
      optimizationMode: "balanced",
      colorLimit: 256
    }
  },
  {
    id: "vrSafe",
    name: "VR-Safe Subtle",
    settings: {
      style: "breathe",
      duration: 1800,
      fps: 20,
      padding: 36,
      exportScale: 0.85,
      scaleAmount: 1.1,
      rotation: 0,
      bounce: 6,
      shake: 6,
      glowBlur: 10,
      glowOpacity: 0.28,
      ringEnabled: false,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "highAttention",
    name: "High-Attention Callout",
    settings: {
      style: "ringDraw",
      duration: 1200,
      fps: 30,
      padding: 72,
      exportScale: 1.15,
      scaleAmount: 1.28,
      rotation: 10,
      bounce: 20,
      shake: 20,
      glowBlur: 26,
      glowOpacity: 0.72,
      ringEnabled: true,
      ringThickness: 5,
      ringStartSize: 0.35,
      ringExpansion: 1.9,
      ringOpacity: 0.9,
      optimizationMode: "balanced",
      colorLimit: 256
    }
  },
  {
    id: "lowFileSize",
    name: "Low File Size Tour",
    settings: {
      duration: 1100,
      fps: 16,
      padding: 28,
      exportScale: 0.75,
      scaleAmount: 1.12,
      rotation: 6,
      bounce: 8,
      shake: 8,
      glowBlur: 8,
      glowOpacity: 0.3,
      ringThickness: 3,
      ringExpansion: 1.35,
      ringOpacity: 0.45,
      optimizationMode: "tiny",
      colorLimit: 64
    }
  }
];

export function applyTourProfile(settings: AnimationSettings, profileId: TourProfileId): AnimationSettings {
  const profile = tourProfiles.find((item) => item.id === profileId);
  if (!profile?.settings) return settings;
  return {
    ...settings,
    ...profile.settings
  };
}

export function tourWarnings(settings: AnimationSettings, clippingReport: ClippingReport | null) {
  const warnings: string[] = [];
  const maxDimension = clippingReport ? Math.max(clippingReport.width, clippingReport.height) : 0;
  const frameCount = Math.round((settings.duration / 1000) * settings.fps);
  const movement = Math.max(settings.bounce, settings.shake);
  const colorCount = optimizationColorCount(settings);

  if (settings.fps > 30) warnings.push("High FPS may increase APNG size and tour loading cost.");
  if (frameCount > 75) warnings.push("Long/high-frame animation may feel heavy in mobile tours.");
  if (maxDimension > 420) warnings.push("Large export dimensions may slow tour loading.");
  if (movement > 80) warnings.push("Large movement can be distracting in VR or headset tours.");
  if (settings.rotation > 45) warnings.push("Strong rotation may be uncomfortable in VR.");
  if (settings.scaleAmount > 1.7) warnings.push("Large scaling can feel aggressive for hotspot navigation.");
  if (settings.glowBlur > 45 || settings.ringExpansion > 3.5) warnings.push("Large glow/ring effects may require more padding and bigger APNGs.");
  if (colorCount === 0) warnings.push("Quality mode is lossless and can create larger APNGs.");

  return warnings;
}
