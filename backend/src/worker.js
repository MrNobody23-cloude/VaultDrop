import IORedis from "ioredis";
import { Worker } from "bullmq";
import Redlock from "redlock";
import { config } from "./config.js";
import { withTransaction } from "./lib/db.js";
import { releaseActiveCheckoutLock } from "./services/auth.js";
import { restoreInventory } from "./services/inventoryGate.js";
import { capturePaymentIntent } from "./services/payment.js";
import { writeAuditEvent } from "./services/audit.js";
import { publishRealtimeEvent } from "./services/events.js";
import { workerOutcomeTotal } from "./lib/metrics.js";

const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
});

const redlock = new Redlock([connection], {
    driftFactor: 0.01,
    retryCount: 5,
    retryDelay: 200
});

const worker = new Worker(
    config.queueName,
    async (job) => {
        const { userId, productId, quantity, idempotencyKey, paymentIntentId, paymentProvider } =
            job.data;

        const lockKey = `lock:product:${productId}`;
        const lock = await redlock.acquire([lockKey], 4000);
        let orderCommitted = false;

        try {
            const payment = await capturePaymentIntent(paymentIntentId);
            if (payment.status !== "succeeded") {
                throw new Error(`payment capture failed with status ${payment.status}`);
            }

            const order = await withTransaction(async (client) => {
                const inserted = await client.query(
                    `
          INSERT INTO orders (user_id, product_id, quantity, idempotency_key, payment_intent_id, payment_provider, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'paid')
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id, status
          `,
                    [userId, productId, quantity, idempotencyKey, paymentIntentId, paymentProvider]
                );

                if (inserted.rows[0]) {
                    return inserted.rows[0];
                }

                const existing = await client.query(
                    "SELECT id, status FROM orders WHERE idempotency_key = $1",
                    [idempotencyKey]
                );

                return existing.rows[0];
            });
            orderCommitted = true;

            await writeAuditEvent("checkout_completed", {
                userId,
                productId,
                quantity,
                idempotencyKey,
                orderId: order.id
            });

            await publishRealtimeEvent("order_completed", {
                userId,
                productId,
                orderId: order.id,
                idempotencyKey
            });

            await releaseActiveCheckoutLock(userId, idempotencyKey);
            workerOutcomeTotal.labels("success").inc();

            return { orderId: order.id };
        } catch (error) {
            if (!orderCommitted) {
                const restored = await restoreInventory(productId, quantity);
                await publishRealtimeEvent("inventory_update", {
                    productId,
                    remaining: restored
                });
            }

            await writeAuditEvent("checkout_failed", {
                userId,
                productId,
                quantity,
                idempotencyKey,
                reason: error.message
            });

            await releaseActiveCheckoutLock(userId, idempotencyKey);
            workerOutcomeTotal.labels("failed").inc();

            throw error;
        } finally {
            await lock.release();
        }
    },
    {
        connection,
        concurrency: 8
    }
);

worker.on("completed", (job) => {
    console.log("job completed", job.id);
});

worker.on("failed", (job, error) => {
    console.error("job failed", job?.id, error.message);
});
