import { RelayRoom } from "./durable-object.js";

export { RelayRoom };

export default {
    async fetch(request, env) {

        const upgrade =
            request.headers.get("Upgrade");

        // Normal browser request
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {

            return new Response(
                "Relay server online.",
                {
                    status: 200,
                    headers: {
                        "Content-Type": "text/plain; charset=UTF-8"
                    }
                }
            );
        }

        // WebSockets must use GET
        if (request.method !== "GET") {

            return new Response(
                "WebSocket must use GET.",
                {
                    status: 400
                }
            );
        }

        const url =
            new URL(request.url);

        const code =
            url.searchParams.get("code");

        // Exactly 8 characters.
        // Letters and numbers are allowed.
        if (!code || code.length !== 8) {

            return new Response(
                "A valid 8-character code is required.",
                {
                    status: 400
                }
            );
        }

        // One Durable Object room per code.
        const id =
            env.RELAY_ROOM.idFromName(code);

        const room =
            env.RELAY_ROOM.get(id);

        return room.fetch(request);
    }
};
