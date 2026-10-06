-- DLS SatsuAudio bridge: start as a deferred action in REAPER 7.
-- No shell, network access, arbitrary action IDs, or audio-thread AI.
local _,script=reaper.get_action_context()
local folder=script:match('^(.*)[/\\]')
local json=dofile(folder..'/json.lua')
local directory=reaper.GetExtState('DLS','BridgeDirectory')
if directory=='' then
  local accepted,path=reaper.GetUserInputs('DLS bridge',1,'Bridge folder (from Connections):',reaper.GetResourcePath()..'/DLS-bridge')
  if not accepted or path=='' then return end
  directory=path; reaper.SetExtState('DLS','BridgeDirectory',directory,true)
end
reaper.RecursiveCreateDirectory(directory,0)
local function path(name) return directory..'/'..name end
local function read(name)
  local f=io.open(path(name),'rb'); if not f then return nil end
  local bytes=f:read(2097153); f:close(); if #bytes>2097152 then return nil end
  local ok,v=pcall(json.decode,bytes); return ok and v or nil
end
local function write(name,data)
  local f=assert(io.open(path(name..'.tmp'),'wb')); f:write(json.encode(data)); f:close()
  os.remove(path(name)); assert(os.rename(path(name..'.tmp'),path(name)))
end
local function project() return reaper.EnumProjects(-1,'') end
-- Include this bridge run so proposals cannot survive a REAPER restart.
local runID=tostring(os.time())..':'..tostring({})
local function projectKey(p) return runID..':'..reaper.GetTrackGUID(reaper.GetMasterTrack(p)) end
local function revision(p) return tostring(reaper.GetProjectStateChangeCount(p)) end
local function context()
  local p=project(); local name=reaper.GetProjectName(p); local tracks={}
  for i=0,reaper.CountTracks(p)-1 do
    local t=reaper.GetTrack(p,i); local _,n=reaper.GetTrackName(t)
    tracks[#tracks+1]={id=reaper.GetTrackGUID(t),name=n,number=i+1,volume=reaper.GetMediaTrackInfo_Value(t,'D_VOL'),pan=reaper.GetMediaTrackInfo_Value(t,'D_PAN'),mute=reaper.GetMediaTrackInfo_Value(t,'B_MUTE')~=0,solo=reaper.GetMediaTrackInfo_Value(t,'I_SOLO')~=0,peakLeft=reaper.Track_GetPeakInfo(t,0),peakRight=reaper.Track_GetPeakInfo(t,1),fxCount=reaper.TrackFX_GetCount(t)}
  end
  local a,b=reaper.GetSet_LoopTimeRange2(p,false,true,0,0,false)
  return {project=projectKey(p),revision=revision(p),name=name~='' and name or 'Untitled session',observedAt=os.time(),tracks=tracks,tempo=reaper.Master_GetTempo(),position=reaper.GetPlayPosition2Ex(p),playState=reaper.GetPlayStateEx(p),loopStart=a,loopEnd=b}
end
local function number(n,min,max) assert(type(n)=='number' and n==n and n>=min and n<=max,'Invalid number'); return n end
local function execute(command)
  assert(type(command.id)=='string' and command.id:match('^[%w%-]+$'),'Invalid command ID')
  local p=project(); assert(command.project==projectKey(p),'Project changed')
  assert(command.revision==revision(p),'Session revision changed')
  number(command.expiresAt,os.time(),os.time()+30)
  local op=command.operation; assert(type(op)=='table','Invalid operation')
  if op.type=='play' then reaper.OnPlayButtonEx(p); return end
  if op.type=='pause' then reaper.OnPauseButtonEx(p); return end
  if op.type=='stop' then reaper.OnStopButtonEx(p); return end
  local t
  if op.type=='mute' or op.type=='solo' or op.type=='volume' then
    for i=0,reaper.CountTracks(p)-1 do local candidate=reaper.GetTrack(p,i); if reaper.GetTrackGUID(candidate)==op.track then t=candidate; break end end
    assert(t,'Track no longer exists')
    if op.type=='volume' then number(op.value,0,2) else assert(type(op.value)=='boolean','Invalid on/off value') end
  elseif op.type=='loop' then number(op.start,0,86400); number(op['end'],op.start+0.001,86400)
  elseif op.type=='marker' then number(op.position,0,86400); assert(type(op.name)=='string' and #op.name<=320,'Invalid marker name')
  else error('Unsupported operation') end
  reaper.Undo_BeginBlock2(p)
  local ok,err=pcall(function()
    if op.type=='mute' then reaper.SetMediaTrackInfo_Value(t,'B_MUTE',op.value and 1 or 0)
    elseif op.type=='solo' then reaper.SetMediaTrackInfo_Value(t,'I_SOLO',op.value and 1 or 0)
    elseif op.type=='volume' then reaper.SetMediaTrackInfo_Value(t,'D_VOL',op.value)
    elseif op.type=='loop' then reaper.GetSet_LoopTimeRange2(p,true,true,op.start,op['end'],false)
    elseif op.type=='marker' then reaper.AddProjectMarker2(p,false,op.position,0,op.name,-1,0) end
  end)
  reaper.Undo_EndBlock2(p,'DLS / Satsu: '..op.type,-1); reaper.UpdateArrange()
  if not ok then error(err) end
end
local function commands()
  local files={}; local i=0
  while true do local name=reaper.EnumerateFiles(directory,i); if not name then break end; if name:match('^command%-[%w%-]+%.json$') then files[#files+1]=name end; i=i+1 end
  table.sort(files)
  for _,name in ipairs(files) do
    local id=name:match('^command%-(.*)%.json$'); local cmd=read(name)
    if read('receipt-'..id..'.json') then os.remove(path(name))
    else
      -- Claim before execution. A crash leaves processing-* for inspection and
      -- is never automatically re-executed by this script or the service.
      local claimed=os.rename(path(name),path('processing-'..id..'.json'))
      if claimed then
        local ok,err=pcall(function() assert(cmd and cmd.id==id,'Invalid command'); execute(cmd) end)
        write('receipt-'..id..'.json',{id=id,status=ok and 'applied' or 'rejected',message=ok and 'Executed in REAPER' or tostring(err),observedAt=os.time(),revision=revision(project())})
        os.remove(path('processing-'..id..'.json'))
      end
    end
  end
end
local _,_,section,commandID=reaper.get_action_context()
reaper.SetToggleCommandState(section,commandID,1); reaper.RefreshToolbar2(section,commandID)
reaper.atexit(function() os.remove(path('context.json')); reaper.SetToggleCommandState(section,commandID,0);reaper.RefreshToolbar2(section,commandID) end)
local last=0
local function tick()
  if reaper.time_precise()-last>.25 then
    local ok,err=pcall(function() commands(); write('context.json',context()) end)
    if not ok then reaper.ShowConsoleMsg('DLS bridge: '..tostring(err)..'\n'); return end
    last=reaper.time_precise()
  end
  reaper.defer(tick)
end
tick()
