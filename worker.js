import { RelayRoom } from "./durable-object.js";

export { RelayRoom };

export default {
    async fetch(request, env) {

        const url =
            new URL(request.url);

        /*
         * Normal browser request.
         */
        if (
            request.headers.get("Upgrade") !==
            "websocket"
        ) {
            return new Response(
                "Relay server online.",
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "text/plain"
                    }
                }
            );
        }

        if (request.method !== "GET") {

            return new Response(
                "WebSocket must use GET.",
                {
                    status: 400
                }
            );
        }

        const code =
            url.searchParams.get("code");

        if (!code || code.length !== 8) {

            return new Response(
                "A valid 8-character code is required.",
                {
                    status: 400
                }
            );
        }

        /*
         * Every code gets its own Durable Object.
         */
        const id =
            env.RELAY_ROOM.idFromName(code);

        const room =
            env.RELAY_ROOM.get(id);

        return room.fetch(request);
    }
};
