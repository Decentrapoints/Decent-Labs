import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
function run(source) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) {
    const error = to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_close(L);
    assert.fail(error);
  }
  lua.lua_close(L);
}
const codec = readFileSync(
    new URL("../reaper/json.lua", import.meta.url),
    "utf8",
  ),
  bridge = readFileSync(
    new URL("../reaper/DLS_Satsu_Bridge.lua", import.meta.url),
    "utf8",
  ),
  palette = readFileSync(
    new URL("../reaper/DLS_Satsu_Palette.lua", import.meta.url),
    "utf8",
  );
test("Lua bridge, palette, and codec compile on a Lua 5.3 runtime", () =>
  run(
    `assert(load(${JSON.stringify(bridge)}));assert(load(${JSON.stringify(palette)}));assert(load(${JSON.stringify(codec)}))`,
  ));
test("Lua JSON roundtrip handles Unicode, escapes, strict parsing and bounded nesting", () =>
  run(`
local json=assert(load(${JSON.stringify(codec)}))()
local value=json.decode([[{"id":"task-1","operation":{"type":"marker","name":"雪\\nquote\\\""},"values":[0,true,false,null]}]])
assert(value.operation.name=='雪\\nquote"');assert(value.values[2]==true);assert(value.values[3]==false);assert(value.values[4]==json.null)
assert(json.decode(json.encode(value)).id=='task-1')
for _,input in ipairs({'{"a":1,"a":2}','01','[1,]','"\\\\q"','1e','{','true false'})do assert(not pcall(json.decode,input),input)end
assert(json.decode('"\\\\uD834\\\\uDD1E"')==utf8.char(0x1d11e))
`));
test("deferred bridge enforces revisions and allowlist and creates native undo/receipts", () =>
  run(`
local json=assert(load(${JSON.stringify(codec)}))();dofile=function()return json end
local files,queue,undo,mutations,rev,now={},{},0,0,4,100;os.time=function()return now end
io.open=function(path,mode)if mode=='rb' then if not files[path]then return nil end;return {read=function()return files[path]end,close=function()end}end;return{write=function(_,s)files[path]=s end,close=function()end}end
os.remove=function(path)files[path]=nil end;os.rename=function(a,b)if not files[a]then return nil end;files[b]=files[a];files[a]=nil;return true end
reaper={get_action_context=function()return false,'/scripts/bridge.lua',0,99 end,GetExtState=function()return '/bridge' end,RecursiveCreateDirectory=function()end,EnumProjects=function()return 1 end,GetMasterTrack=function()return 0 end,GetTrackGUID=function(t)return t==0 and 'master' or 'track' end,GetProjectStateChangeCount=function()return rev end,GetProjectName=function()return 'Original session' end,CountTracks=function()return 1 end,GetTrack=function()return 1 end,GetTrackName=function()return true,'Guitar' end,GetMediaTrackInfo_Value=function(_,key)return key=='D_VOL' and 1 or 0 end,Track_GetPeakInfo=function()return .1 end,TrackFX_GetCount=function()return 2 end,GetSet_LoopTimeRange2=function()return 0,8 end,Master_GetTempo=function()return 92 end,GetPlayPosition2Ex=function()return 0 end,GetPlayStateEx=function()return 0 end,SetToggleCommandState=function(section,id)assert(section==0 and id==99)end,RefreshToolbar2=function()end,atexit=function()end,time_precise=function()return now end,defer=function(fn)queue[1]=fn end,ShowConsoleMsg=function(s)error(s)end,EnumerateFiles=function(_,index)local list={};for key in pairs(files)do if key:match('^/bridge/')then list[#list+1]=key:sub(9)end end;table.sort(list);return list[index+1]end,Undo_BeginBlock2=function()undo=undo+1 end,Undo_EndBlock2=function()end,UpdateArrange=function()end,SetMediaTrackInfo_Value=function(_,key,value)assert(key=='B_MUTE' and value==1);mutations=mutations+1;rev=rev+1 end}
assert(load(${JSON.stringify(bridge)}))();local context=json.decode(files['/bridge/context.json'])
local function send(id,revision,operation)files['/bridge/command-'..id..'.json']=json.encode({id=id,project=context.project,revision=revision,operation=operation,expiresAt=now+10});now=now+1;queue[1]();return json.decode(files['/bridge/receipt-'..id..'.json'])end
assert(send('one','4',{type='mute',track='track',value=true}).status=='applied');assert(mutations==1 and undo==1)
assert(send('stale','4',{type='mute',track='track',value=true}).status=='rejected');assert(mutations==1)
assert(send('shell','5',{type='shell',value='evil'}).status=='rejected');assert(mutations==1)
assert(send('one','5',{type='mute',track='track',value=true}).status=='applied');assert(mutations==1)
`));
