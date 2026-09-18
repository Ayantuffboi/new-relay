import { DurableObject } from "cloudflare:workers";

export class RelayRoom extends DurableObject {

    constructor(ctx, env) {

        super(ctx, env);

        this.ctx = ctx;
        this.env = env;
    }

    async fetch(request) {

        if (
            request.headers.get("Upgrade") !==
            "websocket"
        ) {

            return new Response(
                "WebSocket required.",
                {
                    status: 426
                }
            );
        }

        const pair =
            new WebSocketPair();

        const client =
            pair[0];

        const server =
            pair[1];

        /*
         * Hibernatable WebSocket.
         */
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

            data =
                JSON.parse(message);

        } catch {

            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid message."
            }));

            return;
        }

        let state =
            ws.deserializeAttachment() || {};

        /*
         * HOST REGISTER
         */
        if (data.type === "host-register") {

            state.role = "host";

            state.hostId =
                data.hostId ||
                crypto.randomUUID();

            ws.serializeAttachment(state);

            /*
             * Tell any existing client.
             */
            for (
                const other
                of this.ctx.getWebSockets()
            ) {

                if (other === ws) {
                    continue;
                }

                const otherState =
                    other.deserializeAttachment();

                if (
                    otherState &&
                    otherState.role === "client"
                ) {

                    other.send(JSON.stringify({
                        type: "host-online"
                    }));
                }
            }

            return;
        }

        /*
         * CLIENT REGISTER
         */
        if (data.type === "client-register") {

            /*
             * Only one client at a time.
             */
            const existingClient =
                this.findRole("client");

            if (
                existingClient &&
                existingClient !== ws
            ) {

                ws.send(JSON.stringify({
                    type: "error",
                    message: "This room is already in use."
                }));

                return;
            }

            state.role = "client";

            state.clientId =
                data.clientId ||
                crypto.randomUUID();

            ws.serializeAttachment(state);

            const host =
                this.findRole("host");

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
                type: "client-online"
            }));

            return;
        }

        /*
         * CLIENT READY
         */
        if (data.type === "client-ready") {

            const host =
                this.findRole("host");

            if (host) {

                host.send(JSON.stringify({
                    type: "client-ready"
                }));
            }

            return;
        }

        /*
         * SIGNALING
         *
         * This includes:
         * offer
         * answer
         * ICE candidates
         */
        if (data.type === "signal") {

            const targetRole =
                state.role === "host"
                    ? "client"
                    : "host";

            const target =
                this.findRole(targetRole);

            if (!target) {

                ws.send(JSON.stringify({
                    type: "error",
                    message:
                        "Other device is not connected."
                }));

                return;
            }

            target.send(JSON.stringify({
                type: "signal",
                data: data.data
            }));

            return;
        }
    }

    findRole(role) {

        for (
            const ws
            of this.ctx.getWebSockets()
        ) {

            if (
                ws.readyState !==
                WebSocket.OPEN
            ) {
                continue;
            }

            const state =
                ws.deserializeAttachment();

            if (
                state &&
                state.role === role
            ) {

                return ws;
            }
        }

        return null;
    }

    webSocketClose(ws) {

        const state =
            ws.deserializeAttachment();

        if (!state) {
            return;
        }

        if (state.role === "host") {

            const client =
                this.findRole("client");

            if (client) {

                client.send(JSON.stringify({
                    type: "host-offline"
                }));
            }
        }

        if (state.role === "client") {

            const host =
                this.findRole("host");

            if (host) {

                host.send(JSON.stringify({
                    type: "client-offline"
                }));
            }
        }
    }

    webSocketError(ws) {

        /*
         * The Cloudflare runtime handles
         * the connection lifecycle.
         */
    }
}
