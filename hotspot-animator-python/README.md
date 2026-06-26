# Hotspot Animator (Python)

A standalone Python desktop version of **Hotspot Animator**.

It imports standard hotspot images, previews animation styles live, lets users tune motion, glow, ring, optimization, presets, and 3DVista-oriented settings, then exports animated files for virtual tour hotspot graphics.

The original React/Vite web app lives one folder up. This Python version is designed to run offline as a local desktop app.

## Features

- Import standard hotspot images, including PNG, JPG, WebP, GIF, BMP, TIFF, and ICO files supported by Pillow.
- Live animated preview.
- Compose multiple image layers with individual animation settings, order, visibility, position, and size.
- Sequence image frames as a slideshow with hold times, transitions, and apply-timing-to-all.
- 62 animation styles, including None, Gentle / Elegant, and Disappear / Reveal effects.
- Animation category selector to make styles easier to browse.
- Export format selector for APNG, Animated WebP, GIF, WebM video, and 3DVista drag rotate ZIP.
- Output folder selector for saving animation and batch ZIP exports.
- 3DVista export profiles.
- Tour-friendly warnings.
- Clipping warning with padding guidance.
- Advanced settings for FPS, delay, scale, padding, glow, ring, easing, and file optimization.
- File size optimization through APNG/GIF color limits and WebP quality presets.
- Factory presets and user presets, with save / apply / duplicate / rename / delete.
- Preset import/export as JSON.
- Batch export multiple image files into a ZIP of APNG files.
- 3DVista drag rotate package export with mouse drag rotation, mouse wheel zoom, and a generated install/preview README.
- Light / dark theme toggle.
- Transparent (checkerboard) / light / dark / custom preview backgrounds.
- Manual playback: play / pause, previous / next frame, a timeline scrubber, and a frame counter.
- Undo / redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) plus Space to play and arrow keys to step frames.
- Drag a layer on the preview canvas to reposition it (compose mode).
- Tooltips throughout, and session settings (theme, mode, last-used values, output folder) that persist between launches.
- Headless self-test for checking renderer/export health.

## Requirements

- Python 3.10 or newer
- Pillow 10+
- imageio, imageio-ffmpeg, and numpy for WebM export
- Tkinter, which is included with most standard Python installations

## Install

Open Command Prompt or PowerShell inside this folder:

```text
hotspot-animator-python
```

Then run:

```bash
pip install -r requirements.txt
```

If the packages are already installed, this may finish quickly.

## Run

```bash
python main.py
```

The desktop window opens. Click **Import**, choose an image, select an animation style, pick an export format from the dropdown in the top bar, tune the settings, and click **Export**.

For the 3DVista drag rotate ZIP, use **Sequence (slideshow)** with one image per rotation angle. Selecting that format automatically switches to sequence mode and sets each frame to Hold 0 and Cut.

## Smoke Test

You can test the renderer without opening the GUI:

```bash
python main.py --selftest
```

This creates:

```text
selftest_output.png
selftest_output.apng
```

The PNG is a contact sheet of all animation styles. The APNG confirms animated export is working.

## New Effect Families

The desktop app includes the same expanded effect families as the HTML app:

- Gentle / Elegant: Velvet Breath, Silk Drift, Quiet Halo, Pearl Shimmer, Calm Orbit, Slow Bloom.
- Disappear / Reveal: Soft Disappear, Soft Dissolve, shape wipes, directional reveals, Iris Disappear, and Iris Reveal.

## Build Windows EXE

To create a standalone Windows executable with PyInstaller:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_exe.ps1
```

This creates:

```text
dist\Hotspot Animator.exe
```

Users can run that file without installing Python.

## Build Windows Installer

If Inno Setup is installed, compile:

```powershell
& "C:\Program Files\Inno Setup 7\ISCC.exe" ".\installer.iss"
```

This creates:

```text
installer-output\Hotspot Animator Setup.exe
```

The installer adds Hotspot Animator to the normal Windows application folder and can create shortcuts.

## Project Structure

```text
hotspot-animator-python/
+-- main.py
+-- requirements.txt
+-- README.md
+-- hotspot_animator/
|   +-- animation.py       # Animation frame math
|   +-- apng_export.py     # APNG rendering/export
|   +-- export_formats.py  # WebP, GIF, WebM, and 3DVista rotate ZIP export
|   +-- presets.py         # Factory/user presets
|   +-- render.py          # Pillow renderer
|   +-- settings.py        # Settings, labels, capabilities
|   +-- styles.py          # Color, filename, and formatting helpers
|   +-- tour_profiles.py   # 3DVista profiles and warnings
|   +-- ui/
|       +-- __init__.py
```

## Presets

User presets are saved locally here:

```text
~/.hotspot-animator/user_presets.json
```

This keeps user presets outside the source folder so updating the app does not overwrite them.

## Notes

- The app uses Tkinter and Pillow. No browser, Electron, or Qt is required.
- Exported APNG, WebP, GIF, and WebM files are real animated files.
- Preview uses a checkerboard background, but transparent-capable exports remain transparent.
- If movement, glow, or ring settings are too large, increase padding to avoid clipping.
