import { RelayRoom } from "./durable-object.js";

export { RelayRoom };

const CODE_LENGTH = 8;

function generateCode() {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);

    let code = "";

    for (let i = 0; i < CODE_LENGTH; i++) {
        code += chars[bytes[i] % chars.length];
    }

    return code;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Relay server online.", {
                status: 200
            });
        }

        let code = url.searchParams.get("code");

        if (!code) {
            code = generateCode();
        }

        if (code.length !== CODE_LENGTH) {
            return new Response("Code must be exactly 8 characters.", {
                status: 400
            });
        }

        const id = env.RELAY_ROOM.idFromName(code);
        const room = env.RELAY_ROOM.get(id);

        return room.fetch(request);
    }
};
