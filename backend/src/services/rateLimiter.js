import { config } from "../config.js";
import { redis } from "../lib/redis.js";

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end

local ttl = redis.call('TTL', key)
if current > limit then
  return {0, ttl, current}
end

return {1, ttl, current}
`;

let rateLimitSha = null;

async function executeRateLimit(userId) {
    if (!rateLimitSha) {
        rateLimitSha = await redis.script("LOAD", RATE_LIMIT_SCRIPT);
    }

    const key = `ratelimit:${userId}`;
    return redis.evalsha(
        rateLimitSha,
        1,
        key,
        config.rateLimitPerMinute,
        config.rateLimitWindowSeconds
    );
}

export async function rateLimitGuard(request, reply) {
    const userId = request.user?.userId || "anonymous";

    const [allowed, ttl] = await executeRateLimit(userId);
    if (Number(allowed) !== 1) {
        return reply
            .code(429)
            .header("retry-after", String(ttl))
            .send({ error: "Rate limit exceeded" });
    }
}
