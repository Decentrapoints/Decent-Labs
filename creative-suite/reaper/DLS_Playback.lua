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

-- The test harness exercises the same model without opening a native window.
if DLS_PLAYBACK_TEST then return model end
if reaper.set_action_options then reaper.set_action_options(1) end
local M=model(reaper)
local namespace='DLSPlayback'
local _,script,section,command=reaper.get_action_context()
local expanded=reaper.GetExtState(namespace,'expanded')=='1'
local collapsed=reaper.GetExtState(namespace,'collapsed')=='1'
local width=tonumber(reaper.GetExtState(namespace,'width')) or 940
local height=tonumber(reaper.GetExtState(namespace,'height')) or 350
local function bottom_dock()
  if reaper.DockGetPosition then
    for i=0,15 do if reaper.DockGetPosition(i)==0 then return 1|(i<<8) end end
  end
  return 1
end
local dock=tonumber(reaper.GetExtState(namespace,'dock')) or bottom_dock()
-- One-time migration from the old panel's first (often top) docker.
if reaper.GetExtState(namespace,'layoutVersion')~='2' then
  dock=bottom_dock();reaper.SetExtState(namespace,'layoutVersion','2',true)
end
gfx.init('DLS / Playback',math.max(380,width),collapsed and 58 or math.max(220,height),dock)
if command and command>0 then reaper.SetToggleCommandState(section,command,1);reaper.RefreshToolbar2(section,command) end
local lastDown,down,pressed,released=false,false,false,false
local drag,focus,tooltip,notice,taps,scroll,pending,lastClick=nil,nil,'','',{},0,nil,nil
local hideRequested=false
local C,clipTop,clipBottom,revealPitch={},0,math.huge,false
local native
local function palette()
  local light=(reaper.GetLastColorThemeFile() or ''):find('DLS Satsu Light',1,true)~=nil
  C=light and {bg={210,212,219},panel={226,228,233},line={174,177,190},text={35,34,47},muted={78,76,96},accent={89,61,149},selected={205,197,224},green={33,106,72}}
    or {bg={17,18,22},panel={25,26,32},line={48,48,58},text={238,237,243},muted={171,166,185},accent={186,167,237},selected={43,37,57},green={143,210,171}}
  gfx.clear=C.bg[1]+C.bg[2]*256+C.bg[3]*65536
end
local function color(name,alpha)
  local rgb=C[name];gfx.set(rgb[1]/255,rgb[2]/255,rgb[3]/255,alpha or 1)
end
local function rect(x,y,w,h,tone)
  local top=math.max(y,clipTop);local bottom=math.min(y+h,clipBottom)
  if bottom>top then color(tone);gfx.rect(x,top,w,bottom-top,1) end
end
local function text(label,x,y,w,h,tone,size)
  -- Never draw a partly clipped label or let it spill beneath pinned chrome.
  if y<clipTop or y+h>clipBottom or w<=0 then return end
  gfx.setfont(1,'Segoe UI',size or 14);color(tone or 'text');gfx.x=x;gfx.y=y
  gfx.drawstr(label,4,x+w,y+h)
end
local function inside(x,y,w,h)
  return gfx.mouse_x>=x and gfx.mouse_x<x+w and gfx.mouse_y>=math.max(y,clipTop) and gfx.mouse_y<math.min(y+h,clipBottom)
end
local function finish()
  if drag and drag.undo and M.valid(drag.ctx) then reaper.Undo_EndBlock2(drag.ctx.project,drag.label,-1) end
  drag=nil
end
local function edit(label,action,ctx)
  finish();ctx=ctx or M.context()
  if not M.valid(ctx) then return end
  reaper.Undo_BeginBlock2(ctx.project)
  local ok,result=pcall(action,ctx)
  reaper.Undo_EndBlock2(ctx.project,label,-1)
  notice=not ok and 'Could not apply control: '..tostring(result) or result==false and 'Select an eligible target first.' or ''
