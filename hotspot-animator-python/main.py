"""Hotspot Animator - standalone Python desktop app.

Full-feature parity with the web app: compose + sequence modes, 60+ animation
styles, tour profiles, warnings, APNG/WebP/GIF/WebM/3DVista-rotate exports,
optimization modes, batch export, presets (CRUD + import/export), undo/redo,
manual playback + timeline scrubber, light/dark theme, transparent/light/dark
preview backgrounds, drag-to-reposition layers, tooltips, and session
persistence.

The animation math, rendering, and encoders live in the ``hotspot_animator``
package. This file is the Tkinter UI.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import threading
import time
import tkinter as tk
import webbrowser
import zipfile
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from tkinter import (
    BooleanVar,
    Canvas,
    DoubleVar,
    IntVar,
    Listbox,
    StringVar,
    Tk,
    colorchooser,
    filedialog,
    messagebox,
    simpledialog,
    ttk,
)

from PIL import Image, ImageDraw, ImageOps, ImageTk

from hotspot_animator.apng_export import export_apng, export_composite_apng, export_sequence_apng
from hotspot_animator.export_formats import (
    export_gif,
    export_rotate_package,
    export_webm,
    export_webp,
    render_composite_animation_frames,
    render_sequence_animation_frames,
    render_sequence_still_frames,
)
from hotspot_animator.presets import (
    FACTORY_PRESETS,
    apply_preset,
    export_user_presets,
    import_user_presets,
    load_user_presets,
    save_user_presets,
    settings_to_preset,
)
from hotspot_animator.render import (
    CompositeLayer,
    SequenceFrame,
    SourceImage,
    analyze_clipping,
    composite_canvas_size,
    composite_timeline,
    optimization_label,
    render_composite_frame,
    render_frame,
    render_sequence_frame,
    sequence_canvas_size,
    sequence_timeline,
)
from hotspot_animator.settings import (
    ANIMATION_LABELS,
    STYLE_GROUPS,
    AnimationSettings,
    default_settings,
    is_ring_forced,
    supports,
)
from hotspot_animator.styles import format_bytes, parse_hex, safe_filename
from hotspot_animator.tour_profiles import TOUR_PROFILES, apply_tour_profile, tour_warnings


APP_TITLE = "Hotspot Animator"
ROOT_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
ROCK_BENCH_LOGO = ROOT_DIR / "assets" / "rock-bench-logo.jpg"
SESSION_DIR = Path.home() / ".hotspot-animator"
SESSION_FILE = SESSION_DIR / "session.json"

ABOUT_LINKS = {
    "channel": "https://www.youtube.com/@rockbench",
    "subscribe": "https://www.youtube.com/channel/UC6OwZWavuKkB1e7GN-9UA1g?sub_confirmation=1",
    "playlist": "https://www.youtube.com/playlist?list=PLtI1Arw9fM9S0Tga0Ir3j52GEBkUk3L7y",
    "github": "https://github.com/ahmadmehri",
    "donate": "https://buymeacoffee.com/rockbench",
}
OPTIMIZATION_LABELS = {
    "quality": "Quality",
    "balanced": "Balanced",
    "small": "Small File",
    "tiny": "Tiny File",
    "custom": "Custom Colors",
}
MODE_LABELS = {
    "compose": "Compose layers",
    "sequence": "Sequence (slideshow)",
}
MODE_IDS = {label: key for key, label in MODE_LABELS.items()}
TRANSITION_LABELS = {
    "cut": "Cut",
    "crossfade": "Crossfade",
    "dissolve": "Dissolve",
    "wipeLeft": "Wipe Left",
    "wipeRight": "Wipe Right",
    "wipeUp": "Wipe Up",
    "wipeDown": "Wipe Down",
    "iris": "Iris",
}
TRANSITION_IDS = {label: key for key, label in TRANSITION_LABELS.items()}
EXPORT_FORMATS = {
    "apng": {"label": "APNG", "extension": ".apng", "filetypes": [("Animated PNG", "*.apng")]},
    "webp": {"label": "Animated WebP", "extension": ".webp", "filetypes": [("Animated WebP", "*.webp")]},
    "gif": {"label": "GIF", "extension": ".gif", "filetypes": [("GIF", "*.gif")]},
    "webm": {"label": "WebM video", "extension": ".webm", "filetypes": [("WebM video", "*.webm")]},
    "rotate-package": {"label": "3DVista drag rotate ZIP", "extension": "-3dvista-rotate.zip", "filetypes": [("ZIP package", "*.zip")]},
}
EXPORT_FORMAT_IDS = {value["label"]: key for key, value in EXPORT_FORMATS.items()}
ROTATE_PACKAGE_TIMING = {"hold_ms": 0, "transition": "cut", "transition_ms": 0}
PREVIEW_BG_LABELS = {
    "transparent": "Transparent",
    "light": "Light",
    "dark": "Dark",
    "custom": "Custom",
}
SUPPORTED_IMAGE_EXTENSIONS = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.gif", "*.bmp", "*.tif", "*.tiff", "*.ico")
IMAGE_FILETYPES = [
    ("Image files", " ".join(SUPPORTED_IMAGE_EXTENSIONS)),
    ("PNG files", "*.png"),
    ("JPEG files", "*.jpg *.jpeg"),
    ("WebP files", "*.webp"),
    ("GIF files", "*.gif"),
    ("BMP files", "*.bmp"),
    ("TIFF files", "*.tif *.tiff"),
    ("Icon files", "*.ico"),
    ("All files", "*.*"),
]
HISTORY_LIMIT = 100

# Per-control tooltip help text (keyed by settings field).
TIPS = {
    "profile": "Apply a ready-made 3DVista hotspot profile (size / VR-safe / file-size).",
    "category": "Filter the animation styles by family.",
    "style": "The animation applied to the active hotspot.",
    "duration": "Length of one animation loop, in milliseconds.",
    "scaleAmount": "How much the icon grows at the peak of the animation.",
    "rotation": "Maximum rotation, in degrees.",
    "bounce": "Maximum vertical travel, in pixels.",
    "shake": "Maximum horizontal travel, in pixels.",
    "minOpacity": "Lowest opacity the icon fades to.",
    "glowColor": "Color of the glow halo.",
    "glowBlur": "Softness/size of the glow, in pixels.",
    "glowOpacity": "Strength of the glow.",
    "ringColor": "Color of the attention ring.",
    "ringThickness": "Line thickness of the ring, in pixels.",
    "ringStartSize": "Ring size at the start of the pulse.",
    "ringExpansion": "How far the ring expands.",
    "ringOpacity": "Strength of the ring.",
    "easing": "Timing curve used to drive the motion.",
    "fps": "Frames per second of the exported animation.",
    "delay": "Delay before this layer starts, in milliseconds.",
    "padding": "Transparent margin around the icon so motion/glow is not clipped.",
    "exportScale": "Scales the whole exported canvas up or down.",
    "colorLimit": "Color palette size used by Custom Colors mode.",
    "background": "Preview-only color used behind the hotspot (not baked into transparent exports).",
    "filename": "Base name for the exported file.",
}

# Color palettes ------------------------------------------------------------

LIGHT = {
    "name": "light",
    "shell": "#eef2f4",
    "panel": "#ffffff",
    "panel_alt": "#f7fafb",
    "field": "#ffffff",
    "text": "#172029",
    "subtext": "#52616c",
    "muted": "#7f939d",
    "border": "#ccd8de",
    "accent": "#0f8fba",
    "accent_active": "#0b789c",
    "accent_text": "#ffffff",
    "warn": "#8a4b00",
    "warn_bg": "#fff6e8",
    "hint_bg": "#eef8fb",
    "preview": "#e7edf0",
    "trough": "#dce6ea",
    "select": "#dff1f7",
}
DARK = {
    "name": "dark",
    "shell": "#10151a",
    "panel": "#1b232b",
    "panel_alt": "#222c35",
    "field": "#161d24",
    "text": "#e7eef2",
    "subtext": "#9fb1bc",
    "muted": "#6c7e89",
    "border": "#33414c",
    "accent": "#22a7d4",
    "accent_active": "#1b8cb3",
    "accent_text": "#06141b",
    "warn": "#ffcf8f",
    "warn_bg": "#2c2415",
    "hint_bg": "#16323b",
    "preview": "#11181e",
    "trough": "#2a3640",
    "select": "#1d4250",
}


class Tooltip:
    """Lightweight hover tooltip."""

    def __init__(self, widget, text: str) -> None:
        self.widget = widget
        self.text = text
        self.tip: tk.Toplevel | None = None
        widget.bind("<Enter>", self._show, add="+")
        widget.bind("<Leave>", self._hide, add="+")
        widget.bind("<ButtonPress>", self._hide, add="+")

    def _show(self, _event=None) -> None:
        if self.tip or not self.text:
            return
        try:
            x = self.widget.winfo_rootx() + 14
            y = self.widget.winfo_rooty() + self.widget.winfo_height() + 4
        except Exception:
            return
        self.tip = tk.Toplevel(self.widget)
        self.tip.wm_overrideredirect(True)
        self.tip.wm_geometry(f"+{x}+{y}")
        tk.Label(
            self.tip,
            text=self.text,
            background="#172029",
            foreground="#ffffff",
            font=("Segoe UI", 9),
            justify="left",
            wraplength=270,
            padx=8,
            pady=5,
        ).pack()

    def _hide(self, _event=None) -> None:
        if self.tip:
            self.tip.destroy()
            self.tip = None


def _enable_dpi_awareness() -> None:
    """Make the process DPI-aware on Windows BEFORE the first window is created.

    Without this, Windows virtualizes a high-DPI display: Tk lays out in logical
    pixels while the OS bitmap-stretches the window to physical pixels. That makes
    everything blurry and makes the real (physical) layout disagree with Tk's own
    winfo geometry — which manifests as panels that look clipped even though Tk
    thinks they fit. Becoming DPI-aware renders 1:1 at the real resolution.
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes

        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)  # per-monitor aware
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


@dataclass
class AppLayer:
    id: str
    source: SourceImage
    settings: AnimationSettings
    name: str
    x: float = 0.0
    y: float = 0.0
    scale: float = 1.0
    visible: bool = True
    hold_ms: int = 900
    transition: str = "crossfade"
    transition_ms: int = 400


def main() -> None:
    parser = argparse.ArgumentParser(description="Hotspot Animator standalone Python app")
    parser.add_argument("--selftest", action="store_true", help="Render a contact sheet without opening the GUI")
    args = parser.parse_args()
    if args.selftest:
        run_selftest()
        return
    app = HotspotAnimatorApp()
    app.mainloop()


