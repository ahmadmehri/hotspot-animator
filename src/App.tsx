import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import JSZip from "jszip";
import {
  Download,
  ChevronDown,
  Copy,
  AlertTriangle,
  Coffee,
  FileImage,
  Gauge,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Github,
  ImagePlus,
  Layers as LayersIcon,
  ListVideo,
  Save,
  Trash2,
  Upload,
  Loader2,
  Moon,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Undo2,
  Youtube
} from "lucide-react";
import {
  AnimationSettings,
  AnimationStyle,
  animationLabels,
  defaultSettings,
  Easing,
  OptimizationMode
} from "./animation";
import {
  CompositeDoc,
  CompositeLayer,
  ExportProgress,
  PreviewBg,
  SeqTransition,
  SequenceFrame,
  compositeCanvasSize,
  compositeTimeline,
  exportCompositeApng,
  exportSequenceApng,
  optimizationLabel,
  renderCompositeFrame,
  renderSequenceFrame,
  sequenceCanvasSize,
  sequenceTimeline,
  SourceImage
} from "./render";
import {
  Preset,
  applyPresetSettings,
  factoryPresets,
  presetVersion,
  settingsToPreset
} from "./presets";
import { TourProfileId, applyTourProfile, tourProfiles, tourWarnings } from "./tourProfiles";
import hotspotAnimatorIcon from "./assets/hotspot-animator-icon-512.png";
import rockBenchLogo from "./assets/rock-bench-logo.jpg";

const styleGroups = ([
  {
    label: "No Animation",
    styles: ["none"] as AnimationStyle[]
  },
  {
    label: "Subtle / VR Safe",
    styles: ["breathe", "breathingRing", "focusHalo", "softLift", "vrGentlePulse"] as AnimationStyle[]
  },
  {
    label: "Gentle / Elegant",
    styles: ["calmOrbit", "pearlShimmer", "quietHalo", "silkDrift", "slowBloom", "velvetBreath"] as AnimationStyle[]
  },
  {
    label: "Disappear / Reveal",
    styles: [
      "irisDisappear",
      "irisReveal",
      "revealBottomUp",
      "revealLeftToRight",
      "revealRightToLeft",
      "revealTopDown",
      "shapeBottomUp",
      "shapeLeftToRight",
      "shapeRightToLeft",
      "shapeTopDown",
      "softDisappear",
      "softDissolve"
    ] as AnimationStyle[]
  },
  {
    label: "Pulse / Attention",
    styles: [
      "beacon",
      "clickRipple",
      "doublePulse",
      "flashGlow",
      "heartbeat",
      "magnetPop",
      "pingDoubleRing",
      "pop",
      "pulse"
    ] as AnimationStyle[]
  },
  {
    label: "Ring Effects",
    styles: ["radar", "ringDraw", "ringDrawReverse"] as AnimationStyle[]
  },
  {
    label: "Movement",
    styles: [
      "bounce",
      "compassNudge",
      "float",
      "floatDiagonal",
      "floatHorizontal",
      "orbit",
      "slide",
      "slideDown",
      "slideLeft",
      "slideRight",
      "slideUp"
    ] as AnimationStyle[]
  },
  {
    label: "Energetic",
    styles: [
      "attention",
      "elastic",
      "farZoomIn",
      "rubberBand",
      "shimmer",
      "spin",
      "sweepGlow",
      "swing",
      "tremble",
      "wiggle",
      "wobble",
      "zoomSpin"
    ] as AnimationStyle[]
  }
]).map((group): { label: string; styles: AnimationStyle[] } => ({
  ...group,
  styles: [...group.styles].sort((left, right) => animationLabels[left].localeCompare(animationLabels[right]))
}));
const easingOptions: Easing[] = ["sine", "easeInOut", "easeOut", "spring", "linear"];
const optimizationOptions: Array<{ value: OptimizationMode; label: string }> = [
  { value: "quality", label: "Quality" },
  { value: "balanced", label: "Balanced" },
  { value: "small", label: "Small File" },
  { value: "tiny", label: "Tiny File" },
  { value: "custom", label: "Custom Colors" }
];
const userPresetStorageKey = "hotspot-animator-user-presets";
const themeStorageKey = "hotspot-animator-theme";
const previewBgStorageKey = "hotspot-animator-preview-bg";
const settingsStorageKey = "hotspot-animator-settings";

type Theme = "light" | "dark";

type OutputWritable = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
};

type OutputFileHandle = {
  createWritable(): Promise<OutputWritable>;
};

type OutputDirectoryHandle = {
  name: string;
  getFileHandle(name: string, options: { create: boolean }): Promise<OutputFileHandle>;
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
};

type OutputPickerStartIn = "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";

type OutputDirectoryPickerOptions = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: OutputPickerStartIn;
};

type OutputSaveFilePickerOptions = {
  suggestedName: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: OutputDirectoryPickerOptions) => Promise<OutputDirectoryHandle>;
  showSaveFilePicker?: (options: OutputSaveFilePickerOptions) => Promise<OutputFileHandle>;
};

// Document-level settings apply to the whole exported APNG (one canvas, one
// output file). Everything else in AnimationSettings is per-layer animation.
interface DocSettings {
  fps: number;
  padding: number;
  exportScale: number;
  optimizationMode: OptimizationMode;
  colorLimit: number;
  background: string;
  filename: string;
}

const docKeys: Array<keyof DocSettings> = [
  "fps",
  "padding",
  "exportScale",
  "optimizationMode",
  "colorLimit",
  "background",
  "filename"
];

interface Layer {
  id: string;
  source: SourceImage;
  settings: AnimationSettings;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
  name: string;
  // Sequence-mode fields (ignored in compose mode).
  holdMs: number;
  transition: SeqTransition;
  transitionMs: number;
}

type AppMode = "compose" | "sequence";
const modeStorageKey = "hotspot-animator-mode";

const transitionOptions: Array<{ value: SeqTransition; label: string }> = [
  { value: "cut", label: "Cut (none)" },
  { value: "crossfade", label: "Crossfade" },
  { value: "dissolve", label: "Dissolve" },
  { value: "wipeRight", label: "Wipe →" },
  { value: "wipeLeft", label: "Wipe ←" },
  { value: "wipeDown", label: "Wipe ↓" },
  { value: "wipeUp", label: "Wipe ↑" },
  { value: "iris", label: "Iris" }
];

function loadInitialMode(): AppMode {
  try {
    const stored = localStorage.getItem(modeStorageKey);
    if (stored === "compose" || stored === "sequence") return stored;
  } catch {
    /* ignore */
  }
  return "compose";
}

interface DocSnapshot {
  layers: Layer[];
  doc: DocSettings;
  draftSettings: AnimationSettings;
}

function docFromSettings(settings: AnimationSettings): DocSettings {
  return {
    fps: settings.fps,
    padding: settings.padding,
    exportScale: settings.exportScale,
    optimizationMode: settings.optimizationMode,
    colorLimit: settings.colorLimit,
    background: settings.background,
    filename: settings.filename
  };
}

// Combine a layer's animation with the document fields so legacy helpers
// (tourWarnings, analyzeClipping) that expect a full AnimationSettings still work.
function effectiveSettings(settings: AnimationSettings, doc: DocSettings): AnimationSettings {
  return { ...settings, ...doc };
}

