import { Queue } from "bullmq";
import { config } from "../config.js";
import { redis } from "../lib/redis.js";
import { queueDepthGauge } from "../lib/metrics.js";

export const checkoutQueue = new Queue(config.queueName, {
    connection: redis,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 1000,
        attempts: 1
    }
});

export async function enqueueCheckoutJob(payload, idempotencyKey) {
    return checkoutQueue.add("checkout", payload, {
        jobId: idempotencyKey
    });
}

export function startQueueDepthMonitor() {
    const interval = setInterval(async () => {
        const [waiting, active, delayed] = await Promise.all([
            checkoutQueue.getWaitingCount(),
            checkoutQueue.getActiveCount(),
            checkoutQueue.getDelayedCount()
        ]);

        queueDepthGauge.set(waiting + active + delayed);
    }, 2000);

    interval.unref();
}
