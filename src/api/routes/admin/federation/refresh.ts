/* SPDX-License-Identifier: AGPL-3.0-only */
import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { federationStatus, refreshRegistry } from "@spacebar/api/util/utility/federation";

const router = Router({ mergeParams: true });

router.post(
    "/",
    route({ right: "OPERATOR", spacebarOnly: true, description: "Fetch the registry document now and refresh peer discovery lists" }),
    async (req: Request, res: Response) => {
        await refreshRegistry();
        res.json(await federationStatus());
    },
);

export default router;
