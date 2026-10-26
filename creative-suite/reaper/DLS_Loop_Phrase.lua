-- DLS phrase loop / MIT. Empty selection never erases existing loop points.
local project=reaper.EnumProjects(-1,'')
local a,b=reaper.GetSet_LoopTimeRange2(project,false,false,0,0,false)
if b<=a then reaper.MB('Select a phrase in the timeline first.','DLS / Loop phrase',0);return end
reaper.Undo_BeginBlock2(project)
reaper.GetSet_LoopTimeRange2(project,true,true,a,b,false)
reaper.GetSetRepeatEx(project,1)
reaper.Undo_EndBlock2(project,'DLS: loop phrase',-1)
