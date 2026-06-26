# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('assets\\rock-bench-logo.jpg', 'assets')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # numpy + imageio + imageio_ffmpeg are kept so WebM export works in the
    # packaged app. Everything below is genuinely unused by Hotspot Animator and
    # is excluded to stop PyInstaller from bundling hundreds of MB of OpenCV/Qt/
    # scientific libraries that happen to be installed in this environment.
    excludes=[
        'pytest', 'matplotlib', 'cv2', 'scipy', 'pandas', 'IPython',
        'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'tcl8', 'sympy',
        'notebook', 'jupyter', 'sklearn', 'numba', 'torch', 'tensorflow',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Hotspot Animator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['assets\\hotspot-animator.ico'],
)
