import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const source = readFileSync(
  new URL("../reaper/DLS_Playback.lua", import.meta.url),
  "utf8",
);
function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    const result = lauxlib.luaL_dostring(L, to_luastring(code));
    if (result !== lua.LUA_OK)
      assert.fail(to_jsstring(lua.lua_tostring(L, -1)));
  } finally {
    lua.lua_close(L);
  }
}
const fixture = `
local active, valid, marker, tempo, rate, repeatState, writes, updates = 'project',true,-1,120,1,0,{},0
local a,b,midi={pitch=2},{pitch=-3},{pitch=0,midi=true}
local selected={a,b,midi}
local stamp,markerBpm=10,92
local api={
EnumProjects=function()return active end,GetCursorPositionEx=function()return 12 end,
FindTempoTimeSigMarker=function()return marker end,Master_GetTempo=function()return tempo end,Master_GetPlayRate=function()return rate end,
GetTempoTimeSigMarker=function(_,index)return index==marker,stamp,4,0,markerBpm,7,8,true end,
SetTempoTimeSigMarker=function(p,index,pos,measure,beat,bpm,num,den,ramp)
assert(p=='project' and index==marker and pos==10 and measure==-1 and beat==-1 and num==7 and den==8 and ramp)
markerBpm=bpm;writes[#writes+1]='marker';return true end,
SetCurrentBPM=function(p,value,undo)assert(p=='project' and not undo);tempo=value;writes[#writes+1]='tempo' end,
CSurf_OnPlayRateChange=function(value)rate=value;writes[#writes+1]='rate' end,
CountSelectedMediaItems=function()return #selected end,GetSelectedMediaItem=function(_,i)return selected[i+1]end,
GetActiveTake=function(item)return item end,TakeIsMIDI=function(t)return t.midi end,
ValidatePtr=function(p)return valid and p=='project' end,ValidatePtr2=function(_,t)return t~=b or not b.removed end,
GetMediaItemTakeInfo_Value=function(t)return t.pitch end,SetMediaItemTakeInfo_Value=function(t,key,value)assert(key=='D_PITCH');t.pitch=value end,
GetMediaItemTake_Item=function(t)return t end,UpdateItemInProject=function()updates=updates+1 end,UpdateArrange=function()end,
GetSet_LoopTimeRange2=function(_,set,loop,start,ending,seek)if set then assert(loop and start==3 and ending==7 and not seek);return start,ending end;return 3,7 end,
GetSetRepeatEx=function(_,value)if value>=0 then repeatState=value end;return repeatState end
}
DLS_PLAYBACK_TEST=true
local M=assert(load(${JSON.stringify(source)}))()(api)
`;
test("Playback tempo slider changes real BPM and preserves tempo-marker timing, signature and ramps", () =>
  run(
    fixture +
      `
local ctx=M.context();assert(ctx.tempo==120 and ctx.marker==-1)
assert(M.tempo(ctx,156));assert(tempo==156 and rate==1)
assert(M.tempo(ctx,999));assert(tempo==400)
assert(not M.tempo(ctx,'garbage') and not M.tempo(ctx,0/0))
marker=2;ctx=M.context();assert(ctx.tempo==92);assert(M.tempo(ctx,80));assert(markerBpm==80 and tempo==400)
stamp=11;assert(not M.tempo(ctx,70));assert(markerBpm==80)
active='other';marker=-1;assert(not M.tempo(M.context(),100));assert(not M.rate(ctx,.5))
valid=false;assert(not M.tempo(ctx,88))
`,
  ));
test("Playback pitch captures audio takes, keeps relative intervals, skips MIDI/deleted takes and clamps range", () =>
  run(
    fixture +
      `
local ctx=M.context();assert(#ctx.takes==2 and ctx.mixed)
assert(M.pitch(ctx,1,true));assert(a.pitch==3 and b.pitch==-2 and midi.pitch==0)
selected={midi};assert(M.pitch(ctx,-2.25));assert(a.pitch==-2.25 and b.pitch==-2.25)
b.removed=true;assert(M.pitch(ctx,20));assert(a.pitch==12 and b.pitch==-2.25 and updates==5)
assert(not M.pitch(M.context(),2));valid=false;assert(not M.pitch(ctx,0))
assert(M.clamp('-3.2',-12,12)==-3.2 and M.clamp(math.huge,-12,12)==nil)
`,
  ));
