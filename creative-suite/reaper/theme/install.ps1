[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ResourcePath = (Join-Path $env:APPDATA 'REAPER'),
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$resourceRoot = [IO.Path]::GetFullPath($ResourcePath)
if (-not (Test-Path -LiteralPath (Join-Path $resourceRoot 'reaper.ini') -PathType Leaf)) {
    throw 'Choose REAPER''s resource directory (Options > Show REAPER resource path). No reaper.ini found.'
}
$themeDirectory = Join-Path $resourceRoot 'ColorThemes'
$destination = Join-Path $themeDirectory 'DLS Satsu.ReaperThemeZip'
$source = Join-Path $PSScriptRoot 'dist/DLS Satsu.ReaperThemeZip'
if ($Uninstall) {
    if ((Test-Path -LiteralPath $destination) -and $PSCmdlet.ShouldProcess($destination, 'Remove DLS theme only')) {
        Remove-Item -LiteralPath $destination
    }
    Write-Host 'DLS theme removed. Select another theme in REAPER. Your projects and other themes are untouched.'
    return
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Theme archive is missing. Download the complete theme folder.' }
# Validate the archive before touching the destination; no extraction to user files.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($source)
try {
    if (-not $archive.GetEntry('DLS Satsu.ReaperTheme') -or -not $archive.GetEntry('DLS_Satsu/rtconfig.txt')) {
        throw 'Invalid DLS theme archive.'
    }
} finally { $archive.Dispose() }
if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination).Hash -eq (Get-FileHash -LiteralPath $source).Hash) {
    Write-Host 'DLS Satsu is already installed. Choose Options > Themes > DLS Satsu.'
    return
}
if ($PSCmdlet.ShouldProcess($destination, 'Install DLS Satsu theme')) {
    New-Item -ItemType Directory -Path $themeDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $destination) {
        $backupName = 'DLS Satsu-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.ReaperThemeZip.bak'
        Copy-Item -LiteralPath $destination -Destination (Join-Path $themeDirectory $backupName)
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw 'Installed archive checksum does not match.' }
    Write-Host 'Installed DLS Satsu. In REAPER choose Options > Themes > DLS Satsu.'
}