function loadInitialSettings(): AnimationSettings {
  try {
    const stored = localStorage.getItem(settingsStorageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        // Merge over defaults so settings added in later versions are filled in,
        // and an outdated/corrupt key can never drop a required field.
        return { ...defaultSettings, ...(parsed as Partial<AnimationSettings>) };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultSettings;
}

function loadInitialDoc(): DocSettings {
  return docFromSettings(loadInitialSettings());
}

let layerCounter = 0;
function makeLayer(source: SourceImage, settings: AnimationSettings): Layer {
  layerCounter += 1;
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    source,
    settings,
    x: 0,
    y: 0,
    scale: 1,
    visible: true,
    name: source.name,
    holdMs: 800,
    transition: "crossfade",
    transitionMs: 400
  };
}

const previewBgOptions: Array<{ value: PreviewBg; label: string; swatch: string }> = [
  { value: "checker", label: "Transparent", swatch: "swatch-checker" },
  { value: "light", label: "Light", swatch: "swatch-light" },
  { value: "dark", label: "Dark", swatch: "swatch-dark" }
];

function loadInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function loadInitialPreviewBg(): PreviewBg {
  try {
    const stored = localStorage.getItem(previewBgStorageKey);
    if (stored === "checker" || stored === "light" || stored === "dark" || stored === "custom") return stored;
  } catch {
    /* ignore */
  }
  return "checker";
}

const tips = {
  export: "Save a 3DVista-ready APNG.",
  import: "Load one transparent PNG.",
  reset: "Reset the selected layer's animation to defaults.",
  dropZone: "Drop or choose a PNG hotspot.",
  tourProfile: "Apply safe 3DVista defaults.",
  animationStyle: "Choose the motion effect.",
  duration: "Total animation length.",
  scaleAmount: "Maximum zoom size.",
  rotation: "Maximum turn amount.",
  verticalDistance: "Up/down travel distance.",
  horizontalDistance: "Left/right travel distance.",
  attentionRing: "Add an animated ring.",
  easing: "Controls motion smoothness.",
  fps: "Frames per second.",
  delay: "Pause before repeating.",
  padding: "Adds room around motion.",
  exportScale: "Resize exported APNG.",
  optimization: "Balance quality and file size.",
  colorLimit: "Limit APNG color count.",
  minOpacity: "Lowest fade level.",
  glowColor: "Glow effect color.",
  glowBlur: "Glow softness.",
  glowOpacity: "Glow strength.",
  ringColor: "Ring effect color.",
  ringThickness: "Ring line width.",
  ringStartSize: "Ring starting size.",
  ringExpansion: "Ring growth amount.",
  ringOpacity: "Ring visibility.",
  background: "Preview canvas color only.",
  filename: "Export file name.",
  advanced: "Fine-tune export settings.",
  batch: "Export many PNGs at once.",
  presets: "Save or reuse settings.",
  addBatch: "Add PNGs to the queue.",
  exportBatch: "Export queue as a ZIP.",
  clearBatch: "Empty the batch queue.",
  previewBatch: "Use this PNG in preview.",
  presetLibrary: "Choose a saved preset.",
  presetName: "Name for a user preset.",
  applyPreset: "Use selected preset.",
  savePreset: "Save current settings.",
  duplicatePreset: "Copy selected preset.",
  renamePreset: "Rename user preset.",
  deletePreset: "Delete user preset.",
  exportPresets: "Download user presets.",
  importPresets: "Load preset JSON."
};

type Capability =
  | "scale"
  | "opacity"
  | "rotation"
  | "vertical"
  | "horizontal"
  | "glow";

const capabilities: Record<Capability, AnimationStyle[]> = {
  scale: [
    "pulse",
    "breathe",
    "pop",
    "bounce",
    "spin",
    "glow",
    "heartbeat",
    "attention",
    "float",
    "floatHorizontal",
    "blink",
    "wobble",
    "zoomSpin",
    "beacon",
    "shimmer",
    "elastic",
    "floatDiagonal",
    "doublePulse",
    "tiltPulse",
    "rubberBand",
    "flashGlow",
    "ringDraw",
    "farZoomIn",
    "breathingRing",
    "pingDoubleRing",
    "softLift",
    "magnetPop",
    "focusHalo",
    "sweepGlow",
    "compassNudge",
    "vrGentlePulse",
    "clickRipple",
    "ringDrawReverse",
    "velvetBreath",
    "silkDrift",
    "quietHalo",
    "pearlShimmer",
    "calmOrbit",
    "slowBloom",
    "softDisappear"
  ],
  opacity: [
    "pulse",
    "blink",
    "zoomSpin",
    "shimmer",
    "doublePulse",
    "tiltPulse",
    "flashGlow",
    "farZoomIn",
    "magnetPop",
    "vrGentlePulse",
    "velvetBreath",
    "slowBloom",
    "softDisappear",
    "softDissolve",
    "shapeRightToLeft",
    "shapeLeftToRight",
    "shapeTopDown",
    "shapeBottomUp",
    "revealLeftToRight",
    "revealRightToLeft",
    "revealTopDown",
    "revealBottomUp",
    "irisDisappear",
    "irisReveal"
  ],
  rotation: ["wiggle", "spin", "attention", "swing", "wobble", "zoomSpin", "orbit", "tremble", "tiltPulse", "calmOrbit"],
  vertical: [
    "bounce",
    "attention",
    "float",
    "floatDiagonal",
    "orbit",
    "tremble",
    "slideDown",
    "slideUp",
    "softLift",
    "compassNudge",
    "silkDrift",
    "calmOrbit"
  ],
  horizontal: [
    "wiggle",
    "floatHorizontal",
    "swing",
    "wobble",
    "shimmer",
    "floatDiagonal",
    "orbit",
    "tremble",
    "slide",
    "slideRight",
    "slideLeft",
    "rubberBand",
    "compassNudge",
    "silkDrift",
    "calmOrbit"
  ],
  glow: [
    "pulse",
    "breathe",
    "pop",
    "glow",
    "radar",
    "heartbeat",
    "attention",
    "float",
    "floatHorizontal",
    "blink",
    "swing",
    "wobble",
    "zoomSpin",
    "beacon",
    "shimmer",
    "elastic",
    "floatDiagonal",
    "orbit",
    "tremble",
    "doublePulse",
    "tiltPulse",
    "rubberBand",
    "flashGlow",
    "ringDraw",
    "farZoomIn",
    "breathingRing",
    "pingDoubleRing",
    "softLift",
    "magnetPop",
    "focusHalo",
    "sweepGlow",
    "compassNudge",
    "vrGentlePulse",
    "clickRipple",
    "ringDrawReverse",
    "velvetBreath",
    "silkDrift",
    "quietHalo",
    "pearlShimmer",
    "calmOrbit",
    "slowBloom",
    "softDisappear",
    "softDissolve",
    "shapeRightToLeft",
    "shapeLeftToRight",
    "shapeTopDown",
    "shapeBottomUp",
    "revealLeftToRight",
    "revealRightToLeft",
    "revealTopDown",
    "revealBottomUp",
    "irisDisappear",
    "irisReveal"
  ]
};

export function App() {
  const [doc, setDoc] = useState<DocSettings>(loadInitialDoc);
  const [draftSettings, setDraftSettings] = useState<AnimationSettings>(loadInitialSettings);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>("");
  const [batchSources, setBatchSources] = useState<SourceImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [batchProgress, setBatchProgress] = useState<ExportProgress | null>(null);
  const [message, setMessage] = useState("Import a transparent PNG to begin.");
  const [userPresets, setUserPresets] = useState<Preset[]>(() => loadUserPresets());
  const [selectedPresetId, setSelectedPresetId] = useState(factoryPresets[0]?.id ?? "");
  const [presetName, setPresetName] = useState("My hotspot preset");
  const [tourProfileId, setTourProfileId] = useState<TourProfileId>("custom");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(loadInitialTheme);
  const [previewBg, setPreviewBg] = useState<PreviewBg>(loadInitialPreviewBg);
  const [mode, setMode] = useState<AppMode>(loadInitialMode);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [outputDirectory, setOutputDirectory] = useState<OutputDirectoryHandle | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] = useState("");
  const [outputAccess, setOutputAccess] = useState(() => ({
    secure: window.isSecureContext,
    directory: typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function",
    saveAs: typeof (window as DirectoryPickerWindow).showSaveFilePicker === "function"
  }));
  const [outputStatus, setOutputStatus] = useState("");
  const playheadRef = useRef(0);
  const hasLayersRef = useRef(false);
  const activeLayerIdRef = useRef("");
  const draftSettingsRef = useRef<AnimationSettings>(defaultSettings);
  const layersRef = useRef<Layer[]>([]);
  const docRef = useRef<DocSettings>(docFromSettings(defaultSettings));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef<{ past: DocSnapshot[]; future: DocSnapshot[] }>({ past: [], future: [] });
  const lastCommittedRef = useRef<DocSnapshot | null>(null);
  const snapshotRef = useRef<DocSnapshot | null>(null);
  const settingsSaveTimerRef = useRef<number | undefined>(undefined);
  const timeTravelRef = useRef(false);
  const commitTimerRef = useRef<number | undefined>(undefined);
  const presetImportRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const layersInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    scale: number;
  } | null>(null);

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? null,
    [layers, activeLayerId]
  );
  const settings = activeLayer ? activeLayer.settings : draftSettings;
  const source = activeLayer?.source ?? null;
  const hasLayers = layers.length > 0;
  const effective = useMemo(() => effectiveSettings(settings, doc), [settings, doc]);
  const compositeLayers = useMemo<CompositeLayer[]>(
    () =>
      layers.map((layer) => ({
        image: layer.source,
        settings: layer.settings,
        x: layer.x,
        y: layer.y,
        scale: layer.scale ?? 1,
        visible: layer.visible
      })),
    [layers]
  );
  const seqFrames = useMemo<SequenceFrame[]>(
    () =>
      layers.map((layer) => ({
        image: layer.source,
        scale: layer.scale ?? 1,
        holdMs: layer.holdMs,
        transition: layer.transition,
        transitionMs: layer.transitionMs,
        visible: layer.visible
      })),
    [layers]
  );
  const isSequence = mode === "sequence";
  const timeline = useMemo(
    () => (isSequence ? sequenceTimeline(seqFrames, doc.fps) : compositeTimeline(compositeLayers, doc.fps)),
    [isSequence, seqFrames, compositeLayers, doc.fps]
  );
  const allPresets = useMemo(() => [...factoryPresets, ...userPresets], [userPresets]);
  const selectedPreset = allPresets.find((preset) => preset.id === selectedPresetId) ?? allPresets[0];
  const warnings = useMemo(() => tourWarnings(effective, null), [effective]);

  const snapshot = useMemo<DocSnapshot>(
    () => ({ layers, doc, draftSettings }),
    [layers, doc, draftSettings]
  );

  const canvasSize = useMemo(() => {
    if (!hasLayers) return { width: 1, height: 1 };
    return isSequence
      ? sequenceCanvasSize(seqFrames, doc.padding, doc.exportScale)
      : compositeCanvasSize(compositeLayers, doc.padding, doc.exportScale);
  }, [hasLayers, isSequence, seqFrames, compositeLayers, doc.padding, doc.exportScale]);

  const previewSize = useMemo(() => {
    if (!hasLayers) return { width: 520, height: 420 };
    const maxWidth = 370;
    const maxHeight = 305;
    const ratio = Math.min(maxWidth / canvasSize.width, maxHeight / canvasSize.height, 1);
    return {
      width: Math.max(280, Math.round(canvasSize.width * ratio)),
      height: Math.max(240, Math.round(canvasSize.height * ratio))
    };
  }, [hasLayers, canvasSize]);

  const frameCount = timeline.frameCount;
  const outputDestinationText = outputDirectory
    ? `Selected folder: ${outputDirectoryName || outputDirectory.name}`
    : outputAccess.directory
      ? "No output folder selected. Exports will ask where to save or use Downloads until you choose one."
      : outputAccess.saveAs
        ? "Folder selection is not available in this browser. Exports will open Save As."
        : outputAccess.secure
          ? "Folder selection is blocked by this browser. Exports will use Downloads."
          : "Folder selection needs Chrome/Edge on localhost or HTTPS. Exports will use Downloads.";

  // Draw one composite frame at the given normalized position (0..1 of the
  // combined loop), sampling every layer at its own time.
  const renderFrame = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !hasLayers) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
      if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;
      const timeMs = progress * timeline.periodMs;
      if (isSequence) {
        renderSequenceFrame(context, seqFrames, doc.exportScale, doc.background, timeMs, previewBg);
      } else {
        renderCompositeFrame(context, compositeLayers, doc.exportScale, doc.background, timeMs, previewBg);
      }
    },
    [hasLayers, isSequence, seqFrames, compositeLayers, canvasSize, doc.exportScale, doc.background, timeline.periodMs, previewBg]
  );

  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    setOutputAccess({
      secure: window.isSecureContext,
      directory: typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function",
      saveAs: typeof (window as DirectoryPickerWindow).showSaveFilePicker === "function"
    });
  }, []);

  useEffect(() => {
    hasLayersRef.current = hasLayers;
  }, [hasLayers]);

  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
  }, [activeLayerId]);

  useEffect(() => {
    draftSettingsRef.current = draftSettings;
  }, [draftSettings]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    if (!hasLayers) return;
    if (!isPlaying) {
      // Paused: render the frame currently under the playhead.
      renderFrame(playheadRef.current);
      return;
    }
    let animationId = 0;
    let startTime = 0;
    let lastFrameIdx = -1;
    const periodMs = Math.max(1, timeline.periodMs);

    const tick = (now: number) => {
      if (!startTime) startTime = now - playheadRef.current * periodMs;
      const progress = (((now - startTime) % periodMs) + periodMs) % periodMs / periodMs;
      renderFrame(progress);
      playheadRef.current = progress;
      const idx = Math.floor(progress * frameCount);
      if (idx !== lastFrameIdx) {
        lastFrameIdx = idx;
        setPlayhead(progress);
      }
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [hasLayers, isPlaying, renderFrame, frameCount, timeline.periodMs]);

  const scrubTo = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      setIsPlaying(false);
      playheadRef.current = clamped;
      setPlayhead(clamped);
      renderFrame(clamped);
    },
    [renderFrame]
  );

  const stepFrame = useCallback(
    (direction: number) => {
      const raw = playheadRef.current + direction / Math.max(1, frameCount);
      const wrapped = ((raw % 1) + 1) % 1;
      setIsPlaying(false);
      playheadRef.current = wrapped;
      setPlayhead(wrapped);
      renderFrame(wrapped);
    },
    [frameCount, renderFrame]
  );

  const applySnapshot = useCallback((snap: DocSnapshot) => {
    timeTravelRef.current = true;
    setLayers(snap.layers);
    setDoc(snap.doc);
    setDraftSettings(snap.draftSettings);
  }, []);

  // ---- Undo / redo history (debounced so a slider drag = one step) ----
  // A snapshot is the whole editable document: layers, doc, and the pre-import
  // draft. So undo covers add/remove/reorder/move/visibility as well as tuning.
  useEffect(() => {
    snapshotRef.current = snapshot;
    if (lastCommittedRef.current === null) {
      lastCommittedRef.current = snapshot;
      return;
    }
    if (timeTravelRef.current) {
      timeTravelRef.current = false;
      lastCommittedRef.current = snapshot;
      return;
    }
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      if (snapshot === lastCommittedRef.current) return;
      const history = historyRef.current;
      history.past.push(lastCommittedRef.current as DocSnapshot);
      if (history.past.length > 100) history.past.shift();
      history.future = [];
      lastCommittedRef.current = snapshot;
      setCanUndo(true);
      setCanRedo(false);
    }, 350);
    return () => window.clearTimeout(commitTimerRef.current);
  }, [snapshot]);

  const undo = useCallback(() => {
    window.clearTimeout(commitTimerRef.current);
    const history = historyRef.current;
    // Commit any pending (un-debounced) change first so redo can return to it.
    if (snapshotRef.current && snapshotRef.current !== lastCommittedRef.current) {
      history.past.push(lastCommittedRef.current as DocSnapshot);
      history.future = [];
      lastCommittedRef.current = snapshotRef.current;
    }
    const previous = history.past.pop();
    if (!previous) {
      setCanUndo(false);
      return;
    }
    history.future.push(lastCommittedRef.current as DocSnapshot);
    lastCommittedRef.current = previous;
    applySnapshot(previous);
    setCanUndo(history.past.length > 0);
    setCanRedo(true);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    window.clearTimeout(commitTimerRef.current);
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) {
      setCanRedo(false);
      return;
    }
    history.past.push(lastCommittedRef.current as DocSnapshot);
    lastCommittedRef.current = next;
    applySnapshot(next);
    setCanUndo(true);
    setCanRedo(history.future.length > 0);
  }, [applySnapshot]);

  // Start a clean project: clears layers/frames, settings, mode and history.
  // App-level prefs (theme, preview background, saved presets) are kept.
  const newProject = useCallback(() => {
    if (
      layersRef.current.length > 0 &&
      !window.confirm("Start a new project? This clears all current layers/frames and settings.")
    ) {
      return;
    }
    historyRef.current = { past: [], future: [] };
    lastCommittedRef.current = null;
    setCanUndo(false);
    setCanRedo(false);
    setLayers([]);
    setActiveLayerId("");
    setBatchSources([]);
    setDraftSettings(defaultSettings);
    setDoc(docFromSettings(defaultSettings));
    setTourProfileId("custom");
    setMode("compose");
    setIsPlaying(true);
    setPlayhead(0);
    playheadRef.current = 0;
    setMessage("New project started. Import a PNG to begin.");
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (typing || !hasLayersRef.current) return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((current) => !current);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, stepFrame]);

  // Write to the active layer's animation, or the pre-import draft when no
  // layer is selected.
  const setActiveSettings = useCallback(
    (updater: (current: AnimationSettings) => AnimationSettings) => {
      setLayers((current) => {
        if (!hasLayersRef.current) return current;
        return current.map((layer) =>
          layer.id === activeLayerIdRef.current ? { ...layer, settings: updater(layer.settings) } : layer
        );
      });
      if (!hasLayersRef.current) setDraftSettings((current) => updater(current));
    },
    []
  );

  const update = <K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) => {
    setActiveSettings((current) => ({ ...current, [key]: value }));
  };

  const updateDoc = <K extends keyof DocSettings>(key: K, value: DocSettings[K]) => {
    setDoc((current) => ({ ...current, [key]: value }));
  };

  const updateActiveLayer = useCallback((patch: Partial<Pick<Layer, "x" | "y" | "scale" | "visible" | "name" | "holdMs" | "transition" | "transitionMs">>) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === activeLayerIdRef.current ? { ...layer, ...patch } : layer))
    );
  }, []);

  const applyActiveTimingToAllFrames = useCallback(() => {
    const active = layersRef.current.find((layer) => layer.id === activeLayerIdRef.current);
    if (!active) return;
    const timing = {
      holdMs: active.holdMs,
      transition: active.transition,
      transitionMs: active.transitionMs
    };
    setLayers((current) => current.map((layer) => ({ ...layer, ...timing })));
    setMessage("Frame timing applied to all sequence frames.");
  }, []);

  const addLayerFromImage = useCallback(
    (image: SourceImage, makeActive = true) => {
      const layer = makeLayer(image, { ...draftSettingsRef.current });
      setLayers((current) => [...current, layer]);
      if (makeActive) setActiveLayerId(layer.id);
      setDoc((current) =>
        current.filename && hasLayersRef.current ? current : { ...current, filename: `${image.name}-animated` }
      );
      return layer;
    },
    []
  );

  const removeLayer = useCallback((id: string) => {
    setLayers((current) => {
      const next = current.filter((layer) => layer.id !== id);
      setActiveLayerId((active) => (active === id ? next[next.length - 1]?.id ?? "" : active));
      return next;
    });
  }, []);

  const moveLayer = useCallback((id: string, direction: -1 | 1) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const toggleLayerVisible = useCallback((id: string) => {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)));
  }, []);

  const isFixed = settings.style === "none";
  const supports = (capability: Capability) => capabilities[capability].includes(settings.style);
  const ringForced =
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
  const ringActive = ringForced || settings.ringEnabled;

  // A tour profile carries both document fields (fps/scale/padding/optimization)
  // and animation fields, so it updates the doc AND the active layer's animation.
  const applyFullSettings = useCallback(
    (produce: (current: AnimationSettings) => AnimationSettings) => {
      const layerSettings = hasLayersRef.current
        ? layersRef.current.find((l) => l.id === activeLayerIdRef.current)?.settings ?? draftSettingsRef.current
        : draftSettingsRef.current;
      const next = produce(effectiveSettings(layerSettings, docRef.current));
      setActiveSettings(() => next);
      setDoc(docFromSettings(next));
    },
    [setActiveSettings]
  );

  const updateTourProfile = (profileId: TourProfileId) => {
    setTourProfileId(profileId);
    applyFullSettings((current) => applyTourProfile(current, profileId));
    const profile = tourProfiles.find((item) => item.id === profileId);
    if (profile && profile.id !== "custom") setMessage(`3DVista profile applied: ${profile.name}`);
  };

  useEffect(() => {
    localStorage.setItem(userPresetStorageKey, JSON.stringify(userPresets));
  }, [userPresets]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(previewBgStorageKey, previewBg);
    } catch {
      /* ignore */
    }
  }, [previewBg]);

  useEffect(() => {
    try {
      localStorage.setItem(modeStorageKey, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // Persist the active animation + document settings (debounced) so a reload
  // restores the last look. Images themselves can't be persisted, so this only
  // carries the tuning; new layers inherit it. filename is per-image, excluded.
  useEffect(() => {
    window.clearTimeout(settingsSaveTimerRef.current);
    settingsSaveTimerRef.current = window.setTimeout(() => {
      try {
        const { filename: _filename, ...persisted } = effective;
        localStorage.setItem(settingsStorageKey, JSON.stringify(persisted));
      } catch {
        /* ignore */
      }
    }, 300);
    return () => window.clearTimeout(settingsSaveTimerRef.current);
  }, [effective]);

  const applySelectedPreset = () => {
    if (!selectedPreset) return;
    applyFullSettings((current) => applyPresetSettings(current, selectedPreset.settings));
    setMessage(`Preset applied: ${selectedPreset.name}`);
  };

  const savePreset = () => {
    const trimmedName = presetName.trim() || "Untitled preset";
    const preset: Preset = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: trimmedName,
      kind: "user",
      settings: settingsToPreset(effective)
    };
    setUserPresets((current) => [...current, preset]);
    setSelectedPresetId(preset.id);
    setMessage(`Preset saved: ${trimmedName}`);
  };

  const duplicatePreset = () => {
    if (!selectedPreset) return;
    const copy: Preset = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: `${selectedPreset.name} Copy`,
      kind: "user",
      settings: { ...selectedPreset.settings }
    };
    setUserPresets((current) => [...current, copy]);
    setSelectedPresetId(copy.id);
    setPresetName(copy.name);
    setMessage(`Preset duplicated: ${copy.name}`);
  };

  const renamePreset = () => {
    if (!selectedPreset || selectedPreset.kind !== "user") return;
    const trimmedName = presetName.trim() || selectedPreset.name;
    setUserPresets((current) =>
      current.map((preset) => (preset.id === selectedPreset.id ? { ...preset, name: trimmedName } : preset))
    );
    setMessage(`Preset renamed: ${trimmedName}`);
  };

  const deletePreset = () => {
    if (!selectedPreset || selectedPreset.kind !== "user") return;
    setUserPresets((current) => current.filter((preset) => preset.id !== selectedPreset.id));
    setSelectedPresetId(factoryPresets[0]?.id ?? "");
    setMessage(`Preset deleted: ${selectedPreset.name}`);
  };

  const exportPresets = () => {
    const payload = {
      app: "Hotspot Animator",
      version: presetVersion,
      presets: userPresets.map((preset) => ({
        name: preset.name,
        settings: preset.settings
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hotspot-animator-presets.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("User presets exported.");
  };

  const importPresets = async (files: FileList | File[]) => {
    try {
      const imported: Preset[] = [];
      for (const file of Array.from(files)) {
        const payload = JSON.parse(await file.text()) as {
          presets?: Array<{ name?: string; settings?: Preset["settings"] }>;
        };
        imported.push(
          ...(payload.presets ?? [])
            .filter((preset) => preset.name && preset.settings)
            .map((preset) => ({
              id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: preset.name as string,
              kind: "user" as const,
              settings: preset.settings as Preset["settings"]
            }))
        );
      }

      if (imported.length === 0) {
        setMessage("No valid presets found in the selected file(s).");
        return;
      }

      setUserPresets((current) => [...current, ...imported]);
      setSelectedPresetId(imported[0].id);
      setMessage(`${imported.length} preset${imported.length === 1 ? "" : "s"} imported.`);
    } catch {
      setMessage("Preset import failed. Choose valid Hotspot Animator preset JSON files.");
    }
  };

  const importLayerFiles = useCallback(
    async (files: FileList | File[]) => {
      const pngFiles = Array.from(files).filter(
        (file) => file.type.includes("png") || file.name.toLowerCase().endsWith(".png")
      );
      if (pngFiles.length === 0) {
        setMessage("Choose one or more transparent PNG files.");
        return;
      }
      try {
        const loaded = await Promise.all(pngFiles.map(loadSourceImage));
        let lastId = "";
        loaded.forEach((image) => {
          lastId = addLayerFromImage(image, false).id;
        });
        if (lastId) setActiveLayerId(lastId);
        setMessage(`${loaded.length} layer${loaded.length === 1 ? "" : "s"} added.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "One or more PNG files could not be loaded.");
      }
    },
    [addLayerFromImage]
  );

  const importBatchFiles = useCallback(async (files: FileList | File[]) => {
    const pngFiles = Array.from(files).filter((file) => file.type.includes("png") || file.name.toLowerCase().endsWith(".png"));
    if (pngFiles.length === 0) {
      setMessage("Choose one or more PNG files for batch export.");
      return;
    }

    try {
      const loaded = await Promise.all(pngFiles.map(loadSourceImage));
      setBatchOpen(true);
      setBatchSources((current) => {
        const existingKeys = new Set(current.map((item) => item.name));
        const unique = loaded.filter((item) => !existingKeys.has(item.name));
        return [...current, ...unique];
      });

      if (!hasLayersRef.current && loaded[0]) {
        addLayerFromImage(loaded[0]);
      }

      setMessage(`${loaded.length} PNG file${loaded.length === 1 ? "" : "s"} added to batch queue.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "One or more PNG files could not be loaded.");
    }
  }, [source]);

  const compositeDoc: CompositeDoc = {
    fps: doc.fps,
    padding: doc.padding,
    exportScale: doc.exportScale,
    optimizationMode: doc.optimizationMode,
    colorLimit: doc.colorLimit,
    background: doc.background
  };

  const chooseOutputDirectory = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    const access = {
      secure: window.isSecureContext,
      directory: typeof picker === "function",
      saveAs: typeof (window as DirectoryPickerWindow).showSaveFilePicker === "function"
    };
    if (!access.secure) {
      const text = "Output folder selection needs Chrome/Edge on localhost or HTTPS. This page is not a secure browser context.";
      setOutputAccess(access);
      setOutputStatus(text);
      setMessage(text);
      return;
    }
    if (!picker) {
      const text = access.saveAs
          ? "This browser cannot keep an output folder selected. Export will ask where to save each file."
          : "This browser does not allow HTML apps to choose an output folder. Use Chrome or Edge, or exports will use Downloads.";
      setOutputAccess(access);
      setOutputStatus(text);
      setMessage(text);
      return;
    }
    try {
      const handle = await picker.call(window, {
        id: "hotspot-animator-output",
        mode: "readwrite",
        startIn: "downloads"
      });
      setOutputAccess(access);
      const permission = handle.requestPermission ? await handle.requestPermission({ mode: "readwrite" }) : "granted";
      if (permission !== "granted") {
        const text = "Output folder permission was not granted.";
        setOutputDirectory(null);
        setOutputDirectoryName("");
        setOutputStatus(text);
        setMessage(text);
        return;
      }
      setOutputDirectory(handle);
      setOutputDirectoryName(handle.name);
      setOutputStatus(`Ready to save exports to: ${handle.name}`);
      setMessage(`Output folder selected: ${handle.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const rawMessage = error instanceof Error ? error.message : "";
      const text =
        rawMessage.includes("user gesture") || rawMessage.includes("user activation")
          ? "The browser blocked the folder picker because it did not receive a direct click. Click the Output folder button directly in Chrome or Edge."
          : rawMessage || "Could not select an output folder.";
      setOutputAccess(access);
      setOutputDirectory(null);
      setOutputDirectoryName("");
      setOutputStatus(text);
      setMessage(text);
    }
  };

  const clearOutputDirectory = () => {
    setOutputDirectory(null);
    setOutputDirectoryName("");
    setOutputStatus("Output folder cleared. Exports will ask where to save or use Downloads.");
    setMessage("Output folder cleared.");
  };

  const ensureOutputPermission = async (handle: OutputDirectoryHandle) => {
    const options = { mode: "readwrite" as const };
    const current = handle.queryPermission ? await handle.queryPermission(options) : "granted";
    if (current === "granted") return true;
    const next = handle.requestPermission ? await handle.requestPermission(options) : current;
    return next === "granted";
  };

  const saveBlobToDirectory = async (handle: OutputDirectoryHandle, filename: string, blob: Blob) => {
    if (!(await ensureOutputPermission(handle))) {
      setOutputDirectory(null);
      setOutputDirectoryName("");
      throw new Error("Output folder permission was not granted.");
    }
    const file = await handle.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
  };

  const saveBlobWithSavePicker = async (
    filename: string,
    blob: Blob,
    description: string,
    accept: Record<string, string[]>
  ) => {
    const picker = (window as DirectoryPickerWindow).showSaveFilePicker;
    if (!picker) return "unsupported" as const;
    try {
      const file = await picker.call(window, {
        suggestedName: filename,
        types: [{ description, accept }]
      });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
      throw error;
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onExport = async () => {
    if (!hasLayers) {
      setMessage("Add at least one layer before exporting.");
      return;
    }
    setExporting(true);
    setExportProgress({ phase: "rendering", completed: 0, total: 1, percent: 0 });
    const unitWord = isSequence
      ? layers.length === 1
        ? "frame"
        : "frames"
      : layers.length === 1
        ? "layer"
        : "layers";
    setMessage(`Rendering ${frameCount} frames from ${layers.length} ${unitWord}...`);
    try {
      const blob = isSequence
        ? await exportSequenceApng(seqFrames, compositeDoc, setExportProgress)
        : await exportCompositeApng(compositeLayers, compositeDoc, setExportProgress);
      const filename = `${safeFileName(doc.filename.trim() || "hotspot-animated")}.apng`;
      let saveTarget: "folder" | "save-as" | "downloads" = "downloads";
      if (outputDirectory) {
        await saveBlobToDirectory(outputDirectory, filename, blob);
        saveTarget = "folder";
      } else {
        const saveAsResult = await saveBlobWithSavePicker(filename, blob, "Animated PNG", {
          "image/apng": [".apng"],
          "image/png": [".png"]
        });
        if (saveAsResult === "cancelled") {
          setMessage("Export canceled.");
          return;
        }
        if (saveAsResult === "saved") {
          saveTarget = "save-as";
        } else {
          downloadBlob(blob, filename);
        }
      }
      setMessage(
        saveTarget === "folder"
          ? `Animated APNG saved to ${outputDirectoryName || "selected folder"}: ${filename} (${formatBytes(blob.size)}).`
          : saveTarget === "save-as"
            ? `Animated APNG saved: ${filename} (${formatBytes(blob.size)}).`
          : `Animated APNG exported and verified: ${formatBytes(blob.size)} using ${optimizationLabel(effective)}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "APNG export failed.");
    } finally {
      setExporting(false);
      window.setTimeout(() => setExportProgress(null), 900);
    }
  };

  const onBatchExport = async () => {
    if (batchSources.length === 0) {
      setMessage("Add PNG files to the batch queue before exporting.");
      return;
    }

    setBatchExporting(true);
    setBatchProgress({ phase: "rendering", completed: 0, total: batchSources.length, percent: 0 });
    setMessage(`Batch exporting ${batchSources.length} APNG file${batchSources.length === 1 ? "" : "s"}...`);

    try {
      const zip = new JSZip();
      let totalBytes = 0;

      for (let index = 0; index < batchSources.length; index += 1) {
        const item = batchSources[index];
        setBatchProgress({
          phase: "rendering",
          completed: index,
          total: batchSources.length,
          percent: Math.round((index / batchSources.length) * 92)
        });
        const blob = await exportCompositeApng(
          [{ image: item, settings: effective, x: 0, y: 0, scale: 1, visible: true }],
          compositeDoc
        );
        totalBytes += blob.size;
        zip.file(`${safeFileName(item.name)}-animated.apng`, blob);
        setBatchProgress({
          phase: "rendering",
          completed: index + 1,
          total: batchSources.length,
          percent: Math.round(((index + 1) / batchSources.length) * 92)
        });
      }

      setBatchProgress({ phase: "encoding", completed: batchSources.length, total: batchSources.length, percent: 96 });
      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const zipName = "hotspot-animated-batch.zip";
      let saveTarget: "folder" | "save-as" | "downloads" = "downloads";
      if (outputDirectory) {
        await saveBlobToDirectory(outputDirectory, zipName, zipBlob);
        saveTarget = "folder";
      } else {
        const saveAsResult = await saveBlobWithSavePicker(zipName, zipBlob, "ZIP archive", {
          "application/zip": [".zip"]
        });
        if (saveAsResult === "cancelled") {
          setMessage("Batch export canceled.");
          return;
        }
        if (saveAsResult === "saved") {
          saveTarget = "save-as";
        } else {
          downloadBlob(zipBlob, zipName);
        }
      }
      setBatchProgress({ phase: "done", completed: batchSources.length, total: batchSources.length, percent: 100 });
      setMessage(
        saveTarget === "folder"
          ? `Batch ZIP saved to ${outputDirectoryName || "selected folder"}: ${zipName}.`
          : saveTarget === "save-as"
            ? `Batch ZIP saved: ${zipName}.`
          : `Batch exported ${batchSources.length} APNG file${batchSources.length === 1 ? "" : "s"}: ${formatBytes(totalBytes)} before ZIP.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Batch export failed.");
    } finally {
      setBatchExporting(false);
      window.setTimeout(() => setBatchProgress(null), 1200);
    }
  };

  // Drag the active layer around the preview canvas. Screen pixels are
  // converted to source pixels via the on-screen scale captured at grab time.
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!activeLayer || isSequence) return;
    const scale = (previewSize.width / Math.max(1, canvasSize.width)) * doc.exportScale;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: activeLayer.x,
      baseY: activeLayer.y,
      scale: scale || 1
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.scale;
    const dy = (event.clientY - drag.startY) / drag.scale;
    updateActiveLayer({ x: Math.round(drag.baseX + dx), y: Math.round(drag.baseY + dy) });
  };

  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="topbar">
          <div className="app-brand">
            <img src={hotspotAnimatorIcon} alt="" aria-hidden="true" />
            <div>
              <h1>Hotspot Animator</h1>
              <p>Design transparent APNG hotspot animations for 3DVista.</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={newProject}
              title="New project — clears all layers/frames and settings"
              aria-label="New project"
            >
              <FilePlus2 size={18} />
            </button>
            <button
              className="icon-button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 size={18} />
            </button>
            <button
              className="icon-button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className={`output-folder-button ${outputDirectory ? "is-active" : ""}`}
              onClick={chooseOutputDirectory}
              title={
                outputDirectory
                  ? `Output folder: ${outputDirectoryName}`
                  : outputAccess.directory
                    ? "Choose output folder"
                    : "Output folder selection is not supported in this browser"
              }
              aria-label="Choose output folder"
            >
              <FolderOpen size={18} />
              <span>{outputDirectory ? outputDirectoryName || "Output folder" : "Output folder"}</span>
            </button>
            <button
              className="primary-action"
              onClick={onExport}
              disabled={!source || exporting}
              title={tips.export}
              aria-label={tips.export}
            >
              {exporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
              Export APNG
            </button>
          </div>
        </div>

        <div className="stage-row">
          <section className="preview-column">
            <div className="mode-toggle" role="group" aria-label="Mode">
              <button
                className={mode === "compose" ? "is-active" : ""}
                onClick={() => setMode("compose")}
                title="Stack layers that animate at the same time"
              >
                Compose layers
              </button>
              <button
                className={mode === "sequence" ? "is-active" : ""}
                onClick={() => setMode("sequence")}
                title="Play images one after another with transitions"
              >
                Sequence (slideshow)
              </button>
            </div>
            <div className="preview-actions">
              <button onClick={() => inputRef.current?.click()} title={tips.import} aria-label={tips.import}>
                <ImagePlus size={17} />
                Import
              </button>
              <button
                onClick={() => setActiveSettings(() => defaultSettings)}
                title={tips.reset}
                aria-label={tips.reset}
              >
                <RotateCcw size={17} />
                Reset
              </button>
            </div>
            {source ? (
              <div className="preview-bg-row">
                <span className="preview-bg-label">Preview on</span>
                <div className="preview-bg-swatches" role="group" aria-label="Preview background">
                  {previewBgOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${option.swatch} ${previewBg === option.value ? "is-active" : ""}`}
                      onClick={() => setPreviewBg(option.value)}
                      title={`Preview on ${option.label.toLowerCase()} background`}
                      aria-label={`Preview on ${option.label.toLowerCase()} background`}
                      aria-pressed={previewBg === option.value}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className={`drop-zone ${dragging ? "dragging" : ""} ${source ? "has-source" : ""} ${
                source ? `preview-${previewBg}` : ""
              }`}
              title={tips.dropZone}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (event.dataTransfer.files.length > 0) void importLayerFiles(event.dataTransfer.files);
              }}
            >
              {source ? (
                <canvas
                  ref={canvasRef}
                  className={activeLayer && !isSequence ? "is-draggable" : ""}
                  style={{
                    width: previewSize.width,
                    height: previewSize.height
                  }}
                  aria-label="Animated hotspot preview"
                  title={activeLayer && !isSequence ? "Drag to move the selected layer" : undefined}
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerCancel={onCanvasPointerUp}
                />
              ) : (
                <button className="empty-import" onClick={() => inputRef.current?.click()} title={tips.import}>
                  <ImagePlus size={42} />
                  <span>Drop transparent PNGs or choose files</span>
                </button>
              )}
              <input
                ref={inputRef}
                className="hidden-input"
                type="file"
                accept="image/png"
                multiple
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  if (files) void importLayerFiles(files);
                  event.currentTarget.value = "";
                }}
              />
            </div>

            {source ? (
              <div className="playback-bar">
                <button
                  type="button"
                  onClick={() => stepFrame(-1)}
                  title="Previous frame"
                  aria-label="Previous frame"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="play-toggle"
                  onClick={() => setIsPlaying((current) => !current)}
                  title={isPlaying ? "Pause" : "Play"}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => stepFrame(1)}
                  title="Next frame"
                  aria-label="Next frame"
                >
                  <SkipForward size={16} />
                </button>
                <input
                  type="range"
                  className="scrub"
                  min={0}
                  max={1}
                  step={0.001}
                  value={playhead}
                  style={{ ["--range-fill" as string]: `${playhead * 100}%` }}
                  onChange={(event) => scrubTo(Number(event.target.value))}
                  aria-label="Animation timeline"
                  title="Scrub the timeline"
                />
                <span
                  className="playback-readout"
                  title="Current frame / total frames"
                >
                  {Math.min(frameCount, Math.floor(playhead * frameCount) + 1)}/{frameCount}
                </span>
              </div>
            ) : null}

            <aside className="info-panel">
              <div className="metric" title={isSequence ? "Number of frames in the sequence" : "Number of layers in the stack"}>
                <FileImage size={18} />
                <span>
                  {hasLayers
                    ? `${layers.length} ${isSequence ? "frame" : "layer"}${layers.length === 1 ? "" : "s"}`
                    : isSequence
                      ? "No frames"
                      : "No layers"}
                </span>
              </div>
              <div className="metric" title="Output frame rate and total loop length">
                <Gauge size={18} />
                <span>
                  {doc.fps} fps - {(timeline.periodMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div
                className="metric"
                title={isSequence ? "Selected frame's transition into the next" : "Selected layer's animation style"}
              >
                <Sparkles size={18} />
                <span>
                  {!activeLayer
                    ? "—"
                    : isSequence
                      ? transitionOptions.find((option) => option.value === activeLayer.transition)?.label ?? "Transition"
                      : animationLabels[settings.style]}
                </span>
              </div>
              <div className="metric" title="APNG colour optimization (set in Advanced Settings)">
                <Gauge size={18} />
                <span>{optimizationLabel(effective)}</span>
              </div>
              {hasLayers ? (
                <div className="metric" title="Pixel dimensions of the exported APNG">
                  <Download size={18} />
                  <span>
                    Export {canvasSize.width} x {canvasSize.height}px
                  </span>
                </div>
              ) : null}
              <div
                className={`output-destination ${outputDirectory ? "is-active" : !outputAccess.directory ? "is-unavailable" : ""}`}
                title={outputStatus || outputDestinationText}
              >
                <FolderOpen size={17} />
                <span>{outputStatus || outputDestinationText}</span>
                {outputDirectory ? (
                  <button type="button" onClick={clearOutputDirectory}>
                    Clear
                  </button>
                ) : (
                  <button type="button" onClick={chooseOutputDirectory}>
                    Choose
                  </button>
                )}
              </div>
              <p className="status">{message}</p>
              {exportProgress ? (
                <div className="progress-panel" aria-live="polite">
                  <div className="progress-label">
                    <span>{progressLabel(exportProgress)}</span>
                    <strong>{exportProgress.percent}%</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={exportProgress.percent}
                  >
                    <span style={{ width: `${exportProgress.percent}%` }} />
                  </div>
                </div>
              ) : null}
            </aside>
          </section>

          <section className="general-settings-panel">
            <header className="panel-header">
              <SlidersHorizontal size={18} />
              <h2>{isSequence ? "Frame Timing" : "Animation"}</h2>
            </header>
            {isSequence ? (
              activeLayer ? (
                <div className="control-grid embedded">
                  <NumberField
                    label="Hold"
                    tooltip="How long this frame stays fully visible."
                    suffix="ms"
                    min={0}
                    max={6000}
                    step={10}
                    value={activeLayer.holdMs}
                    onChange={(value) => updateActiveLayer({ holdMs: value })}
                  />
                  <label className="field" title="Transition into the next frame.">
                    <span>Transition</span>
                    <select
                      value={activeLayer.transition}
                      onChange={(event) => updateActiveLayer({ transition: event.target.value as SeqTransition })}
                    >
                      {transitionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumberField
                    label="Transition time"
                    tooltip="How long the blend into the next frame takes. Raise FPS (Advanced) for smoother short blends."
                    suffix="ms"
                    min={0}
                    max={4000}
                    step={10}
                    value={activeLayer.transitionMs}
                    disabled={activeLayer.transition === "cut"}
                    onChange={(value) => updateActiveLayer({ transitionMs: value })}
                  />
                  <button
                    className="apply-all-button wide"
                    type="button"
                    disabled={layers.length < 2}
                    onClick={applyActiveTimingToAllFrames}
                    title="Apply this frame's hold, transition, and transition time to every frame."
                  >
                    <Copy size={16} />
                    Apply timing to all
                  </button>
                  <p className="setting-note wide">
                    Frames play top-to-bottom in the Frames list. Each one holds, then transitions into the next; the
                    last loops back to the first.
                  </p>
                </div>
              ) : (
                <div className="control-grid embedded">
                  <p className="setting-note wide">Add frames below, then select one to set its hold time and transition.</p>
                </div>
              )
            ) : (
              <div className="control-grid embedded">
                <label className="field wide" title={tips.tourProfile}>
                  <span>3DVista export profile</span>
                  <select value={tourProfileId} onChange={(event) => updateTourProfile(event.target.value as TourProfileId)}>
                    {tourProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field wide" title={tips.animationStyle}>
                  <span>Animation style</span>
                  <select
                    value={settings.style}
                    onChange={(event) => update("style", event.target.value as AnimationStyle)}
                  >
                    {styleGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.styles.map((value) => (
                          <option key={value} value={value}>
                            {animationLabels[value]}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <NumberField label="Duration" tooltip={tips.duration} suffix="ms" min={300} max={5000} step={50} value={settings.duration} disabled={isFixed} onChange={(value) => update("duration", value)} />
                <NumberField label="Scale amount" tooltip={tips.scaleAmount} min={1} max={3} step={0.01} value={settings.scaleAmount} disabled={!supports("scale")} onChange={(value) => update("scaleAmount", value)} />
                <NumberField label="Rotation" tooltip={tips.rotation} suffix="deg" min={0} max={180} step={1} value={settings.rotation} disabled={!supports("rotation")} onChange={(value) => update("rotation", value)} />
                <NumberField label="Vertical distance" tooltip={tips.verticalDistance} suffix="px" min={0} max={180} step={1} value={settings.bounce} disabled={!supports("vertical")} onChange={(value) => update("bounce", value)} />
                <NumberField label="Horizontal distance" tooltip={tips.horizontalDistance} suffix="px" min={0} max={180} step={1} value={settings.shake} disabled={!supports("horizontal")} onChange={(value) => update("shake", value)} />

                <label className={`field checkbox-field ${ringForced || isFixed ? "is-disabled" : ""}`} title={tips.attentionRing}>
                  <input
                    type="checkbox"
                    checked={ringActive && !isFixed}
                    disabled={ringForced || isFixed}
                    onChange={(event) => update("ringEnabled", event.target.checked)}
                  />
                  <span>Attention ring</span>
                </label>
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="controls">
        <header className="controls-header">
          <SlidersHorizontal size={19} />
          <h2>Tools</h2>
        </header>

        {((hasLayers && !timeline.exact) || (!isSequence && warnings.length > 0)) ? (
          <section className="side-warning-panel">
            {hasLayers && !timeline.exact ? (
              <div className="warning-panel">
                <AlertTriangle size={18} />
                <span>
                  {isSequence
                    ? `This sequence is long, so it was capped at ${frameCount} frames — lower the FPS or shorten holds/transitions for a smoother result.`
                    : `Layer durations don't share a clean loop, so the combined APNG (${frameCount} frames) may jump when it repeats. Match durations (or their multiples) for a seamless loop.`}
                </span>
              </div>
            ) : null}
            {!isSequence &&
              warnings.map((warning) => (
              <div className="warning-panel compact" key={warning}>
                <AlertTriangle size={16} />
                <span>{warning}</span>
              </div>
            ))}
          </section>
        ) : null}

        <Disclosure
          title={`${isSequence ? "Frames" : "Layers"}${hasLayers ? ` (${layers.length})` : ""}`}
          tooltip={isSequence ? "Order the images that play in sequence." : "Stack several PNGs, each with its own animation."}
          tone="advanced"
          open={layersOpen}
          onToggle={() => setLayersOpen((current) => !current)}
        >
          <section className="layers-panel">
            <button
              className="layers-add"
              onClick={() => layersInputRef.current?.click()}
              title={isSequence ? "Add one or more PNGs as frames" : "Add one or more PNGs as layers"}
            >
              <ImagePlus size={16} />
              {isSequence ? "Add frames" : "Add layers"}
            </button>
            <input
              ref={layersInputRef}
              className="hidden-input"
              type="file"
              accept="image/png"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (files) void importLayerFiles(files);
                event.currentTarget.value = "";
              }}
            />
            {hasLayers ? (
              <ul className="layer-list">
                {layers
                  .map((layer, index) => ({ layer, index }))
                  .reverse()
                  .map(({ layer, index }) => (
                    <li
                      key={layer.id}
                      className={`layer-row ${layer.id === activeLayerId ? "is-active" : ""} ${
                        layer.visible ? "" : "is-hidden"
                      }`}
                    >
                      <button
                        className="layer-select"
                        onClick={() => setActiveLayerId(layer.id)}
                        title="Edit this layer"
                      >
                        <span className="layer-thumb">
                          <img src={layer.source.element.src} alt="" />
                        </span>
                        <span className="layer-name">{layer.name}</span>
                      </button>
                      <span className="layer-actions">
                        <button
                          onClick={() => toggleLayerVisible(layer.id)}
                          title={layer.visible ? "Hide layer" : "Show layer"}
                          aria-label={layer.visible ? "Hide layer" : "Show layer"}
                        >
                          {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button
                          onClick={() => moveLayer(layer.id, 1)}
                          disabled={index === layers.length - 1}
                          title="Move forward"
                          aria-label="Move forward"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          onClick={() => moveLayer(layer.id, -1)}
                          disabled={index === 0}
                          title="Move backward"
                          aria-label="Move backward"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          onClick={() => removeLayer(layer.id)}
                          title="Delete layer"
                          aria-label="Delete layer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="setting-note">
                {isSequence
                  ? "No frames yet. Use “Add frames” to import the images that will play in sequence."
                  : "No layers yet. Import a PNG or use “Add layers” to stack several."}
              </p>
            )}

            {activeLayer ? (
              <div className="control-grid compact layer-position">
                <NumberField
                  label={isSequence ? "Frame size" : "Layer size"}
                  tooltip={isSequence ? "Scale this sequence frame." : "Scale this layer."}
                  suffix="x"
                  min={0.1}
                  max={4}
                  step={0.01}
                  value={activeLayer.scale ?? 1}
                  onChange={(value) => updateActiveLayer({ scale: value })}
                />
                {!isSequence ? (
                  <>
                    <NumberField
                      label="Layer X"
                      tooltip="Horizontal position of this layer."
                      suffix="px"
                      min={-600}
                      max={600}
                      step={1}
                      value={activeLayer.x}
                      onChange={(value) => updateActiveLayer({ x: value })}
                    />
                    <NumberField
                      label="Layer Y"
                      tooltip="Vertical position of this layer."
                      suffix="px"
                      min={-600}
                      max={600}
                      step={1}
                      value={activeLayer.y}
                      onChange={(value) => updateActiveLayer({ y: value })}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
        </Disclosure>

        <Disclosure
          title="Advanced Settings"
          tooltip={tips.advanced}
          tone="advanced"
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((current) => !current)}
        >
          <div className="control-grid compact">
            <label className="field" title={tips.easing}>
              <span>Easing</span>
              <select value={settings.easing} onChange={(event) => update("easing", event.target.value as Easing)}>
                {easingOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="FPS" tooltip={`${tips.fps} (whole APNG)`} min={8} max={60} step={1} value={doc.fps} onChange={(value) => updateDoc("fps", value)} />
            <NumberField label="Delay" tooltip={`${tips.delay} (this layer)`} suffix="ms" min={0} max={5000} step={50} value={settings.delay} onChange={(value) => update("delay", value)} />
            <NumberField label="Padding" tooltip={`${tips.padding} (whole APNG)`} suffix="px" min={0} max={240} step={1} value={doc.padding} onChange={(value) => updateDoc("padding", value)} />
            <NumberField label="Export scale" tooltip={`${tips.exportScale} (whole APNG)`} min={0.25} max={4} step={0.05} value={doc.exportScale} onChange={(value) => updateDoc("exportScale", value)} />
            <label className="field wide" title={tips.optimization}>
              <span>File optimization</span>
              <select
                value={doc.optimizationMode}
                onChange={(event) => updateDoc("optimizationMode", event.target.value as OptimizationMode)}
              >
                {optimizationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Custom color limit"
              tooltip={tips.colorLimit}
              min={2}
              max={256}
              step={1}
              value={doc.colorLimit}
              disabled={doc.optimizationMode !== "custom"}
              onChange={(value) => updateDoc("colorLimit", value)}
            />
            <p className="setting-note wide">
              Smaller color limits usually reduce APNG size. Use Quality for gradients or soft shadows.
            </p>
            <NumberField label="Min opacity" tooltip={tips.minOpacity} min={0.05} max={1} step={0.01} value={settings.minOpacity} disabled={!supports("opacity")} onChange={(value) => update("minOpacity", value)} />
            <ColorField label="Glow color" tooltip={tips.glowColor} value={settings.glowColor} disabled={!supports("glow")} onChange={(value) => update("glowColor", value)} />
            <NumberField label="Glow blur" tooltip={tips.glowBlur} suffix="px" min={0} max={100} step={1} value={settings.glowBlur} disabled={!supports("glow")} onChange={(value) => update("glowBlur", value)} />
            <NumberField label="Glow opacity" tooltip={tips.glowOpacity} min={0} max={1} step={0.01} value={settings.glowOpacity} disabled={!supports("glow")} onChange={(value) => update("glowOpacity", value)} />
            <ColorField label="Ring color" tooltip={tips.ringColor} value={settings.ringColor} disabled={!ringActive} onChange={(value) => update("ringColor", value)} />
            <NumberField label="Ring thickness" tooltip={tips.ringThickness} suffix="px" min={1} max={24} step={1} value={settings.ringThickness} disabled={!ringActive} onChange={(value) => update("ringThickness", value)} />
            <NumberField label="Ring start size" tooltip={tips.ringStartSize} min={0.05} max={3} step={0.05} value={settings.ringStartSize} disabled={!ringActive} onChange={(value) => update("ringStartSize", value)} />
            <NumberField label="Ring expansion" tooltip={tips.ringExpansion} min={0.05} max={6} step={0.05} value={settings.ringExpansion} disabled={!ringActive} onChange={(value) => update("ringExpansion", value)} />
            <NumberField label="Ring opacity" tooltip={tips.ringOpacity} min={0} max={1} step={0.01} value={settings.ringOpacity} disabled={!ringActive} onChange={(value) => update("ringOpacity", value)} />
            <ColorField label="Custom background" tooltip={tips.background} value={doc.background} onChange={(value) => updateDoc("background", value)} />
            <label className="field wide" title={tips.filename}>
              <span>Export filename</span>
              <input value={doc.filename} onChange={(event) => updateDoc("filename", event.target.value)} />
            </label>
            <div className={`output-setting wide ${outputDirectory ? "is-active" : !outputAccess.directory ? "is-unavailable" : ""}`}>
              <div>
                <span>Output destination</span>
                <strong>{outputStatus || outputDestinationText}</strong>
              </div>
              <button type="button" onClick={outputDirectory ? clearOutputDirectory : chooseOutputDirectory}>
                <FolderOpen size={16} />
                {outputDirectory ? "Clear folder" : "Choose folder"}
              </button>
            </div>
          </div>
        </Disclosure>

        <Disclosure
          title="Batch Export"
          tooltip={tips.batch}
          tone="batch"
          open={batchOpen}
          onToggle={() => setBatchOpen((current) => !current)}
        >
          <section className="batch-panel">
            <div className="batch-actions">
              <button onClick={() => batchInputRef.current?.click()} disabled={batchExporting} title={tips.addBatch}>
                <ImagePlus size={16} />
                Add PNGs
              </button>
              <button onClick={onBatchExport} disabled={batchExporting || batchSources.length === 0} title={tips.exportBatch}>
                {batchExporting ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                Export ZIP
              </button>
              <button onClick={() => setBatchSources([])} disabled={batchExporting || batchSources.length === 0} title={tips.clearBatch}>
                <Trash2 size={16} />
                Clear
              </button>
            </div>
            <input
              ref={batchInputRef}
              className="hidden-input"
              type="file"
              accept="image/png"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (files) void importBatchFiles(files);
                event.currentTarget.value = "";
              }}
            />
            <div className="batch-summary">
              <span>{batchSources.length} PNG file{batchSources.length === 1 ? "" : "s"} queued</span>
              <span>{animationLabels[settings.style]}</span>
            </div>
            {batchProgress ? (
              <div className="progress-panel" aria-live="polite">
                <div className="progress-label">
                  <span>{batchProgressLabel(batchProgress)}</span>
                  <strong>{batchProgress.percent}%</strong>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={batchProgress.percent}
                >
                  <span style={{ width: `${batchProgress.percent}%` }} />
                </div>
              </div>
            ) : null}
            {batchSources.length > 0 ? (
              <div className="batch-list">
                {batchSources.map((item, index) => (
                  <button
                    key={`${item.name}-${index}`}
                    onClick={() => addLayerFromImage(item)}
                    disabled={batchExporting}
                    title="Add this PNG as a layer"
                  >
                    <FileImage size={15} />
                    <span>{item.name}.png</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </Disclosure>

        <Disclosure
          title="Preset Library"
          tooltip={tips.presets}
          tone="preset"
          open={presetsOpen}
          onToggle={() => setPresetsOpen((current) => !current)}
        >
          <section className="preset-panel">
            <label className="field wide" title={tips.presetLibrary}>
              <span>Preset library</span>
              <select
                value={selectedPreset?.id ?? ""}
                onChange={(event) => {
                  const next = allPresets.find((preset) => preset.id === event.target.value);
                  setSelectedPresetId(event.target.value);
                  if (next) setPresetName(next.kind === "user" ? next.name : `${next.name} Copy`);
                }}
              >
                <optgroup label="Factory">
                  {factoryPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="User">
                  {userPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="field wide" title={tips.presetName}>
              <span>Preset name</span>
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} />
            </label>
            <div className="preset-actions">
              <button onClick={applySelectedPreset} disabled={!selectedPreset} title={tips.applyPreset}>
                <Sparkles size={16} />
                Apply
              </button>
              <button onClick={savePreset} title={tips.savePreset}>
                <Save size={16} />
                Save
              </button>
              <button onClick={duplicatePreset} disabled={!selectedPreset} title={tips.duplicatePreset}>
                <Copy size={16} />
                Duplicate
              </button>
              <button onClick={renamePreset} disabled={selectedPreset?.kind !== "user"} title={tips.renamePreset}>
                <Save size={16} />
                Rename
              </button>
              <button onClick={deletePreset} disabled={selectedPreset?.kind !== "user"} title={tips.deletePreset}>
                <Trash2 size={16} />
                Delete
              </button>
              <button onClick={exportPresets} disabled={userPresets.length === 0} title={tips.exportPresets}>
                <Download size={16} />
                Export
              </button>
              <button onClick={() => presetImportRef.current?.click()} title={tips.importPresets}>
                <Upload size={16} />
                Import
              </button>
            </div>
            <input
              ref={presetImportRef}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              multiple
              onChange={(event) => {
                const files = event.currentTarget.files;
                if (files) void importPresets(files);
                event.currentTarget.value = "";
              }}
            />
          </section>
        </Disclosure>

        <section className="creator-card" aria-label="Rock Bench links">
          <a
            className="creator-brand"
            href="https://www.youtube.com/@rockbench"
            target="_blank"
            rel="noreferrer"
            title="Open Rock Bench channel"
          >
            <img src={rockBenchLogo} alt="Rock Bench logo" />
            <div>
              <strong>Rock Bench</strong>
              <span>VT education on YouTube</span>
            </div>
          </a>
          <div className="creator-links">
            <a
              href="https://www.youtube.com/channel/UC6OwZWavuKkB1e7GN-9UA1g?sub_confirmation=1"
              target="_blank"
              rel="noreferrer"
              title="Subscribe on YouTube"
            >
              <Youtube size={16} />
              Subscribe
            </a>
            <a
              href="https://www.youtube.com/playlist?list=PLtI1Arw9fM9S0Tga0Ir3j52GEBkUk3L7y"
              target="_blank"
              rel="noreferrer"
              title="Open VT education playlist"
            >
              <ListVideo size={16} />
              VT Playlist
            </a>
            <a
              href="https://github.com/ahmadmehri"
              target="_blank"
              rel="noreferrer"
              title="Open GitHub profile"
            >
              <Github size={16} />
              GitHub
            </a>
            <a
              href="https://buymeacoffee.com/rockbench"
              target="_blank"
              rel="noreferrer"
              title="Support Rock Bench"
            >
              <Coffee size={16} />
              Donate
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}

function progressLabel(progress: ExportProgress) {
  if (progress.phase === "encoding") return "Encoding APNG";
  if (progress.phase === "done") return "Export ready";
  return `Rendering frame ${progress.completed} of ${progress.total}`;
}

function batchProgressLabel(progress: ExportProgress) {
  if (progress.phase === "encoding") return "Creating ZIP";
  if (progress.phase === "done") return "Batch ready";
  return `Exporting file ${progress.completed} of ${progress.total}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function loadSourceImage(file: File) {
  return new Promise<SourceImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name.replace(/\.[^.]+$/, "")
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be loaded.`));
    };
    image.src = url;
  });
}

function safeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim() || "hotspot";
}

function Disclosure({
  title,
  tooltip,
  tone,
  open,
  onToggle,
  children
}: {
  title: string;
  tooltip?: string;
  tone: "advanced" | "batch" | "preset";
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`disclosure disclosure-${tone} ${open ? "is-open" : ""}`}>
      <button
        className="disclosure-button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={tooltip}
      >
        <span>{title}</span>
        <ChevronDown size={18} />
      </button>
      {open ? <div className="disclosure-content">{children}</div> : null}
    </section>
  );
}

function loadUserPresets() {
  try {
    const stored = localStorage.getItem(userPresetStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Preset[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((preset) => preset.kind === "user" && preset.id && preset.name && preset.settings)
      .map((preset) => ({
        ...preset,
        kind: "user" as const
      }));
  } catch {
    return [];
  }
}

interface NumberFieldProps {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function NumberField({ label, tooltip, value, min, max, step, suffix, disabled = false, onChange }: NumberFieldProps) {
  const fillPercent = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <label className={`field ${disabled ? "is-disabled" : ""}`} title={tooltip}>
      <span>
        {label}
        <strong>
          {value}
          {suffix ?? ""}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ["--range-fill" as string]: `${fillPercent}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  tooltip,
  value,
  disabled = false,
  onChange
}: {
  label: string;
  tooltip?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field color-field ${disabled ? "is-disabled" : ""}`} title={tooltip}>
      <span>{label}</span>
      <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
