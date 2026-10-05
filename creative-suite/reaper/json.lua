-- Small strict JSON codec for the bridge. Lua 5.3+ / REAPER 7.
local json = {}
local null = {}; json.null = null
local escapes = {['"']='\\"', ['\\']='\\\\', ['\b']='\\b', ['\f']='\\f', ['\n']='\\n', ['\r']='\\r', ['\t']='\\t'}
local function quote(s)
  return '"' .. s:gsub('[%z\1-\31\\"]', function(c) return escapes[c] or string.format('\\u%04x', c:byte()) end) .. '"'
end
local function encode(v, depth)
  assert(depth < 32, 'JSON depth exceeded')
  if v == null or v == nil then return 'null' end
  local t = type(v)
  if t == 'string' then return quote(v) end
  if t == 'boolean' then return tostring(v) end
  if t == 'number' then assert(v == v and math.abs(v) ~= math.huge, 'Invalid number'); return tostring(v) end
  assert(t == 'table', 'Unsupported JSON value')
  local array, n = true, 0
  for k in pairs(v) do n=n+1; if type(k)~='number' or k<1 or k%1~=0 then array=false end end
  if array and n ~= #v then array=false end
  local out = {}
  if array then for i=1,#v do out[i]=encode(v[i],depth+1) end; return '['..table.concat(out,',')..']' end
  for k,value in pairs(v) do assert(type(k)=='string','Invalid key'); out[#out+1]=quote(k)..':'..encode(value,depth+1) end
  table.sort(out); return '{'..table.concat(out,',')..'}'
end
function json.encode(v) return encode(v,0) end
function json.decode(s)
  assert(type(s)=='string' and #s<2097152, 'JSON size exceeded')
  local p=1
  local function skip() local _,e=s:find('^[ \t\r\n]*',p); p=(e or p-1)+1 end
  local function stringValue()
    assert(s:sub(p,p)=='"'); p=p+1; local out={}
    while p<=#s do
      local c=s:sub(p,p); p=p+1
      if c=='"' then return table.concat(out) end
      if c=='\\' then
        local e=s:sub(p,p); p=p+1
        local mapping={['"']='"',['\\']='\\',['/']='/',b='\b',f='\f',n='\n',r='\r',t='\t'}
        if e=='u' then
          local h=s:sub(p,p+3); assert(h:match('^%x%x%x%x$'),'Invalid Unicode'); p=p+4; local code=tonumber(h,16)
          if code>=0xd800 and code<=0xdbff then
            assert(s:sub(p,p+1)=='\\u','Missing surrogate'); p=p+2; local low=tonumber(s:sub(p,p+3),16); p=p+4
            assert(low and low>=0xdc00 and low<=0xdfff,'Invalid surrogate'); code=0x10000+(code-0xd800)*1024+low-0xdc00
          else assert(code<0xdc00 or code>0xdfff,'Invalid surrogate') end
          out[#out+1]=utf8.char(code)
        else assert(mapping[e],'Invalid escape'); out[#out+1]=mapping[e] end
      else assert(c:byte()>=32,'Control character'); out[#out+1]=c end
    end
    error('Unterminated string')
  end
  local value
  value=function(depth)
    assert(depth<32,'JSON depth exceeded'); skip(); local c=s:sub(p,p)
    if c=='"' then return stringValue() end
    if c=='{' or c=='[' then
      local object=c=='{'; p=p+1; skip(); local out={}, nil
      local finish=object and '}' or ']'
      if s:sub(p,p)==finish then p=p+1; return out end
      while true do
        skip(); local key
        if object then key=stringValue(); assert(out[key]==nil,'Duplicate key'); skip(); assert(s:sub(p,p)==':'); p=p+1 end
        local v=value(depth+1); if object then out[key]=v else out[#out+1]=v end
        skip(); c=s:sub(p,p); p=p+1; if c==finish then return out end; assert(c==',','Missing separator')
      end
    end
    for word,result in pairs({['true']=true,['false']=false,['null']=null}) do if s:sub(p,p+#word-1)==word then p=p+#word; return result end end
    local number=s:match('^-?%d+%.?%d*[eE]?[+-]?%d*',p); assert(number and #number>0,'Invalid value')
    assert(not number:match('^-?0%d') and not number:match('%.$'),'Invalid number')
    local n=tonumber(number); assert(n and n==n and math.abs(n)~=math.huge,'Invalid number'); p=p+#number; return n
  end
  local v=value(0); skip(); assert(p>#s,'Trailing JSON'); return v
end
return json
