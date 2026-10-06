-- DLS Playback / REAPER 7+ / MIT. Built-in gfx only: no extensions required.
-- Changes use native project undo; pitch changes never rewrite source audio.
local function model(api)
  local M = {}
  function M.clamp(value, lo, hi)
    value = tonumber(value)
    if not value or value ~= value or value == math.huge or value == -math.huge then return nil end
    return math.max(lo, math.min(hi, value))
  end
  function M.context()
    local p = api.EnumProjects(-1, '')
    local time = api.GetCursorPositionEx(p)
    local marker = api.FindTempoTimeSigMarker(p, time)
    local ctx = {project=p, marker=marker, takes={}, tempo=api.Master_GetTempo(), rate=api.Master_GetPlayRate(p)}
    if marker >= 0 then
      local ok, pos, _, _, bpm, num, den, ramp = api.GetTempoTimeSigMarker(p, marker)
      if ok then ctx.position=pos; ctx.tempo=bpm; ctx.num=num; ctx.den=den; ctx.ramp=ramp end
    end
    for i=0,api.CountSelectedMediaItems(p)-1 do
      local take=api.GetActiveTake(api.GetSelectedMediaItem(p,i))
      if take and not api.TakeIsMIDI(take) then ctx.takes[#ctx.takes+1]=take end
    end
    if #ctx.takes>0 then
      ctx.pitch=api.GetMediaItemTakeInfo_Value(ctx.takes[1],'D_PITCH')
      for _,take in ipairs(ctx.takes) do
        if math.abs(api.GetMediaItemTakeInfo_Value(take,'D_PITCH')-ctx.pitch)>.001 then ctx.mixed=true end
      end
    end
    return ctx
  end
  function M.valid(ctx)
    return api.ValidatePtr(ctx.project,'ReaProject*')
  end
  function M.tempo(ctx,value)
    value=M.clamp(value,20,400)
    if not value or not M.valid(ctx) then return false end
    if ctx.marker>=0 then
      local ok,pos=api.GetTempoTimeSigMarker(ctx.project,ctx.marker)
      if not ok or pos~=ctx.position then return false end
      return api.SetTempoTimeSigMarker(ctx.project,ctx.marker,ctx.position,-1,-1,value,ctx.num,ctx.den,ctx.ramp)
    end
    -- SetCurrentBPM changes the active project: never redirect a captured drag.
    if api.EnumProjects(-1,'')~=ctx.project then return false end
    api.SetCurrentBPM(ctx.project,value,false)
    return true
  end
  function M.rate(ctx,value)
    value=M.clamp(value,.25,2)
    if not value or not M.valid(ctx) or api.EnumProjects(-1,'')~=ctx.project then return false end
    api.CSurf_OnPlayRateChange(value); return true
  end
  function M.pitch(ctx,value,relative)
    value=M.clamp(value,-12,12)
    if not value or not M.valid(ctx) then return false end
    local count=0
    for _,take in ipairs(ctx.takes) do
      if api.ValidatePtr2(ctx.project,take,'MediaItem_Take*') and not api.TakeIsMIDI(take) then
        local pitch=relative and api.GetMediaItemTakeInfo_Value(take,'D_PITCH')+value or value
        api.SetMediaItemTakeInfo_Value(take,'D_PITCH',math.max(-12,math.min(12,pitch)))
        api.UpdateItemInProject(api.GetMediaItemTake_Item(take)); count=count+1
      end
    end
    api.UpdateArrange(); return count>0
  end
  function M.loop_selection(ctx)
    if not M.valid(ctx) then return false end
    local a,b=api.GetSet_LoopTimeRange2(ctx.project,false,false,0,0,false)
    if b<=a then return false end
    api.GetSet_LoopTimeRange2(ctx.project,true,true,a,b,false)
    api.GetSetRepeatEx(ctx.project,1); return true
  end
  function M.live_pitch(ctx)
    if not M.valid(ctx) then return false end
    -- Require one track so a multi-selection never changes an unexpected chain.
    if api.CountSelectedTracks(ctx.project)~=1 then return false end
    local track=api.GetSelectedTrack(ctx.project,0)
    if not track then return false end
    local fx=api.TrackFX_AddByName(track,'ReaPitch (Cockos)',false,0)
    if fx<0 then
      fx=api.TrackFX_AddByName(track,'ReaPitch (Cockos)',false,-1)
      if fx<0 then return false end
      -- New live transposition precedes the amp; existing chains are reused.
      if fx>0 then api.TrackFX_CopyToTrack(track,fx,track,0,true);fx=0 end
    end
    api.TrackFX_Show(track,fx,3);return true
  end
  return M
end

-- The test harness exercises this exact model without opening a native window.
if DLS_PLAYBACK_TEST then return model end
if reaper.set_action_options then reaper.set_action_options(1) end
local M=model(reaper)
local namespace='DLSPlayback'
local _,script,section,command=reaper.get_action_context()
local expanded=reaper.GetExtState(namespace,'expanded')=='1'
local dock=tonumber(reaper.GetExtState(namespace,'dock')) or 1
local width=tonumber(reaper.GetExtState(namespace,'width')) or 740
local height=tonumber(reaper.GetExtState(namespace,'height')) or 360
gfx.init('DLS / Playback',math.max(380,width),math.max(240,height),dock)
if command and command>0 then reaper.SetToggleCommandState(section,command,1); reaper.RefreshToolbar2(section,command) end
local lastDown=false
local down,pressed=false,false
local drag,focus,tooltip,notice,taps,scroll=nil,nil,'','',{},0
local C={}
local function palette()
  local name=reaper.GetLastColorThemeFile() or ''
  local light=name:find('DLS Satsu Light',1,true)~=nil
  C=light and {bg={210,212,219},panel={226,228,233},line={174,177,190},text={35,34,47},muted={78,76,96},accent={89,61,149},selected={205,197,224}}
    or {bg={17,18,22},panel={25,26,32},line={48,48,58},text={238,237,243},muted={171,166,185},accent={186,167,237},selected={43,37,57}}
  gfx.clear=C.bg[1]+C.bg[2]*256+C.bg[3]*65536
end
local function color(name,alpha)
  local rgb=C[name]; gfx.set(rgb[1]/255,rgb[2]/255,rgb[3]/255,alpha or 1)
end
local function rect(x,y,w,h,tone)
  color(tone);gfx.rect(x,y,w,h,1)
end
local function text(label,x,y,w,h,tone,size)
  gfx.setfont(1,'Segoe UI',size or 14);color(tone or 'text');gfx.x=x;gfx.y=y
  gfx.drawstr(label,4,x+w,y+h)
end
local function inside(x,y,w,h)
  return gfx.mouse_x>=x and gfx.mouse_x<x+w and gfx.mouse_y>=y and gfx.mouse_y<y+h
end
local function finish()
  if drag and M.valid(drag.ctx) then reaper.Undo_EndBlock2(drag.ctx.project,drag.label,-1) end
  drag=nil
end
local function edit(label,action,ctx)
  finish();ctx=ctx or M.context()
  if not M.valid(ctx) then return end
  reaper.Undo_BeginBlock2(ctx.project)
  local ok,result=pcall(action,ctx)
  reaper.Undo_EndBlock2(ctx.project,label,-1)
  if not ok then notice='Could not apply control: '..tostring(result)
  elseif result==false then notice='No eligible target. Check the current selection.'
  else notice='' end
end
local function button(label,x,y,w,h,action,tip,on,disabled)
  local hover=inside(x,y,w,h)
  rect(x,y,w,h,on and 'selected' or hover and 'line' or 'panel')
  text(label,x+10,y,w-20,h,disabled and 'muted' or on and 'accent' or 'text',13)
  if hover then tooltip=tip or label end
  if not disabled and hover and pressed then action() end
end
local function input(id,value,x,y,w,h,apply,tip)
  local active=focus and focus.id==id
  rect(x,y,w,h,active and 'selected' or 'panel')
  text(active and focus.value..'|' or value,x+10,y,w-20,h,'text',19)
  if inside(x,y,w,h) then
    tooltip=tip
    if pressed then finish();focus={id=id,value='',apply=apply} end
  end
end
local function slider(id,value,lo,hi,x,y,w,h,ctx,apply,label,disabled)
  local hover=inside(x,y,w,h)
  local fraction=math.max(0,math.min(1,((value or 0)-lo)/(hi-lo)))
  rect(x,y+h/2-2,w,4,'line');rect(x,y+h/2-2,w*fraction,4,'accent')
  color(disabled and 'muted' or 'accent');gfx.circle(x+w*fraction,y+h/2,6,1,1)
  if hover then tooltip=disabled and 'Select an audio item to enable pitch.' or label..' — drag; use the value field for precise entry.' end
  if hover and pressed and not disabled then
    focus=nil;finish();reaper.Undo_BeginBlock2(ctx.project)
    drag={id=id,ctx=ctx,apply=apply,label=label,x=x,w=w,lo=lo,hi=hi}
  end
  if drag and drag.id==id and down then
    local v=drag.lo+math.max(0,math.min(1,(gfx.mouse_x-drag.x)/drag.w))*(drag.hi-drag.lo)
    v=math.floor(v*100+.5)/100
    if not M.valid(drag.ctx) or reaper.EnumProjects(-1,'')~=drag.ctx.project then finish()
    elseif v~=drag.value then
      drag.value=v
      if not drag.apply(drag.ctx,v) then notice='The target changed; release and try again.';finish() end
    end
  end
end
local function tap()
  local now=reaper.time_precise()
  if #taps>0 and now-taps[#taps]>3 then taps={} end
  taps[#taps+1]=now
  if #taps>5 then table.remove(taps,1) end
  if #taps>1 then
    local bpm=60*(#taps-1)/(taps[#taps]-taps[1])
    edit('DLS: tap tempo',function(ctx)return M.tempo(ctx,bpm)end)
  end
end
local function render()
  palette();tooltip='';local ctx=M.context()
  local margin=20;local w=math.max(320,gfx.w-margin*2)
  local required=(expanded and 538 or 238)+(w<600 and 118 or 0)
  scroll=math.max(0,math.min(scroll,math.max(0,required-gfx.h+32)))
  if gfx.mouse_wheel~=0 then scroll=math.max(0,math.min(scroll-gfx.mouse_wheel/3,math.max(0,required-gfx.h+32)));gfx.mouse_wheel=0 end
  local y=-scroll
  text('PLAYBACK',margin,y+12,w-104,25,'accent',12)
  button((gfx.dock(-1)&1)==1 and 'Float' or 'Dock',gfx.w-84,y+10,64,27,function()gfx.dock((gfx.dock(-1)&1)==1 and 0 or 1)end,'Dock beneath the arrange view, or float this panel.')
  text('Tempo & speed',margin,y+43,w,25,'text',22)
  local column=w>=600 and (w-16)/2 or w
  local by=y+85
  text(ctx.marker>=0 and 'BPM / tempo marker at edit cursor' or 'BPM / project tempo',margin,by,column,22,'muted',12)
  input('bpm',string.format('%.2f',ctx.tempo),margin,by+28,100,35,function(v)edit('DLS: set tempo',function(c)return M.tempo(c,v)end)end,'Type BPM (20–400); Enter applies, Escape cancels.')
  button('Tap',margin+110,by+28,64,35,tap,'Tap several beats to set tempo.')
  slider('bpm',ctx.tempo,40,296,margin+12,by+72,column-24,30,ctx,M.tempo,'DLS: tempo')
  local sx,sy=margin+column+16,by
  if w<600 then sx,sy=margin,by+118 end
  text('SPEED / pitch handling in practice settings',sx,sy,column,22,'muted',12)
  input('rate',string.format('%.0f%%',ctx.rate*100),sx,sy+28,100,35,function(v)edit('DLS: playback speed',function(c)return M.rate(c,tonumber(v) and tonumber(v)/100)end)end,'Type speed in percent (25–200).')
  button('100%',sx+110,sy+28,64,35,function()edit('DLS: reset speed',function(c)return M.rate(c,1)end)end,'Return to original playback speed.')
  slider('rate',ctx.rate,.25,2,sx+12,sy+72,column-24,30,ctx,M.rate,'DLS: playback speed')
  local bottom=sy+114
  button(expanded and 'v  Pitch & practice' or '>  Pitch & practice',margin,bottom,w,36,function()expanded=not expanded;reaper.SetExtState(namespace,'expanded',expanded and '1' or '0',true)end,'Expand pitch, loop, and metronome tools.')
  if expanded then
    local py=bottom+51
    text('AUDIO TAKE PITCH',margin,py,w,20,'accent',12)
    text(string.format('%d selected audio take%s%s',#ctx.takes,#ctx.takes==1 and '' or 's',ctx.mixed and ' / mixed pitch' or ''),margin,py+22,w,23,'muted',13)
    input('pitch',ctx.pitch and (ctx.mixed and 'Mixed' or string.format('%+.2f st',ctx.pitch)) or 'Select audio',margin,py+53,120,35,function(v)edit('DLS: take pitch',function(c)return M.pitch(c,v)end)end,'Absolute pitch for selected audio takes, in semitones (−12 to +12). MIDI is unchanged.')
    button('-1',margin+130,py+53,45,35,function()edit('DLS: pitch down',function(c)return M.pitch(c,-1,true)end)end,'Lower each selected audio take by one semitone.',false,#ctx.takes==0)
    button('+1',margin+183,py+53,45,35,function()edit('DLS: pitch up',function(c)return M.pitch(c,1,true)end)end,'Raise each selected audio take by one semitone.',false,#ctx.takes==0)
    button('Reset',margin+236,py+53,70,35,function()edit('DLS: reset pitch',function(c)return M.pitch(c,0)end)end,'Reset selected audio takes to zero pitch shift.',false,#ctx.takes==0)
    slider('pitch',ctx.pitch,-12,12,margin+12,py+99,w-24,30,ctx,function(c,v)return M.pitch(c,v)end,'DLS: take pitch',#ctx.takes==0)
    text('Fine tune: type e.g. -2.25 st. Source files stay intact; Ctrl+Z undoes.',margin,py+133,w,23,'muted',12)
    local ey=py+166
    local bw=(w-16)/3
    button('Loop selection',margin,ey,bw,34,function()edit('DLS: loop time selection',M.loop_selection)end,'Copy time selection to loop points and enable repeat.')
    button('Repeat',margin+bw+8,ey,bw,34,function()edit('DLS: repeat',function(c)reaper.GetSetRepeatEx(c.project,reaper.GetSetRepeatEx(c.project,-1)==1 and 0 or 1)end)end,'Toggle project repeat.',reaper.GetSetRepeatEx(ctx.project,-1)==1)
    button('Click',margin+2*(bw+8),ey,bw,34,function()reaper.Main_OnCommand(40364,0)end,'Toggle REAPER metronome.',reaper.GetToggleCommandStateEx(0,40364)==1)
    button('Keep pitch at slow speed',margin,ey+44,(w-8)/2,34,function()reaper.Main_OnCommand(40671,0)end,'Toggle native preserve-pitch for project playback-rate changes.',reaper.GetToggleCommandStateEx(0,40671)==1)
    button('Metronome settings',margin+(w+8)/2,ey+44,(w-8)/2,34,function()reaper.Main_OnCommand(40363,0)end,'Open native click, count-in, pre-roll and sound settings.')
    button('Live track pitch / ReaPitch',margin,ey+88,w,34,function()
      if reaper.CountSelectedTracks(ctx.project)~=1 then notice='Select one guitar track, then open Live track pitch.';return end
      edit('DLS: open live track pitch',M.live_pitch)
    end,'Open ReaPitch on the selected track. If missing, add it before the amp; set transpose in its native controls.')
  end
  rect(0,gfx.h-30,gfx.w,30,'bg')
  text(notice~='' and notice or tooltip~='' and tooltip or 'Space: play / stop    Tab: focus BPM, speed, pitch    Enter: apply    Esc: cancel',margin,gfx.h-29,w,28,'muted',12)
end
reaper.atexit(function()
  finish();local state,_,_,ww,hh=gfx.dock(-1,0,0,0,0)
  reaper.SetExtState(namespace,'dock',tostring(state),true)
  reaper.SetExtState(namespace,'width',tostring(ww),true);reaper.SetExtState(namespace,'height',tostring(hh),true)
  if command and command>0 then reaper.SetToggleCommandState(section,command,0);reaper.RefreshToolbar2(section,command) end
  gfx.quit()
end)
local function frame()
  local key=gfx.getchar()
  if key<0 then return end
  down=(gfx.mouse_cap&1)==1;pressed=down and not lastDown
  if not down and lastDown then finish() end
  if key==9 then
    local id=not focus and 'bpm' or focus.id=='bpm' and 'rate' or focus.id=='rate' and 'pitch' or 'bpm'
    if id=='pitch' then expanded=true end
    focus={id=id,value='',apply=function(v)
      edit('DLS: playback value',function(c)
        if id=='bpm' then return M.tempo(c,v) elseif id=='rate' then return M.rate(c,tonumber(v) and tonumber(v)/100) else return M.pitch(c,v) end
      end)
    end}
  elseif focus then
    if key==13 then local f=focus;focus=nil;f.apply(f.value)
    elseif key==27 then focus=nil
    elseif key==8 then focus.value=focus.value:sub(1,-2)
    elseif key>=32 and key<=126 and string.char(key):match('[%d%.%-%+]') then focus.value=focus.value..string.char(key) end
  elseif key==32 then reaper.Main_OnCommand(40044,0)
  elseif key==27 then return end
  local ok,err=pcall(render)
  if not ok then reaper.MB('Playback panel error: '..tostring(err),'DLS',0);return end
  lastDown=down;gfx.update();reaper.defer(frame)
end
frame()
