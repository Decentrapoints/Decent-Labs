-- Install and apply the packaged native DLS Satsu theme. No dependencies.
-- This action preserves the prior theme path for DLS_Restore_Theme.lua.
local _, script = reaper.get_action_context()
local folder = script:match('^(.*)[/\\]')
local variant = DLS_THEME_VARIANT == 'light' and ' Light' or ''
DLS_THEME_VARIANT = nil
local name = 'DLS Satsu' .. variant .. '.ReaperThemeZip'
local source = folder .. '/theme/dist/' .. name
local file = io.open(source, 'rb')
if not file then
  reaper.MB('The theme package is missing. Keep this script in the repository reaper folder.', 'DLS Satsu', 0)
  return
end
local bytes = file:read('*a'); file:close()
local target = reaper.GetResourcePath() .. '/ColorThemes/' .. name
-- Save the old theme only on the first application, never replace it with DLS.
local current = reaper.GetLastColorThemeFile()
-- Zipped themes can report the virtual .ReaperTheme member, not its archive.
if not reaper.file_exists(current) and reaper.file_exists(current .. 'Zip') then current = current .. 'Zip' end
local currentName = current:match('([^/\\]+)$') or ''
local alreadyDLS = currentName:match('^DLS Satsu%.ReaperTheme') or currentName:match('^DLS Satsu Light%.ReaperTheme')
if reaper.GetExtState('DLS', 'ThemeBeforeSatsu') == '' and current ~= target and not alreadyDLS then
  reaper.SetExtState('DLS', 'ThemeBeforeSatsu', current, true)
end
reaper.RecursiveCreateDirectory(reaper.GetResourcePath() .. '/ColorThemes', 0)
local existing = io.open(target, 'rb')
local old = existing and existing:read('*a') or nil
if existing then existing:close() end
if old and old ~= bytes then
  local backup = target .. '.previous'
  local suffix = 1
  while reaper.file_exists(backup) do backup = target .. '.previous-' .. suffix; suffix = suffix + 1 end
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
-- Register a portable action and open the real Playback controls after setup.
local playback = folder .. '/DLS_Playback.lua'
if reaper.file_exists(playback) and reaper.AddRemoveReaScript then
  local action = reaper.AddRemoveReaScript(true, 0, playback, true)
  if action > 0 and (not reaper.GetToggleCommandStateEx or reaper.GetToggleCommandStateEx(0, action) ~= 1) then
    reaper.Main_OnCommand(action, 0)
  end
end
