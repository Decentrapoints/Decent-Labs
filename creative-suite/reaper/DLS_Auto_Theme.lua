-- DLS appearance / MIT. Portable REAPER Lua; no extensions or web service.
local function model(api)
  local M={}
  function M.minute(value)
    local h,m=tostring(value):match('^(%d%d):(%d%d)$')
    h,m=tonumber(h),tonumber(m)
    if h and h<24 and m<60 then return h*60+m end
  end
  function M.target(mode,day,night,minute)
    if mode=='off' then return nil end
    if mode=='dark' or mode=='light' then return mode end
    if mode~='auto' or not day or not night or day==night then return nil end
    local light=day<night and minute>=day and minute<night
      or day>night and (minute>=day or minute<night)
    return light and 'light' or 'dark'
  end
  function M.apply(variant)
    local path=api.GetResourcePath()..'/ColorThemes/DLS Satsu'..(variant=='light' and ' Light' or '')..'.ReaperThemeZip'
    if not api.file_exists(path) then return false,'Missing theme: '..path end
    local current=api.GetLastColorThemeFile()
    if current==path or current..'Zip'==path then return true end
    local name=current:match('([^/\\]+)$') or ''
    if api.GetExtState('DLS','ThemeBeforeSatsu')=='' and not name:match('^DLS Satsu') then
      if not api.file_exists(current) and api.file_exists(current..'Zip') then current=current..'Zip' end
      api.SetExtState('DLS','ThemeBeforeSatsu',current,true)
    end
    if not api.OpenColorThemeFile(path) then return false,'REAPER could not load '..path end
    api.UpdateArrange();api.TrackList_AdjustWindows(false)
    return true
  end
  return M
end
if DLS_APPEARANCE_TEST then return model end
local M=model(reaper)
local namespace='DLSAppearance'
local heartbeat=tonumber(reaper.GetExtState(namespace,'Heartbeat'))
local now=reaper.time_precise()
if heartbeat and now>=heartbeat and now-heartbeat<2 then return end
if reaper.set_action_options then reaper.set_action_options(1) end
local owner=tostring(now)..tostring({})
reaper.SetExtState(namespace,'Owner',owner,false)
local lastTarget,lastRevision,nextCheck=nil,nil,0
reaper.atexit(function()
  if reaper.GetExtState(namespace,'Owner')==owner then
    reaper.DeleteExtState(namespace,'Owner',false)
    reaper.DeleteExtState(namespace,'Heartbeat',false)
  end
end)
local function frame()
  local tick=reaper.time_precise()
  reaper.SetExtState(namespace,'Heartbeat',tostring(tick),false)
  local revision=reaper.GetExtState(namespace,'Revision')
  if revision~=lastRevision then lastTarget=nil;nextCheck=0;lastRevision=revision end
  if tick>=nextCheck then
    nextCheck=tick+30
    local mode=reaper.GetExtState(namespace,'Mode');if mode=='' then mode='auto' end
    if mode=='off' then return end
    local time=os.date('*t') -- Local timezone, including daylight-saving changes.
    local day=M.minute(reaper.GetExtState(namespace,'DayStart')~='' and reaper.GetExtState(namespace,'DayStart') or '07:00')
    local night=M.minute(reaper.GetExtState(namespace,'NightStart')~='' and reaper.GetExtState(namespace,'NightStart') or '19:00')
    local target=M.target(mode,day,night,time.hour*60+time.min)
    if not target then reaper.ShowConsoleMsg('DLS appearance: invalid schedule; run DLS_Theme_Settings.lua.\n');return end
    -- Defer visual reloads during playback/recording. Keep the last selection
    -- for this period, so a manual theme choice is not continually overridden.
    if target~=lastTarget and (reaper.GetPlayState()&5)==0 then
      local ok,message=M.apply(target)
      if not ok then reaper.ShowConsoleMsg('DLS appearance: '..message..'\n');return end
      lastTarget=target
    end
    if mode~='auto' and lastTarget then return end
  end
  reaper.defer(frame)
end
frame()
