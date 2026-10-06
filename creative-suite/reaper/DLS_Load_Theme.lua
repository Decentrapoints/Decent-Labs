-- Install and apply the packaged native DLS Satsu theme. No dependencies.
-- This action preserves the prior theme path for DLS_Restore_Theme.lua.
local _, script = reaper.get_action_context()
local folder = script:match('^(.*)[/\\]')
local source = folder .. '/theme/dist/DLS Satsu.ReaperThemeZip'
local file = io.open(source, 'rb')
if not file then
  reaper.MB('The theme package is missing. Keep this script in the repository reaper folder.', 'DLS Satsu', 0)
  return
end
local bytes = file:read('*a'); file:close()
local target = reaper.GetResourcePath() .. '/ColorThemes/DLS Satsu.ReaperThemeZip'
-- Save the old theme only on the first application, never replace it with DLS.
local current = reaper.GetLastColorThemeFile()
if reaper.GetExtState('DLS', 'ThemeBeforeSatsu') == '' and current ~= target then
  reaper.SetExtState('DLS', 'ThemeBeforeSatsu', current, true)
end
reaper.RecursiveCreateDirectory(reaper.GetResourcePath() .. '/ColorThemes', 0)
local existing = io.open(target, 'rb')
local old = existing and existing:read('*a') or nil
if existing then existing:close() end
if old and old ~= bytes then
  local backup = target .. '.previous'
  if reaper.file_exists(backup) then
    reaper.MB('A previous DLS theme backup already exists. Use the theme installer to update without replacing that backup.', 'DLS Satsu', 0)
    return
  end
  local saved = io.open(backup, 'wb')
  if not saved then reaper.MB('Could not back up the previous DLS theme.', 'DLS Satsu', 0); return end
  local ok = saved:write(old); saved:close()
  if not ok then reaper.MB('Could not write the previous theme backup.', 'DLS Satsu', 0); return end
end
if old ~= bytes then
  local output = io.open(target, 'wb')
  if not output then reaper.MB('Could not install the theme. Check the REAPER resource folder permissions.', 'DLS Satsu', 0); return end
  local ok = output:write(bytes); output:close()
  if not ok then reaper.MB('Could not write the theme package.', 'DLS Satsu', 0); return end
end
if not reaper.OpenColorThemeFile(target) then
  reaper.MB('REAPER could not load the theme archive. Your previous theme selection is saved for restoration.', 'DLS Satsu', 0)
  return
end
reaper.UpdateArrange()
reaper.TrackList_AdjustWindows(false)
