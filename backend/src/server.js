import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { seedInventory } from "./services/inventoryGate.js";
import { registerCheckoutRoutes } from "./routes/checkout.js";
import { startQueueDepthMonitor } from "./services/queue.js";
import { getMetrics, metricsRegistry } from "./lib/metrics.js";
import { attachRealtimeServer } from "./services/websocket.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST"]
});

await registerCheckoutRoutes(fastify);

fastify.get("/healthz", async () => ({ status: "ok" }));
fastify.get("/api/healthz", async () => ({ status: "ok" }));

fastify.get("/metrics", async (request, reply) => {
    reply
        .header("content-type", metricsRegistry.contentType)
        .send(await getMetrics());
});

await attachRealtimeServer(fastify);
await seedInventory();
startQueueDepthMonitor();

fastify.listen({ port: config.port, host: "0.0.0.0" }).catch((error) => {
    fastify.log.error(error);
    process.exit(1);
});
