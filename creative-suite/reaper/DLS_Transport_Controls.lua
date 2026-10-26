-- DLS native transport gestures / MIT. Runs independently of the Playback dock.
-- Registered by the workspace installer. Stop through the Actions list.
local _,script=reaper.get_action_context()
local directory=script:match('^(.*[/\\])')
if not directory or not reaper.JS_Window_Find then return end
if reaper.set_action_options then reaper.set_action_options(1) end
local prior=DLS_PLAYBACK_TEST
DLS_PLAYBACK_TEST=true
local ok,model=pcall(dofile,directory..'DLS_Playback.lua')
DLS_PLAYBACK_TEST=prior
if not ok then return end
local loaded,factory=pcall(dofile,directory..'DLS_Native_Controls.lua')
if not loaded then return end
local native=factory(reaper,model(reaper),'transport')
reaper.atexit(function()
  native.close()
  reaper.DeleteExtState('DLSPlayback','NativeHeartbeat',false)
end)
local function frame()
  reaper.SetExtState('DLSPlayback','NativeHeartbeat',tostring(reaper.time_precise()),false)
  local success=pcall(native.frame)
  if not success then return end
  reaper.defer(frame)
end
frame()
