import net from "node:net";
import crypto from "node:crypto";
import { ConnectedAccount } from "@spacebar/database";
import { emitEvent } from "@spacebar/util";

export function writeVarInt(value: number): Buffer {
    const bytes: number[] = [];
    do {
        let temp = value & 0x7F;
        value >>>= 7;
        if (value !== 0) temp |= 0x80;
        bytes.push(temp);
    } while (value !== 0);
    return Buffer.from(bytes);
}

export function readVarInt(buffer: Buffer, offset = 0): { value: number; bytesRead: number } | null {
    let res = 0;
    let shift = 0;
    let bytesRead = 0;
    while (true) {
        if (offset + bytesRead >= buffer.length) return null;
        const b = buffer[offset + bytesRead++];
        res |= (b & 0x7F) << shift;
        shift += 7;
        if ((b & 0x80) === 0) break;
        if (shift > 35) throw new Error("VarInt too big");
    }
    return { value: res, bytesRead };
}

export function writeString(str: string): Buffer {
    const buf = Buffer.from(str, "utf8");
    return Buffer.concat([writeVarInt(buf.length), buf]);
}

export function readString(buffer: Buffer, offset = 0): { value: string; bytesRead: number } | null {
    const len = readVarInt(buffer, offset);
    if (!len) return null;
    const start = offset + len.bytesRead;
    const end = start + len.value;
    if (buffer.length < end) return null;
    const str = buffer.slice(start, end).toString("utf8");
    return { value: str, bytesRead: len.bytesRead + len.value };
}

export function writePacket(id: number, data: Buffer = Buffer.alloc(0)): Buffer {
    const idBuf = writeVarInt(id);
    const lenBuf = writeVarInt(idBuf.length + data.length);
    return Buffer.concat([lenBuf, idBuf, data]);
}

export function mojangSha1Digest(hash: Buffer): string {
    const isNegative = (hash[0] & 0x80) !== 0;
    if (!isNegative) return hash.toString("hex").replace(/^0+/, "");
    const big = BigInt("0x" + hash.toString("hex"));
    const comp = (BigInt(1) << BigInt(160)) - big;
    return "-" + comp.toString(16);
}

export function rsaDecryptPkcs1(privateKey: string, encrypted: Buffer): Buffer {
    const raw = crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_NO_PADDING,
        },
        encrypted
    );

    let sepIndex = 2;
    while (sepIndex < raw.length && raw[sepIndex] !== 0) {
        sepIndex++;
    }
    if (sepIndex >= raw.length) {
        throw new Error("Invalid PKCS#1 v1.5 padding in decrypted block");
    }
    return raw.slice(sepIndex + 1);
}

export class Aes128Cfb8Cipher {
    private key: Buffer;
    private iv: Buffer;

    constructor(key: Buffer, iv: Buffer) {
        this.key = key;
        this.iv = Buffer.from(iv);
    }

    public update(data: Buffer): Buffer {
        const out = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) {
            const cipher = crypto.createCipheriv("aes-128-ecb", this.key, null);
            cipher.setAutoPadding(false);
            const encryptedIv = cipher.update(this.iv);
            const ct = data[i] ^ encryptedIv[0];
            out[i] = ct;
            this.iv = Buffer.concat([this.iv.slice(1), Buffer.from([ct])]);
        }
        return out;
    }
}

export interface VerificationSession {
    userId: string;
    expectedUsername: string;
    code: string;
    createdAt: number;
    expiresAt: number;
    verified: boolean;
    verifiedName?: string;
    uuid?: string;
}

export class MinecraftVerifierServer {
    private static instance: MinecraftVerifierServer | null = null;
    private server: net.Server | null = null;
    private autoStopTimer: NodeJS.Timeout | null = null;
    private keypair: { publicKey: Buffer; privateKey: string } | null = null;
    private pendingByUsername = new Map<string, VerificationSession>();
    private pendingByUserId = new Map<string, VerificationSession>();
    private publicHost = process.env.MINECRAFT_VERIFIER_HOST || "46.247.109.3";
    private port = Number(process.env.MINECRAFT_VERIFIER_PORT) || 25565;
    private readonly timeoutMs = 180000; // 3 minutes of inactivity

