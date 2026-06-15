import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import JSZip from "jszip";
import {
  Download,
  ChevronDown,
  Copy,
  AlertTriangle,
  Coffee,
  FileImage,
  Gauge,
  Github,
  ImagePlus,
  ListVideo,
  Save,
  Trash2,
  Upload,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
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
  ExportProgress,
  analyzeClipping,
  exportApng,
  optimizationLabel,
  renderHotspotFrame,
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
    label: "Subtle / VR Safe",
    styles: ["breathe", "breathingRing", "focusHalo", "softLift", "vrGentlePulse"] as AnimationStyle[]
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

const tips = {
  export: "Save a 3DVista-ready APNG.",
  import: "Load one transparent PNG.",
  reset: "Restore default settings.",
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
    "slide",
    "slideRight",
    "slideLeft",
    "slideDown",
    "slideUp",
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
    "ringDrawReverse"
  ],
  opacity: [
    "pulse",
    "blink",
    "zoomSpin",
    "shimmer",
    "doublePulse",
    "tiltPulse",
    "slide",
    "slideRight",
    "slideLeft",
    "slideDown",
    "slideUp",
    "flashGlow",
    "farZoomIn",
    "magnetPop",
    "vrGentlePulse"
  ],
  rotation: ["wiggle", "spin", "attention", "swing", "wobble", "zoomSpin", "orbit", "tremble", "tiltPulse"],
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
    "compassNudge"
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
    "compassNudge"
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
    "slide",
    "slideRight",
    "slideLeft",
    "slideDown",
    "slideUp",
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
    "ringDrawReverse"
  ]
};

