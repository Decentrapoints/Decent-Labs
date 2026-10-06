-- DLS live guitar transposition / MIT. The shared model preserves selection rules.
local _,path=reaper.get_action_context()
local folder=path:match('^(.*[/\\])')
local before=DLS_PLAYBACK_TEST;DLS_PLAYBACK_TEST=true
local ok,factory=pcall(dofile,folder..'DLS_Playback.lua');DLS_PLAYBACK_TEST=before
if not ok then reaper.MB('Install DLS_Playback.lua beside this action.','DLS / Pitch',0);return end
local M=factory(reaper);local ctx=M.context()
if reaper.CountSelectedTracks(ctx.project)~=1 then reaper.MB('Select one guitar track first.','DLS / Pitch',0);return end
reaper.Undo_BeginBlock2(ctx.project)
M.live_pitch(ctx)
reaper.Undo_EndBlock2(ctx.project,'DLS: open live guitar pitch',-1)
