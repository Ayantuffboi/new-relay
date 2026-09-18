import { DurableObject } from "cloudflare:workers";

export class RelayRoom extends DurableObject {

    constructor(ctx, env) {
        super(ctx, env);

        this.ctx = ctx;
        this.env = env;
    }

    async fetch(request) {

        if (
            request.headers.get("Upgrade")?.toLowerCase()
            !== "websocket"
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

        // Accept the server side as a
        // hibernatable Durable Object WebSocket.
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
                message: "Invalid JSON message."
            }));

            return;
        }


        let state =
            ws.deserializeAttachment() || {};


        // =====================================================
        // HOST REGISTER
        // =====================================================

        if (data.type === "host-register") {

            state.role = "host";

            state.hostId =
                data.hostId || crypto.randomUUID();

            ws.serializeAttachment(state);

            console.log(
                "HOST REGISTERED:",
                state.hostId
            );


            // Tell any connected client.
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

                    try {

                        other.send(JSON.stringify({
                            type: "host-online"
                        }));

                    } catch {}

                }
            }

            return;
        }


        // =====================================================
        // CLIENT REGISTER
        // =====================================================

        if (data.type === "client-register") {

            const existingClient =
                this.findRole("client");

            if (
                existingClient &&
                existingClient !== ws
            ) {

                ws.send(JSON.stringify({
                    type: "error",
                    message:
                        "This room already has a client."
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


            // Tell client host exists.
            ws.send(JSON.stringify({
                type: "host-online"
            }));


            // Tell host client exists.
            host.send(JSON.stringify({
                type: "client-online"
            }));

            return;
        }


        // =====================================================
        // CLIENT READY
        // =====================================================

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


        // =====================================================
        // SIGNAL
        // =====================================================

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


        // =====================================================
        // UNKNOWN MESSAGE
        // =====================================================

        ws.send(JSON.stringify({
            type: "error",
            message:
                "Unknown message type."
        }));
    }


    findRole(role) {

        for (
            const ws
            of this.ctx.getWebSockets()
        ) {

            if (
                ws.readyState !== WebSocket.OPEN
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


    webSocketClose(
        ws,
        code,
        reason,
        wasClean
    ) {

        const state =
            ws.deserializeAttachment();

        if (!state) {
            return;
        }


        if (state.role === "host") {

            const client =
                this.findRole("client");

            if (client) {

                try {

                    client.send(JSON.stringify({
                        type: "host-offline"
                    }));

                } catch {}

            }
        }


        if (state.role === "client") {

            const host =
                this.findRole("host");

            if (host) {

                try {

                    host.send(JSON.stringify({
                        type: "client-offline"
                    }));

                } catch {}

            }
        }
    }


    webSocketError(ws) {

        console.error(
            "WebSocket error"
        );
    }
}