class HotspotAnimatorApp(Tk):
    def __init__(self) -> None:
        _enable_dpi_awareness()
        super().__init__()
        # Keep widgets/fonts at a comfortable size now that we render at true
        # physical resolution (otherwise everything would look tiny on high-DPI).
        try:
            scaling = self.winfo_fpixels("1i") / 72.0
            if scaling > 0.1:
                self.tk.call("tk", "scaling", scaling)
        except Exception:
            pass
        self.title(APP_TITLE)
        self.geometry("1360x860")
        self.minsize(1120, 700)

        session = _load_session()
        self.settings = _settings_from_session(session)
        self.theme = session.get("theme", "light") if session.get("theme") in ("light", "dark") else "light"
        self.preview_bg = session.get("preview_bg", "transparent")
        if self.preview_bg not in PREVIEW_BG_LABELS:
            self.preview_bg = "transparent"
        self.pal = LIGHT if self.theme == "light" else DARK

        self.source: SourceImage | None = None
        self.layers: list[AppLayer] = []
        self.active_layer_id: str = ""
        self.batch_sources: list[SourceImage] = []
        self.user_presets = load_user_presets()
        self.preview_photo: ImageTk.PhotoImage | None = None
        self.exporting = False
        self.control_widgets: dict[str, list] = {}
        self.is_closing = False
        self.color_swatches: dict[str, Canvas] = {}
        self.rock_bench_photo: ImageTk.PhotoImage | None = None
        self.updating_ui = False
        self._restoring = False
        self.preview_job: str | None = None
        self.themed_canvases: list[tuple[Canvas, str]] = []
        self.thumb_cache: dict[str, ImageTk.PhotoImage] = {}

        # Playback state.
        self.playing = True
        self.playhead = 0.0
        self._period_ms = 0
        self._frame_count = 0
        self._last_tick = time.perf_counter()
        self._preview_disp = 1.0
        self._preview_export_size = (1, 1)
        self._checker_cache: dict[tuple[int, int], Image.Image] = {}
        self._drag_last: tuple[int, int] | None = None

        # Undo/redo.
        self._history: list[dict] = []
        self._hist_index = -1
        self._history_job: str | None = None

        self.output_dir: Path | None = None
        saved_dir = session.get("output_dir")
        if saved_dir and Path(saved_dir).is_dir():
            self.output_dir = Path(saved_dir)

        self.output_dir_var = StringVar()
        self.export_format_var = StringVar(value=EXPORT_FORMATS.get(session.get("export_format", "apng"), EXPORT_FORMATS["apng"])["label"])
        self.mode_var = StringVar(value=MODE_LABELS.get(session.get("mode", "compose"), MODE_LABELS["compose"]))
        self.preview_bg_var = StringVar(value=PREVIEW_BG_LABELS[self.preview_bg])
        self.theme_btn_var = StringVar(value="Dark" if self.theme == "light" else "Light")
        self.frame_label_var = StringVar(value="Frame 0 / 0")
        self.playhead_var = DoubleVar(value=0.0)
        self.play_btn_var = StringVar(value="⏸ Pause")

        self.layer_scale_var = DoubleVar(value=1.0)
        self.layer_x_var = DoubleVar(value=0.0)
        self.layer_y_var = DoubleVar(value=0.0)
        self.hold_var = IntVar(value=900)
        self.transition_var = StringVar(value=TRANSITION_LABELS["crossfade"])
        self.transition_ms_var = IntVar(value=400)

        self.vars: dict[str, object] = {}
        self._style = ttk.Style(self)
        try:
            self._style.theme_use("clam")
        except Exception:
            pass

        self._build_ui()
        self._bind_shortcuts()
        self._apply_theme(self.theme)
        self._update_output_dir_label()
        self._settings_to_ui()
        self._refresh_all()
        self._commit_history()

        self.protocol("WM_DELETE_WINDOW", self.close)
        self._maximize()
        self._last_tick = time.perf_counter()
        self.preview_job = self.after(33, self._animate_preview)

    def _maximize(self) -> None:
        """Open maximized so all three panes fit the actual screen."""
        import os
        if os.environ.get("HSA_NO_MAX"):
            return
        try:
            self.state("zoomed")
        except Exception:
            try:
                self.attributes("-zoomed", True)
            except Exception:
                pass

    # ---- Theme -----------------------------------------------------------

    def _apply_theme(self, name: str) -> None:
        self.theme = name
        self.pal = LIGHT if name == "light" else DARK
        p = self.pal
        s = self._style
        self.configure(bg=p["shell"])
        s.configure(".", font=("Segoe UI", 11), background=p["shell"], foreground=p["text"])
        s.configure("Shell.TFrame", background=p["shell"])
        s.configure("Panel.TFrame", background=p["panel"])
        s.configure("Header.TFrame", background=p["panel"])
        s.configure("Card.TFrame", background=p["panel_alt"])
        s.configure("Seg.TFrame", background=p["panel"])
        s.configure("TLabel", background=p["panel"], foreground=p["text"], font=("Segoe UI", 11))
        s.configure("Shell.TLabel", background=p["shell"], foreground=p["text"])
        s.configure("Title.TLabel", background=p["panel"], foreground=p["text"], font=("Segoe UI", 16, "bold"))
        s.configure("Subtitle.TLabel", background=p["panel"], foreground=p["subtext"], font=("Segoe UI", 10))
        s.configure("Field.TLabel", background=p["panel"], foreground=p["subtext"], font=("Segoe UI", 11, "bold"))
        s.configure("Value.TLabel", background=p["panel"], foreground=p["text"], font=("Segoe UI", 10))
        s.configure("Hint.TLabel", background=p["panel"], foreground=p["muted"], font=("Segoe UI", 10))
        s.configure("Warn.TLabel", background=p["warn_bg"], foreground=p["warn"], font=("Segoe UI", 10))
        s.configure("Warn.TFrame", background=p["warn_bg"])
        s.configure("Card.TLabel", background=p["panel_alt"], foreground=p["text"])
        s.configure("CardHint.TLabel", background=p["panel_alt"], foreground=p["subtext"], font=("Segoe UI", 10))
        s.configure("TLabelframe", background=p["panel"], bordercolor=p["border"], relief="solid", borderwidth=1)
        s.configure("TLabelframe.Label", background=p["panel"], foreground=p["text"], font=("Segoe UI", 12, "bold"))
        s.configure("TButton", font=("Segoe UI", 10), padding=(10, 7), background=p["panel_alt"], foreground=p["text"], bordercolor=p["border"])
        s.map("TButton", background=[("active", p["hint_bg"]), ("disabled", p["panel_alt"])], foreground=[("disabled", p["muted"])])
        s.configure("Accent.TButton", font=("Segoe UI", 11, "bold"), padding=(16, 9), background=p["accent"], foreground=p["accent_text"], bordercolor=p["accent"])
        s.map("Accent.TButton", background=[("active", p["accent_active"]), ("disabled", p["muted"])])
        s.configure("Top.TButton", font=("Segoe UI", 10), padding=(7, 6), background=p["panel_alt"], foreground=p["text"], bordercolor=p["border"])
        s.map("Top.TButton", background=[("active", p["hint_bg"]), ("disabled", p["panel_alt"])], foreground=[("disabled", p["muted"])])
        s.configure("Toggle.TButton", font=("Segoe UI", 9), padding=(7, 5))
        s.map("Toggle.TButton", background=[("active", p["hint_bg"])])
        s.configure("On.Toggle.TButton", background=p["accent"], foreground=p["accent_text"])
        s.map("On.Toggle.TButton", background=[("active", p["accent_active"])])
        s.configure("TEntry", fieldbackground=p["field"], foreground=p["text"], bordercolor=p["border"], insertcolor=p["text"], padding=(7, 5))
        s.configure("TSpinbox", fieldbackground=p["field"], foreground=p["text"], background=p["panel_alt"], arrowcolor=p["text"], bordercolor=p["border"], padding=(6, 4))
        s.configure("TCombobox", fieldbackground=p["field"], foreground=p["text"], background=p["panel_alt"], arrowcolor=p["text"], bordercolor=p["border"], padding=(6, 4))
        s.map("TCombobox", fieldbackground=[("readonly", p["field"])], foreground=[("readonly", p["text"])])
        s.configure("Horizontal.TScale", background=p["panel"], troughcolor=p["trough"])
        s.configure("Vertical.TScale", background=p["panel"], troughcolor=p["trough"])
        s.configure("TScrollbar", background=p["panel_alt"], troughcolor=p["shell"], bordercolor=p["border"], arrowcolor=p["text"])
        s.configure("Treeview", background=p["field"], fieldbackground=p["field"], foreground=p["text"], rowheight=40, font=("Segoe UI", 10))
        s.map("Treeview", background=[("selected", p["select"])], foreground=[("selected", p["text"])])
        s.configure("Treeview.Heading", background=p["panel_alt"], foreground=p["subtext"], font=("Segoe UI", 10, "bold"))

        try:
            self.option_add("*TCombobox*Listbox.background", p["field"])
            self.option_add("*TCombobox*Listbox.foreground", p["text"])
            self.option_add("*TCombobox*Listbox.selectBackground", p["accent"])
            self.option_add("*TCombobox*Listbox.selectForeground", p["accent_text"])
        except Exception:
            pass

        for canvas, role in self.themed_canvases:
            try:
                if role == "preview":
                    canvas.configure(bg=p["preview"], highlightbackground=p["border"])
                else:
                    canvas.configure(bg=p["panel"])
            except Exception:
                pass
        for lb in (getattr(self, "batch_list", None),):
            if lb is not None:
                lb.configure(bg=p["field"], fg=p["text"], selectbackground=p["accent"], selectforeground=p["accent_text"], highlightbackground=p["border"])
        self.theme_btn_var.set("Dark" if name == "light" else "Light")
        self._refresh_color_swatches()
        self._draw_ring_indicator()

    def toggle_theme(self) -> None:
        self._apply_theme("dark" if self.theme == "light" else "light")
        self._save_session()

    # ---- UI build --------------------------------------------------------

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        self._build_topbar()

        # A weighted grid (not a PanedWindow) so the three columns always shrink
        # to fit the window — ttk.PanedWindow lays panes out at their natural
        # width and clips the rightmost one on small / DPI-scaled screens.
        body = ttk.Frame(self, style="Shell.TFrame")
        body.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0, 10))
        body.rowconfigure(0, weight=1)
        # No `uniform` here: it would scale every column up to satisfy the widest
        # one (the preview's background-swatch row), overflowing the window. Plain
        # weights let grid shrink columns to fit.
        body.columnconfigure(0, weight=4, minsize=260)
        body.columnconfigure(1, weight=3, minsize=240)
        body.columnconfigure(2, weight=3, minsize=240)

        left = ttk.Frame(body, style="Panel.TFrame", padding=10)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        middle_outer, middle = self._scrollable_panel(body)
        middle_outer.grid(row=0, column=1, sticky="nsew", padx=(0, 8))
        right_outer, right = self._scrollable_panel(body)
        right_outer.grid(row=0, column=2, sticky="nsew")

        self._build_preview(left)
        self._build_settings(middle)
        self._build_sidebar(right)

    def _build_topbar(self) -> None:
        bar = ttk.Frame(self, style="Header.TFrame", padding=(14, 10))
        bar.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 8))

        # pack (not grid) so the right-hand Export cluster is reliably pinned to
        # the right edge regardless of screen width / DPI scaling.
        brand = ttk.Frame(bar, style="Header.TFrame")
        brand.pack(side="left", anchor="w")
        ttk.Label(brand, text=APP_TITLE, style="Title.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(brand, text="APNG hotspot animator for 3DVista tours", style="Subtitle.TLabel", wraplength=360, justify="left").grid(row=1, column=0, sticky="w")

        actions = ttk.Frame(bar, style="Header.TFrame")
        actions.pack(side="right", anchor="e")
        # Pack from the RIGHT so the primary Export control is always pinned to
        # the edge and is never the control that gets clipped on small/DPI-scaled
        # screens. Less-critical buttons sit to its left. Compact style keeps the
        # whole cluster narrow enough to never overflow the top bar.
        ttk.Button(actions, text="Export", style="Accent.TButton", command=self.export_current).pack(side="right", padx=(6, 0))
        fmt = ttk.Combobox(actions, textvariable=self.export_format_var, values=[v["label"] for v in EXPORT_FORMATS.values()], state="readonly", width=12)
        fmt.pack(side="right", padx=(4, 0))
        fmt.bind("<<ComboboxSelected>>", lambda _e: self._export_format_changed())
        Tooltip(fmt, "Export format")
        ttk.Button(actions, textvariable=self.theme_btn_var, command=self.toggle_theme, style="Top.TButton", width=6).pack(side="right", padx=3)
        ttk.Label(actions, text="Theme", style="Subtitle.TLabel").pack(side="right", padx=(8, 2))
        self.redo_btn = ttk.Button(actions, text="Redo", command=self.redo, style="Top.TButton", width=5)
        self.redo_btn.pack(side="right", padx=2)
        self.undo_btn = ttk.Button(actions, text="Undo", command=self.undo, style="Top.TButton", width=5)
        self.undo_btn.pack(side="right", padx=2)
        ttk.Button(actions, text="New", command=self.new_project, style="Top.TButton", width=5).pack(side="right", padx=2)
        Tooltip(self.undo_btn, "Undo (Ctrl+Z)")
        Tooltip(self.redo_btn, "Redo (Ctrl+Y)")

    def _build_preview(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        parent.rowconfigure(3, weight=1)

        # Mode + file actions.
        top = ttk.Frame(parent, style="Panel.TFrame")
        top.grid(row=0, column=0, sticky="ew")
        ttk.Button(top, text="Import", command=self.import_png).pack(side="left")
        ttk.Button(top, text="Reset", command=self.reset_settings).pack(side="left", padx=6)
        ttk.Button(top, text="Folder", command=self.choose_output_dir).pack(side="left")

        modes = ttk.Frame(parent, style="Panel.TFrame")
        modes.grid(row=1, column=0, sticky="ew", pady=(10, 6))
        ttk.Label(modes, text="Mode", style="Field.TLabel").pack(side="left", padx=(0, 8))
        self.mode_compose_btn = ttk.Button(modes, text="Compose layers", style="Toggle.TButton", command=lambda: self._set_mode("compose"))
        self.mode_compose_btn.pack(side="left", padx=2)
        self.mode_sequence_btn = ttk.Button(modes, text="Sequence", style="Toggle.TButton", command=lambda: self._set_mode("sequence"))
        self.mode_sequence_btn.pack(side="left", padx=2)

        bgrow = ttk.Frame(parent, style="Panel.TFrame")
        bgrow.grid(row=2, column=0, sticky="ew", pady=(0, 8))
        ttk.Label(bgrow, text="Preview bg", style="Field.TLabel").pack(side="left", padx=(0, 8))
        self.bg_buttons: dict[str, ttk.Button] = {}
        for key in ("transparent", "light", "dark"):
            btn = ttk.Button(bgrow, text=PREVIEW_BG_LABELS[key], style="Toggle.TButton", command=lambda k=key: self._set_preview_bg(k))
            btn.pack(side="left", padx=2)
            self.bg_buttons[key] = btn
        custom = ttk.Button(bgrow, text="Custom", style="Toggle.TButton", command=self._pick_preview_bg)
        custom.pack(side="left", padx=2)
        self.bg_buttons["custom"] = custom

        self.canvas = Canvas(parent, width=300, height=280, highlightthickness=1, bd=0)
        self.canvas.grid(row=3, column=0, sticky="nsew")
        self.canvas.bind("<Configure>", self._preview_resized)
        self.canvas.bind("<ButtonPress-1>", self._drag_start)
        self.canvas.bind("<B1-Motion>", self._drag_move)
        self.canvas.bind("<ButtonRelease-1>", self._drag_end)
        self.themed_canvases.append((self.canvas, "preview"))
        self.preview_canvas_size = (340, 300)

        play = ttk.Frame(parent, style="Panel.TFrame")
        play.grid(row=4, column=0, sticky="ew", pady=(10, 4))
        play.columnconfigure(3, weight=1)
        ttk.Button(play, text="⏮", width=3, command=lambda: self.step_frame(-1)).grid(row=0, column=0)
        ttk.Button(play, textvariable=self.play_btn_var, command=self.toggle_play, width=9).grid(row=0, column=1, padx=4)
        ttk.Button(play, text="⏭", width=3, command=lambda: self.step_frame(1)).grid(row=0, column=2)
        self.scrubber = ttk.Scale(play, from_=0.0, to=1.0, orient="horizontal", variable=self.playhead_var, command=self._scrub)
        self.scrubber.grid(row=0, column=3, sticky="ew", padx=8)
        ttk.Label(play, textvariable=self.frame_label_var, style="Value.TLabel").grid(row=0, column=4)

        self.summary = StringVar(value="No image loaded")
        ttk.Label(parent, textvariable=self.summary, anchor="w", justify="left", wraplength=320, style="Hint.TLabel").grid(row=5, column=0, sticky="ew", pady=(8, 0))

    def _build_settings(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)
        self.profile_var = StringVar(value="Custom")
        self.category_var = StringVar(value=self._style_group_for_style(self.settings.style))
        self.style_var = StringVar(value=ANIMATION_LABELS[self.settings.style])
        self.easing_var = StringVar(value=self.settings.easing)
        self.optimization_var = StringVar(value=OPTIMIZATION_LABELS[self.settings.optimizationMode])
        self.filename_var = StringVar(value=self.settings.filename)

        row = 0
        # Animation section.
        anim = self._section(parent, "Animation", row); row += 1
        self._combo(anim, "3DVista profile", self.profile_var, [name for name, _ in TOUR_PROFILES.values()], "profile", self._profile_changed)
        self._combo(anim, "Category", self.category_var, [group for group, _ in STYLE_GROUPS], "category", self._category_changed)
        style_items = self._style_items(self.category_var.get())
        self.style_lookup = {label: style for style, label in style_items}
        self.style_combo = self._combo(anim, "Style", self.style_var, [label for _, label in style_items], "style", self._style_changed)
        self._number(anim, "duration", "Duration (ms)", 300, 5000, 50)
        self._ring_toggle(anim)

        # Motion section.
        motion = self._section(parent, "Motion", row); row += 1
        self._number(motion, "scaleAmount", "Scale amount", 1.0, 3.0, 0.01)
        self._number(motion, "rotation", "Rotation (deg)", 0, 180, 1)
        self._number(motion, "bounce", "Vertical distance (px)", 0, 180, 1)
        self._number(motion, "shake", "Horizontal distance (px)", 0, 180, 1)

        # Opacity & glow.
        glow = self._section(parent, "Opacity & Glow", row); row += 1
        self._number(glow, "minOpacity", "Min opacity", 0.05, 1, 0.01)
        self._color(glow, "glowColor", "Glow color")
        self._number(glow, "glowBlur", "Glow blur (px)", 0, 100, 1)
        self._number(glow, "glowOpacity", "Glow opacity", 0, 1, 0.01)

        # Ring.
        ring = self._section(parent, "Attention Ring", row); row += 1
        self._color(ring, "ringColor", "Ring color")
        self._number(ring, "ringThickness", "Ring thickness (px)", 1, 24, 1)
        self._number(ring, "ringStartSize", "Ring start size", 0.05, 3, 0.05)
        self._number(ring, "ringExpansion", "Ring expansion", 0.05, 6, 0.05)
        self._number(ring, "ringOpacity", "Ring opacity", 0, 1, 0.01)

        # Timing.
        timing = self._section(parent, "Timing & Canvas", row); row += 1
        self._combo(timing, "Easing", self.easing_var, ["sine", "easeInOut", "easeOut", "spring", "linear"], "easing", self._ui_to_settings)
        self._number(timing, "fps", "FPS", 8, 60, 1)
        self._number(timing, "delay", "Delay (ms)", 0, 5000, 50)
        self._number(timing, "padding", "Padding (px)", 0, 240, 1)
        self._number(timing, "exportScale", "Export scale", 0.25, 4, 0.05)

        # Export & file.
        out = self._section(parent, "Export & File", row); row += 1
        self._combo(out, "Optimization", self.optimization_var, list(OPTIMIZATION_LABELS.values()), "optimization", self._optimization_changed)
        self._number(out, "colorLimit", "Custom color limit", 2, 256, 1)
        frame = ttk.Frame(out, style="Panel.TFrame")
        frame.pack(fill="x", pady=6)
        ttk.Label(frame, text="Filename", style="Field.TLabel").pack(anchor="w")
        entry = ttk.Entry(frame, textvariable=self.filename_var)
        entry.pack(fill="x", pady=(3, 0))
        self.filename_var.trace_add("write", lambda *_: self._ui_to_settings())
        Tooltip(entry, TIPS["filename"])
        self.output_label = ttk.Label(out, textvariable=self.output_dir_var, style="Hint.TLabel", wraplength=260, justify="left")
        self.output_label.pack(anchor="w", pady=(6, 0))
        ttk.Label(out, text="Tip: Balanced suits most tours. Use Small/Tiny File for mobile-heavy projects.", style="Hint.TLabel", wraplength=260, justify="left").pack(anchor="w", pady=(6, 0))

    def _build_sidebar(self, parent: ttk.Frame) -> None:
        parent.columnconfigure(0, weight=1)

        self.warning_text = StringVar(value="")
        warn = ttk.LabelFrame(parent, text="Warnings", padding=8)
        warn.pack(fill="x", pady=(0, 10))
        ttk.Label(warn, textvariable=self.warning_text, style="TLabel", wraplength=240, justify="left").pack(anchor="w", fill="x")

        self._build_layers_panel(parent)
        self._build_batch_panel(parent)
        self._build_preset_panel(parent)
        self._build_about_panel(parent)

    # ---- small widget builders ------------------------------------------

    def _section(self, parent: ttk.Frame, title: str, _row: int) -> ttk.Frame:
        frame = ttk.LabelFrame(parent, text=title, padding=10)
        frame.pack(fill="x", pady=(0, 10))
        frame.columnconfigure(0, weight=1)
        return frame

    def _combo(self, parent: ttk.Frame, label: str, var: StringVar, values: list[str], tip_key: str, command) -> ttk.Combobox:
        frame = ttk.Frame(parent, style="Panel.TFrame")
        frame.pack(fill="x", pady=5)
        ttk.Label(frame, text=label, style="Field.TLabel").pack(anchor="w")
        combo = ttk.Combobox(frame, textvariable=var, values=values, state="readonly")
        combo.pack(fill="x", pady=(3, 0))
        combo.bind("<<ComboboxSelected>>", lambda _e: command())
        if tip_key in TIPS:
            Tooltip(combo, TIPS[tip_key])
        return combo

    def _number(self, parent: ttk.Frame, key: str, label: str, min_v: float, max_v: float, step: float) -> None:
        var = DoubleVar(value=float(getattr(self.settings, key)))
        self.vars[key] = var
        frame = ttk.Frame(parent, style="Panel.TFrame")
        frame.pack(fill="x", pady=5)
        frame.columnconfigure(0, weight=1)
        ttk.Label(frame, text=label, style="Field.TLabel").grid(row=0, column=0, sticky="w")
        box = ttk.Spinbox(frame, textvariable=var, from_=min_v, to=max_v, increment=step, width=9, command=self._ui_to_settings)
        box.grid(row=0, column=1, sticky="e")
        scale = ttk.Scale(frame, variable=var, from_=min_v, to=max_v, orient="horizontal", command=lambda _v: self._ui_to_settings())
        scale.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(2, 0))
        box.bind("<KeyRelease>", lambda _e: self._ui_to_settings())
        if key in TIPS:
            Tooltip(box, TIPS[key])
            Tooltip(scale, TIPS[key])
        self.control_widgets.setdefault(key, []).extend([box, scale])

    def _color(self, parent: ttk.Frame, key: str, label: str) -> None:
        var = StringVar(value=getattr(self.settings, key))
        self.vars[key] = var
        frame = ttk.Frame(parent, style="Panel.TFrame")
        frame.pack(fill="x", pady=5)
        frame.columnconfigure(1, weight=1)
        ttk.Label(frame, text=label, style="Field.TLabel").grid(row=0, column=0, columnspan=3, sticky="w")
        swatch = Canvas(frame, width=46, height=26, highlightthickness=1, cursor="hand2")
        swatch.grid(row=1, column=0, sticky="w", pady=(3, 0))
        swatch.bind("<Button-1>", lambda _e: self.pick_color(key))
        self.color_swatches[key] = swatch
        ttk.Label(frame, textvariable=var, style="Value.TLabel").grid(row=1, column=1, sticky="w", padx=8, pady=(3, 0))
        button = ttk.Button(frame, text="Pick", width=6, command=lambda: self.pick_color(key))
        button.grid(row=1, column=2, sticky="e", pady=(3, 0))
        if key in TIPS:
            Tooltip(swatch, TIPS[key])
        self.control_widgets.setdefault(key, []).extend([swatch, button])
        var.trace_add("write", lambda *_: self._color_changed())

    def _ring_toggle(self, parent: ttk.Frame) -> None:
        self.ring_var = BooleanVar(value=self.settings.ringEnabled)
        box = ttk.Frame(parent, style="Card.TFrame", padding=9)
        box.pack(fill="x", pady=(6, 2))
        box.columnconfigure(1, weight=1)
        self.ring_indicator = Canvas(box, width=28, height=28, highlightthickness=0, cursor="hand2")
        self.ring_indicator.grid(row=0, column=0, rowspan=2, sticky="nw", padx=(0, 10))
        self.ring_indicator.bind("<Button-1>", lambda _e: self.toggle_ring())
        self.themed_canvases.append((self.ring_indicator, "card"))
        lbl = ttk.Label(box, text="Attention ring", style="Card.TLabel", cursor="hand2", font=("Segoe UI", 11, "bold"))
        lbl.grid(row=0, column=1, sticky="w")
        lbl.bind("<Button-1>", lambda _e: self.toggle_ring())
        ttk.Label(box, text="Animated pulse/ring around the hotspot.", style="CardHint.TLabel", wraplength=220, justify="left").grid(row=1, column=1, sticky="w")

    def _scrollable_panel(self, parent) -> tuple[ttk.Frame, ttk.Frame]:
        outer = ttk.Frame(parent, style="Shell.TFrame")
        outer.rowconfigure(0, weight=1)
        outer.columnconfigure(0, weight=1)
        # Explicit small width so this column's size is driven by its grid weight,
        # not by the (much wider) natural width of the content frame. The content
        # is clamped to the canvas width via the <Configure> binding below, so it
        # never overflows horizontally.
        canvas = Canvas(outer, highlightthickness=0, bd=0, width=240, height=420)
        scrollbar = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        content = ttk.Frame(canvas, padding=10, style="Shell.TFrame")
        content.columnconfigure(0, weight=1)
        window_id = canvas.create_window((0, 0), window=content, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        scrollbar.grid(row=0, column=1, sticky="ns")
        content.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda e: canvas.itemconfigure(window_id, width=e.width))
        self._bind_wheel(canvas, canvas)
        self._bind_wheel(content, canvas)
        self.themed_canvases.append((canvas, "scroll"))
        return outer, content

    def _bind_wheel(self, widget, canvas: Canvas) -> None:
        widget.bind("<MouseWheel>", lambda event: canvas.yview_scroll(int(-1 * (event.delta / 120)), "units"), add="+")

    def _build_layers_panel(self, parent: ttk.Frame) -> None:
        self.layers_panel = ttk.LabelFrame(parent, text="Layers", padding=8)
        self.layers_panel.pack(fill="x", pady=(0, 10))
        self.layers_panel.columnconfigure(0, weight=1)

        buttons = ttk.Frame(self.layers_panel)
        buttons.grid(row=0, column=0, sticky="ew")
        for col in range(5):
            buttons.columnconfigure(col, weight=1)
        ttk.Button(buttons, text="Add", command=self.import_png).grid(row=0, column=0, sticky="ew", padx=(0, 2))
        ttk.Button(buttons, text="Hide", command=self.toggle_active_layer_visible).grid(row=0, column=1, sticky="ew", padx=2)
        ttk.Button(buttons, text="↑", command=lambda: self.move_active_layer(-1)).grid(row=0, column=2, sticky="ew", padx=2)
        ttk.Button(buttons, text="↓", command=lambda: self.move_active_layer(1)).grid(row=0, column=3, sticky="ew", padx=2)
        ttk.Button(buttons, text="Remove", command=self.remove_active_layer).grid(row=0, column=4, sticky="ew", padx=(2, 0))

        self.layers_tree = ttk.Treeview(self.layers_panel, columns=("detail",), show="tree headings", height=5, selectmode="browse")
        self.layers_tree.heading("#0", text="Layer")
        self.layers_tree.heading("detail", text="Detail")
        self.layers_tree.column("#0", width=150, minwidth=110, stretch=True)
        self.layers_tree.column("detail", width=90, minwidth=70, stretch=True)
        self.layers_tree.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        self.layers_tree.bind("<<TreeviewSelect>>", lambda _e: self._select_layer_from_tree())

        controls = ttk.Frame(self.layers_panel)
        controls.grid(row=2, column=0, sticky="ew", pady=(8, 0))
        controls.columnconfigure(1, weight=1)
        controls.columnconfigure(3, weight=1)
        self._small_number(controls, "Size", self.layer_scale_var, 0.1, 4.0, 0.01, 0, 0)
        self._small_number(controls, "X", self.layer_x_var, -600, 600, 1, 1, 0)
        self._small_number(controls, "Y", self.layer_y_var, -600, 600, 1, 1, 2)

        self.sequence_controls = ttk.Frame(self.layers_panel)
        self.sequence_controls.grid(row=3, column=0, sticky="ew", pady=(8, 0))
        self.sequence_controls.columnconfigure(1, weight=1)
        self.sequence_controls.columnconfigure(3, weight=1)
        self._small_number(self.sequence_controls, "Hold", self.hold_var, 0, 6000, 10, 0, 0)
        self._small_number(self.sequence_controls, "T-time", self.transition_ms_var, 0, 4000, 10, 0, 2)
        ttk.Label(self.sequence_controls, text="Transition").grid(row=1, column=0, sticky="w", pady=3)
        tcombo = ttk.Combobox(self.sequence_controls, textvariable=self.transition_var, values=list(TRANSITION_LABELS.values()), state="readonly", width=14)
        tcombo.grid(row=1, column=1, columnspan=3, sticky="ew", pady=3)
        tcombo.bind("<<ComboboxSelected>>", lambda _e: self._layer_controls_changed())
        ttk.Button(self.sequence_controls, text="Apply timing to all frames", command=self.apply_timing_to_all).grid(row=2, column=0, columnspan=4, sticky="ew", pady=(6, 0))

    def _small_number(self, parent: ttk.Frame, label: str, var, min_v: float, max_v: float, step: float, row: int, col: int) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=col, sticky="w", padx=(0, 4), pady=3)
        box = ttk.Spinbox(parent, textvariable=var, from_=min_v, to=max_v, increment=step, width=7, command=self._layer_controls_changed)
        box.grid(row=row, column=col + 1, sticky="ew", pady=3, padx=(0, 6))
        var.trace_add("write", lambda *_: self._layer_controls_changed())

    def _build_batch_panel(self, parent: ttk.Frame) -> None:
        panel = ttk.LabelFrame(parent, text="Batch Export", padding=8)
        panel.pack(fill="x", pady=(0, 10))
        panel.columnconfigure(0, weight=1)
        buttons = ttk.Frame(panel)
        buttons.grid(row=0, column=0, sticky="ew")
        for col in range(3):
            buttons.columnconfigure(col, weight=1)
        ttk.Button(buttons, text="Add images", command=self.add_batch).grid(row=0, column=0, sticky="ew", padx=(0, 3))
        ttk.Button(buttons, text="Export ZIP", command=self.export_batch).grid(row=0, column=1, sticky="ew", padx=3)
        ttk.Button(buttons, text="Clear", command=self.clear_batch).grid(row=0, column=2, sticky="ew", padx=(3, 0))
        self.batch_list = Listbox(panel, height=4, activestyle="none", borderwidth=1, relief="solid", font=("Segoe UI", 10))
        self.batch_list.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        self.batch_list.bind("<Double-Button-1>", lambda _e: self.preview_batch_item())
        ttk.Label(panel, text="Double-click an item to load it as a preview layer.", style="Hint.TLabel").grid(row=2, column=0, sticky="w", pady=(4, 0))

    def _build_preset_panel(self, parent: ttk.Frame) -> None:
        panel = ttk.LabelFrame(parent, text="Preset Library", padding=8)
        panel.pack(fill="x", pady=(0, 10))
        panel.columnconfigure(0, weight=1)
        self.preset_var = StringVar()
        self.preset_combo = ttk.Combobox(panel, textvariable=self.preset_var, state="readonly")
        self.preset_combo.grid(row=0, column=0, sticky="ew")
        self.preset_name = StringVar(value="My hotspot preset")
        ttk.Entry(panel, textvariable=self.preset_name).grid(row=1, column=0, sticky="ew", pady=6)
        actions = ttk.Frame(panel)
        actions.grid(row=2, column=0, sticky="ew")
        for col in range(4):
            actions.columnconfigure(col, weight=1)
        buttons = [
            ("Apply", self.apply_selected_preset),
            ("Save", self.save_preset),
            ("Duplicate", self.duplicate_preset),
            ("Rename", self.rename_preset),
            ("Delete", self.delete_preset),
            ("Export", self.export_presets),
            ("Import", self.import_presets),
        ]
        for index, (text, cmd) in enumerate(buttons):
            ttk.Button(actions, text=text, command=cmd).grid(row=index // 4, column=index % 4, sticky="ew", padx=2, pady=2)
        self._refresh_presets()

    def _build_about_panel(self, parent: ttk.Frame) -> None:
        panel = ttk.LabelFrame(parent, text="About", padding=10)
        panel.pack(fill="x")
        panel.columnconfigure(0, weight=1)
        card = ttk.Frame(panel, padding=10, style="Card.TFrame")
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)
        try:
            logo = Image.open(ROCK_BENCH_LOGO).convert("RGBA")
            logo.thumbnail((50, 50), Image.Resampling.LANCZOS)
            self.rock_bench_photo = ImageTk.PhotoImage(logo)
            logo_label = ttk.Label(card, image=self.rock_bench_photo, style="Card.TLabel", cursor="hand2")
            logo_label.grid(row=0, column=0, rowspan=2, sticky="w", padx=(0, 10))
            logo_label.bind("<Button-1>", lambda _e: self.open_link("channel"))
        except Exception:
            ttk.Label(card, text="RB", style="Card.TLabel", font=("Segoe UI", 16, "bold")).grid(row=0, column=0, rowspan=2, padx=(0, 10))
        title = ttk.Label(card, text="Rock Bench", style="Card.TLabel", font=("Segoe UI", 12, "bold"), cursor="hand2")
        title.grid(row=0, column=1, sticky="w")
        title.bind("<Button-1>", lambda _e: self.open_link("channel"))
        ttk.Label(card, text="VT education on YouTube", style="CardHint.TLabel").grid(row=1, column=1, sticky="w")
        links = ttk.Frame(panel)
        links.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        for col in range(2):
            links.columnconfigure(col, weight=1)
        for index, (text, key) in enumerate([("▶ Subscribe", "subscribe"), ("▤ VT Playlist", "playlist"), ("⌘ GitHub", "github"), ("☕ Donate", "donate")]):
            ttk.Button(links, text=text, command=lambda k=key: self.open_link(k)).grid(row=index // 2, column=index % 2, sticky="ew", padx=2, pady=2)

    # ---- shortcuts -------------------------------------------------------

    def _bind_shortcuts(self) -> None:
        self.bind_all("<Control-z>", lambda _e: self._shortcut(self.undo))
        self.bind_all("<Control-Z>", lambda _e: self._shortcut(self.redo))
        self.bind_all("<Control-y>", lambda _e: self._shortcut(self.redo))
        self.bind_all("<space>", lambda e: self._shortcut(self.toggle_play, e))
        self.bind_all("<Left>", lambda e: self._shortcut(lambda: self.step_frame(-1), e))
        self.bind_all("<Right>", lambda e: self._shortcut(lambda: self.step_frame(1), e))

    def _shortcut(self, action, event=None) -> str | None:
        focus = self.focus_get()
        if isinstance(focus, (ttk.Entry, ttk.Combobox, ttk.Spinbox, tk.Entry, tk.Spinbox)):
            return None
        action()
        return "break"

    # ---- style helpers (ported) -----------------------------------------

    def _style_group_for_style(self, style: str) -> str:
        for group, styles in STYLE_GROUPS:
            if style in styles:
                return group
        return STYLE_GROUPS[0][0]

    def _style_items(self, category: str | None = None) -> list[tuple[str, str]]:
        items = []
        for group, styles in STYLE_GROUPS:
            if category and group != category:
                continue
            for style in sorted(styles, key=lambda s: ANIMATION_LABELS[s]):
                items.append((style, ANIMATION_LABELS[style]))
        return items

    def _refresh_style_options(self, category: str | None = None) -> list[tuple[str, str]]:
        items = self._style_items(category or self.category_var.get())
        self.style_lookup = {label: style for style, label in items}
        if hasattr(self, "style_combo"):
            self.style_combo.configure(values=[label for _style, label in items])
        return items

    # ---- settings <-> UI -------------------------------------------------

    def _ui_to_settings(self) -> None:
        if self.updating_ui:
            return
        try:
            changes = {key: var.get() for key, var in self.vars.items()}
            int_keys = {"duration", "fps", "delay", "padding", "colorLimit"}
            for key in int_keys:
                if key in changes:
                    changes[key] = int(round(float(changes[key])))
            changes["style"] = self.settings.style
            changes["easing"] = self.easing_var.get()
            changes["optimizationMode"] = self._optimization_id()
            changes["ringEnabled"] = bool(self.ring_var.get())
            changes["filename"] = self.filename_var.get()
            self.settings = replace(self.settings, **changes)
            self._sync_active_settings()
        except Exception:
            return
        self._refresh_all()
        self._schedule_history()

    def _settings_to_ui(self) -> None:
        self.updating_ui = True
        try:
            for key, var in self.vars.items():
                if hasattr(self.settings, key):
                    var.set(getattr(self.settings, key))
            category = self._style_group_for_style(self.settings.style)
            self.category_var.set(category)
            self._refresh_style_options(category)
            self.style_var.set(ANIMATION_LABELS[self.settings.style])
            self.easing_var.set(self.settings.easing)
            self.optimization_var.set(OPTIMIZATION_LABELS[self.settings.optimizationMode])
            self.ring_var.set(self.settings.ringEnabled)
            self.filename_var.set(self.settings.filename)
        finally:
            self.updating_ui = False

    def _category_changed(self) -> None:
        if self.updating_ui:
            return
        items = self._refresh_style_options(self.category_var.get())
        style_ids = {style for style, _label in items}
        if self.settings.style not in style_ids and items:
            self.settings = replace(self.settings, style=items[0][0])
            if is_ring_forced(self.settings.style):
                self.settings = replace(self.settings, ringEnabled=True)
            self._sync_active_settings()
        self._settings_to_ui()
        self._refresh_all()
        self._schedule_history()

    def _style_changed(self) -> None:
        self.settings = replace(self.settings, style=self.style_lookup.get(self.style_var.get(), self.settings.style))
        if is_ring_forced(self.settings.style):
            self.settings = replace(self.settings, ringEnabled=True)
        self._sync_active_settings()
        self._settings_to_ui()
        self._refresh_all()
        self._schedule_history()

    def _profile_changed(self) -> None:
        labels = {name: key for key, (name, _) in TOUR_PROFILES.items()}
        self.settings = apply_tour_profile(self.settings, labels.get(self.profile_var.get(), "custom"))
        self._sync_active_settings()
        self._settings_to_ui()
        self._refresh_all()
        self._schedule_history()

    def _optimization_changed(self) -> None:
        self._ui_to_settings()

    def _optimization_id(self) -> str:
        value = self.optimization_var.get()
        for key, label in OPTIMIZATION_LABELS.items():
            if label == value:
                return key
        return self.settings.optimizationMode

    def _refresh_all(self) -> None:
        self._refresh_control_states()
        self._refresh_color_swatches()
        self._refresh_mode_buttons()
        self._refresh_bg_buttons()
        self._refresh_layers_panel()
        self._update_summary_and_warnings()
        self._update_history_buttons()

    def _color_changed(self) -> None:
        self._ui_to_settings()
        self._refresh_color_swatches()

    def _refresh_color_swatches(self) -> None:
        for key, swatch in self.color_swatches.items():
            color = str(getattr(self.settings, key, "#ffffff"))
            rgb = parse_hex(color)
            fill = f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"
            swatch.delete("all")
            swatch.configure(bg=self.pal["panel"], highlightbackground=self.pal["border"])
            swatch.create_rectangle(2, 2, 44, 24, fill=fill, outline=self.pal["border"])

    def _refresh_control_states(self) -> None:
        style = self.settings.style
        ring_active = style != "none" and (self.settings.ringEnabled or is_ring_forced(style))
        capability_map = {
            "scaleAmount": supports("scale", style),
            "rotation": supports("rotation", style),
            "bounce": supports("vertical", style),
            "shake": supports("horizontal", style),
            "minOpacity": supports("opacity", style),
            "glowColor": supports("glow", style),
            "glowBlur": supports("glow", style),
            "glowOpacity": supports("glow", style),
            "ringColor": ring_active,
            "ringThickness": ring_active,
            "ringStartSize": ring_active,
            "ringExpansion": ring_active,
            "ringOpacity": ring_active,
            "colorLimit": self.settings.optimizationMode == "custom",
        }
        for key, enabled in capability_map.items():
            state = "normal" if enabled else "disabled"
            for widget in self.control_widgets.get(key, []):
                try:
                    widget.configure(state=state)
                except Exception:
                    pass
        self._draw_ring_indicator()

    def _refresh_mode_buttons(self) -> None:
        mode = self._mode()
        self.mode_compose_btn.configure(style="On.Toggle.TButton" if mode == "compose" else "Toggle.TButton")
        self.mode_sequence_btn.configure(style="On.Toggle.TButton" if mode == "sequence" else "Toggle.TButton")

    def _refresh_bg_buttons(self) -> None:
        for key, btn in self.bg_buttons.items():
            btn.configure(style="On.Toggle.TButton" if key == self.preview_bg else "Toggle.TButton")

    # ---- layer model -----------------------------------------------------

    def _active_layer(self) -> AppLayer | None:
        return next((layer for layer in self.layers if layer.id == self.active_layer_id), None)

    def _mode(self) -> str:
        return MODE_IDS.get(self.mode_var.get(), "compose")

    def _set_mode(self, mode: str) -> None:
        self.mode_var.set(MODE_LABELS[mode])
        self._refresh_all()
        self._save_session()
        self._schedule_history()

    def _export_format(self) -> str:
        return EXPORT_FORMAT_IDS.get(self.export_format_var.get(), "apng")

    def _to_composite_layers(self) -> list[CompositeLayer]:
        return [CompositeLayer(image=l.source, settings=l.settings, x=l.x, y=l.y, scale=l.scale, visible=l.visible) for l in self.layers]

    def _to_sequence_frames(self) -> list[SequenceFrame]:
        return [SequenceFrame(image=l.source, scale=l.scale, hold_ms=l.hold_ms, transition=l.transition, transition_ms=l.transition_ms, visible=l.visible) for l in self.layers]

    def _set_active_layer(self, layer_id: str) -> None:
        layer = next((item for item in self.layers if item.id == layer_id), None)
        if not layer:
            self.active_layer_id = ""
            self.source = None
            return
        self.active_layer_id = layer.id
        self.source = layer.source
        self.settings = layer.settings
        self._settings_to_ui()
        self._layer_to_ui()
        self._refresh_all()

    def _add_layer(self, source: SourceImage, make_active: bool = True) -> AppLayer:
        layer = AppLayer(
            id=f"layer-{int(time.time() * 1000)}-{len(self.layers)}",
            source=source,
            settings=replace(self.settings),
            name=source.name,
        )
        if self._export_format() == "rotate-package":
            layer.hold_ms = ROTATE_PACKAGE_TIMING["hold_ms"]
            layer.transition = ROTATE_PACKAGE_TIMING["transition"]
            layer.transition_ms = ROTATE_PACKAGE_TIMING["transition_ms"]
        self.layers.append(layer)
        if make_active or not self.active_layer_id:
            self.active_layer_id = layer.id
            self.source = layer.source
            self.settings = layer.settings
        return layer

    def _layer_to_ui(self) -> None:
        layer = self._active_layer()
        self.updating_ui = True
        try:
            if layer:
                self.layer_scale_var.set(layer.scale)
                self.layer_x_var.set(layer.x)
                self.layer_y_var.set(layer.y)
                self.hold_var.set(layer.hold_ms)
                self.transition_var.set(TRANSITION_LABELS.get(layer.transition, TRANSITION_LABELS["crossfade"]))
                self.transition_ms_var.set(layer.transition_ms)
        finally:
            self.updating_ui = False

    def _sync_active_settings(self) -> None:
        layer = self._active_layer()
        if layer:
            layer.settings = self.settings

    def _layer_controls_changed(self) -> None:
        if self.updating_ui:
            return
        layer = self._active_layer()
        if not layer:
            return
        try:
            layer.scale = max(0.1, min(4.0, float(self.layer_scale_var.get())))
            layer.x = float(self.layer_x_var.get())
            layer.y = float(self.layer_y_var.get())
            layer.hold_ms = max(0, int(round(float(self.hold_var.get()))))
            layer.transition = TRANSITION_IDS.get(self.transition_var.get(), "crossfade")
            layer.transition_ms = max(0, int(round(float(self.transition_ms_var.get()))))
        except Exception:
            return
        self._refresh_all()
        self._schedule_history()

    def _refresh_layers_panel(self) -> None:
        if not hasattr(self, "layers_tree"):
            return
        mode = self._mode()
        self.layers_panel.configure(text=f"{'Frames' if mode == 'sequence' else 'Layers'} ({len(self.layers)})")
        if mode == "sequence":
            self.sequence_controls.grid()
        else:
            self.sequence_controls.grid_remove()
        self.layers_tree.delete(*self.layers_tree.get_children())
        live_ids = {layer.id for layer in self.layers}
        for cached in list(self.thumb_cache):
            if cached not in live_ids:
                self.thumb_cache.pop(cached, None)
        for index, layer in enumerate(self.layers):
            marker = "" if layer.visible else "(hidden) "
            if mode == "sequence":
                detail = f"{layer.hold_ms}ms · {TRANSITION_LABELS.get(layer.transition, layer.transition)}"
            else:
                detail = ANIMATION_LABELS.get(layer.settings.style, layer.settings.style)
            image = self._layer_thumb(layer)
            self.layers_tree.insert(
                "", "end", iid=layer.id,
                text=f"  {marker}{index + 1}. {layer.name}",
                values=(detail,),
                image=image,
            )
        if self.active_layer_id in live_ids:
            self.layers_tree.selection_set(self.active_layer_id)
            self.layers_tree.see(self.active_layer_id)

    def _layer_thumb(self, layer: AppLayer) -> ImageTk.PhotoImage:
        cached = self.thumb_cache.get(layer.id)
        if cached is not None:
            return cached
        try:
            thumb = layer.source.image.copy()
            thumb.thumbnail((32, 32), Image.Resampling.LANCZOS)
            base = Image.new("RGBA", (34, 34), (0, 0, 0, 0))
            base.alpha_composite(thumb, ((34 - thumb.width) // 2, (34 - thumb.height) // 2))
            photo = ImageTk.PhotoImage(base)
        except Exception:
            photo = ImageTk.PhotoImage(Image.new("RGBA", (34, 34), (0, 0, 0, 0)))
        self.thumb_cache[layer.id] = photo
        return photo

    def _select_layer_from_tree(self) -> None:
        selection = self.layers_tree.selection()
        if selection and selection[0] != self.active_layer_id:
            self._set_active_layer(selection[0])

    def toggle_active_layer_visible(self) -> None:
        layer = self._active_layer()
        if not layer:
            return
        layer.visible = not layer.visible
        self._refresh_all()
        self._schedule_history()

    def move_active_layer(self, direction: int) -> None:
        layer = self._active_layer()
        if not layer:
            return
        index = self.layers.index(layer)
        next_index = max(0, min(len(self.layers) - 1, index + direction))
        if next_index == index:
            return
        self.layers[index], self.layers[next_index] = self.layers[next_index], self.layers[index]
        self._refresh_all()
        self._schedule_history()

    def remove_active_layer(self) -> None:
        layer = self._active_layer()
        if not layer:
            return
        index = self.layers.index(layer)
        self.layers.pop(index)
        self.thumb_cache.pop(layer.id, None)
        if self.layers:
            self._set_active_layer(self.layers[min(index, len(self.layers) - 1)].id)
        else:
            self.active_layer_id = ""
            self.source = None
            self._refresh_all()
        self._schedule_history()

    def apply_timing_to_all(self) -> None:
        active = self._active_layer()
        if not active:
            return
        for layer in self.layers:
            layer.hold_ms = active.hold_ms
            layer.transition = active.transition
            layer.transition_ms = active.transition_ms
        self._refresh_all()
        self._schedule_history()
        messagebox.showinfo(APP_TITLE, "Frame timing applied to all sequence frames.")

    def _export_format_changed(self) -> None:
        if self._export_format() == "rotate-package":
            self.mode_var.set(MODE_LABELS["sequence"])
            for layer in self.layers:
                layer.hold_ms = ROTATE_PACKAGE_TIMING["hold_ms"]
                layer.transition = ROTATE_PACKAGE_TIMING["transition"]
                layer.transition_ms = ROTATE_PACKAGE_TIMING["transition_ms"]
            self._layer_to_ui()
            messagebox.showinfo(APP_TITLE, "3DVista drag rotate selected.\nSequence mode is active, and all frames were set to Hold 0 and Cut.")
        self._refresh_all()
        self._save_session()

    def _draw_ring_indicator(self) -> None:
        if not hasattr(self, "ring_indicator"):
            return
        forced = is_ring_forced(self.settings.style)
        selected = bool(self.ring_var.get()) or forced
        p = self.pal
        self.ring_indicator.configure(bg=p["panel_alt"])
        self.ring_indicator.delete("all")
        self.ring_indicator.create_oval(4, 4, 24, 24, outline=p["muted"] if not forced else p["border"], width=2, fill=p["panel"])
        if selected:
            accent = p["accent"] if not forced else p["muted"]
            self.ring_indicator.create_oval(9, 9, 19, 19, outline=accent, fill=accent)
        self.ring_indicator.configure(cursor="arrow" if forced else "hand2")

    def toggle_ring(self) -> None:
        if self.settings.style == "none" or is_ring_forced(self.settings.style):
            return
        self.ring_var.set(not self.ring_var.get())
        self._ui_to_settings()

    def _update_summary_and_warnings(self) -> None:
        if not self.layers:
            self.summary.set("No image loaded — import a PNG/WebP/SVG to begin.")
            self.warning_text.set("Import an image to begin.")
            self._period_ms = 0
            self._frame_count = 0
            return
        active = self._active_layer()
        if not active:
            return
        clipping = analyze_clipping(active.source, active.settings)
        warnings = []
        if clipping.isClipping:
            warnings.append(f"Increase padding to at least {clipping.requiredPadding}px to avoid clipping.")
        warnings.extend(tour_warnings(self.settings, clipping))
        if self._mode() == "compose":
            timeline = composite_timeline(self._to_composite_layers(), self.settings.fps)
            width, height = composite_canvas_size(self._to_composite_layers(), self.settings.padding, self.settings.exportScale)
            unit = "layer" if len(self.layers) == 1 else "layers"
            loop_note = "" if timeline.exact else " · loop capped"
        else:
            timeline = sequence_timeline(self._to_sequence_frames(), self.settings.fps)
            width, height = sequence_canvas_size(self._to_sequence_frames(), self.settings.padding, self.settings.exportScale)
            unit = "frame" if len(self.layers) == 1 else "frames"
            loop_note = "" if timeline.exact else " · capped"
        self._period_ms = timeline.period_ms
        self._frame_count = timeline.frame_count
        detail = f"{len(self.layers)} {unit} · {timeline.frame_count} frames{loop_note}"
        self.warning_text.set("\n".join(f"• {w}" for w in warnings) if warnings else "No warnings.")
        self.summary.set(
            f"{detail} · {self.settings.fps} fps · {self.settings.duration / 1000:.1f}s · "
            f"{ANIMATION_LABELS[self.settings.style]} · {optimization_label(self.settings)} · "
            f"Export {width}×{height}px"
        )

    # ---- playback --------------------------------------------------------

    def toggle_play(self) -> None:
        if not self.layers:
            return
        self.playing = not self.playing
        self.play_btn_var.set("⏸ Pause" if self.playing else "▶ Play")
        self._last_tick = time.perf_counter()

    def step_frame(self, direction: int) -> None:
        if not self.layers or self._frame_count <= 0:
            return
        self.playing = False
        self.play_btn_var.set("▶ Play")
        step = 1.0 / max(1, self._frame_count)
        self.playhead = (self.playhead + direction * step) % 1.0
        self._set_scrubber(self.playhead)

    def _scrub(self, _value) -> None:
        if self.updating_ui:
            return
        self.playing = False
        self.play_btn_var.set("▶ Play")
        try:
            self.playhead = float(self.playhead_var.get()) % 1.0
        except Exception:
            pass

    def _set_scrubber(self, value: float) -> None:
        self.updating_ui = True
        try:
            self.playhead_var.set(value)
        finally:
            self.updating_ui = False

    def _update_frame_counter(self) -> None:
        if self._frame_count <= 0:
            self.frame_label_var.set("Frame 0 / 0")
            return
        idx = int(round(self.playhead * self._frame_count)) % self._frame_count
        self.frame_label_var.set(f"Frame {idx + 1} / {self._frame_count}")

    def _animate_preview(self) -> None:
        if self.is_closing:
            return
        now = time.perf_counter()
        dt = now - self._last_tick
        self._last_tick = now
        try:
            if self.layers and self._period_ms > 0:
                if self.playing:
                    self.playhead = (self.playhead + (dt * 1000) / self._period_ms) % 1.0
                    self._set_scrubber(self.playhead)
                self._draw_preview_frame(self.playhead)
                self._update_frame_counter()
            else:
                self._draw_empty()
        finally:
            if not self.is_closing:
                self.preview_job = self.after(33, self._animate_preview)

    def _draw_preview_frame(self, playhead: float) -> None:
        canvas_w, canvas_h = self.preview_canvas_size
        time_ms = playhead * self._period_ms
        if self._mode() == "sequence":
            frame = render_sequence_frame(self._to_sequence_frames(), self.settings, time_ms, draw_background=False)
        else:
            frame = render_composite_frame(self._to_composite_layers(), self.settings, time_ms, draw_background=False)
        self._preview_export_size = frame.size
        composed = self._compose_background(frame)
        disp = composed.copy()
        disp.thumbnail((max(120, canvas_w - 24), max(120, canvas_h - 24)), Image.Resampling.LANCZOS)
        self._preview_disp = disp.width / max(1, frame.width)
        self.preview_photo = ImageTk.PhotoImage(disp)
        self.canvas.delete("all")
        self.canvas.create_image(canvas_w // 2, canvas_h // 2, image=self.preview_photo)

    def _compose_background(self, frame: Image.Image) -> Image.Image:
        size = frame.size
        if self.preview_bg == "transparent":
            base = self._checker(size)
        elif self.preview_bg == "light":
            base = Image.new("RGBA", size, (245, 247, 248, 255))
        elif self.preview_bg == "dark":
            base = Image.new("RGBA", size, (24, 28, 34, 255))
        else:
            r, g, b, _a = parse_hex(self.settings.background)
            base = Image.new("RGBA", size, (r, g, b, 255))
        base = base.copy()
        base.alpha_composite(frame)
        return base

    def _checker(self, size: tuple[int, int]) -> Image.Image:
        cached = self._checker_cache.get(size)
        if cached is not None:
            return cached
        tile = 12
        light = (235, 238, 240, 255) if self.theme == "light" else (44, 50, 57, 255)
        dark = (208, 214, 218, 255) if self.theme == "light" else (32, 37, 43, 255)
        img = Image.new("RGBA", size, light)
        draw = ImageDraw.Draw(img)
        for y in range(0, size[1], tile):
            for x in range(0, size[0], tile):
                if (x // tile + y // tile) % 2:
                    draw.rectangle([x, y, x + tile - 1, y + tile - 1], fill=dark)
        self._checker_cache[size] = img
        return img

    def _draw_empty(self) -> None:
        canvas_w, canvas_h = self.preview_canvas_size
        self.canvas.delete("all")
        self.canvas.create_text(canvas_w // 2, canvas_h // 2, text="Import an image to preview", fill=self.pal["subtext"], font=("Segoe UI", 14, "bold"))
        self.frame_label_var.set("Frame 0 / 0")

    def _preview_resized(self, event) -> None:
        self.preview_canvas_size = (max(1, event.width), max(1, event.height))

    # ---- canvas drag-to-move --------------------------------------------

    def _drag_start(self, event) -> None:
        if self._mode() != "compose" or not self._active_layer():
            return
        self._drag_last = (event.x, event.y)

    def _drag_move(self, event) -> None:
        if self._drag_last is None:
            return
        layer = self._active_layer()
        if not layer:
            return
        scale = max(1e-6, self._preview_disp * max(0.01, self.settings.exportScale))
        dx = (event.x - self._drag_last[0]) / scale
        dy = (event.y - self._drag_last[1]) / scale
        self._drag_last = (event.x, event.y)
        layer.x = max(-600.0, min(600.0, layer.x + dx))
        layer.y = max(-600.0, min(600.0, layer.y + dy))
        self.updating_ui = True
        try:
            self.layer_x_var.set(round(layer.x, 1))
            self.layer_y_var.set(round(layer.y, 1))
        finally:
            self.updating_ui = False
        self._update_summary_and_warnings()

    def _drag_end(self, _event) -> None:
        if self._drag_last is not None:
            self._drag_last = None
            self._schedule_history()

    # ---- undo / redo -----------------------------------------------------

    def _snapshot(self) -> dict:
        return {
            "mode": self._mode(),
            "active": self.active_layer_id,
            "settings": asdict(self.settings),
            "layers": [
                {
                    "id": l.id,
                    "name": l.name,
                    "source": l.source,
                    "settings": asdict(l.settings),
                    "x": l.x,
                    "y": l.y,
                    "scale": l.scale,
                    "visible": l.visible,
                    "hold_ms": l.hold_ms,
                    "transition": l.transition,
                    "transition_ms": l.transition_ms,
                }
                for l in self.layers
            ],
        }

    def _schedule_history(self) -> None:
        if self._restoring:
            return
        if self._history_job:
            try:
                self.after_cancel(self._history_job)
            except Exception:
                pass
        self._history_job = self.after(400, self._commit_history)

    def _commit_history(self) -> None:
        self._history_job = None
        snap = self._snapshot()
        if 0 <= self._hist_index < len(self._history) and self._history[self._hist_index] == snap:
            return
        del self._history[self._hist_index + 1:]
        self._history.append(snap)
        if len(self._history) > HISTORY_LIMIT:
            self._history.pop(0)
        self._hist_index = len(self._history) - 1
        self._update_history_buttons()
        self._save_session()

    def _restore(self, snap: dict) -> None:
        self._restoring = True
        try:
            self.layers = [
                AppLayer(
                    id=item["id"],
                    source=item["source"],
                    settings=AnimationSettings(**item["settings"]),
                    name=item["name"],
                    x=item["x"],
                    y=item["y"],
                    scale=item["scale"],
                    visible=item["visible"],
                    hold_ms=item["hold_ms"],
                    transition=item["transition"],
                    transition_ms=item["transition_ms"],
                )
                for item in snap["layers"]
            ]
            self.thumb_cache.clear()
            self.settings = AnimationSettings(**snap["settings"])
            self.mode_var.set(MODE_LABELS.get(snap["mode"], MODE_LABELS["compose"]))
            self.active_layer_id = snap["active"] if any(l.id == snap["active"] for l in self.layers) else (self.layers[0].id if self.layers else "")
            active = self._active_layer()
            if active:
                self.source = active.source
                self.settings = active.settings
            else:
                self.source = None
            self._settings_to_ui()
            self._layer_to_ui()
            self._refresh_all()
        finally:
            self._restoring = False

    def undo(self) -> None:
        if self._hist_index <= 0:
            return
        self._hist_index -= 1
        self._restore(self._history[self._hist_index])
        self._update_history_buttons()

    def redo(self) -> None:
        if self._hist_index >= len(self._history) - 1:
            return
        self._hist_index += 1
        self._restore(self._history[self._hist_index])
        self._update_history_buttons()

    def _update_history_buttons(self) -> None:
        if not hasattr(self, "undo_btn"):
            return
        self.undo_btn.configure(state="normal" if self._hist_index > 0 else "disabled")
        self.redo_btn.configure(state="normal" if self._hist_index < len(self._history) - 1 else "disabled")

    # ---- file / export ---------------------------------------------------

    def import_png(self) -> None:
        paths = filedialog.askopenfilenames(filetypes=IMAGE_FILETYPES)
        if not paths:
            return
        try:
            loaded = [load_source(path) for path in paths]
            last_layer: AppLayer | None = None
            for source in loaded:
                last_layer = self._add_layer(source, make_active=False)
            if last_layer:
                self._set_active_layer(last_layer.id)
                if len(self.layers) == len(loaded):
                    self.settings = replace(self.settings, filename=f"{loaded[0].name}-animated")
                    self._sync_active_settings()
            self._settings_to_ui()
            self._refresh_all()
            self._schedule_history()
        except Exception as exc:
            messagebox.showerror(APP_TITLE, f"Could not import image:\n{exc}")

    def choose_output_dir(self) -> None:
        path = filedialog.askdirectory(parent=self, title="Choose output folder")
        if not path:
            return
        self.output_dir = Path(path)
        self._update_output_dir_label()
        self._save_session()
        messagebox.showinfo(APP_TITLE, f"Output folder selected:\n{self.output_dir}")

    def _update_output_dir_label(self) -> None:
        self.output_dir_var.set(f"Output: {self.output_dir}" if self.output_dir else "Output: not selected (you'll be asked where to save)")

    def _output_path_or_prompt(self, default: str, extension: str, filetypes: list[tuple[str, str]]) -> Path | None:
        if self.output_dir:
            try:
                self.output_dir.mkdir(parents=True, exist_ok=True)
                with tempfile.TemporaryFile(dir=self.output_dir):
                    pass
            except Exception as exc:
                messagebox.showerror(APP_TITLE, f"Cannot write to the selected output folder:\n{self.output_dir}\n\n{exc}")
                return None
            return self.output_dir / default
        selected = filedialog.asksaveasfilename(parent=self, defaultextension=extension, initialfile=default, filetypes=filetypes)
        return Path(selected) if selected else None

    def export_current(self) -> None:
        if not self.layers:
            messagebox.showinfo(APP_TITLE, "Import one or more image files first.")
            return
        export_format = self._export_format()
        format_info = EXPORT_FORMATS[export_format]
        base_name = safe_filename(self.settings.filename)
        default = f"{base_name}{format_info['extension']}"
        extension = ".zip" if export_format == "rotate-package" else format_info["extension"]
        path = self._output_path_or_prompt(default, extension, format_info["filetypes"])
        if not path:
            return

        def work() -> Path:
            mode = self._mode()
            if export_format == "apng":
                if mode == "sequence":
                    return export_sequence_apng(self._to_sequence_frames(), self.settings, path, self._progress)
                return export_composite_apng(self._to_composite_layers(), self.settings, path, self._progress)
            if export_format == "rotate-package" and mode == "sequence":
                frames, frame_duration = render_sequence_still_frames(self._to_sequence_frames(), self.settings, self._progress)
            elif mode == "sequence":
                frames, frame_duration = render_sequence_animation_frames(self._to_sequence_frames(), self.settings, self._progress)
            else:
                frames, frame_duration = render_composite_animation_frames(self._to_composite_layers(), self.settings, self._progress)
            if export_format == "webp":
                return export_webp(frames, frame_duration, self.settings, path, self._progress)
            if export_format == "gif":
                return export_gif(frames, frame_duration, self.settings, path, self._progress)
            if export_format == "webm":
                return export_webm(frames, frame_duration, path, self._progress)
            if export_format == "rotate-package":
                return export_rotate_package(frames, self.settings, path, base_name, self._progress)
            raise ValueError(f"Unsupported export format: {format_info['label']}")

        self._run_export(work)

    def _run_export(self, work) -> None:
        if self.exporting:
            return
        self.exporting = True
        self.progress = ProgressDialog(self, self.pal)

        def run() -> None:
            try:
                result = work()
                self.after(0, lambda: messagebox.showinfo(APP_TITLE, f"Export complete:\n{result}"))
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: messagebox.showerror(APP_TITLE, f"Export failed:\n{message}"))
            finally:
                self.after(0, self.progress.destroy)
                self.exporting = False

        threading.Thread(target=run, daemon=True).start()

    def _progress(self, label: str, current: int, total: int) -> None:
        if hasattr(self, "progress"):
            self.after(0, lambda: self.progress.update_progress(label, current, total))

    def reset_settings(self) -> None:
        self.settings = default_settings()
        self._sync_active_settings()
        self.profile_var.set("Custom")
        self._settings_to_ui()
        self._refresh_all()
        self._schedule_history()

    def new_project(self) -> None:
        if self.layers and not messagebox.askyesno(APP_TITLE, "Start a new project and clear all layers/frames?"):
            return
        self.layers.clear()
        self.thumb_cache.clear()
        self.active_layer_id = ""
        self.source = None
        self.batch_sources.clear()
        self.settings = default_settings()
        self.profile_var.set("Custom")
        self.playhead = 0.0
        self._settings_to_ui()
        self._refresh_batch()
        self._refresh_all()
        self._schedule_history()

    def pick_color(self, key: str) -> None:
        if key == "glowColor" and not supports("glow", self.settings.style):
            return
        if key == "ringColor" and not (self.settings.ringEnabled or is_ring_forced(self.settings.style)):
            return
        color = colorchooser.askcolor(color=getattr(self.settings, key))[1]
        if color and key in self.vars:
            self.vars[key].set(color)

    def open_link(self, key: str) -> None:
        url = ABOUT_LINKS.get(key)
        if url:
            webbrowser.open_new_tab(url)

    # ---- preview background ----------------------------------------------

    def _set_preview_bg(self, key: str) -> None:
        self.preview_bg = key
        self.preview_bg_var.set(PREVIEW_BG_LABELS[key])
        self._refresh_bg_buttons()
        self._save_session()

    def _pick_preview_bg(self) -> None:
        color = colorchooser.askcolor(color=self.settings.background)[1]
        if color:
            if "background" in self.vars:
                self.vars["background"].set(color)
            self._set_preview_bg("custom")

    # ---- batch -----------------------------------------------------------

    def add_batch(self) -> None:
        paths = filedialog.askopenfilenames(filetypes=IMAGE_FILETYPES)
        for path in paths:
            try:
                self.batch_sources.append(load_source(path))
            except Exception as exc:
                messagebox.showwarning(APP_TITLE, f"Skipped {Path(path).name}: {exc}")
        self._refresh_batch()

    def _refresh_batch(self) -> None:
        self.batch_list.delete(0, "end")
        for source in self.batch_sources:
            self.batch_list.insert("end", source.display_name or source.name)

    def clear_batch(self) -> None:
        self.batch_sources.clear()
        self._refresh_batch()

    def preview_batch_item(self) -> None:
        selection = self.batch_list.curselection()
        if selection:
            source = self.batch_sources[selection[0]]
            layer = self._add_layer(source, make_active=True)
            self.settings = replace(self.settings, filename=f"{source.name}-animated")
            layer.settings = self.settings
            self._settings_to_ui()
            self._refresh_all()
            self._schedule_history()

    def export_batch(self) -> None:
        if not self.batch_sources:
            messagebox.showinfo(APP_TITLE, "Add image files to the batch queue first.")
            return
        path = self._output_path_or_prompt("hotspot-animated-batch.zip", ".zip", [("ZIP files", "*.zip")])
        if not path:
            return

        def work() -> Path:
            out = Path(path)
            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                files = []
                for index, source in enumerate(self.batch_sources):
                    settings = replace(self.settings, filename=f"{source.name}-animated")
                    item_path = tmp_dir / f"{safe_filename(settings.filename)}.apng"
                    export_apng(source, settings, item_path, lambda label, current, total, i=index: self._progress(f"{label} ({i + 1}/{len(self.batch_sources)})", current, total))
                    files.append(item_path)
                with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                    for file in files:
                        archive.write(file, file.name)
            return out

        self._run_export(work)

    # ---- presets ---------------------------------------------------------

    def _all_presets(self) -> list[dict]:
        return FACTORY_PRESETS + self.user_presets

    def _refresh_presets(self) -> None:
        names = [preset["name"] for preset in self._all_presets()]
        self.preset_combo.configure(values=names)
        if names and not self.preset_var.get():
            self.preset_var.set(names[0])

    def _selected_preset(self) -> dict | None:
        name = self.preset_var.get()
        return next((preset for preset in self._all_presets() if preset["name"] == name), None)

    def apply_selected_preset(self) -> None:
        preset = self._selected_preset()
        if preset:
            self.settings = apply_preset(self.settings, preset["settings"])
            self._sync_active_settings()
            self._settings_to_ui()
            self._refresh_all()
            self._schedule_history()

    def save_preset(self) -> None:
        name = self.preset_name.get().strip() or "Untitled preset"
        self.user_presets.append({"id": f"user-{int(time.time() * 1000)}", "name": name, "kind": "user", "settings": settings_to_preset(self.settings)})
        save_user_presets(self.user_presets)
        self._refresh_presets()
        self.preset_var.set(name)

    def duplicate_preset(self) -> None:
        preset = self._selected_preset()
        if not preset:
            return
        name = f"{preset['name']} Copy"
        self.user_presets.append({"id": f"user-{int(time.time() * 1000)}", "name": name, "kind": "user", "settings": dict(preset["settings"])})
        save_user_presets(self.user_presets)
        self._refresh_presets()
        self.preset_var.set(name)

    def rename_preset(self) -> None:
        preset = self._selected_preset()
        if not preset or preset.get("kind") != "user":
            messagebox.showinfo(APP_TITLE, "Only user presets can be renamed.")
            return
        new_name = simpledialog.askstring(APP_TITLE, "New preset name:", initialvalue=preset["name"], parent=self)
        if not new_name:
            return
        new_name = new_name.strip()
        if not new_name:
            return
        for item in self.user_presets:
            if item["id"] == preset["id"]:
                item["name"] = new_name
        save_user_presets(self.user_presets)
        self._refresh_presets()
        self.preset_var.set(new_name)

    def delete_preset(self) -> None:
        preset = self._selected_preset()
        if not preset or preset.get("kind") != "user":
            messagebox.showinfo(APP_TITLE, "Only user presets can be deleted.")
            return
        self.user_presets = [item for item in self.user_presets if item["id"] != preset["id"]]
        save_user_presets(self.user_presets)
        self.preset_var.set("")
        self._refresh_presets()

    def export_presets(self) -> None:
        if not self.user_presets:
            messagebox.showinfo(APP_TITLE, "There are no user presets to export yet.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".json", initialfile="hotspot-animator-presets.json", filetypes=[("JSON files", "*.json")])
        if path:
            export_user_presets(self.user_presets, path)
            messagebox.showinfo(APP_TITLE, f"Exported {len(self.user_presets)} preset(s).")

    def import_presets(self) -> None:
        paths = filedialog.askopenfilenames(filetypes=[("JSON files", "*.json")])
        if not paths:
            return
        try:
            imported = []
            for path in paths:
                imported.extend(import_user_presets(path))
            self.user_presets.extend(imported)
            save_user_presets(self.user_presets)
            self._refresh_presets()
            messagebox.showinfo(APP_TITLE, f"Imported {len(imported)} preset(s).")
        except Exception as exc:
            messagebox.showerror(APP_TITLE, f"Preset import failed:\n{exc}")

    # ---- session ---------------------------------------------------------

    def _save_session(self) -> None:
        if self._restoring:
            return
        data = {
            "version": 1,
            "settings": asdict(self.settings),
            "mode": self._mode(),
            "theme": self.theme,
            "preview_bg": self.preview_bg,
            "export_format": self._export_format(),
            "output_dir": str(self.output_dir) if self.output_dir else "",
        }
        try:
            SESSION_DIR.mkdir(parents=True, exist_ok=True)
            SESSION_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception:
            pass

    def close(self) -> None:
        self.is_closing = True
        self._save_session()
        if self.preview_job:
            try:
                self.after_cancel(self.preview_job)
            except Exception:
                pass
            self.preview_job = None
        self.destroy()


class ProgressDialog:
    def __init__(self, master: Tk, palette: dict) -> None:
        self.dialog = tk.Toplevel(master)
        self.dialog.title("Exporting")
        self.dialog.resizable(False, False)
        self.dialog.configure(bg=palette["panel"])
        try:
            self.dialog.transient(master)
        except Exception:
            pass
        ttk.Label(self.dialog, text="Exporting…").grid(row=0, column=0, padx=16, pady=(16, 6), sticky="w")
        self.label = StringVar(value="")
        ttk.Label(self.dialog, textvariable=self.label, width=42).grid(row=1, column=0, padx=16, sticky="w")
        self.bar = ttk.Progressbar(self.dialog, length=320, mode="determinate")
        self.bar.grid(row=2, column=0, padx=16, pady=16)

    def update_progress(self, label: str, current: int, total: int) -> None:
        self.label.set(f"{label}: {current} / {total}")
        self.bar.configure(maximum=max(1, total), value=current)

    def destroy(self) -> None:
        self.dialog.destroy()


# ---- session helpers (module level) --------------------------------------

def _load_session() -> dict:
    try:
        data = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _settings_from_session(session: dict) -> AnimationSettings:
    base = default_settings()
    stored = session.get("settings")
    if not isinstance(stored, dict):
        return base
    allowed = set(asdict(base).keys())
    changes = {}
    for key, value in stored.items():
        if key in allowed:
            changes[key] = value
    try:
        return replace(base, **changes)
    except Exception:
        return base


def load_source(path: str | Path) -> SourceImage:
    p = Path(path)
    with Image.open(p) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGBA")
    return SourceImage(image=image, width=image.width, height=image.height, name=p.stem, display_name=p.name)


def run_selftest() -> None:
    source = make_test_source()
    settings = default_settings()
    labels = list(ANIMATION_LABELS.items())
    thumb_w, thumb_h = 180, 160
    cols = 5
    rows = math.ceil(len(labels) / cols)
    sheet = Image.new("RGBA", (cols * thumb_w, rows * thumb_h), (245, 247, 248, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (style, label) in enumerate(labels):
        settings = replace(settings, style=style, ringEnabled=True)
        frame = render_frame(source, settings, 0.35, draw_background=True)
        frame.thumbnail((thumb_w - 20, thumb_h - 34), Image.Resampling.LANCZOS)
        x = (index % cols) * thumb_w
        y = (index // cols) * thumb_h
        sheet.alpha_composite(frame, (x + (thumb_w - frame.width) // 2, y + 8))
        draw.text((x + 8, y + thumb_h - 22), label, fill=(23, 32, 41, 255))
    out = Path(__file__).with_name("selftest_output.png")
    sheet.convert("RGB").save(out)
    apng_out = Path(__file__).with_name("selftest_output.apng")
    export_apng(source, settings, apng_out)
    print(f"Rendered {len(labels)} styles to {out}")
    print(f"Exported APNG smoke test to {apng_out} ({format_bytes(apng_out.stat().st_size)})")


def make_test_source() -> SourceImage:
    image = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((10, 10, 86, 86), fill=(0, 194, 255, 255))
    draw.ellipse((30, 30, 66, 66), fill=(255, 184, 32, 255))
    draw.polygon([(48, 88), (62, 58), (34, 58)], fill=(0, 126, 160, 255))
    return SourceImage(image=image, width=image.width, height=image.height, name="selftest-hotspot")


if __name__ == "__main__":
    main()
