-- DLS appearance setup / MIT. Run from the repository on Windows or Linux.
-- Copies only DLS files and manages its own backed-up startup block.
local _,script=reaper.get_action_context()
local folder=script:match('^(.*[/\\])')
local resource=reaper.GetResourcePath()
local function read(path)
  local f=io.open(path,'rb');if not f then return nil end
  local value=f:read('*a');f:close();return value
end
local function write(path,value)
  local old=read(path);if old==value then return end
  if old then
    local backup=path..'.dls-backup-'..os.time();local i=0
    while read(backup) do i=i+1;backup=path..'.dls-backup-'..os.time()..'-'..i end
    local f=assert(io.open(backup,'wb'),'Cannot back up '..path)
    assert(f:write(old));f:close()
  end
  local f=assert(io.open(path,'wb'),'Cannot write '..path)
  local ok,err=f:write(value);f:close();assert(ok,err)
end
local prior=DLS_APPEARANCE_TEST;DLS_APPEARANCE_TEST=true
local loaded,factory=pcall(dofile,folder..'DLS_Auto_Theme.lua')
DLS_APPEARANCE_TEST=prior
if not loaded then reaper.MB('Keep this action beside DLS_Auto_Theme.lua.','DLS appearance',0);return end
local M=factory(reaper)
local function pref(key,fallback)
  local value=reaper.GetExtState('DLSAppearance',key)
  return value~='' and value or fallback
end
local accepted,input=reaper.GetUserInputs('DLS appearance',4,
  'Mode: auto / dark / light / off,Light from (HH:MM),Dark from (HH:MM),Start with REAPER: yes / no',
  pref('Mode','auto')..','..pref('DayStart','07:00')..','..pref('NightStart','19:00')..','..pref('Startup','yes'))
if not accepted then return end
local mode,day,night,startup=input:lower():match('^%s*(%a+)%s*,%s*(%d%d:%d%d)%s*,%s*(%d%d:%d%d)%s*,%s*(%a+)%s*$')
if not mode or not ({auto=true,dark=true,light=true,off=true})[mode]
  or not M.minute(day) or not M.minute(night) or day==night
  or not ({yes=true,no=true})[startup] then
  reaper.MB('Choose auto, dark, light or off; two different 24-hour times such as 07:00 and 19:00; and yes or no for startup.','DLS appearance',0);return
end
local success,err=pcall(function()
  local scripts=resource..'/Scripts/'
  reaper.RecursiveCreateDirectory(scripts,0)
  reaper.RecursiveCreateDirectory(resource..'/ColorThemes',0)
  for _,name in ipairs({'DLS Satsu.ReaperThemeZip','DLS Satsu Light.ReaperThemeZip'}) do
    local target=resource..'/ColorThemes/'..name
    local bytes=read(folder..'theme/dist/'..name) or read(target)
    assert(bytes,'Missing '..name..'; keep the repository reaper folder together.')
    write(target,bytes)
  end
  for _,name in ipairs({'DLS_Auto_Theme.lua','DLS_Theme_Settings.lua'}) do write(scripts..name,assert(read(folder..name),'Missing '..name)) end
  local path=scripts..'__startup.lua'
  local old=read(path) or ''
  local beginMarker='-- DLS_AUTO_THEME_BEGIN'
  local endMarker='-- DLS_AUTO_THEME_END'
  local content=old
  local function marker(text,value,from)
    local first,last=text:find(value,from or 1,true)
    while first do
      local atStart=first==1 or text:sub(first-1,first-1)=='\n' or (first==4 and text:sub(1,3)=='\239\187\191')
      local after=text:sub(last+1,last+1)
      if atStart and (after=='' or after=='\r' or after=='\n') then return first,last end
      first,last=text:find(value,last+1,true)
    end
  end
  while true do
    local first=marker(content,beginMarker);if not first then break end
    local _,last=marker(content,endMarker,first)
    assert(last,'The existing DLS startup block is incomplete; restore its backup before changing it.')
    if content:sub(last+1,last+2)=='\r\n' then last=last+2
    elseif content:sub(last+1,last+1)=='\n' then last=last+1 end
    content=content:sub(1,first-1)..content:sub(last+1)
  end
  if startup=='yes' and mode~='off' then
    local block=beginMarker..'\n'..
      'do\n  local run=loadfile(reaper.GetResourcePath().."/Scripts/DLS_Auto_Theme.lua")\n  if run then pcall(run) end\nend\n'..endMarker..'\n'
    -- Preserve a BOM or first-line interpreter directive, if present.
    local prefix=''
    if content:sub(1,3)=='\239\187\191' then prefix=content:sub(1,3);content=content:sub(4) end
    if content:sub(1,2)=='#!' then
      local ending=content:find('\n',1,true)
      if ending then prefix=prefix..content:sub(1,ending);content=content:sub(ending+1)
      else prefix=prefix..content..'\n';content='' end
    end
    content=prefix..block..content
  end
  local validation=content:gsub('^\239\187\191',''):gsub('^#![^\n]*\n','')
  assert(load(validation,'@'..path),'Existing startup Lua contains an error; no startup changes were written.')
  if content~=old then write(path,content) end
  for key,value in pairs({Mode=mode,DayStart=day,NightStart=night,Startup=startup,Revision=tostring(reaper.time_precise())}) do
    reaper.SetExtState('DLSAppearance',key,value,true)
  end
  if mode~='off' then
    local heartbeat=tonumber(reaper.GetExtState('DLSAppearance','Heartbeat'))
    local now=reaper.time_precise()
    if not heartbeat or now<heartbeat or now-heartbeat>=2 then
      local action=reaper.AddRemoveReaScript(true,0,scripts..'DLS_Auto_Theme.lua',true)
      assert(action>0,'Could not register the appearance action.')
      reaper.Main_OnCommand(action,0)
    end
  end
end)
if not success then reaper.MB('Appearance setup failed: '..tostring(err)..'\nExisting changed files have .dls-backup copies.','DLS appearance',0) end
