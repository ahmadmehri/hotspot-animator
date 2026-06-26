$ErrorActionPreference = "Stop"

# Build the standalone Windows executable from the PyInstaller spec, which is the
# single source of truth for build options and module excludes (it keeps numpy +
# imageio + ffmpeg so WebM export works, and trims unused heavy libraries).

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

python -m PyInstaller --noconfirm --clean "Hotspot Animator.spec"

Copy-Item -LiteralPath (Join-Path $root "README_FOR_USERS.txt") -Destination (Join-Path $root "dist\README_FOR_USERS.txt") -Force

Write-Host ""
Write-Host "Build complete:"
Write-Host (Join-Path $root "dist\Hotspot Animator.exe")
