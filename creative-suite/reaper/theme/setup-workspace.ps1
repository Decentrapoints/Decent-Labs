[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ResourcePath = (Join-Path $env:APPDATA 'REAPER'),
    [switch]$QuickAccess,
    [switch]$NativeControls,
    [string]$SuiteURL = 'http://localhost:4310'
)
$ErrorActionPreference = 'Stop'
$resourceRoot = [IO.Path]::GetFullPath($ResourcePath)
if (-not (Test-Path -LiteralPath (Join-Path $resourceRoot 'reaper.ini') -PathType Leaf)) { throw 'No reaper.ini in the chosen resource directory.' }
if (-not $WhatIfPreference -and (Get-Process reaper -ErrorAction SilentlyContinue)) { throw 'Close REAPER before updating its action, toolbar or extension settings.' }
$uri = $null
if (-not [Uri]::TryCreate($SuiteURL, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https') -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) { throw 'SuiteURL must be an http(s) host URL without a path, credentials, query or fragment.' }
$SuiteURL = $uri.GetLeftPart([UriPartial]::Authority)
$scriptRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$utf8 = New-Object Text.UTF8Encoding $false
function Write-BackedFile([string]$Path, [string]$Content) {
    if ((Test-Path -LiteralPath $Path) -and [IO.File]::ReadAllText($Path) -eq $Content) { return }
    if ($PSCmdlet.ShouldProcess($Path, 'Update DLS settings with a timestamped backup')) {
        if (Test-Path -LiteralPath $Path) { Copy-Item -LiteralPath $Path -Destination ($Path + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.bak') }
        [IO.File]::WriteAllText($Path, $Content, $utf8)
    }
}
function Read-Text([string]$Path) { if (Test-Path -LiteralPath $Path) { return [IO.File]::ReadAllText($Path) }; return '' }
function Set-Section([string]$Content, [string]$Name, [string]$Body) {
    $pattern = '(?ms)^\[' + [regex]::Escape($Name) + '\][^\r\n]*\r?\n.*?(?=^\[|\z)'
    $replacement = '[' + $Name + "]`r`n" + $Body.TrimEnd() + "`r`n`r`n"
    if ([regex]::IsMatch($Content, $pattern)) { return [regex]::Replace($Content, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }) }
    return $Content.TrimEnd() + "`r`n`r`n" + $replacement
}
function Get-Section([string]$Content, [string]$Name) {
    $m = [regex]::Match($Content, '(?ms)^\[' + [regex]::Escape($Name) + '\][^\r\n]*\r?\n(.*?)(?=^\[|\z)')
    if ($m.Success) { return $m.Groups[1].Value }; return ''
}
$actions = @(
    @{ File = 'DLS_Playback.lua'; Label = 'Playback'; Icon = 'playback'; Row = 1 },
    @{ File = 'DLS_Guitar_Tuner.lua'; Label = 'Guitar tuner'; Icon = 'tuner'; Row = 1 },
    @{ File = 'DLS_Live_Pitch.lua'; Label = 'Live guitar pitch'; Icon = 'pitch'; Row = 1 },
    @{ File = 'DLS_Loop_Phrase.lua'; Label = 'Loop phrase'; Icon = 'loop'; Row = 2 },
    @{ Command = '40363'; Label = 'Count-in / metronome settings'; Icon = 'countin'; Row = 2 },
    @{ File = 'DLS_Open_Tabs.lua'; Label = 'DLS Tabs'; Icon = 'tabs'; Row = 2 },
    @{ File = 'DLS_Open_Satsu.lua'; Label = 'Satsu studio'; Icon = 'satsu'; Row = 2 }
)
$service = @{ File = 'DLS_Transport_Controls.lua'; Label = 'Native transport controls' }
$files = @('DLS_Playback.lua', 'DLS_Live_Pitch.lua', 'DLS_Guitar_Tuner.lua', 'DLS_Loop_Phrase.lua', 'DLS_Open_Tabs.lua', 'DLS_Open_Satsu.lua', 'DLS_Native_Controls.lua', 'DLS_Transport_Controls.lua')
foreach ($file in $files) {
    $source = Join-Path $scriptRoot $file
    $target = Join-Path $resourceRoot ('Scripts/' + $file)
    if (-not (Test-Path -LiteralPath $source)) { throw ('Missing script: ' + $file) }
    if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath $source).Hash) { continue }
    if ($PSCmdlet.ShouldProcess($target, 'Install DLS action with backup')) {
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination ($target + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff') + '.bak') }
        Copy-Item -LiteralPath $source -Destination $target -Force
        if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw ('Script checksum mismatch: ' + $file) }
    }
}
if ($NativeControls) {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Native transport dragging requires 64-bit Windows REAPER.' }
    $dll = Join-Path $resourceRoot 'UserPlugins/reaper_js_ReaScriptAPI64.dll'
    $expected = '7231862247efcd935f14a648364f7808631cb99b0fd55eb5ed6af1fbf7405072'
    if (Test-Path -LiteralPath $dll) {
        if ((Get-FileHash -LiteralPath $dll).Hash.ToLowerInvariant() -ne $expected) {
            Write-Warning 'An existing js_ReaScriptAPI version is preserved. DLS will use its compatible APIs; update it through ReaPack if needed.'
        }
    } elseif ($PSCmdlet.ShouldProcess($dll, 'Install official js_ReaScriptAPI 1.310 from a pinned commit and verify SHA-256')) {
        $download = Join-Path ([IO.Path]::GetTempPath()) ('dls-jsapi-' + [Guid]::NewGuid().ToString('N') + '.dll')
        try {
            Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/juliansader/ReaExtensions/2100b96d99b8621f6145a0f02000036c23b3d938/js_ReaScriptAPI/v1.310/reaper_js_ReaScriptAPI64.dll' -OutFile $download
            if ((Get-FileHash -LiteralPath $download).Hash.ToLowerInvariant() -ne $expected) { throw 'Official native extension checksum mismatch; nothing installed.' }
            New-Item -ItemType Directory -Path (Split-Path $dll) -Force | Out-Null
            Copy-Item -LiteralPath $download -Destination $dll
        } finally { if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download } }
    }
}
if ($QuickAccess -or $NativeControls) {
    $kbPath = Join-Path $resourceRoot 'reaper-kb.ini'
    $kb = Read-Text $kbPath
    foreach ($action in ($actions + @($service))) {
        if ($action.Command) { continue }
        $match = [regex]::Match($kb, '(?m)^SCR\s+\d+\s+0\s+(RS\w+)\s+.*\b' + [regex]::Escape($action.File) + '"?\s*$')
        if ($match.Success) { $action.Command = '_' + $match.Groups[1].Value; continue }
        $sha = [Security.Cryptography.SHA1]::Create()
        try { $id = 'RS' + ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes('DLS:' + $action.File)))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
        $action.Command = '_' + $id
        $kb = $kb.TrimEnd() + "`r`nSCR 4 0 " + $id + ' "Custom: DLS / ' + $action.Label + '" ' + $action.File + "`r`n"
    }
    Write-BackedFile $kbPath $kb
    $extPath = Join-Path $resourceRoot 'reaper-extstate.ini'
    $ext = Read-Text $extPath
    $playback = Get-Section $ext 'DLSPlayback'
    if ($QuickAccess -and $playback -notmatch '(?m)^WorkspaceLayoutVersion=2\s*$') {
        $iniPath = Join-Path $resourceRoot 'reaper.ini'
        $ini = Read-Text $iniPath
        $main = Get-Section $ini 'REAPER'
        $main = (@($main -split '\r?\n' | Where-Object { $_ -and $_ -notmatch '^dockheight=' }) + 'dockheight=374') -join "`r`n"
        Write-BackedFile $iniPath (Set-Section $ini 'REAPER' $main)
        $playback = (@($playback -split '\r?\n' | Where-Object { $_ -and $_ -notmatch '^(WorkspaceLayoutVersion|collapsed|height)=' }) + @('WorkspaceLayoutVersion=2', 'collapsed=0', 'height=350')) -join "`r`n"
    }
    $playback = (@($playback -split '\r?\n' | Where-Object { $_ -and $_ -notmatch '^NativeAction=' }) + ('NativeAction=' + $service.Command)) -join "`r`n"
    Write-BackedFile $extPath (Set-Section $ext 'DLSPlayback' $playback)
}
if ($QuickAccess) {
    $menuPath = Join-Path $resourceRoot 'reaper-menu.ini'
    $menu = Read-Text $menuPath
    $body = Get-Section $menu 'Main toolbar'
    if (-not $body) { $body = Get-Section ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'default-toolbar.ReaperMenu'))) 'Main toolbar' }
    $items = New-Object 'Collections.Generic.List[object]'
    $extra = New-Object 'Collections.Generic.List[string]'
    $attributes = @{}
    foreach ($line in ($body -split '\r?\n')) {
        if ($line -match '^(icon|tbf)_(\d+)=(.*)$') { $attributes[($Matches[1] + ':' + $Matches[2])] = $Matches[3] }
    }
    foreach ($line in ($body -split '\r?\n')) {
        if ($line -match '^item_(\d+)=(.*)$') {
            $index = $Matches[1]; $value = $Matches[2]
            $items.Add(@{ Value = $value; Icon = $attributes[('icon:' + $index)]; Tbf = $attributes[('tbf:' + $index)] })
        } elseif ($line -and $line -notmatch '^(icon|tbf)_\d+=') { $extra.Add($line) }
    }
    foreach ($action in $actions) {
        $exists = @($items | Where-Object { ($_.Value -split ' ', 2)[0] -eq $action.Command })
        if ($exists.Count) { continue }
        $item = @{ Value = $action.Command + ' ' + $action.Label; Icon = 'toolbar_dls_' + $action.Icon + '.png'; Tbf = $null }
        $separator = -1
        for ($i = 0; $i -lt $items.Count; $i++) { if ($items[$i].Value -eq '-1') { $separator = $i; break } }
        if ($action.Row -eq 1 -and $separator -ge 0) { $items.Insert($separator, $item) } else { $items.Add($item) }
    }
    $lines = New-Object 'Collections.Generic.List[string]'
    for ($i = 0; $i -lt $items.Count; $i++) {
        $lines.Add('item_' + $i + '=' + $items[$i].Value)
        if ($items[$i].Icon) { $lines.Add('icon_' + $i + '=' + $items[$i].Icon) }
        if ($null -ne $items[$i].Tbf) { $lines.Add('tbf_' + $i + '=' + $items[$i].Tbf) }
    }
    $lines.AddRange($extra)
    Write-BackedFile $menuPath (Set-Section $menu 'Main toolbar' ($lines -join "`r`n"))
    $extPath = Join-Path $resourceRoot 'reaper-extstate.ini'
    $ext = Read-Text $extPath
    $dls = Get-Section $ext 'DLS'
    $dls = (@($dls -split '\r?\n' | Where-Object { $_ -and $_ -notmatch '^SuiteURL=' }) + ('SuiteURL=' + $SuiteURL)) -join "`r`n"
    Write-BackedFile $extPath (Set-Section $ext 'DLS' $dls)
    Write-Host 'Quick access installed: Playback, tuner, live pitch, phrase loop, count-in, Tabs and Satsu. Existing actions and other toolbars are preserved.'
}