export function App() {
  const [settings, setSettings] = useState<AnimationSettings>(defaultSettings);
  const [source, setSource] = useState<SourceImage | null>(null);
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
  const presetImportRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const allPresets = useMemo(() => [...factoryPresets, ...userPresets], [userPresets]);
  const selectedPreset = allPresets.find((preset) => preset.id === selectedPresetId) ?? allPresets[0];
  const clippingReport = useMemo(
    () => (source ? analyzeClipping(source, settings) : null),
    [source, settings]
  );
  const warnings = useMemo(() => tourWarnings(settings, clippingReport), [settings, clippingReport]);

  const previewSize = useMemo(() => {
    if (!source) return { width: 520, height: 420 };
    const maxWidth = 370;
    const maxHeight = 305;
    const rawWidth = (source.width + settings.padding * 2) * settings.exportScale;
    const rawHeight = (source.height + settings.padding * 2) * settings.exportScale;
    const ratio = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);
    return {
      width: Math.max(280, Math.round(rawWidth * ratio)),
      height: Math.max(240, Math.round(rawHeight * ratio))
    };
  }, [source, settings.padding, settings.exportScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let animationId = 0;
    const cycleMs = settings.duration + settings.delay;

    const draw = (now: number) => {
      const progress = ((now % cycleMs) / settings.duration) % 1;
      const activeProgress = now % cycleMs > settings.duration ? 0 : progress;
      renderHotspotFrame(context, source, settings, activeProgress, true);
      frame += 1;
      animationId = requestAnimationFrame(draw);
    };

    canvas.width = Math.ceil((source.width + settings.padding * 2) * settings.exportScale);
    canvas.height = Math.ceil((source.height + settings.padding * 2) * settings.exportScale);
    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [source, settings]);

  const update = <K extends keyof AnimationSettings>(key: K, value: AnimationSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const supports = (capability: Capability) => capabilities[capability].includes(settings.style);
  const ringForced =
    settings.style === "radar" ||
    settings.style === "beacon" ||
    settings.style === "ringDraw" ||
    settings.style === "ringDrawReverse" ||
    settings.style === "pingDoubleRing" ||
    settings.style === "clickRipple" ||
    settings.style === "breathingRing" ||
    settings.style === "focusHalo";
  const ringActive = ringForced || settings.ringEnabled;

  const updateTourProfile = (profileId: TourProfileId) => {
    setTourProfileId(profileId);
    setSettings((current) => applyTourProfile(current, profileId));
    const profile = tourProfiles.find((item) => item.id === profileId);
    if (profile && profile.id !== "custom") setMessage(`3DVista profile applied: ${profile.name}`);
  };

  useEffect(() => {
    localStorage.setItem(userPresetStorageKey, JSON.stringify(userPresets));
  }, [userPresets]);

  const applySelectedPreset = () => {
    if (!selectedPreset) return;
    setSettings((current) => applyPresetSettings(current, selectedPreset.settings));
    setMessage(`Preset applied: ${selectedPreset.name}`);
  };

  const savePreset = () => {
    const trimmedName = presetName.trim() || "Untitled preset";
    const preset: Preset = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: trimmedName,
      kind: "user",
      settings: settingsToPreset(settings)
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

  const importPresets = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text()) as {
        presets?: Array<{ name?: string; settings?: Preset["settings"] }>;
      };
      const imported = (payload.presets ?? [])
        .filter((preset) => preset.name && preset.settings)
        .map((preset) => ({
          id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: preset.name as string,
          kind: "user" as const,
          settings: preset.settings as Preset["settings"]
        }));

      if (imported.length === 0) {
        setMessage("No valid presets found in that file.");
        return;
      }

      setUserPresets((current) => [...current, ...imported]);
      setSelectedPresetId(imported[0].id);
      setMessage(`${imported.length} preset${imported.length === 1 ? "" : "s"} imported.`);
    } catch {
      setMessage("Preset import failed. Choose a valid Hotspot Animator preset JSON file.");
    }
  };

  const importFile = useCallback(async (file: File) => {
    if (!file.type.includes("png")) {
      setMessage("Please choose a PNG file with transparency.");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setSource({
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name.replace(/\.[^.]+$/, "")
      });
      setSettings((current) => ({
        ...current,
        filename: file.name.replace(/\.[^.]+$/, "") + "-animated"
      }));
      setMessage(`${file.name} loaded. Tune the motion, then export APNG.`);
    };
    image.onerror = () => setMessage("That PNG could not be loaded.");
    image.src = url;
  }, []);

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

      if (!source && loaded[0]) {
        setSource(loaded[0]);
        setSettings((current) => ({
          ...current,
          filename: `${loaded[0].name}-animated`
        }));
      }

      setMessage(`${loaded.length} PNG file${loaded.length === 1 ? "" : "s"} added to batch queue.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "One or more PNG files could not be loaded.");
    }
  }, [source]);

  const onExport = async () => {
    if (!source) {
      setMessage("Import a PNG before exporting.");
      return;
    }
    setExporting(true);
    setExportProgress({ phase: "rendering", completed: 0, total: 1, percent: 0 });
    setMessage(
      clippingReport?.isClipping
        ? "Rendering APNG with a clipping warning. Increase padding if the result looks cropped."
        : "Rendering transparent APNG frames..."
    );
    try {
      const blob = await exportApng(source, settings, setExportProgress);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${settings.filename.trim() || "hotspot-animated"}.apng`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(
        `Animated APNG exported and verified: ${formatBytes(blob.size)} using ${optimizationLabel(settings)}.`
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
        const blob = await exportApng(item, settings);
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
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "hotspot-animated-batch.zip";
      link.click();
      URL.revokeObjectURL(url);
      setBatchProgress({ phase: "done", completed: batchSources.length, total: batchSources.length, percent: 100 });
      setMessage(
        `Batch exported ${batchSources.length} APNG file${batchSources.length === 1 ? "" : "s"}: ${formatBytes(totalBytes)} before ZIP.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Batch export failed.");
    } finally {
      setBatchExporting(false);
      window.setTimeout(() => setBatchProgress(null), 1200);
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

        <div className="stage-row">
          <section className="preview-column">
            <div className="preview-actions">
              <button onClick={() => inputRef.current?.click()} title={tips.import} aria-label={tips.import}>
                <ImagePlus size={17} />
                Import
              </button>
              <button onClick={() => setSettings(defaultSettings)} title={tips.reset} aria-label={tips.reset}>
                <RotateCcw size={17} />
                Reset
              </button>
            </div>
            <div
              className={`drop-zone ${dragging ? "dragging" : ""} ${source ? "has-source" : ""}`}
              title={tips.dropZone}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void importFile(file);
              }}
            >
              {source ? (
                <canvas
                  ref={canvasRef}
                  style={{
                    width: previewSize.width,
                    height: previewSize.height
                  }}
                  aria-label="Animated hotspot preview"
                />
              ) : (
                <button className="empty-import" onClick={() => inputRef.current?.click()} title={tips.import}>
                  <ImagePlus size={42} />
                  <span>Drop a transparent PNG or choose a file</span>
                </button>
              )}
              <input
                ref={inputRef}
                className="hidden-input"
                type="file"
                accept="image/png"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>

            <aside className="info-panel">
              <div className="metric">
                <FileImage size={18} />
                <span>{source ? `${source.width} x ${source.height}px` : "No PNG loaded"}</span>
              </div>
              <div className="metric">
                <Gauge size={18} />
                <span>
                  {settings.fps} fps - {(settings.duration / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="metric">
                <Sparkles size={18} />
                <span>{animationLabels[settings.style]}</span>
              </div>
              <div className="metric">
                <Gauge size={18} />
                <span>{optimizationLabel(settings)}</span>
              </div>
              {clippingReport ? (
                <div className="metric">
                  <Download size={18} />
                  <span>
                    Export {clippingReport.width} x {clippingReport.height}px
                  </span>
                </div>
              ) : null}
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
              <h2>Animation</h2>
            </header>
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

              <NumberField label="Duration" tooltip={tips.duration} suffix="ms" min={300} max={5000} step={50} value={settings.duration} onChange={(value) => update("duration", value)} />
              <NumberField label="Scale amount" tooltip={tips.scaleAmount} min={1} max={3} step={0.01} value={settings.scaleAmount} disabled={!supports("scale")} onChange={(value) => update("scaleAmount", value)} />
              <NumberField label="Rotation" tooltip={tips.rotation} suffix="deg" min={0} max={180} step={1} value={settings.rotation} disabled={!supports("rotation")} onChange={(value) => update("rotation", value)} />
              <NumberField label="Vertical distance" tooltip={tips.verticalDistance} suffix="px" min={0} max={180} step={1} value={settings.bounce} disabled={!supports("vertical")} onChange={(value) => update("bounce", value)} />
              <NumberField label="Horizontal distance" tooltip={tips.horizontalDistance} suffix="px" min={0} max={180} step={1} value={settings.shake} disabled={!supports("horizontal")} onChange={(value) => update("shake", value)} />

              <label className={`field checkbox-field ${ringForced ? "is-disabled" : ""}`} title={tips.attentionRing}>
                <input
                  type="checkbox"
                  checked={ringActive}
                  disabled={ringForced}
                  onChange={(event) => update("ringEnabled", event.target.checked)}
                />
                <span>Attention ring</span>
              </label>
            </div>
          </section>
        </div>
      </section>

      <section className="controls">
        <header className="controls-header">
          <SlidersHorizontal size={19} />
          <h2>Tools</h2>
        </header>

        {(clippingReport?.isClipping || warnings.length > 0) ? (
          <section className="side-warning-panel">
            {clippingReport?.isClipping ? (
              <div className="warning-panel">
                <AlertTriangle size={18} />
                <span>
                  Increase padding to at least {clippingReport.requiredPadding}px. Current settings may clip movement,
                  ring, or glow.
                </span>
              </div>
            ) : null}
            {warnings.map((warning) => (
              <div className="warning-panel compact" key={warning}>
                <AlertTriangle size={16} />
                <span>{warning}</span>
              </div>
            ))}
          </section>
        ) : null}

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
            <NumberField label="FPS" tooltip={tips.fps} min={8} max={60} step={1} value={settings.fps} onChange={(value) => update("fps", value)} />
            <NumberField label="Delay" tooltip={tips.delay} suffix="ms" min={0} max={5000} step={50} value={settings.delay} onChange={(value) => update("delay", value)} />
            <NumberField label="Padding" tooltip={tips.padding} suffix="px" min={0} max={240} step={1} value={settings.padding} onChange={(value) => update("padding", value)} />
            <NumberField label="Export scale" tooltip={tips.exportScale} min={0.25} max={4} step={0.05} value={settings.exportScale} onChange={(value) => update("exportScale", value)} />
            <label className="field wide" title={tips.optimization}>
              <span>File optimization</span>
              <select
                value={settings.optimizationMode}
                onChange={(event) => update("optimizationMode", event.target.value as OptimizationMode)}
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
              value={settings.colorLimit}
              disabled={settings.optimizationMode !== "custom"}
              onChange={(value) => update("colorLimit", value)}
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
            <ColorField label="Preview background" tooltip={tips.background} value={settings.background} onChange={(value) => update("background", value)} />
            <label className="field wide" title={tips.filename}>
              <span>Export filename</span>
              <input value={settings.filename} onChange={(event) => update("filename", event.target.value)} />
            </label>
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
                    onClick={() => {
                      setSource(item);
                      setSettings((current) => ({ ...current, filename: `${item.name}-animated` }));
                    }}
                    disabled={batchExporting}
                    title={tips.previewBatch}
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
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importPresets(file);
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
