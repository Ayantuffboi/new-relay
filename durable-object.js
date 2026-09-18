import { DurableObject } from "cloudflare:workers";

export class RelayRoom extends DurableObject {

    constructor(ctx, env) {
        super(ctx, env);

        this.env = env;

        // Restore connections after hibernation.
        this.ctx.getWebSockets().forEach(ws => {
            const state = ws.deserializeAttachment();

            if (state) {
                // State is restored from the attachment.
            }
        });
    }

    async fetch(request) {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket required.", {
                status: 426
            });
        }

        const pair = new WebSocketPair();

        const client = pair[0];
        const server = pair[1];

        this.ctx.acceptWebSocket(server);

        server.serializeAttachment({
            role: null,
            id: crypto.randomUUID()
        });

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    webSocketMessage(ws, message) {
        let data;

        try {
            data = JSON.parse(message);
        } catch {
            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid JSON."
            }));

            return;
        }

        const state = ws.deserializeAttachment() || {};

        /*
         * HOST
         */
        if (data.type === "host-register") {

            state.role = "host";
            state.hostId = data.hostId || crypto.randomUUID();

            ws.serializeAttachment(state);

            this.sendToOthers(ws, {
                type: "host-ready",
                hostId: state.hostId
            });

            return;
        }

        /*
         * CLIENT
         */
        if (data.type === "client-register") {

            state.role = "client";
            state.clientId = data.clientId || crypto.randomUUID();

            ws.serializeAttachment(state);

            const host = this.findRole("host");

            if (!host) {
                ws.send(JSON.stringify({
                    type: "host-offline"
                }));

                return;
            }

            ws.send(JSON.stringify({
                type: "host-online"
            }));

            host.send(JSON.stringify({
                type: "client-online",
                clientId: state.clientId
            }));

            return;
        }

        /*
         * WEBRTC SIGNALING
         */
        if (data.type === "signal") {

            const targetRole =
                state.role === "host"
                    ? "client"
                    : "host";

            const target = this.findRole(targetRole);

            if (target) {
                target.send(JSON.stringify({
                    type: "signal",
                    data: data.data
                }));
            }

            return;
        }

        /*
         * PING
         */
        if (data.type === "ping") {

            ws.send(JSON.stringify({
                type: "pong"
            }));

            return;
        }
    }

    sendToOthers(sender, message) {
        for (const ws of this.ctx.getWebSockets()) {
            if (ws !== sender && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            }
        }
    }

    findRole(role) {
        for (const ws of this.ctx.getWebSockets()) {
            const state = ws.deserializeAttachment();

            if (
                state &&
                state.role === role &&
                ws.readyState === WebSocket.OPEN
            ) {
                return ws;
            }
        }

        return null;
    }

    webSocketClose(ws) {
        const state = ws.deserializeAttachment();

        if (!state) {
            return;
        }

        if (state.role === "host") {
            this.sendToOthers(ws, {
                type: "host-offline"
            });
        }

        if (state.role === "client") {
            const host = this.findRole("host");

            if (host) {
                host.send(JSON.stringify({
                    type: "client-offline"
                }));
            }
        }
    }

    webSocketError(ws) {
        try {
            ws.close();
        } catch {}
    }
}
