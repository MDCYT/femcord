import { route } from "@spacebar/api/middlewares";
import { Request, Response, Router } from "express";
import { MinecraftVerifierServer } from "../../../../connections/Minecraft/MinecraftVerifierServer";

const router = Router({ mergeParams: true });

router.get("/", route({}), async (req: Request, res: Response) => {
    const verifier = MinecraftVerifierServer.getInstance();
    const status = verifier.getStatus(req.user_id);
    return res.json(status);
});

export default router;
