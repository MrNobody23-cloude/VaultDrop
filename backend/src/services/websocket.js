import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { redisSubscriber } from "../lib/redis.js";

export async function attachRealtimeServer(fastify) {
    const wss = new WebSocketServer({
        server: fastify.server,
        path: "/ws"
    });

    wss.on("connection", (socket) => {
        socket.send(
            JSON.stringify({
                type: "connected",
                payload: { message: "VaultDrop realtime connected" }
            })
        );
    });

    await redisSubscriber.subscribe(config.wsBroadcastChannel);
    redisSubscriber.on("message", (_channel, message) => {
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
    });

    fastify.addHook("onClose", async () => {
        wss.close();
        await redisSubscriber.unsubscribe(config.wsBroadcastChannel);
    });
}
