import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { redis } from "../lib/redis.js";

export async function authGuard(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Missing bearer token" });
        return;
    }

    const token = authHeader.substring("Bearer ".length);

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (!decoded.sub) {
            reply.code(401).send({ error: "Invalid token: missing sub" });
            return;
        }

        request.user = {
            userId: String(decoded.sub),
            role: decoded.role || "user"
        };
    } catch (_error) {
        return reply.code(401).send({ error: "Invalid token" });
    }
}

export async function adminGuard(request, reply) {
    await authGuard(request, reply);
    if (reply.sent) return;

    if (request.user.role !== "admin") {
        return reply.code(403).send({ error: "Forbidden: Admin access required" });
    }
}

export async function acquireActiveCheckoutLock(userId, checkoutId) {
    const key = `checkout:active:${userId}`;
    const result = await redis.set(key, checkoutId, "EX", config.checkoutLockTtlSeconds, "NX");
    return {
        acquired: result === "OK",
        key
    };
}

export async function releaseActiveCheckoutLock(userId, checkoutId) {
    const key = `checkout:active:${userId}`;
    const current = await redis.get(key);
    if (current === checkoutId) {
        await redis.del(key);
    }
}
