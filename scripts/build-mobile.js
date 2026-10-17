const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "assets", "public", "mobile", "meowcord.js");

(async () => {
    const result = await Bun.build({
        entrypoints: [path.join(ROOT, "client", "mobile", "src", "index.ts")],
        root: ROOT,
        target: "browser",
        format: "iife",
        minify: true,
        sourcemap: "none",
    });
    if (!result.success) {
        for (const log of result.logs) console.error(log);
        process.exit(1);
    }
    const [output] = result.outputs;
    const code = await output.text();
    if (!code.includes('"__MEOWCORD_ENDPOINTS__"')) throw new Error("the endpoints placeholder did not survive the build");
    await Bun.write(OUTPUT, code);
    console.log(`[mobile] wrote ${path.relative(ROOT, OUTPUT)} (${code.length} bytes)`);
})();
