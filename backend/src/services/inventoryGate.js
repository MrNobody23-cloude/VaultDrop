import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redis } from "../lib/redis.js";
import { config } from "../config.js";
import { inventoryGauge } from "../lib/metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let gateSha = null;

async function loadGateScript() {
    if (gateSha) {
        return gateSha;
    }

    const scriptPath = path.resolve(__dirname, "../../../redis/inventory_gate.lua");
    const script = await fs.readFile(scriptPath, "utf8");
    gateSha = await redis.script("LOAD", script);
    return gateSha;
}

export async function seedInventory() {
    const entries = Object.entries(config.inventoryBootstrap);
    await Promise.all(
        entries.map(async ([productId, count]) => {
            const key = `inv:${productId}`;
            const exists = await redis.exists(key);
            if (exists === 0) {
                await redis.set(key, Number(count));
            }
            inventoryGauge.set({ product_id: productId }, Number(await redis.get(key) || 0));
        })
    );
    
    // Set initial sale expiry if not set
    const expiry = await redis.exists("sale:expiry");
    if (expiry === 0) {
        await redis.set("sale:expiry", Date.now() + (90 * 1000));
    }
}

export async function reserveInventory(productId, qty) {
    const sha = await loadGateScript();
    const key = `inv:${productId}`;
    const [success, remaining] = await redis.evalsha(sha, 1, key, qty);
    inventoryGauge.set({ product_id: productId }, Number(remaining));
    return {
        success: Number(success) === 1,
        remaining: Number(remaining)
    };
}

export async function restoreInventory(productId, qty) {
    const key = `inv:${productId}`;
    const remaining = await redis.incrby(key, Number(qty));
    inventoryGauge.set({ product_id: productId }, Number(remaining));
    return Number(remaining);
}

export async function setInventory(productId, qty) {
    const key = `inv:${productId}`;
    await redis.set(key, Number(qty));
    inventoryGauge.set({ product_id: productId }, Number(qty));
    return Number(qty);
}

export async function getInventory(productId) {
    const current = Number(await redis.get(`inv:${productId}`) || 0);
    inventoryGauge.set({ product_id: productId }, current);
    return current;
}
