import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const fetchText = (url) =>
    new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchText(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(data));
            res.on("error", reject);
        }).on("error", reject);
    });

async function main() {
    console.log("Fetching collectibles...");
    const rawCollectiblesJs = await fetchText("https://raw.githubusercontent.com/wavedevgit/discarchives/main/src/collectibles/collectibles.js");
    const code = rawCollectiblesJs.replace("export { collectibles, previews };", "this.collectibles = collectibles; this.previews = previews;");
    const ctx = {};
    vm.runInNewContext(code, ctx);
    const collectibles = ctx.collectibles;
    console.log(`Extracted ${collectibles.length} collectible categories.`);

    console.log("Fetching profile effects...");
    const rawEffectsJs = await fetchText("https://cdn.jsdelivr.net/npm/@discord-user-card/profile-effects@0.0.9/lib/profileEffects.js");
    const effectsCode = rawEffectsJs
        .replace("export var DiscordProductType;", "var DiscordProductType = {};")
        .replace("export var AnimationType;", "var AnimationType = {};")
        .replace("export const profileEffects =", "this.profileEffects =");
    const effectsCtx = {};
    vm.runInNewContext(effectsCode, effectsCtx);
    const profileEffects = effectsCtx.profileEffects;
    for (const cat of collectibles) {
        for (const prod of cat.products || []) {
            const normalizedPrices = {};
            for (const [group, val] of Object.entries(prod.prices || {})) {
                const cp = val?.country_prices || val?.countryPrices;
                const rawPrices = cp?.prices;
                const prices = Array.isArray(rawPrices)
                    ? rawPrices.map((p) => ({ amount: 0, currency: p.currency || "usd", exponent: p.exponent ?? 2 }))
                    : [{ amount: 0, currency: "usd", exponent: 2 }];
                normalizedPrices[group] = {
                    country_prices: {
                        country_code: cp?.country_code || cp?.countryCode || "US",
                        prices,
                    },
                };
            }
            if (Object.keys(normalizedPrices).length === 0) {
                normalizedPrices["0"] = {
                    country_prices: {
                        country_code: "US",
                        prices: [{ amount: 0, currency: "usd", exponent: 2 }],
                    },
                };
            }
            prod.prices = normalizedPrices;
        }
    }

    const assetsDir = path.resolve("assets");
    const collectiblesPath = path.join(assetsDir, "collectibles.json");
    const effectsPath = path.join(assetsDir, "profile-effects.json");

    await fs.writeFile(collectiblesPath, JSON.stringify(collectibles, null, 2));
    await fs.writeFile(effectsPath, JSON.stringify(profileEffects, null, 2));

    console.log(`Saved ${collectiblesPath} (${collectibles.length} categories)`);
    console.log(`Saved ${effectsPath} (${profileEffects.length} effects)`);
}

main().catch((err) => {
    console.error("Error generating collectibles:", err);
    process.exit(1);
});
