[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ResourcePath = (Join-Path $env:APPDATA 'REAPER'),
    [ValidateSet('Both', 'Dark', 'Light')][string]$Variant = 'Both',
    [switch]$Uninstall,
    [switch]$QuickAccess,
    [switch]$NativeControls,
    [string]$SuiteURL = 'http://localhost:4310'
)
$ErrorActionPreference = 'Stop'
$resourceRoot = [IO.Path]::GetFullPath($ResourcePath)
if (($QuickAccess -or $NativeControls) -and -not $WhatIfPreference -and (Get-Process reaper -ErrorAction SilentlyContinue)) {
    throw 'Close REAPER before installing quick-access/native controls so its settings are not overwritten on exit.'
}
if (-not (Test-Path -LiteralPath (Join-Path $resourceRoot 'reaper.ini') -PathType Leaf)) {
    throw 'Choose REAPER''s resource directory (Options > Show REAPER resource path). No reaper.ini found.'
}
$themeDirectory = Join-Path $resourceRoot 'ColorThemes'
$names = if ($Variant -eq 'Both') { @('DLS Satsu', 'DLS Satsu Light') } elseif ($Variant -eq 'Light') { @('DLS Satsu Light') } else { @('DLS Satsu') }
foreach ($name in $names) {
    $destination = Join-Path $themeDirectory ($name + '.ReaperThemeZip')
    $source = Join-Path $PSScriptRoot ('dist/' + $name + '.ReaperThemeZip')
    if ($Uninstall) {
        if ((Test-Path -LiteralPath $destination) -and $PSCmdlet.ShouldProcess($destination, 'Remove DLS theme only')) {
            Remove-Item -LiteralPath $destination
        }
        Write-Host 'DLS theme removed. Select another theme in REAPER. Your projects and other themes are untouched.'
        continue
    }
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Theme archive is missing. Download the complete theme folder.' }
    # Validate the archive before touching the destination; no extraction to user files.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($source)
    try {
        $assetFolder = if ($name -eq 'DLS Satsu Light') { 'DLS_Satsu_Light' } else { 'DLS_Satsu' }
        if (-not $archive.GetEntry($name + '.ReaperTheme') -or -not $archive.GetEntry($assetFolder + '/rtconfig.txt')) {
            throw 'Invalid DLS theme archive.'
        }
    } finally { $archive.Dispose() }
    if ((Test-Path -LiteralPath $destination) -and (Get-FileHash -LiteralPath $destination).Hash -eq (Get-FileHash -LiteralPath $source).Hash) {
        Write-Host ($name + ' is already installed. Select it under Options > Themes.')
        continue
    }
    if ($PSCmdlet.ShouldProcess($destination, 'Install DLS Satsu theme')) {
        New-Item -ItemType Directory -Path $themeDirectory -Force | Out-Null
        if (Test-Path -LiteralPath $destination) {
            $backupName = $name + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.ReaperThemeZip.bak'
            Copy-Item -LiteralPath $destination -Destination (Join-Path $themeDirectory $backupName)
        }
        Copy-Item -LiteralPath $source -Destination $destination -Force
        if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw 'Installed archive checksum does not match.' }
        Write-Host ('Installed ' + $name + '. Select it under Options > Themes in REAPER.')
    }
}
if ($Uninstall) { return }
$playbackSource = Join-Path $PSScriptRoot '../DLS_Playback.lua'
$playbackDirectory = Join-Path $resourceRoot 'Scripts'
$playbackTarget = Join-Path $playbackDirectory 'DLS_Playback.lua'
if (-not (Test-Path -LiteralPath $playbackSource -PathType Leaf)) { throw 'Playback script is missing. Download the complete reaper folder.' }
if ($PSCmdlet.ShouldProcess($playbackTarget, 'Install DLS Playback controls')) {
    New-Item -ItemType Directory -Path $playbackDirectory -Force | Out-Null
    if ((Test-Path -LiteralPath $playbackTarget) -and (Get-FileHash -LiteralPath $playbackTarget).Hash -ne (Get-FileHash -LiteralPath $playbackSource).Hash) {
        Copy-Item -LiteralPath $playbackTarget -Destination ($playbackTarget + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.bak')
    }
    Copy-Item -LiteralPath $playbackSource -Destination $playbackTarget -Force
    if ((Get-FileHash -LiteralPath $playbackTarget).Hash -ne (Get-FileHash -LiteralPath $playbackSource).Hash) { throw 'Playback checksum does not match.' }
    if (-not $QuickAccess) { Write-Host 'Playback installed. Actions > New action > Load ReaScript > Scripts/DLS_Playback.lua > Run; add it to your toolbar.' }
}

if ($QuickAccess -or $NativeControls) {
    & (Join-Path $PSScriptRoot 'setup-workspace.ps1') -ResourcePath $resourceRoot -QuickAccess:$QuickAccess -NativeControls:$NativeControls -SuiteURL $SuiteURL -WhatIf:$WhatIfPreference
}
