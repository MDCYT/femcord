/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router } from "express";
import { route } from "@spacebar/api/middlewares";
import { FederationRequestError, parseCanonicalId } from "@spacebar/util";
import { hostUser } from "@spacebar/api/util/utility/federationHost";
import { federationHandler, ownInstance } from "@spacebar/api/util/utility/federationNetwork";

const router = Router({ mergeParams: true });

router.get(
    "/lookup",
    route({ spacebarOnly: true, authentication: "never", description: "Public profile of one of this instance's users by username. Needs a signed request." }),
    federationHandler(async (req) => {
        const username = typeof req.query.username === "string" ? req.query.username.trim().toLowerCase() : "";
        if (!/^[a-z0-9_.]{2,32}$/.test(username)) throw new FederationRequestError("unknown_user", "Unknown user", 404);
        return { body: await hostUser({ username }) };
    }),
);

router.get(
    "/:user_id",
    route({ spacebarOnly: true, authentication: "never", description: "Public profile of one of this instance's users by canonical id. Needs a signed request." }),
    federationHandler(async (req) => {
        const parsed = parseCanonicalId(req.params.user_id);
        if (!parsed || parsed.instance !== ownInstance()) throw new FederationRequestError("unknown_user", "Unknown user", 404);
        return { body: await hostUser({ id: parsed.id }) };
    }),
);

export default router;
