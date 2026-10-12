import { CLOSECODES, setHeartbeat } from "@spacebar/gateway";
import { IncomingMessage } from "node:http";
import { URL } from "node:url";
import WS from "ws";
import { VoiceOPCodes, WebRtcWebSocket, Send } from "../util";
import { onClose } from "./Close";
import { onMessage } from "./Message";

export async function Connection(this: WS.Server, socket: WebRtcWebSocket, request: IncomingMessage) {
    try {
        socket.remoteAddress = request.socket.remoteAddress;
        socket.on("error", (error) => console.error("[WebRTC]", error));
        socket.on("close", onClose.bind(socket));
        socket.on(
            "message",
            socket.federation
                ? (buffer: Buffer, isBinary: boolean) => {
                      socket.federationInbox = (socket.federationInbox ?? Promise.resolve()).then(() => onMessage.call(socket, buffer, isBinary));
                  }
                : onMessage.bind(socket),
        );
        console.log("[WebRTC] new connection", request.url);

        if (process.env.WS_LOGEVENTS) {
            [
                "close",
                "error",
                "upgrade",
                //"message",
                "open",
                "ping",
                "pong",
                "unexpected-response",
            ].forEach((x) => {
                socket.on(x, (y) => console.log("[WebRTC]", x, y));
            });
        }

        const { searchParams } = new URL(`http://localhost${request.url}`);

        socket.encoding = "json";
        socket.version = Math.min(Number(searchParams.get("v")) || 3, 9);
        socket.voiceSequence = 0;
        socket.maxDaveVersion = 0;
        socket.daveVersion = 0;
        if (socket.version < 3) return socket.close(CLOSECODES.Unknown_error, "invalid version");

        setHeartbeat(socket);

        socket.authenticationTimeout = setTimeout(() => socket.terminate(), 1000 * 30);

        await Send(socket, {
            op: VoiceOPCodes.HELLO,
            d: {
                v: socket.version,
                heartbeat_interval: 13750,
            },
        });
    } catch (error) {
        console.error("[WebRTC]", error);
        return socket.close(CLOSECODES.Unknown_error);
    }
}