    public static getInstance(): MinecraftVerifierServer {
        if (!this.instance) {
            this.instance = new MinecraftVerifierServer();
        }
        return this.instance;
    }

    private getKeypair(): { publicKey: Buffer; privateKey: string } {
        if (!this.keypair) {
            const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
                modulusLength: 1024,
                publicKeyEncoding: { type: "spki", format: "der" },
                privateKeyEncoding: { type: "pkcs8", format: "pem" },
            });
            this.keypair = { publicKey: publicKey as Buffer, privateKey: privateKey as string };
        }
        return this.keypair;
    }

    public startVerification(userId: string, username: string): { ok: boolean; server: string; port: number; code: string; expiresAt: number; username: string } {
        const cleanName = username.trim();
        const code = `FC-${Math.floor(1000 + Math.random() * 9000)}`;
        const expiresAt = Date.now() + this.timeoutMs;

        const session: VerificationSession = {
            userId,
            expectedUsername: cleanName,
            code,
            createdAt: Date.now(),
            expiresAt,
            verified: false,
        };

        this.pendingByUsername.set(cleanName.toLowerCase(), session);
        this.pendingByUserId.set(userId, session);

        this.ensureStarted();

        return {
            ok: true,
            server: this.publicHost,
            port: this.port,
            code,
            expiresAt,
            username: cleanName,
        };
    }

    public getStatus(userId: string): { active: boolean; verified: boolean; expired?: boolean; username?: string; uuid?: string; expiresIn?: number } {
        const session = this.pendingByUserId.get(userId);
        if (!session) {
            return { active: false, verified: false };
        }

        if (session.verified) {
            return {
                active: true,
                verified: true,
                username: session.verifiedName || session.expectedUsername,
                uuid: session.uuid,
            };
        }

        if (Date.now() > session.expiresAt) {
            this.pendingByUserId.delete(userId);
            this.pendingByUsername.delete(session.expectedUsername.toLowerCase());
            this.checkShutdown();
            return { active: false, verified: false, expired: true };
        }

        return {
            active: true,
            verified: false,
            username: session.expectedUsername,
            expiresIn: Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)),
        };
    }

    public cancelVerification(userId: string): void {
        const session = this.pendingByUserId.get(userId);
        if (session) {
            this.pendingByUserId.delete(userId);
            this.pendingByUsername.delete(session.expectedUsername.toLowerCase());
            this.checkShutdown();
        }
    }

    private ensureStarted(): void {
        this.resetInactivityTimer();

        if (this.server) return;

        try {
            this.server = net.createServer((socket) => this.handleClient(socket));
            this.server.on("error", (err: any) => {
                console.error("[MinecraftVerifier] Server error:", err?.message || err);
                if (err.code === "EADDRINUSE") {
                    console.warn(`[MinecraftVerifier] Port ${this.port} is already in use.`);
                }
            });

            this.server.listen(this.port, "0.0.0.0", () => {
                console.log(`[MinecraftVerifier] Servidor de verificación de Minecraft encendido en 0.0.0.0:${this.port}`);
            });
        } catch (e) {
            console.error("[MinecraftVerifier] Error al iniciar servidor:", e);
        }
    }

    private resetInactivityTimer(): void {
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
        }
        this.autoStopTimer = setTimeout(() => {
            this.checkShutdown(true);
        }, this.timeoutMs);
    }

    private checkShutdown(force = false): void {
        const now = Date.now();
        for (const [key, s] of this.pendingByUsername.entries()) {
            if (now > s.expiresAt) {
                this.pendingByUsername.delete(key);
                this.pendingByUserId.delete(s.userId);
            }
        }

        if (force || this.pendingByUsername.size === 0) {
            this.stopServer();
        }
    }

    public stopServer(): void {
        if (this.autoStopTimer) {
            clearTimeout(this.autoStopTimer);
            this.autoStopTimer = null;
        }

        if (this.server) {
            try {
                this.server.close(() => {
                    console.log("[MinecraftVerifier] Servidor de verificación apagado para ahorrar recursos.");
                });
            } catch {}
            this.server = null;
        }
    }

    private async onPlayerVerified(verifiedName: string, uuid: string): Promise<boolean> {
        const session = this.pendingByUsername.get(verifiedName.toLowerCase());
        if (!session) return false;

        session.verified = true;
        session.verifiedName = verifiedName;
        session.uuid = uuid;

        try {
            let account = await ConnectedAccount.findOne({
                where: {
                    user_id: session.userId,
                    type: "minecraft",
                },
            });

            if (account) {
                account.name = verifiedName;
                account.external_id = uuid;
                account.metadata_ = { uuid, verified_at: new Date().toISOString() };
                account.verified = true;
                account.visibility = 1;
                account.revoked = false;
                await account.save();
            } else {
                account = await ConnectedAccount.create({
                    user_id: session.userId,
                    type: "minecraft",
                    name: verifiedName,
                    external_id: uuid,
                    verified: true,
                    visibility: 1,
                    revoked: false,
                    metadata_: { uuid, verified_at: new Date().toISOString() },
                }).save();
            }

            await emitEvent({
                event: "USER_CONNECTIONS_UPDATE",
                data: { ...account, token_data: undefined },
                user_id: session.userId,
            });

            console.log(`[MinecraftVerifier] ¡Cuenta verificada exitosamente! ${verifiedName} (${uuid}) para usuario ${session.userId}`);
        } catch (err) {
            console.error("[MinecraftVerifier] Error al guardar cuenta vinculada:", err);
        }

        this.pendingByUsername.delete(verifiedName.toLowerCase());

        setTimeout(() => {
            this.checkShutdown();
        }, 3000);

        return true;
    }

    private handleClient(socket: net.Socket): void {
        socket.setTimeout(15000, () => {
            try { socket.destroy(); } catch {}
        });

        let buffer = Buffer.alloc(0);
        let state = 0; // 0 = handshake, 1 = status, 2 = login
        let clientProtocol = 765;
        let username = "";
        let verifyToken: Buffer | null = null;
        let clientCipher: Aes128Cfb8Cipher | null = null;

        const { publicKey, privateKey } = this.getKeypair();

        socket.on("data", async (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            while (buffer.length > 0) {
                const lenVarInt = readVarInt(buffer);
                if (!lenVarInt) break;
                const packetTotalLen = lenVarInt.bytesRead + lenVarInt.value;
                if (buffer.length < packetTotalLen) break;

                const packetData = buffer.slice(lenVarInt.bytesRead, packetTotalLen);
                buffer = buffer.slice(packetTotalLen);

                const idVarInt = readVarInt(packetData);
                if (!idVarInt) break;
                const packetId = idVarInt.value;
                const payload = packetData.slice(idVarInt.bytesRead);

                if (state === 0 && packetId === 0x00) {
                    // Handshake
                    let off = 0;
                    const p = readVarInt(payload, off);
                    if (p) {
                        clientProtocol = p.value;
                        off += p.bytesRead;
                    }
                    const host = readString(payload, off);
                    if (host) off += host.bytesRead;
                    off += 2; // port
                    const nextState = readVarInt(payload, off);
                    state = nextState ? nextState.value : 1;
                } else if (state === 1) {
                    // Status (Server List Ping)
                    if (packetId === 0x00) {
                        const pendingList = Array.from(this.pendingByUsername.values());
                        const statusObj = {
                            version: {
                                name: "FemCord Verifier",
                                protocol: clientProtocol || 765,
                            },
                            players: {
                                max: Math.max(1, pendingList.length),
                                online: pendingList.length,
                                sample: pendingList.slice(0, 5).map((p) => ({
                                    name: `§aEsperando: §f${p.expectedUsername}`,
                                    id: "00000000-0000-0000-0000-000000000000",
                                })),
                            },
                            description: {
                                text: "§d§lFemCord §7» §aServidor de Verificación Oficial\n§7Conéctate para vincular tu cuenta automáticamente.",
                            },
                        };
                        try {
                            socket.write(writePacket(0x00, writeString(JSON.stringify(statusObj))));
                        } catch {}
                    } else if (packetId === 0x01) {
                        try {
                            socket.write(writePacket(0x01, payload));
                            socket.end();
                        } catch {}
                    }
                } else if (state === 2) {
                    // Login
                    if (packetId === 0x00) {
                        // Login Start
                        const parsedUser = readString(payload);
                        username = parsedUser?.value || "Player";
                        verifyToken = crypto.randomBytes(4);

                        const encReq = Buffer.concat([
                            writeString(""),
                            writeVarInt(publicKey.length),
                            publicKey,
                            writeVarInt(verifyToken.length),
                            verifyToken,
                        ]);

                        try {
                            socket.write(writePacket(0x01, encReq));
                        } catch {}
                    } else if (packetId === 0x01) {
                        // Encryption Response
                        let off = 0;
                        const ssLen = readVarInt(payload, off);
                        if (!ssLen) return socket.destroy();
                        off += ssLen.bytesRead;
                        const encSS = payload.slice(off, off + ssLen.value);
                        off += ssLen.value;

                        let encVT: Buffer | null = null;
                        if (off < payload.length) {
                            let vtLen = readVarInt(payload, off);
                            if (vtLen && vtLen.value === 1 && off + vtLen.bytesRead + 1 < payload.length) {
                                off += vtLen.bytesRead + 1;
                                vtLen = readVarInt(payload, off);
                            }
                            if (vtLen) {
                                off += vtLen.bytesRead;
                                encVT = payload.slice(off, off + vtLen.value);
                            }
                        }

                        if (!encSS || !encVT) return socket.destroy();

                        let sharedSecret: Buffer;
                        try {
                            sharedSecret = rsaDecryptPkcs1(privateKey, encSS);
                            const decVT = rsaDecryptPkcs1(privateKey, encVT);
                            if (!verifyToken || !decVT.equals(verifyToken)) {
                                console.warn("[MinecraftVerifier] Verify token mismatch for", username);
                                return socket.destroy();
                            }
                        } catch (err) {
                            console.error("[MinecraftVerifier] Decryption error:", err);
                            return socket.destroy();
                        }

                        clientCipher = new Aes128Cfb8Cipher(sharedSecret, sharedSecret);

                        // Compute Mojang SHA-1
                        const hash = crypto.createHash("sha1").update(Buffer.from("")).update(sharedSecret).update(publicKey).digest();
                        const digest = mojangSha1Digest(hash);

                        let mojangData: { id: string; name: string } | null = null;
                        try {
                            const mojangRes = await fetch(
                                `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(username)}&serverId=${digest}`,
                                { signal: AbortSignal.timeout(10000) }
                            );
                            if (mojangRes.ok) {
                                mojangData = (await mojangRes.json()) as { id: string; name: string };
                            }
                        } catch (mojangErr) {
                            console.error("[MinecraftVerifier] Mojang hasJoined request failed:", mojangErr);
                        }

                        if (!mojangData?.id || !mojangData?.name) {
                            const failMsg = JSON.stringify({
                                text: "§c§l[FemCord] §cError de autenticación con Mojang.\n\n§7No se pudo comprobar tu sesión oficial de Minecraft.",
                            });
                            try {
                                const p = writePacket(0x00, writeString(failMsg));
                                socket.write(clientCipher.update(p));
                                socket.end();
                            } catch {}
                            return;
                        }

                        const verified = await this.onPlayerVerified(mojangData.name, mojangData.id);

                        const responseMsg = verified
                            ? {
                                  text: `§d§l[FemCord] §a¡Cuenta verificada exitosamente!\n\n§fHola §e${mojangData.name}§f, tu cuenta de Minecraft ha sido vinculada correctamente a tu perfil de FemCord.\n\n§7¡Ya puedes volver a tu navegador, la ventana se cerrará sola!`,
                              }
                            : {
                                  text: `§c§l[FemCord] §cNo hay ninguna vinculación pendiente para §e${mojangData.name}§c.\n\n§7Abre Ajustes > Conexiones en FemCord y dale a 'Vincular' primero.`,
                              };

                        try {
                            const p = writePacket(0x00, writeString(JSON.stringify(responseMsg)));
                            socket.write(clientCipher.update(p));
                            setTimeout(() => {
                                try { socket.end(); } catch {}
                            }, 250);
                        } catch {}
                        return;
                    }
                }
            }
        });

        socket.on("error", () => {});
    }
}
