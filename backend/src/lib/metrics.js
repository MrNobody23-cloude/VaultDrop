import client from "prom-client";

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const checkoutRequestsTotal = new client.Counter({
    name: "checkout_requests_total",
    help: "Total checkout API requests",
    labelNames: ["outcome"],
    registers: [registry]
});

export const gateRejectionsTotal = new client.Counter({
    name: "gate_rejections_total",
    help: "Total requests rejected by atomic inventory gate",
    registers: [registry]
});

export const queueDepthGauge = new client.Gauge({
    name: "checkout_queue_depth",
    help: "Current checkout queue depth",
    registers: [registry]
});

export const inventoryGauge = new client.Gauge({
    name: "inventory_remaining",
    help: "Current inventory level for product",
    labelNames: ["product_id"],
    registers: [registry]
});

export const workerOutcomeTotal = new client.Counter({
    name: "worker_outcomes_total",
    help: "Checkout worker outcomes",
    labelNames: ["outcome"],
    registers: [registry]
});

export async function getMetrics() {
    return registry.metrics();
}

export const metricsRegistry = registry;
