import crypto from "node:crypto";
import Stripe from "stripe";
import { config } from "../config.js";

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export async function preCreatePaymentIntent({ idempotencyKey }) {
    if (!stripe) {
        return {
            provider: "mock",
            paymentIntentId: `pi_mock_${crypto.randomUUID()}`,
            status: "requires_capture"
        };
    }

    const intent = await stripe.paymentIntents.create(
        {
            amount: config.productPriceCents,
            currency: config.stripeCurrency,
            capture_method: "automatic",
            payment_method_types: ["card"],
            metadata: { idempotencyKey }
        },
        { idempotencyKey: `intent_${idempotencyKey}` }
    );

    return {
        provider: "stripe",
        paymentIntentId: intent.id,
        status: intent.status
    };
}

export async function capturePaymentIntent(paymentIntentId) {
    if (!stripe || paymentIntentId.startsWith("pi_mock_")) {
        return {
            provider: "mock",
            paymentIntentId,
            status: "succeeded"
        };
    }

    const intent = await stripe.paymentIntents.confirm(paymentIntentId);
    return {
        provider: "stripe",
        paymentIntentId: intent.id,
        status: intent.status
    };
}
