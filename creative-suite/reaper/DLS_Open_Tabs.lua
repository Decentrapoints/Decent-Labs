-- DLS Tabs / MIT. Uses the suite's configured browser URL; no project is uploaded.
local base=reaper.GetExtState('DLS','SuiteURL')
if base=='' then base='http://localhost:4310' end
if not base:match('^https?://[%w%.%-:%[%]]+/?$') then reaper.MB('Set a valid http(s) host URL in DLS SuiteURL.','DLS / Tabs',0);return end
base=base:gsub('/$','')..'/#tabs'
if reaper.CF_ShellExecute then reaper.CF_ShellExecute(base)
elseif reaper.GetOS():find('Win',1,true) then reaper.ExecProcess('rundll32.exe url.dll,FileProtocolHandler '..base,-2)
elseif reaper.GetOS():find('OSX',1,true) then reaper.ExecProcess('open '..base,-1)
else reaper.ExecProcess('xdg-open '..base,-1) end
