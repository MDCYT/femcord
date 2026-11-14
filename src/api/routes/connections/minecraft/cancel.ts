import { route } from "@spacebar/api/middlewares";
import { Request, Response, Router } from "express";
import { MinecraftVerifierServer } from "../../../../connections/Minecraft/MinecraftVerifierServer";

const router = Router({ mergeParams: true });

router.post("/", route({}), async (req: Request, res: Response) => {
    const verifier = MinecraftVerifierServer.getInstance();
    verifier.cancelVerification(req.user_id);
    return res.json({ ok: true });
});

export default router;