test("Playback speed and phrase looping use their own native controls", () =>
  run(
    fixture +
      `
local ctx=M.context();assert(M.rate(ctx,.7));assert(rate==.7 and tempo==120)
assert(M.rate(ctx,10));assert(rate==2);assert(M.rate(ctx,.1));assert(rate==.25)
assert(M.loop_selection(ctx));assert(repeatState==1)
api.GetSet_LoopTimeRange2=function()return 4,4 end;assert(not M.loop_selection(ctx))
`,
  ));
test("Live pitch reuses ReaPitch or adds it before the amp only on one explicitly selected track", () =>
  run(
    fixture +
      `
local count,fx,created,moved,shown=1,-1,0,0,nil
api.CountSelectedTracks=function()return count end;api.GetSelectedTrack=function()return 'guitar' end
api.TrackFX_AddByName=function(track,name,input,mode)
assert(track=='guitar' and name=='ReaPitch (Cockos)' and not input)
if mode==-1 then created=created+1;fx=2 end;return fx end
api.TrackFX_CopyToTrack=function(a,index,b,destination,move)assert(a==b and index==2 and destination==0 and move);moved=moved+1;fx=0 end
api.TrackFX_Show=function(track,index,mode)assert(track=='guitar' and mode==3);shown=index end
local ctx=M.context();assert(M.live_pitch(ctx));assert(created==1 and moved==1 and shown==0)
assert(M.live_pitch(ctx));assert(created==1 and moved==1)
count=2;assert(not M.live_pitch(ctx));assert(created==1)
count=0;assert(not M.live_pitch(ctx))
`,
  ));
test("Playback panel renders both palettes, supports BPM drag, keyboard entry, collapse and narrow scrolling", () =>
  run(
    fixture +
      `
DLS_PLAYBACK_TEST=false;reaper=api
local nextFrame,onExit,key,labels,ext,theme,undoBegin,undoEnd=nil,nil,0,{}, {},'DLS Satsu.ReaperThemeZip',0,0
api.get_action_context=function()return false,'/scripts/DLS_Playback.lua',0,100 end
api.GetExtState=function(_,k)return ext[k] or '' end;api.SetExtState=function(_,k,v)ext[k]=v end
api.GetLastColorThemeFile=function()return theme end
api.SetToggleCommandState=function()end;api.RefreshToolbar2=function()end
api.Undo_BeginBlock2=function()undoBegin=undoBegin+1 end;api.Undo_EndBlock2=function()undoEnd=undoEnd+1 end
api.GetToggleCommandStateEx=function()return 1 end;api.Main_OnCommand=function()end
api.atexit=function(fn)onExit=fn end;api.defer=function(fn)nextFrame=fn end
api.MB=function(message)error(message)end
gfx={w=740,h=580,mouse_x=-1,mouse_y=-1,mouse_cap=0,mouse_wheel=0,init=function()end,
set=function()end,rect=function()end,circle=function()end,setfont=function()end,
drawstr=function(label)labels[#labels+1]=label end,
dock=function()return 1,0,0,740,580 end,update=function()end,quit=function()end,
getchar=function()local v=key;key=0;return v end}
assert(load(${JSON.stringify(source)}))()
assert(table.concat(labels,'|'):find('Tempo & speed',1,true));assert(not table.concat(labels,'|'):find('AUDIO TAKE PITCH',1,true))
local function frame(k,x,y,cap)key=k or 0;gfx.mouse_x=x or -1;gfx.mouse_y=y or -1;gfx.mouse_cap=cap or 0;labels={};nextFrame()end
frame(0,130,172,1);frame(0,200,172,1);frame();assert(tempo~=120 and rate==1 and undoBegin==undoEnd)
frame(9);frame(49);frame(52);frame(48);frame(13);assert(tempo==140)
frame(0,35,216,1);frame();assert(ext.expanded=='1');assert(table.concat(labels,'|'):find('AUDIO TAKE PITCH',1,true))
theme='DLS Satsu Light.ReaperThemeZip';gfx.w=380;gfx.h=360;gfx.mouse_wheel=-1200;frame();assert(gfx.clear==210+212*256+219*65536)
assert(table.concat(labels,'|'):find('Metronome settings',1,true));onExit();assert(undoBegin==undoEnd)
`,
  ));
