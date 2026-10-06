-- Native REAPER integration check. Only run against an isolated -cfgfile.
-- DLS_THEME_SMOKE_DIR must equal REAPER's resource path; production is refused.
local function normalized(p) return p:gsub('\\','/'):gsub('/+$',''):lower() end
local root = os.getenv('DLS_THEME_SMOKE_DIR')
if not root or normalized(root) ~= normalized(reaper.GetResourcePath()) then return end
local _, script = reaper.get_action_context()
local folder = script:match('^(.*)[/\\]')
local json = dofile(folder .. '/../reaper/json.lua')
local result = {version=reaper.GetAppVersion(),resource=reaper.GetResourcePath(),checks={},ok=false}
local ok, failure = pcall(function()
  local theme = folder .. '/../reaper/theme/dist/DLS Satsu.ReaperThemeZip'
  assert(reaper.OpenColorThemeFile(theme),'Theme archive did not load')
  local loaded = reaper.GetLastColorThemeFile()
  assert(loaded:match('DLS Satsu%.ReaperThemeZip$'),'Unexpected loaded theme')
  result.theme=loaded
  for _,key in ipairs({'col_arrangebg','col_mixerbg','col_tcp_text'}) do
    local expected=key=='col_arrangebg' and reaper.ColorToNative(17,18,22) or
      key=='col_mixerbg' and reaper.ColorToNative(25,26,32) or reaper.ColorToNative(238,237,243)
    assert(reaper.GetThemeColor(key,0)==expected,'Theme color mismatch: '..key)
    result.checks[key]=true
  end
  for section,variants in pairs({tcp={'Studio','Compact','Recording'},mcp={'Studio','Compact','Inspector'},['master.mcp']={'Studio'},trans={'Studio'},envcp={'Studio'}}) do
    local names={}
    for i=0,60 do
      local found,name=reaper.ThemeLayout_GetLayout(section,i)
      if not found then break end
      names[name]=true
    end
    for _,variant in ipairs(variants) do
      for _,scale in ipairs({'',' 150%',' 200%'}) do
        local name='Satsu '..variant..scale
        assert(names[name],'Missing native layout: '..section..' / '..name)
        assert(reaper.ThemeLayout_SetLayout(section,name),'Layout rejected: '..name)
      end
    end
    result.checks[section]=true
    reaper.ThemeLayout_SetLayout(section,'')
  end
  reaper.ThemeLayout_RefreshAll()
  result.ok=true
end)
if not ok then result.error=tostring(failure) end
local output=assert(io.open(root..'/theme-smoke.json','wb'))
output:write(json.encode(result));output:close()
-- This instance is isolated and owns no user project. Quit after the report.
reaper.Main_OnCommand(40004,0)
