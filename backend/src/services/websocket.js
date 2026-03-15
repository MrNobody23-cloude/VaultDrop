import { WebSocketServer } from "ws";
import { config } from "../config.js";
import { redisSubscriber } from "../lib/redis.js";

export async function attachRealtimeServer(fastify) {
    const wss = new WebSocketServer({
        server: fastify.server,
        path: "/ws"
    });

    // Heartbeat to keep connections alive on Render/Proxies
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on("connection", (socket, req) => {
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        fastify.log.info({ 
            msg: "WS Connection established", 
            remoteAddress: req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        });

        socket.send(
            JSON.stringify({
                type: "connected",
                payload: { message: "VaultDrop realtime connected" }
            })
        );

        socket.on('error', (err) => {
            fastify.log.error({ msg: "WS Socket error", error: err.message });
        });
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
        clearInterval(interval);
        wss.close();
        await redisSubscriber.unsubscribe(config.wsBroadcastChannel);
    });
}
