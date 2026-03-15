import { redis } from "./src/lib/redis.js";

const qty = process.argv[2] || 20;
const productId = "sku-vaultdrop";
const key = `inv:${productId}`;

async function restock() {
    try {
        const newValue = await redis.incrby(key, Number(qty));
        console.log(`\x1b[32mSUCCESS:\x1b[0m Added ${qty} to inventory.`);
        console.log(`\x1b[36mNEW TOTAL:\x1b[0m ${newValue} items remaining for ${productId}`);
        process.exit(0);
    } catch (error) {
        console.error(`\x1b[31mERROR:\x1b[0m ${error.message}`);
        process.exit(1);
    }
}

restock();
