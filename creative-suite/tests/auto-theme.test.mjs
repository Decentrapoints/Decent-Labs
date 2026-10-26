import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const worker = readFileSync(
  new URL("../reaper/DLS_Auto_Theme.lua", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("../reaper/DLS_Theme_Settings.lua", import.meta.url),
  "utf8",
);
function run(code) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  try {
    if (lauxlib.luaL_dostring(L, to_luastring(code)) !== lua.LUA_OK)
      assert.fail(to_jsstring(lua.lua_tostring(L, -1)));
  } finally {
    lua.lua_close(L);
  }
}
const fixture = String.raw`
local ext,current,applied,clock,play,hour,minute,nextFrame,onExit={},'/themes/Previous.ReaperThemeZip',0,100,0,6,59,nil,nil
local files={['/resource/ColorThemes/DLS Satsu.ReaperThemeZip']='dark',['/resource/ColorThemes/DLS Satsu Light.ReaperThemeZip']='light'}
local api={GetResourcePath=function()return '/resource'end,GetLastColorThemeFile=function()return current end,
file_exists=function(path)return files[path]~=nil end,GetExtState=function(ns,key)return ext[ns..'/'..key]or ''end,
SetExtState=function(ns,key,v)ext[ns..'/'..key]=v end,DeleteExtState=function(ns,key)ext[ns..'/'..key]=nil end,
OpenColorThemeFile=function(path)current=path;applied=applied+1;return true end,
UpdateArrange=function()end,TrackList_AdjustWindows=function()end,
time_precise=function()return clock end,GetPlayState=function()return play end,
atexit=function(fn)onExit=fn end,defer=function(fn)nextFrame=fn end,ShowConsoleMsg=function(message)error(message)end}
DLS_APPEARANCE_TEST=true
local factory=assert(load(${JSON.stringify(worker)}))();local M=factory(api)
`;
test("Local-time appearance handles exact boundaries, overnight schedules, fixed modes and invalid times", () =>
  run(
    fixture +
      String.raw`
assert(M.minute('07:00')==420 and M.minute('23:59')==1439)
for _,v in ipairs({'24:00','12:60','7:00','07:000','bad'})do assert(M.minute(v)==nil)end
for _,v in ipairs({{419,'dark'},{420,'light'},{1139,'light'},{1140,'dark'},{0,'dark'}})do assert(M.target('auto',420,1140,v[1])==v[2])end
assert(M.target('auto',1140,420,0)=='light' and M.target('auto',1140,420,800)=='dark')
assert(M.target('light',420,1140,0)=='light' and M.target('dark',420,1140,800)=='dark')
assert(M.target('off',420,1140,800)==nil and M.target('auto',420,420,800)==nil)
`,
  ));
test("Day/night worker defers reloads during playback, follows clock changes and respects manual choices until the next period", () =>
  run(
    fixture +
      String.raw`
reaper=api;DLS_APPEARANCE_TEST=false;os.date=function()return {hour=hour,min=minute}end
assert(load(${JSON.stringify(worker)}))();assert(applied==1 and current:find('DLS Satsu.ReaperThemeZip',1,true))
local function step()clock=clock+31;local fn=nextFrame;nextFrame=nil;assert(fn);fn()end
hour=7;minute=0;play=1;step();assert(applied==1)
play=4;step();assert(applied==1)
play=0;step();assert(applied==2 and current:find(' Light',1,true))
current='/themes/Manual.ReaperThemeZip';step();assert(applied==2)
hour=19;step();assert(applied==3 and not current:find(' Light',1,true))
hour=8;step();assert(applied==4) -- Local clock/DST corrections are re-evaluated.
ext['DLSAppearance/Mode']='off';ext['DLSAppearance/Revision']='changed';step();assert(nextFrame==nil)
onExit();assert(ext['DLSAppearance/Heartbeat']==nil)
`,
  ));
test("Appearance checks missing themes and virtual archive names without redundant reloads", () =>
  run(
    fixture +
      String.raw`
current='/resource/ColorThemes/DLS Satsu.ReaperTheme';assert(M.apply('dark'));assert(applied==0)
files['/resource/ColorThemes/DLS Satsu Light.ReaperThemeZip']=nil
local ok,message=M.apply('light');assert(not ok and message:find('Missing theme',1,true) and applied==0)
`,
  ));
const installer =
  fixture +
  String.raw`
reaper=api;local input='auto,07:00,19:00,yes';local writes,messages,commands=0,{},0
files['/repo/DLS_Auto_Theme.lua']=${JSON.stringify(worker)}
files['/repo/DLS_Theme_Settings.lua']=${JSON.stringify(settings)}
files['/resource/Scripts/__startup.lua']='-- User startup\nreturn\n'
api.get_action_context=function()return false,'/repo/DLS_Theme_Settings.lua'end
api.GetUserInputs=function()return true,input end
api.RecursiveCreateDirectory=function()end
api.AddRemoveReaScript=function(_,_,path)assert(path=='/resource/Scripts/DLS_Auto_Theme.lua');return 42 end
api.Main_OnCommand=function(id)assert(id==42);commands=commands+1 end
api.MB=function(message)messages[#messages+1]=message end
os.time=function()return 1000 end
dofile=function()assert(DLS_APPEARANCE_TEST);return factory end
io.open=function(path,mode)
 if mode=='rb' then if files[path]==nil then return nil end;return{read=function()return files[path]end,close=function()end}end
 return{write=function(_,value)files[path]=value;writes=writes+1;return true end,close=function()end}
end
local configure=assert(load(${JSON.stringify(settings)}))
`;
test("Portable appearance setup preserves startup Lua, backs it up, is idempotent and removes only its own block", () =>
  run(
    installer +
      String.raw`
configure();assert(#messages==0 and commands==1 and ext['DLSAppearance/Mode']=='auto')
local first=files['/resource/Scripts/__startup.lua'];assert(first:find('-- User startup\nreturn\n',1,true))
assert(files['/resource/Scripts/__startup.lua.dls-backup-1000']=='-- User startup\nreturn\n')
local count=writes;configure();assert(writes==count and files['/resource/Scripts/__startup.lua']==first)
input='off,07:00,19:00,no';configure();assert(#messages==0 and files['/resource/Scripts/__startup.lua']=='-- User startup\nreturn\n')
input='auto,25:00,19:00,yes';count=writes;configure();assert(#messages==1 and writes==count)
`,
  ));
test("Portable setup retains BOM/shebang and rejects malformed existing startup Lua", () =>
  run(
    installer +
      String.raw`
files['/resource/Scripts/__startup.lua']='\239\187\191#!/usr/bin/env lua\n-- User startup\n'
configure();assert(#messages==0)
local prefix='\239\187\191#!/usr/bin/env lua\n';assert(files['/resource/Scripts/__startup.lua']:sub(1,#prefix)==prefix)
local count=writes;configure();assert(#messages==0 and writes==count)
local userComment='-- Example: -- DLS_AUTO_THEME_BEGIN and -- DLS_AUTO_THEME_END\n'
files['/resource/Scripts/__startup.lua']=userComment;configure();assert(#messages==0 and files['/resource/Scripts/__startup.lua']:find(userComment,1,true))
local broken='local = invalid';files['/resource/Scripts/__startup.lua']=broken
configure();assert(#messages==1 and files['/resource/Scripts/__startup.lua']==broken)
`,
  ));
