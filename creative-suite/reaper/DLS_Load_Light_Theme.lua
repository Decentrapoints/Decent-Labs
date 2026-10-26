-- Install/apply the soft gray variant and open Playback tools.
local _,script=reaper.get_action_context()
DLS_THEME_VARIANT='light'
dofile(script:match('^(.*)[/\\]')..'/DLS_Load_Theme.lua')
