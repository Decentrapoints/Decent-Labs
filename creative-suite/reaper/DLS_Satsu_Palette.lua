-- Apply/restore DLS colors to the current REAPER theme. Layout stays native.
local _,script=reaper.get_action_context()
local json=dofile(script:match('^(.*)[/\\]')..'/json.lua')
local colors={col_main_bg={17,18,22},col_main_text={238,237,243},col_main_text2={171,166,185},col_main_textshadow={17,18,22},col_seltrack={48,40,63},col_tcp_text={238,237,243},col_tcp_textsel={186,167,237},col_mixerbg={25,26,32},col_arrangebg={17,18,22},col_arrangebg2={25,26,32},col_tr1_bg={25,26,32},col_tr2_bg={34,35,43},col_tr1_divline={48,48,58},col_tr2_divline={48,48,58},col_gridlines={48,48,58},col_gridlines2={48,48,58},col_gridlines3={62,59,72},col_cursor={186,167,237}}
local previous=reaper.GetExtState('DLS','PaletteBackup')
if previous~='' then
  local ok,backup=pcall(json.decode,previous)
  if not ok then reaper.MB('Saved palette could not be read.','DLS palette',0);return end
  for key,value in pairs(backup) do reaper.SetThemeColor(key,value,0) end
  reaper.DeleteExtState('DLS','PaletteBackup',true)
else
  local backup={}
  for key,rgb in pairs(colors) do
    local value=reaper.GetThemeColor(key,0)
    if value~=-1 then backup[key]=value;reaper.SetThemeColor(key,reaper.ColorToNative(rgb[1],rgb[2],rgb[3]),0) end
  end
  reaper.SetExtState('DLS','PaletteBackup',json.encode(backup),true)
end
reaper.UpdateArrange();reaper.TrackList_AdjustWindows(false)
