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
const uiFixture =
  fixture +
  `
DLS_PLAYBACK_TEST=false;reaper=api
local nextFrame,onExit,key,labels,ext,theme,undoBegin,undoEnd,clock=nil,nil,0,{}, {},'DLS Satsu.ReaperThemeZip',0,0,1
local dockState=1
api.time_precise=function()return clock end
api.DockGetPosition=function(i)return i==3 and 0 or 2 end
api.get_action_context=function()return false,'/scripts/DLS_Playback.lua',0,100 end
api.GetExtState=function(_,k)return ext[k] or '' end;api.SetExtState=function(_,k,v)ext[k]=v end
api.GetLastColorThemeFile=function()return theme end
api.SetToggleCommandState=function()end;api.RefreshToolbar2=function()end
api.Undo_BeginBlock2=function()undoBegin=undoBegin+1 end;api.Undo_EndBlock2=function()undoEnd=undoEnd+1 end
api.GetToggleCommandStateEx=function()return 1 end;api.Main_OnCommand=function()end
api.atexit=function(fn)onExit=fn end;api.defer=function(fn)nextFrame=fn end
api.MB=function(message)error(message)end
gfx={w=940,h=260,mouse_x=-1,mouse_y=-1,mouse_cap=0,mouse_wheel=0,
init=function(_,_,_,d)dockState=d end,set=function()end,rect=function()end,circle=function()end,setfont=function()end,
drawstr=function(label,flags,right,bottom)labels[#labels+1]={label=label,y=gfx.y,bottom=bottom};assert(gfx.y>=0 and bottom<=gfx.h,'text outside viewport: '..label) end,
dock=function(v)if v>=0 then dockState=v end;return dockState,0,0,gfx.w,gfx.h end,update=function()end,quit=function()end,
getchar=function()local v=key;key=0;return v end}
assert(load(${JSON.stringify(source)}))()
local function frame(k,x,y,cap,dt)
clock=clock+(dt or .5);key=k or 0;gfx.mouse_x=x or -1;gfx.mouse_y=y or -1;gfx.mouse_cap=cap or 0;labels={};local fn=nextFrame;nextFrame=nil;assert(fn,'panel stopped');fn()
end
local function visible(needle)for _,v in ipairs(labels)do if v.label:find(needle,1,true)then return v end end end
`;
test("BPM numbers drag horizontally or vertically, click to type, and form one undo step per gesture", () =>
  run(
    uiFixture +
      `
assert(dockState==769 and ext.layoutVersion=='2')
frame(0,55,96,1);frame(0,95,96,1);frame();assert(tempo==140 and rate==1 and undoBegin==1 and undoEnd==1)
frame(0,55,96,1);frame(0,55,56,1);frame();assert(tempo==160 and undoBegin==2 and undoEnd==2)
frame(0,55,96,1);frame(0,95,96,9);frame();assert(tempo==162)
frame(0,55,96,1);frame(0,55,96,0);frame(49);frame(52);frame(48);frame(13);assert(tempo==140)
frame(9);frame(55);frame(48);frame(13);assert(tempo==70)
onExit();assert(undoBegin==undoEnd)
`,
  ));
test("Double-clicking slider handle restores 120 BPM, 100% speed, and zero take pitch", () =>
  run(
    uiFixture +
      `
local function doubleClick(x,y)frame(0,x,y,1);frame(0,x,y,0,.03);frame(0,x,y,1,.05);frame(0,x,y,0,.03)end
tempo=180;doubleClick(24+(180-20)/380*424,135);assert(tempo==120)
rate=.7;doubleClick(480+(.7*100-25)/175*424,135);assert(rate==1)
frame(0,40,166,1);frame();frame();assert(ext.expanded=='1')
gfx.h=360;frame();a.pitch=4;b.pitch=4
doubleClick(24+(4+12)/24*424,277);assert(a.pitch==0 and b.pitch==0)
onExit();assert(undoBegin==undoEnd)
`,
  ));
test("Pitch expansion reveals actual controls in a 260px dock; whole Playback collapse hides all child controls", () =>
  run(
    uiFixture +
      `
assert(visible('PROJECT TEMPO') and not visible('AUDIO TAKE PITCH'))
frame(0,40,166,1);frame();frame();assert(ext.expanded=='1')
assert(visible('AUDIO TAKE PITCH') and visible('Live guitar pitch / ReaPitch'))
for _,v in ipairs(labels)do if v.label:find('Pitch',1,true)or v.label:find('Count-in',1,true)then assert(v.y>=48 and v.bottom<=gfx.h-26)end end
-- Floating panels fold into their header; docked panels close into the toolbar.
dockState=0;frame(0,50,24,1);frame();assert(ext.collapsed=='1')
assert(not visible('PROJECT TEMPO') and not visible('AUDIO TAKE PITCH') and visible('>  PLAYBACK'))
frame(0,50,24,1);frame();assert(ext.collapsed=='0' and visible('PROJECT TEMPO'))
dockState=769
gfx.w=380;gfx.h=240;gfx.mouse_wheel=-2400;frame();assert(visible('Live guitar pitch / ReaPitch'))
theme='DLS Satsu Light.ReaperThemeZip';frame();assert(gfx.clear==210+212*256+219*65536)
frame(0,50,24,1);assert(nextFrame==nil and ext.collapsed=='0')
onExit();assert(ext.dock=='769' and undoBegin==undoEnd)
`,
  ));
