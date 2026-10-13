/* SPDX-License-Identifier: AGPL-3.0-only */
import { Request, Response, Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { discoveryCategories, discoveryPage } from "@spacebar/api/util/handlers/Discovery";
import { searchDirectory } from "@spacebar/api/util/utility/federation";

const router = Router({ mergeParams: true });

router.get(
    "/",
    route({
        description:
            "Other instances from the registry and a page of the servers they list for global discovery, searched by name, keywords and description from the cached listings, with icons through this instance's media proxy",
    }),
    async (req: Request, res: Response) => {
        const { offset, limit } = discoveryPage(req.query, 24);
        res.set("Cache-Control", "private, max-age=30");
        res.json(await searchDirectory({ query: String(req.query.query ?? ""), categoryIds: discoveryCategories(req.query.category_id), offset, limit }));
    },
);

export default router;
