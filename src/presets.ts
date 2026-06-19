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

const disappearBase: PresetSettings = {
  ...base,
  duration: 1300,
  fps: 24,
  scaleAmount: 1.04,
  minOpacity: 0.05,
  glowBlur: 12,
  glowOpacity: 0.24,
  ringEnabled: false,
  easing: "easeInOut",
  optimizationMode: "small",
  colorLimit: 128
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
    id: "factory-velvet-breath",
    name: "Velvet Breath",
    kind: "factory",
    settings: {
      ...base,
      style: "velvetBreath",
      duration: 2200,
      fps: 24,
      scaleAmount: 1.09,
      minOpacity: 0.9,
      glowBlur: 16,
      glowOpacity: 0.34,
      ringThickness: 3,
      ringExpansion: 1.36,
      ringOpacity: 0.42,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-silk-drift",
    name: "Silk Drift",
    kind: "factory",
    settings: {
      ...base,
      style: "silkDrift",
      duration: 2400,
      fps: 24,
      scaleAmount: 1.05,
      bounce: 12,
      shake: 12,
      glowBlur: 14,
      glowOpacity: 0.28,
      ringEnabled: false,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-quiet-halo",
    name: "Quiet Halo",
    kind: "factory",
    settings: {
      ...base,
      style: "quietHalo",
      duration: 2300,
      fps: 24,
      scaleAmount: 1.06,
      glowBlur: 18,
      glowOpacity: 0.3,
      ringThickness: 3,
      ringStartSize: 0.96,
      ringExpansion: 1.28,
      ringOpacity: 0.5,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-pearl-shimmer",
    name: "Pearl Shimmer",
    kind: "factory",
    settings: {
      ...base,
      style: "pearlShimmer",
      duration: 2100,
      fps: 24,
      scaleAmount: 1.04,
      glowBlur: 12,
      glowOpacity: 0.3,
      ringEnabled: false,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-calm-orbit",
    name: "Calm Orbit",
    kind: "factory",
    settings: {
      ...base,
      style: "calmOrbit",
      duration: 2600,
      fps: 24,
      scaleAmount: 1.04,
      rotation: 6,
      bounce: 10,
      shake: 10,
      glowBlur: 14,
      glowOpacity: 0.28,
      ringEnabled: false,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-slow-bloom",
    name: "Slow Bloom",
    kind: "factory",
    settings: {
      ...base,
      style: "slowBloom",
      duration: 2500,
      fps: 24,
      scaleAmount: 1.08,
      minOpacity: 0.88,
      glowBlur: 18,
      glowOpacity: 0.36,
      ringThickness: 3,
      ringStartSize: 0.86,
      ringExpansion: 1.42,
      ringOpacity: 0.5,
      optimizationMode: "small",
      colorLimit: 128
    }
  },
  {
    id: "factory-soft-disappear",
    name: "Soft Disappear",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "softDisappear",
      duration: 1500,
      scaleAmount: 1.08
    }
  },
  {
    id: "factory-soft-dissolve",
    name: "Soft Dissolve",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "softDissolve",
      duration: 1500,
      glowOpacity: 0.2
    }
  },
  {
    id: "factory-shape-right-to-left",
    name: "Shape Right to Left",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "shapeRightToLeft"
    }
  },
  {
    id: "factory-shape-left-to-right",
    name: "Shape Left to Right",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "shapeLeftToRight"
    }
  },
  {
    id: "factory-shape-top-down",
    name: "Shape Top Down",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "shapeTopDown"
    }
  },
  {
    id: "factory-shape-bottom-up",
    name: "Shape Bottom Up",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "shapeBottomUp"
    }
  },
  {
    id: "factory-reveal-left-to-right",
    name: "Reveal Left to Right",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "revealLeftToRight",
      duration: 1200
    }
  },
  {
    id: "factory-reveal-right-to-left",
    name: "Reveal Right to Left",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "revealRightToLeft",
      duration: 1200
    }
  },
  {
    id: "factory-reveal-top-down",
    name: "Reveal Top Down",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "revealTopDown",
      duration: 1200
    }
  },
  {
    id: "factory-reveal-bottom-up",
    name: "Reveal Bottom Up",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "revealBottomUp",
      duration: 1200
    }
  },
  {
    id: "factory-iris-disappear",
    name: "Iris Disappear",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "irisDisappear",
      duration: 1400
    }
  },
  {
    id: "factory-iris-reveal",
    name: "Iris Reveal",
    kind: "factory",
    settings: {
      ...disappearBase,
      style: "irisReveal",
      duration: 1400
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
