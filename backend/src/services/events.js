import { config } from "../config.js";
import { redis } from "../lib/redis.js";

export async function publishRealtimeEvent(type, payload) {
    const message = JSON.stringify({
        type,
        payload,
        ts: new Date().toISOString()
    });
    await redis.publish(config.wsBroadcastChannel, message);
}