end
local function change(d,v)
  if not M.valid(d.ctx) or reaper.EnumProjects(-1,'')~=d.ctx.project then finish();return end
  if v==d.value then return end
  if not d.undo then reaper.Undo_BeginBlock2(d.ctx.project);d.undo=true end
  d.value=v
  if not d.apply(d.ctx,v) then notice='The target changed. Release and try again.';finish() end
end
local function double(id)
  local now=reaper.time_precise()
  local yes=lastClick and lastClick.id==id and now-lastClick.time<.32 and math.abs(lastClick.x-gfx.mouse_x)<8 and math.abs(lastClick.y-gfx.mouse_y)<8
  lastClick=yes and nil or {id=id,time=now,x=gfx.mouse_x,y=gfx.mouse_y}
  return yes
end
local function button(label,x,y,w,h,action,tip,on,disabled)
  local hover=inside(x,y,w,h)
  rect(x,y,w,h,on and 'selected' or hover and 'line' or 'panel')
  text(label,x+10,y,w-20,h,disabled and 'muted' or on and 'accent' or 'text',16)
  if hover then tooltip=tip or label end
  if not disabled and hover and pressed then pending=action end
end
local function number(id,value,display,x,y,w,h,ctx,apply,lo,hi,default,step,disabled)
  local active=focus and focus.id==id
  rect(x,y,w,h,active and 'selected' or 'panel')
  text(active and focus.value..'|' or display,x+10,y,w-20,h,disabled and 'muted' or 'text',22)
  local hover=inside(x,y,w,h)
  if hover then tooltip=disabled and 'Select an audio item to transpose it.' or 'Drag the number right / up to increase; Shift: fine. Click: type. Double-click: reset.' end
  if hover and pressed and not disabled then
    finish();focus=nil
    if double('number:'..id) then edit('DLS: reset '..id,function(c)return apply(c,default)end,ctx)
    else
      local mx,my=gfx.mouse_x,gfx.mouse_y
      if native and native.mouse_down then local nx,ny=native.mouse_down();if nx then mx,my=nx,ny end end
      drag={id='number:'..id,ctx=ctx,apply=apply,label='DLS: '..id,x=mx,y=my,origin=value,lo=lo,hi=hi,step=step,field=id}
    end
  end
  if drag and drag.id=='number:'..id then
    local d=drag;local dx=gfx.mouse_x-d.x;local dy=d.y-gfx.mouse_y
    if down and (d.moved or math.max(math.abs(dx),math.abs(dy))>=3) then
      d.moved=true;lastClick=nil
      local delta=math.abs(dx)>=math.abs(dy) and dx or dy
      local fine=(gfx.mouse_cap&8)==8 and .1 or 1
      change(d,math.floor(math.max(lo,math.min(hi,d.origin+delta*step*fine))*100+.5)/100)
    elseif released and not d.moved then
      focus={id=id,value='',ctx=d.ctx,apply=function(v)
        local n=tonumber(v);if n then edit('DLS: enter '..id,function(c)return apply(c,n)end,d.ctx) else notice='Enter a number, or Escape to cancel.' end
      end}
    end
  end
end
local function slider(id,value,lo,hi,default,x,y,w,h,ctx,apply,disabled)
  local hover=inside(x,y,w,h)
  local fraction=math.max(0,math.min(1,((value or default)-lo)/(hi-lo)))
  rect(x,y+h/2-2,w,4,'line');rect(x,y+h/2-2,w*fraction,4,'accent')
  if y+h/2-6>=clipTop and y+h/2+6<=clipBottom then color(disabled and 'muted' or 'accent');gfx.circle(x+w*fraction,y+h/2,6,1,1) end
  if hover then tooltip=disabled and 'Select an audio item to enable pitch.' or 'Drag to adjust. Double-click the handle to reset.' end
  if hover and pressed and not disabled then
    finish();focus=nil
    if double('slider:'..id) then edit('DLS: reset '..id,function(c)return apply(c,default)end,ctx)
    else drag={id='slider:'..id,ctx=ctx,apply=apply,label='DLS: '..id,x=x,w=w,lo=lo,hi=hi} end
  end
  if drag and drag.id=='slider:'..id and down then
    local d=drag;change(d,math.floor((d.lo+math.max(0,math.min(1,(gfx.mouse_x-d.x)/d.w))*(d.hi-d.lo))*100+.5)/100)
  end
