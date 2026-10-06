$ErrorActionPreference = 'Stop'
# A disposable resource fixture, never the actual REAPER profile. Its process
# probe is isolated so this test can run while the user's REAPER is open.
function Get-Process { param([string]$Name) return $null }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('dls-installer-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
try {
    $ini = Join-Path $fixture 'reaper.ini'
    $menu = Join-Path $fixture 'reaper-menu.ini'
    $ext = Join-Path $fixture 'reaper-extstate.ini'
    [IO.File]::WriteAllText($ini, "[REAPER]`r`ndockheight=700`r`nOther=keep`r`n[Other]`r`nValue=keep`r`n")
    [IO.File]::WriteAllText($menu, "[Main toolbar]`r`nitem_0=40023 Save`r`nicon_0=toolbar_save.png`r`ntbf_0=1`r`nitem_1=-1`r`nitem_2=40021 New`r`n[Toolbar 2]`r`nitem_0=_custom Custom action`r`ntitle=Custom`r`n")
    [IO.File]::WriteAllText($ext, "[DLS]`r`nExisting=keep`r`n[Unrelated]`r`nValue=keep`r`n")
    $setup = Join-Path $PSScriptRoot '../reaper/theme/setup-workspace.ps1'
    & $setup -ResourcePath $fixture -QuickAccess -SuiteURL 'https://music.example:443'
    $firstMenu = [IO.File]::ReadAllText($menu)
    $firstExt = [IO.File]::ReadAllText($ext)
    Assert ($firstMenu.Contains("[Toolbar 2]`r`nitem_0=_custom Custom action`r`ntitle=Custom")) 'Unrelated toolbar changed.'
    Assert ($firstMenu.Contains('tbf_0=1') -and $firstMenu.Contains('icon_0=toolbar_save.png')) 'Original button attributes changed.'
    Assert (([regex]::Matches($firstMenu, 'item_\d+=.* Playback')).Count -eq 1) 'Playback action duplicated.'
    Assert ($firstExt.Contains("Existing=keep`r`nSuiteURL=https://music.example")) 'Existing suite settings were merged incorrectly.'
    Assert ($firstExt.Contains('NativeAction=_RS') -and $firstExt.Contains('[Unrelated]')) 'Transport registration or unrelated settings missing.'
    Assert ([IO.File]::ReadAllText($ini).Contains('dockheight=374')) 'Initial dock was not made compact.'
    $customIni = [IO.File]::ReadAllText($ini).Replace('dockheight=374', 'dockheight=430')
    [IO.File]::WriteAllText($ini, $customIni)
    & $setup -ResourcePath $fixture -QuickAccess -SuiteURL 'https://music.example:443'
    Assert ([IO.File]::ReadAllText($menu) -eq $firstMenu) 'Reinstall duplicated or changed toolbar buttons.'
    Assert ([IO.File]::ReadAllText($ext) -eq $firstExt) 'Reinstall changed extension settings.'
    Assert ([IO.File]::ReadAllText($ini) -eq $customIni) 'Reinstall overwrote a user-chosen dock height.'
    Assert (([regex]::Matches([IO.File]::ReadAllText((Join-Path $fixture 'reaper-kb.ini')), '(?m)^SCR')).Count -eq 7) 'Actions duplicated or missing.'
    $rejected = $false
    try { & $setup -ResourcePath $fixture -QuickAccess -SuiteURL 'https://example/path' } catch { $rejected = $true }
    Assert $rejected 'Unsafe suite URL accepted.'
    Write-Host 'Installer fixture passed: preservation, idempotency, compact dock, action registration and URL validation.'
} finally {
    $resolved = [IO.Path]::GetFullPath($fixture)
    Assert ($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolved -Leaf).StartsWith('dls-installer-test-')) 'Fixture cleanup target is invalid.'
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
