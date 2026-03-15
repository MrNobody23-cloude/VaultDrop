import dotenv from "dotenv";

dotenv.config();

const defaultInventory = {
    "sku-vaultdrop": 100
};

export const config = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 8080),
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    postgresUrl:
        process.env.POSTGRES_URL || "postgres://vaultdrop:vaultdrop@localhost:5432/vaultdrop",
    jwtSecret: process.env.JWT_SECRET || "vaultdrop-dev-secret",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeCurrency: process.env.STRIPE_CURRENCY || "usd",
    productPriceCents: Number(process.env.PRODUCT_PRICE_CENTS || 5000),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 5),
    rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60),
    checkoutLockTtlSeconds: Number(process.env.CHECKOUT_LOCK_TTL_SECONDS || 120),
    queueName: process.env.CHECKOUT_QUEUE_NAME || "checkout-queue",
    inventoryBootstrap: process.env.INVENTORY_BOOTSTRAP
        ? JSON.parse(process.env.INVENTORY_BOOTSTRAP)
        : defaultInventory,
    wsBroadcastChannel: process.env.WS_BROADCAST_CHANNEL || "vaultdrop:events",
    auditStream: process.env.AUDIT_STREAM || "vaultdrop:audit"
};