end
local function tap()
  local now=reaper.time_precise()
  if #taps>0 and now-taps[#taps]>3 then taps={} end
  taps[#taps+1]=now;if #taps>5 then table.remove(taps,1) end
  if #taps>1 then edit('DLS: tap tempo',function(ctx)return M.tempo(ctx,60*(#taps-1)/(taps[#taps]-taps[1]))end) end
end
local function persist()
  reaper.SetExtState(namespace,'expanded',expanded and '1' or '0',true)
  reaper.SetExtState(namespace,'collapsed',collapsed and '1' or '0',true)
end
local function resize_panel(h)
  -- gfx.init alone cannot resize an existing dock; the optional native adapter
  -- requests REAPER's bottom-docker layout or resizes our floating window.
  if DLS_RESIZE_PLAYBACK then DLS_RESIZE_PLAYBACK(h) end
end
local function toggle_panel()
  if (gfx.dock(-1)&1)==1 then
    finish();focus=nil;collapsed=false;persist();hideRequested=true;return
  end
  finish();focus=nil;collapsed=not collapsed;scroll=0;persist()
  resize_panel(collapsed and 58 or (expanded and 300 or 220))
end
local function toggle_pitch()
  finish();expanded=not expanded;scroll=0;persist()
  if expanded then revealPitch=true;resize_panel(350) end
end
local function render()
  palette();tooltip='';local ctx=M.context();local margin=16
  local w=math.max(320,gfx.w-margin*2-12);local wide=w>=720
  local header=48;local footer=26;local view=math.max(1,gfx.h-header-footer)
  local core=wide and 100 or 200
  local required=core+44+(expanded and (wide and 118 or 226) or 0)+8
  local maxScroll=math.max(0,required-view)
  if not collapsed then
    if revealPitch then scroll=math.min(maxScroll,core);revealPitch=false end
    scroll=math.max(0,math.min(scroll,maxScroll))
    if gfx.mouse_wheel~=0 then scroll=math.max(0,math.min(scroll-gfx.mouse_wheel/4,maxScroll));gfx.mouse_wheel=0 end
  else gfx.mouse_wheel=0 end
  clipTop=header;clipBottom=gfx.h-footer
  if not collapsed then
    local y=header+8-scroll;local cw=wide and (w-16)/2 or w
    text(ctx.marker>=0 and 'TEMPO / ACTIVE MARKER' or 'PROJECT TEMPO',margin,y,cw,20,'accent',13)
    number('bpm',ctx.tempo,string.format('%.2f',ctx.tempo),margin,y+26,112,34,ctx,M.tempo,20,400,120,.5)
    text('BPM',margin+120,y+26,45,34,'muted',13)
    button('Tap',margin+170,y+26,54,34,tap,'Tap several beats to set project tempo.')
    slider('bpm',ctx.tempo,20,400,120,margin+8,y+68,cw-16,22,ctx,M.tempo)
    local sx,sy=wide and margin+cw+16 or margin,wide and y or y+100
    text('PLAYBACK SPEED',sx,sy,cw,20,'accent',13)
    local percent=ctx.rate*100
    local percentApply=function(c,v)return M.rate(c,v/100)end
    number('rate',percent,string.format('%.0f%%',percent),sx,sy+26,90,34,ctx,percentApply,25,200,100,.5)
    button('70%',sx+100,sy+26,54,34,function()edit('DLS: practice speed',function(c)return M.rate(c,.7)end)end,'Slow riff practice to 70% of the original speed.')
    button('100%',sx+162,sy+26,62,34,function()edit('DLS: reset speed',function(c)return M.rate(c,1)end)end,'Return to original speed.')
    button('Keep pitch',sx+232,sy+26,math.max(88,math.min(120,cw-232)),34,function()reaper.Main_OnCommand(40671,0)end,'Preserve audio pitch while slowing playback.',reaper.GetToggleCommandStateEx(0,40671)==1)
    slider('rate',percent,25,200,100,sx+8,sy+68,cw-16,22,ctx,percentApply)
    local py=header+core+8-scroll
    button(expanded and 'v  Pitch & practice' or '>  Pitch & practice',margin,py,w,32,toggle_pitch,'Show audio transposition, live guitar pitch and phrase practice tools.',expanded)
    if expanded then
      local ay=py+42;local pcw=wide and cw or w
      text('AUDIO TAKE PITCH',margin,ay,pcw,20,'accent',13)
      text(#ctx.takes==0 and 'Select audio / MIDI stays unchanged' or #ctx.takes..' audio take(s)'..(ctx.mixed and ' / mixed' or ''),margin+145,ay,pcw-145,20,'muted',13)
      number('pitch',ctx.pitch or 0,ctx.pitch and (ctx.mixed and 'Mixed' or string.format('%+.2f st',ctx.pitch)) or '-- st',margin,ay+24,110,34,ctx,M.pitch,-12,12,0,.05,#ctx.takes==0)
      button('-1',margin+118,ay+24,44,34,function()edit('DLS: pitch down',function(c)return M.pitch(c,-1,true)end)end,'Lower each selected audio take by a semitone.',false,#ctx.takes==0)
      button('+1',margin+170,ay+24,44,34,function()edit('DLS: pitch up',function(c)return M.pitch(c,1,true)end)end,'Raise each selected audio take by a semitone.',false,#ctx.takes==0)
      button('Reset',margin+222,ay+24,math.min(96,pcw-222),34,function()edit('DLS: reset pitch',function(c)return M.pitch(c,0)end)end,'Reset selected audio takes to zero semitones.',false,#ctx.takes==0)
      slider('pitch',ctx.pitch,-12,12,0,margin+8,ay+68,pcw-16,22,ctx,M.pitch,#ctx.takes==0)
      local qx,qy=wide and margin+cw+16 or margin,wide and ay or ay+108
      local bw=(pcw-16)/3
      text('RIFF PRACTICE',qx,qy,pcw,20,'accent',13)
      button('Loop phrase',qx,qy+24,bw,34,function()edit('DLS: loop phrase',M.loop_selection)end,'Copy the time selection to loop points and enable repeat.')
      button('Click',qx+bw+8,qy+24,bw,34,function()reaper.Main_OnCommand(40364,0)end,'Toggle the metronome.',reaper.GetToggleCommandStateEx(0,40364)==1)
      button('Count-in',qx+2*(bw+8),qy+24,bw,34,function()reaper.Main_OnCommand(40363,0)end,'Open native count-in, pre-roll and click sound settings.')
      button('Live guitar pitch / ReaPitch',qx,qy+68,pcw,32,function()
        if reaper.CountSelectedTracks(ctx.project)~=1 then notice='Select one guitar track to open live pitch.';return end
        edit('DLS: live guitar pitch',M.live_pitch)
      end,'Open ReaPitch before the amp on one selected track. Nothing is added until clicked.')
    end
    if maxScroll>0 then
      local sh=math.max(24,view*view/required);local sy=header+scroll/maxScroll*(view-sh)
      rect(gfx.w-10,header,4,view,'line');rect(gfx.w-12,sy,8,sh,'accent')
      if inside(gfx.w-18,header,18,view) and down then scroll=math.max(0,math.min(maxScroll,(gfx.mouse_y-header-sh/2)/(view-sh)*maxScroll)) end
    end
  end
  clipTop=0;clipBottom=gfx.h
  rect(0,0,gfx.w,header,'bg');rect(0,header-1,gfx.w,1,'line')
  button(collapsed and '>  PLAYBACK' or 'v  PLAYBACK',margin,8,148,32,toggle_panel,(gfx.dock(-1)&1)==1 and 'Collapse Playback into its toolbar button; click that button to reopen.' or 'Collapse or expand all Playback controls.',not collapsed)
  text(string.format('%.2f BPM   /   %.0f%%',ctx.tempo,ctx.rate*100),margin+164,8,math.max(0,w-350),32,'muted',14)
  button((gfx.dock(-1)&1)==1 and 'Float' or 'Bottom dock',gfx.w-126,8,110,32,function()
    finish();gfx.dock((gfx.dock(-1)&1)==1 and 0 or bottom_dock())
  end,'Dock below the arrangement, or float this panel.')
  if not collapsed then
    rect(0,gfx.h-footer,gfx.w,footer,'bg')
    text(notice~='' and notice or tooltip~='' and tooltip or 'Drag numbers / Shift: fine / Double-click: reset / Space: play-stop',margin,gfx.h-footer,w,footer,'muted',13)
  end
end
-- Optional adapter captures precise mouse-down coordinates and native tempo
-- gestures. The installed transport service stays active when the dock hides.
local adapter=script:match('^(.*[/\\])')
if adapter and reaper.file_exists and reaper.file_exists(adapter..'DLS_Native_Controls.lua') then
  local ok,factory=pcall(dofile,adapter..'DLS_Native_Controls.lua')
  if ok and type(factory)=='function' then
    local mode
    local service=reaper.GetExtState(namespace,'NativeAction')
    if service~='' and reaper.NamedCommandLookup then
      local action=reaper.NamedCommandLookup(service)
      if action>0 then
        local heartbeat=tonumber(reaper.GetExtState(namespace,'NativeHeartbeat'))
        if not heartbeat or reaper.time_precise()-heartbeat>1 then reaper.Main_OnCommand(action,0) end
        mode='panel'
      end
    end
    native=factory(reaper,M,mode)
    DLS_RESIZE_PLAYBACK=native.resize
    DLS_NATIVE_FRAME=native.frame
    DLS_NATIVE_EXIT=native.close
    DLS_INITIAL_RESIZE=collapsed and 58 or (expanded and 350 or 230)
  end
end
reaper.atexit(function()
  finish();persist()
  if DLS_NATIVE_EXIT then DLS_NATIVE_EXIT() end
  local state,_,_,ww,hh=gfx.dock(-1,0,0,0,0)
  reaper.SetExtState(namespace,'dock',tostring(state),true)
  reaper.SetExtState(namespace,'width',tostring(ww),true)
  if not collapsed then reaper.SetExtState(namespace,'height',tostring(hh),true) end
  DLS_RESIZE_PLAYBACK=nil;DLS_NATIVE_FRAME=nil;DLS_NATIVE_EXIT=nil;DLS_INITIAL_RESIZE=nil
  if command and command>0 then reaper.SetToggleCommandState(section,command,0);reaper.RefreshToolbar2(section,command) end
  gfx.quit()
end)
local function frame()
  local key=gfx.getchar();if key<0 then return end
  down=(gfx.mouse_cap&1)==1;pressed=down and not lastDown;released=not down and lastDown
  if key==9 then
    local id=not focus and 'bpm' or focus.id=='bpm' and 'rate' or focus.id=='rate' and 'pitch' or 'bpm'
    collapsed=false;if id=='pitch' then expanded=true end;persist()
    focus={id=id,value='',apply=function(v)edit('DLS: enter '..id,function(c)
      if id=='bpm' then return M.tempo(c,v) elseif id=='rate' then return M.rate(c,tonumber(v) and tonumber(v)/100) else return M.pitch(c,v) end
    end)end}
  elseif focus then
    if key==13 then local f=focus;focus=nil;f.apply(f.value)
    elseif key==27 then focus=nil
    elseif key==8 then focus.value=focus.value:sub(1,-2)
    elseif key>=32 and key<=126 and string.char(key):match('[%d%.%-%+]') then focus.value=focus.value..string.char(key) end
  elseif key==32 then reaper.Main_OnCommand(40044,0)
  elseif key==27 then return end
  local ok,err=pcall(function()
    if DLS_NATIVE_FRAME then DLS_NATIVE_FRAME() end
    if DLS_INITIAL_RESIZE then resize_panel(DLS_INITIAL_RESIZE);DLS_INITIAL_RESIZE=nil end
    render()
    if released then finish() end
    if pending then local action=pending;pending=nil;action() end
  end)
  if not ok then reaper.MB('Playback panel error: '..tostring(err),'DLS',0);return end
  if hideRequested then return end
  lastDown=down;gfx.update();reaper.defer(frame)
end
frame()
