import { Router, Response, Request } from "express";
import { route } from "@spacebar/api/middlewares";
import { PUBLIC_ASSETS_FOLDER } from "@spacebar/util";
import path from "node:path";
import fs from "node:fs";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        spacebarOnly: true,
        authentication: "never",
    }),
    (req: Request, res: Response) => {
        const zipPath = path.join(PUBLIC_ASSETS_FOLDER, "FemCord-Equicord.zip");
        if (!fs.existsSync(zipPath)) {
            return res.status(404).send("Download package not found");
        }
        return res.download(zipPath, "FemCord-Equicord.zip");
    },
);

export default router;
