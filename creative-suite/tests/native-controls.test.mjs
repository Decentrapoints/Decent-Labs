import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
const root = new URL("../reaper/", import.meta.url);
const source = (name) => readFileSync(new URL(name, root), "utf8");
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
test("Every shipped ReaScript compiles on Lua 5.3", () =>
  run(
    readdirSync(root)
      .filter((n) => n.endsWith(".lua"))
      .map((n) => `assert(load(${JSON.stringify(source(n))}))`)
      .join("\n"),
  ));
const fixture = `
local active,tempo,stamp,cap,mx,my,scale,focused='project',120,0,0,0,0,1,'edit'
local begins,ends,posts,releases,writes=0,0,0,{},0
local theme='DLS Satsu.ReaperThemeZip';local conflict=false
local api={GetOS=function()return 'Win64'end,GetLastColorThemeFile=function()return theme end,
GetMainHwnd=function()return 'main'end,JS_Window_Find=function()return 'panel'end,
JS_Window_FindChildByID=function(_,id)assert(id==0);return 'transport'end,
JS_Window_IsWindow=function()return true end,
JS_WindowMessage_Intercept=function(_,msg,pass)assert(pass);if conflict and msg=='WM_LBUTTONUP'then return 0 end;return 1 end,
JS_WindowMessage_Release=function(_,msg)releases[#releases+1]=msg end,
JS_Window_GetClientSize=function()return true,2000,64*scale end,
JS_Window_GetClientRect=function()return true,100,200,2100,200+64*scale end,
JS_WindowMessage_Peek=function()return stamp>0,true,stamp,0,0,600*scale,30*scale end,
JS_Mouse_GetState=function()return cap end,GetMousePosition=function()return mx,my end,
JS_Window_GetFocus=function()return focused end,JS_Window_GetClassName=function()return 'Edit'end,
JS_Window_GetRect=function()return true,100+570*scale,200+18*scale,100+630*scale,200+46*scale end,
JS_WindowMessage_Post=function(window,msg,key)assert(window=='edit' and key==27);posts=posts+1;return true end,
Undo_BeginBlock2=function()begins=begins+1 end,Undo_EndBlock2=function()ends=ends+1 end,
EnumProjects=function()return active end}
local M={valid=function()return true end,context=function()return {project=active,tempo=tempo}end,
tempo=function(ctx,v)assert(ctx.project==active);tempo=v;writes=writes+1;return true end}
local N=assert(load(${JSON.stringify(source("DLS_Native_Controls.lua"))}))()(api,M,'transport')
local function down()stamp=stamp+1;cap=1;mx=100+600*scale;my=200+30*scale;N.frame()end
`;
test("Native tempo drag cancels only its own edit through the message queue, then writes one undo gesture", () =>
  run(
    fixture +
      `
N.frame();down();mx=mx+40;N.frame();assert(posts==2 and writes==0 and begins==0)
focused=nil;N.frame();assert(tempo==140 and begins==1);cap=0;N.frame();assert(ends==1)
-- A subsequent press with no movement remains ordinary native text entry.
down();cap=0;N.frame();assert(posts==2 and begins==1)
N.close();assert(#releases==2 and begins==ends)
`,
  ));
test("Native dragging handles scaled layouts, fine adjustment, clamps, project switches and conflicting hooks", () =>
  run(
    fixture +
      `
focused=nil;scale=1.5;down();mx=mx+40;cap=9;N.frame();cap=0;N.frame();assert(tempo==122)
scale=2;down();my=my-1000;N.frame();cap=0;N.frame();assert(tempo==400)
down();mx=mx-2000;N.frame();cap=0;N.frame();assert(tempo==20)
down();mx=mx+20;N.frame();active='other';N.frame();assert(begins==ends)
theme='Other';N.frame();assert(#releases==2)
theme='DLS Satsu';conflict=true;N.frame();assert(#releases==3 and releases[3]=='WM_LBUTTONDOWN')
N.close();assert(#releases==3)
`,
  ));
test("Tabs and Satsu shortcuts use configured routes without exporting project data or accepting shell text", () => {
  for (const [name, route] of [
    ["DLS_Open_Tabs.lua", "tabs"],
    ["DLS_Open_Satsu.lua", "studio"],
  ])
    run(`
local base='https://music.example:443';local calls,messages=0,0
reaper={GetExtState=function()return base end,CF_ShellExecute=function(url)assert(url=='https://music.example:443/#${route}');calls=calls+1 end,MB=function()messages=messages+1 end}
local action=assert(load(${JSON.stringify(source(name))}));action();assert(calls==1)
for _,bad in ipairs({'http://localhost & bad','https://example/path','javascript:bad','https://example/?query=1'})do base=bad;action()end
assert(calls==1 and messages==4)
`);
});
test("Guitar tuner reuses an existing effect and adds a new tuner before the amp only on one selected track", () =>
  run(`
local count,fx,created,moved,shown,beginning,ending=1,-1,0,0,0,0,0
reaper={EnumProjects=function()return 'project'end,CountSelectedTracks=function()return count end,GetSelectedTrack=function()return 'guitar'end,
TrackFX_AddByName=function(_,name,_,mode)assert(name=='ReaTune (Cockos)');if mode==-1 then created=created+1;fx=2 end;return fx end,
TrackFX_CopyToTrack=function(a,index,b,dest,move)assert(a==b and index==2 and dest==0 and move);fx=0;moved=moved+1 end,
TrackFX_Show=function(_,index,mode)assert(index==0 and mode==3);shown=shown+1 end,
Undo_BeginBlock2=function()beginning=beginning+1 end,Undo_EndBlock2=function()ending=ending+1 end,MB=function()end}
local action=assert(load(${JSON.stringify(source("DLS_Guitar_Tuner.lua"))}));action();action();count=2;action();count=0;action()
assert(created==1 and moved==1 and shown==2 and beginning==1 and ending==1)
`));
