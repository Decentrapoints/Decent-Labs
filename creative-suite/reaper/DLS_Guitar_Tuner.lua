-- DLS guitar tuner / MIT. Reuses ReaTune on one selected track.
local project=reaper.EnumProjects(-1,'')
if reaper.CountSelectedTracks(project)~=1 then reaper.MB('Select one guitar track first.','DLS / Tuner',0);return end
local track=reaper.GetSelectedTrack(project,0)
local fx=reaper.TrackFX_AddByName(track,'ReaTune (Cockos)',false,0)
if fx<0 then
  reaper.Undo_BeginBlock2(project)
  fx=reaper.TrackFX_AddByName(track,'ReaTune (Cockos)',false,-1)
  if fx>0 then reaper.TrackFX_CopyToTrack(track,fx,track,0,true);fx=0 end
  reaper.Undo_EndBlock2(project,'DLS: add guitar tuner before amp',-1)
end
if fx>=0 then reaper.TrackFX_Show(track,fx,3) end
