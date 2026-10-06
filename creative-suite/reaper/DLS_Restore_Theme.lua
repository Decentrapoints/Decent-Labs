-- Restore the theme selected before running DLS_Load_Theme.lua.
local previous = reaper.GetExtState('DLS', 'ThemeBeforeSatsu')
if previous == '' then
  reaper.MB('No previous theme was saved. Choose a theme from Options > Themes.', 'DLS Satsu', 0)
  return
end
if not reaper.file_exists(previous) then
  reaper.MB('The previous theme file was moved or deleted. Choose it from Options > Themes.', 'DLS Satsu', 0)
  return
end
if not reaper.OpenColorThemeFile(previous) then
  reaper.MB('REAPER could not load the previous theme. Its saved path has been retained.', 'DLS Satsu', 0)
  return
end
reaper.DeleteExtState('DLS', 'ThemeBeforeSatsu', true)
reaper.UpdateArrange()
reaper.TrackList_AdjustWindows(false)
