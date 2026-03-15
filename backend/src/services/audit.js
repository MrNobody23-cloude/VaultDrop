import { config } from "../config.js";
import { redis } from "../lib/redis.js";

export async function writeAuditEvent(eventType, payload) {
    const event = {
        event_type: eventType,
        payload: JSON.stringify(payload),
        created_at: new Date().toISOString()
    };

    await redis.xadd(
        config.auditStream,
        "*",
        "event_type",
        event.event_type,
        "payload",
        event.payload,
        "created_at",
        event.created_at
    );
}
