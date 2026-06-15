import { AnimationSettings } from "./animation";

export type PresetSettings = Omit<AnimationSettings, "filename">;

export interface Preset {
  id: string;
  name: string;
  settings: PresetSettings;
  kind: "factory" | "user";
}

export const presetVersion = 1;

export function settingsToPreset(settings: AnimationSettings): PresetSettings {
  const { filename, ...presetSettings } = settings;
  return presetSettings;
}

export function applyPresetSettings(current: AnimationSettings, preset: PresetSettings): AnimationSettings {
  return {
    ...current,
    ...preset,
    ringStartSize: preset.ringStartSize ?? current.ringStartSize,
    optimizationMode: preset.optimizationMode ?? current.optimizationMode,
    colorLimit: preset.colorLimit ?? current.colorLimit,
    filename: current.filename
  };
}

const base: PresetSettings = {
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
  background: "#22313f"
};

export const factoryPresets: Preset[] = [
  {
    id: "factory-soft-pulse",
    name: "Soft Pulse",
    kind: "factory",
    settings: { ...base, style: "pulse", scaleAmount: 1.18, glowOpacity: 0.45, ringExpansion: 1.55 }
  },
  {
    id: "factory-vr-subtle",
    name: "VR Subtle",
    kind: "factory",
    settings: {
      ...base,
      style: "breathe",
      duration: 1900,
      fps: 24,
      scaleAmount: 1.12,
      glowOpacity: 0.32,
      ringEnabled: false
    }
  },
  {
    id: "factory-strong-callout",
    name: "Strong Callout",
    kind: "factory",
    settings: {
      ...base,
      style: "attention",
      scaleAmount: 1.35,
      rotation: 18,
      bounce: 24,
      glowOpacity: 0.75,
      ringExpansion: 2.05
    }
  },
  {
    id: "factory-horizontal-float",
    name: "Horizontal Float",
    kind: "factory",
    settings: {
      ...base,
      style: "floatHorizontal",
      duration: 1800,
      shake: 26,
      scaleAmount: 1.1,
      ringEnabled: false
    }
  },
  {
    id: "factory-clean-radar",
    name: "Clean Radar",
    kind: "factory",
    settings: {
      ...base,
      style: "radar",
      duration: 1600,
      scaleAmount: 1,
      glowOpacity: 0.25,
      ringThickness: 3,
      ringExpansion: 2.2,
      ringOpacity: 0.8
    }
  },
  {
    id: "factory-ring-draw",
    name: "Ring Draw",
    kind: "factory",
    settings: {
      ...base,
      style: "ringDraw",
      duration: 1300,
      scaleAmount: 1.08,
      glowOpacity: 0.45,
      ringThickness: 5,
      ringStartSize: 1.1,
      ringExpansion: 1.1,
      ringOpacity: 0.9
    }
  },
  {
    id: "factory-slide-right",
    name: "Slide Right",
    kind: "factory",
    settings: {
      ...base,
      style: "slideRight",
      duration: 1100,
      shake: 42,
      scaleAmount: 1.08,
      minOpacity: 0.15,
      ringEnabled: false
    }
  },
  {
    id: "factory-slide-down",
    name: "Slide Down",
    kind: "factory",
    settings: {
      ...base,
      style: "slideDown",
      duration: 1100,
      bounce: 42,
      scaleAmount: 1.08,
      minOpacity: 0.15,
      ringEnabled: false
    }
  },
  {
    id: "factory-far-zoom-in",
    name: "Far Zoom In",
    kind: "factory",
    settings: {
      ...base,
      style: "farZoomIn",
      duration: 1200,
      scaleAmount: 1.45,
      minOpacity: 0.08,
      glowOpacity: 0.65,
      ringExpansion: 1.7
    }
  },
  {
    id: "factory-ping-double-ring",
    name: "Ping Double Ring",
    kind: "factory",
    settings: {
      ...base,
      style: "pingDoubleRing",
      duration: 1500,
      fps: 24,
      scaleAmount: 1.08,
      glowOpacity: 0.42,
      ringThickness: 4,
      ringStartSize: 0.3,
      ringExpansion: 2.1,
      ringOpacity: 0.76,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-focus-halo",
    name: "Focus Halo",
    kind: "factory",
    settings: {
      ...base,
      style: "focusHalo",
      duration: 1700,
      fps: 24,
      scaleAmount: 1.08,
      glowBlur: 20,
      glowOpacity: 0.58,
      ringThickness: 4,
      ringStartSize: 1,
      ringExpansion: 1.28,
      ringOpacity: 0.72
    }
  },
  {
    id: "factory-vr-gentle-pulse",
    name: "VR Gentle Pulse",
    kind: "factory",
    settings: {
      ...base,
      style: "vrGentlePulse",
      duration: 1900,
      fps: 20,
      scaleAmount: 1.08,
      glowBlur: 10,
      glowOpacity: 0.26,
      ringEnabled: false,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-low-file-size",
    name: "Low File Size",
    kind: "factory",
    settings: {
      ...base,
      style: "flashGlow",
      duration: 1200,
      fps: 18,
      padding: 36,
      scaleAmount: 1.14,
      glowBlur: 14,
      ringExpansion: 1.45,
      optimizationMode: "small",
      colorLimit: 128
    }
  }
];
