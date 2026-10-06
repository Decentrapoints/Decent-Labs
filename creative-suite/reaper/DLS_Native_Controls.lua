-- Optional Windows adapter / MIT. js_ReaScriptAPI 1.310+.
-- Adds a drag gesture to the DLS transport tempo display. No audio processing.
-- Each instance releases only its own hooks; other scripts' hooks are preserved.
return function(api,M,mode)
  local N={frame=function()end,resize=function()end,close=function()end,status='Native extension unavailable'}
  if not api.JS_Window_Find or not (api.GetOS() or ''):find('Win',1,true) then return N end
  local transport,owned,lastStamp,gesture=nil,{},0,nil
  local panel,panelOwned=nil,false
  local function finish()
    if gesture and gesture.undo and M.valid(gesture.ctx) then api.Undo_EndBlock2(gesture.ctx.project,'DLS: native tempo drag',-1) end
    gesture=nil
  end
  local function release()
    finish()
    if transport and api.JS_Window_IsWindow(transport) then
      for _,message in ipairs(owned) do api.JS_WindowMessage_Release(transport,message) end
    end
    transport=nil;owned={};lastStamp=0
  end
  local function attach()
    local name=(api.GetLastColorThemeFile() or '')
    if not name:find('DLS Satsu',1,true) then release();return end
    if transport and api.JS_Window_IsWindow(transport) then return end
    release()
    transport=api.JS_Window_FindChildByID(api.GetMainHwnd(),0)
      or api.JS_Window_Find(api.JS_Localize('Transport','DLG_188'),true)
    N.status=transport and 'Transport connected' or 'Transport not found'
    if not transport then return end
    -- Observe passthrough events, never block transport buttons or text entry.
    for _,message in ipairs({'WM_LBUTTONDOWN','WM_LBUTTONUP'}) do
      if api.JS_WindowMessage_Intercept(transport,message,true)==1 then owned[#owned+1]=message
      else release();return end
    end
  end
  local function scale()
    local ok,_,h=api.JS_Window_GetClientSize(transport)
    if not ok then return nil end
    -- DLS transport's three original layouts have baseline heights 64/96/128.
    return h>=116 and 2 or h>=84 and 1.5 or 1
  end
  function N.frame()
    if mode~='transport' and (not panel or not api.JS_Window_IsWindow(panel)) then
      panel=api.JS_Window_Find('DLS / Playback',true)
      panelOwned=panel and api.JS_WindowMessage_Intercept(panel,'WM_LBUTTONDOWN',true)==1
    end
    if mode=='panel' then return end
    attach();if not transport then return end
    local ok,_,stamp,_,_,x,y=api.JS_WindowMessage_Peek(transport,'WM_LBUTTONDOWN')
    if ok and stamp>lastStamp then
      finish()
      lastStamp=stamp
      local s=scale()
      if s and x>=568*s and x<634*s and y>=16*s and y<48*s then
        local valid,left,top=api.JS_Window_GetClientRect(transport)
        if valid then
          local ctx=M.context()
          gesture={ctx=ctx,x=left+x,y=top+y,origin=ctx.tempo}
        end
      else gesture=nil end
    end
    if not gesture then return end
    local g=gesture;local cap=api.JS_Mouse_GetState(9)
    if (cap&1)==1 then g.fine=(cap&8)==8 end
    if not M.valid(g.ctx) or api.EnumProjects(-1,'')~=g.ctx.project then
      if g.undo and M.valid(g.ctx) then api.Undo_EndBlock2(g.ctx.project,'DLS: native tempo drag',-1) end
      gesture=nil;return
    end
    local mx,my=api.GetMousePosition();local dx,dy=mx-g.x,g.y-my
    if math.max(math.abs(dx),math.abs(dy))<3 and not g.undo then
      if (cap&1)==0 then gesture=nil end
      return
    end
    local delta=math.abs(dx)>=math.abs(dy) and dx or dy
    local value=math.floor(math.max(20,math.min(400,g.origin+delta*.5*(g.fine and .1 or 1)))*100+.5)/100
    if value~=g.value then
      -- Defocus the native edit only after the drag threshold. Plain clicks
      -- continue to use REAPER's normal text entry and mousewheel behavior.
      if not g.editDismissed and api.JS_Window_GetFocus then
        local focus=api.JS_Window_GetFocus()
        local valid,left,top,right,bottom=api.JS_Window_GetRect(focus)
        local client,tx,ty=api.JS_Window_GetClientRect(transport)
        local s=scale()
        if focus and valid and client and s and api.JS_Window_GetClassName(focus)=='Edit'
          and left>=tx+560*s and right<=tx+650*s and top>=ty+8*s and bottom<=ty+56*s then
          -- Post through REAPER's dialog message loop. Sending directly to
          -- the Edit procedure bypasses Escape handling and leaves stale text.
          if api.JS_WindowMessage_Post then
            api.JS_WindowMessage_Post(focus,'WM_KEYDOWN',27,0,1,0)
            api.JS_WindowMessage_Post(focus,'WM_KEYUP',27,0,1,49152)
            g.editDismissed=true;return
          end
          api.JS_Window_SetFocus(api.GetMainHwnd())
        end
        g.editDismissed=true
      end
      if not g.undo then api.Undo_BeginBlock2(g.ctx.project);g.undo=true end
      g.value=value
      if not M.tempo(g.ctx,value) then
        api.Undo_EndBlock2(g.ctx.project,'DLS: native tempo drag',-1);gesture=nil
      end
    end
    if (cap&1)==0 then
      if g.undo then api.Undo_EndBlock2(g.ctx.project,'DLS: native tempo drag',-1) end
      gesture=nil
    end
  end
  function N.mouse_down()
    if not panelOwned then return nil end
    local ok,_,_,_,_,x,y=api.JS_WindowMessage_Peek(panel,'WM_LBUTTONDOWN')
    if ok then return x,y end
  end
  function N.resize(height)
    local window=api.JS_Window_Find('DLS / Playback',true)
    if not window then N.status='Playback window not found';return end
    local ok,left,top,right,bottom=api.JS_Window_GetRect(window)
    if ok and (gfx.dock(-1)&1)==0 then
      api.JS_Window_Resize(window,right-left,height+(bottom-top-gfx.h));return
    end
    -- Dock height belongs to REAPER. Docked collapse hides our panel entirely;
    -- the workspace installer establishes a compact initial bottom-dock size.
  end
  function N.close()
    release()
    if panelOwned and api.JS_Window_IsWindow(panel) then api.JS_WindowMessage_Release(panel,'WM_LBUTTONDOWN') end
    panel=nil;panelOwned=false
  end
  return N
end
