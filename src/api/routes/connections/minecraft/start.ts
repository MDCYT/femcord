import { route } from "@spacebar/api/middlewares";
import { Request, Response, Router } from "express";
import { ApiError } from "@spacebar/util";
import { MinecraftVerifierServer } from "../../../../connections/Minecraft/MinecraftVerifierServer";

const router = Router({ mergeParams: true });

router.post("/", route({}), async (req: Request, res: Response) => {
    const rawUsername = (req.body?.username || "").toString().trim();
    if (!rawUsername) {
        throw new ApiError("Debes ingresar tu nombre de usuario de Minecraft", 400);
    }
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(rawUsername)) {
        throw new ApiError("Nombre de usuario de Minecraft inválido (1-16 caracteres alfanuméricos)", 400);
    }

    const verifier = MinecraftVerifierServer.getInstance();
    const result = verifier.startVerification(req.user_id, rawUsername);

    return res.json(result);
});

export default router;
