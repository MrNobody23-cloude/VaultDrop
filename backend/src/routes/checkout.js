import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { redis } from "../lib/redis.js";
import { authGuard, adminGuard, acquireActiveCheckoutLock, releaseActiveCheckoutLock } from "../services/auth.js";
import { rateLimitGuard } from "../services/rateLimiter.js";
import {
    reserveInventory,
    restoreInventory,
    setInventory,
    getInventory
} from "../services/inventoryGate.js";
import { enqueueCheckoutJob } from "../services/queue.js";
import { preCreatePaymentIntent } from "../services/payment.js";
import { writeAuditEvent } from "../services/audit.js";
import { publishRealtimeEvent } from "../services/events.js";
import {
    checkoutRequestsTotal,
    gateRejectionsTotal,
    inventoryGauge
} from "../lib/metrics.js";

export async function registerCheckoutRoutes(fastify) {
    fastify.post("/api/auth/login", async (request, reply) => {
        const userId = String(request.body?.userId || "demo-user").trim();
        if (!userId) {
            return reply.code(400).send({ error: "User ID is required" });
        }

        const role = userId.toLowerCase() === "admin" ? "admin" : "user";
        const token = jwt.sign(
            { sub: userId, role },
            config.jwtSecret,
            { expiresIn: "1h" }
        );

        return reply.send({ token, userId, role });
    });

    fastify.post("/api/admin/restock", { preHandler: [adminGuard] }, async (request, reply) => {
        const productId = request.body?.productId || "sku-vaultdrop";
        const quantity = Number(request.body?.quantity || 50);

        if (isNaN(quantity) || quantity <= 0) {
            return reply.code(400).send({ error: "Invalid quantity" });
        }

        const remaining = await setInventory(productId, quantity);

        // Reset the sale timer when admin restocks
        const expiry = Date.now() + (90 * 1000); // 90 seconds
        await redis.set("sale:expiry", expiry);

        await publishRealtimeEvent("inventory_update", {
            productId,
            remaining,
            saleExpiry: expiry
        });

        return reply.send({ success: true, remaining, saleExpiry: expiry });
    });

    fastify.post(
        "/api/checkout",
        {
            preHandler: [authGuard, rateLimitGuard]
        },
        async (request, reply) => {
            const productId = request.body?.productId || "sku-vaultdrop";
            const quantity = Number(request.body?.quantity || 1);
            const idempotencyKey = request.body?.idempotencyKey || crypto.randomUUID();
            const userId = request.user.userId;

            // Check if sale is still active
            const saleExpiry = await redis.get("sale:expiry");
            if (saleExpiry && Date.now() > Number(saleExpiry)) {
                return reply.code(410).send({
                    error: "SALE_ENDED",
                    message: "The countdown has finished. No more purchases allowed."
                });
            }

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return reply.code(400).send({ error: "quantity must be a positive integer" });
            }

            const lock = await acquireActiveCheckoutLock(userId, idempotencyKey);
            if (!lock.acquired) {
                checkoutRequestsTotal.labels("duplicate").inc();
                return reply.code(409).send({
                    error: "Duplicate checkout blocked",
                    reason: "one active checkout per user is enforced"
                });
            }

            let inventoryReserved = false;
            try {
                const gateResult = await reserveInventory(productId, quantity);

                if (!gateResult.success) {
                    gateRejectionsTotal.inc();
                    checkoutRequestsTotal.labels("sold_out").inc();

                    await writeAuditEvent("checkout_rejected", {
                        userId,
                        productId,
                        quantity,
                        idempotencyKey,
                        reason: "sold_out",
                        remaining: gateResult.remaining
                    });

                    await publishRealtimeEvent("sold_out", {
                        productId,
                        remaining: gateResult.remaining
                    });

                    await releaseActiveCheckoutLock(userId, idempotencyKey);

                    return reply.code(409).send({
                        error: "SOLD_OUT",
                        remaining: gateResult.remaining
                    });
                }

                inventoryReserved = true;

                const paymentIntent = await preCreatePaymentIntent({ idempotencyKey });

                await enqueueCheckoutJob(
                    {
                        userId,
                        productId,
                        quantity,
                        idempotencyKey,
                        paymentIntentId: paymentIntent.paymentIntentId,
                        paymentProvider: paymentIntent.provider
                    },
                    idempotencyKey
                );

                await writeAuditEvent("checkout_queued", {
                    userId,
                    productId,
                    quantity,
                    idempotencyKey,
                    paymentIntentId: paymentIntent.paymentIntentId
                });

                await publishRealtimeEvent("inventory_update", {
                    productId,
                    remaining: gateResult.remaining
                });

                checkoutRequestsTotal.labels("queued").inc();

                return reply.code(202).send({
                    status: "queued",
                    idempotencyKey,
                    remaining: gateResult.remaining,
                    paymentIntentId: paymentIntent.paymentIntentId
                });
            } catch (error) {
                checkoutRequestsTotal.labels("error").inc();

                if (inventoryReserved) {
                    const restored = await restoreInventory(productId, quantity);
                    inventoryGauge.set({ product_id: productId }, restored);
                }

                await releaseActiveCheckoutLock(userId, idempotencyKey);

                request.log.error({ error }, "checkout failure");
                return reply.code(500).send({
                    error: "Checkout failed unexpectedly"
                });
            }
        }
    );

    fastify.get("/api/inventory/:productId", async (request, reply) => {
        const productId = request.params.productId;
        const remaining = await getInventory(productId);
        const saleExpiry = await redis.get("sale:expiry");
        return reply.send({ productId, remaining, saleExpiry: Number(saleExpiry) || 0 });
    });
}