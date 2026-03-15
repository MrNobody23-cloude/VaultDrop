-- Atomic inventory decrement gate.
-- Returns {1, remaining} on success, {0, current} if insufficient stock.
local key = KEYS[1]
local requested = tonumber(ARGV[1])

if not requested or requested <= 0 then
  return {0, tonumber(redis.call('GET', key) or '0')}
end

local current = tonumber(redis.call('GET', key) or '0')
if current < requested then
  return {0, current}
end

local remaining = redis.call('DECRBY', key, requested)
return {1, tonumber(remaining)}
