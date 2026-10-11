(() => {
  // 1. Detect if this window is on the OAuth callback URL
  const path = window.location.pathname;
  const match = path.match(/^\/connections\/([a-zA-Z0-9_-]+)(?:\/callback)?\/?$/i);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");

  if (match && code && state) {
    const provider = match[1].toLowerCase();
    document.title = "Conectando " + provider + "...";

    const renderBox = (icon, title, message, showCloseBtn) => {
      let box = document.getElementById("connection-callback-box");
      if (!box) {
        box = document.createElement("div");
        box.id = "connection-callback-box";
        box.style.cssText =
          "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#1e1f22;color:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;z-index:99999999;padding:20px;box-sizing:border-box;";
        (document.body || document.documentElement).appendChild(box);
      }
      box.innerHTML = `
        <div style="background:#2b2d31;padding:36px 40px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:440px;width:100%;text-align:center;">
          ${icon}
          <h2 style="margin:16px 0 8px 0;font-size:20px;color:#fff;">${title}</h2>
          <p style="margin:0 0 24px 0;font-size:14px;color:#b5bac1;line-height:1.5;">${message}</p>
          ${showCloseBtn ? '<button id="cb-close-btn" style="background:#5865f2;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer;">Cerrar ventana</button>' : ""}
        </div>
      `;
      const btn = document.getElementById("cb-close-btn");
      if (btn) btn.onclick = () => window.close();
    };

    const spinner = `<div style="width:48px;height:48px;border:4px solid #588a99;border-top-color:transparent;border-radius:50%;margin:0 auto;animation:th-spin 1s linear infinite;"></div><style>@keyframes th-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`;
    const successIcon = `<div style="font-size:48px;color:#57f287;line-height:1;">✓</div>`;
    const errorIcon = `<div style="font-size:48px;color:#ed4245;line-height:1;">✗</div>`;

    renderBox(spinner, "Vinculando cuenta...", `Verificando autorización con ${provider}...`, false);

    fetch(`/api/v9/connections/${provider}/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state })
    })
      .then(async (res) => {
        if (res.ok) {
          renderBox(
            successIcon,
            "¡Conexión exitosa!",
            `Tu cuenta de ${provider} se ha vinculado correctamente a FemCord. Esta ventana se cerrará automáticamente.`,
            true
          );
          setTimeout(() => {
            try {
              window.close();
            } catch {}
          }, 1500);
        } else {
          let msg = "No se pudo completar la autorización. Es posible que el código haya expirado o ya fue utilizado.";
          try {
            const data = await res.json();
            if (data.message) msg = data.message;
          } catch {}
          renderBox(errorIcon, "Error al vincular", msg, true);
        }
      })
      .catch((err) => {
        renderBox(errorIcon, "Error de conexión", err?.message || String(err), true);
      });
  }

  // 2. Webpack platform integration
  const knownId = "573648";
  const isPlatforms = (value) =>
    typeof value?.map === "function" &&
    typeof value?.isSupported === "function" &&
    typeof value?.getByUrl === "function";
  let require;
  (window.webpackChunkdiscord_app ??= []).push([
    [Symbol("fosscord-connections")],
    {},
    (r) => (require = r),
  ]);

  const findPlatforms = () => {
    if (!require?.m) return undefined;
    const ids = require.m[knownId]
      ? [knownId]
      : Object.keys(require.m).filter((id) => String(require.m[id]).includes('name:"Crunchyroll"'));
    for (const id of ids) {
      const found = Object.values(require(id) ?? {}).find(isPlatforms);
      if (found) return found;
    }
    return undefined;
  };

  const toyhouseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 198 191" width="24" height="24"><g transform="translate(6.292,-54.859)"><path fill="#588a99" d="M -6.2923729,154.22213 92.377447,54.858845 121.69053,84.093271 V 69.076617 h 31.14565 v 46.273543 l 38.59837,38.59837 h -32.36923 v 91.21228 H 25.02776 v -91.10105 z"/><path fill="#ffffff" d="m 54.338047,170.6337 v 8.39821 H 70.80075 v 53.94872 h 11.012215 v -54.00434 h 17.920872 c 0,0 2.72e-4,-0.23357 2.72e-4,2.12606 v 51.91208 h 8.966631 v -29.12162 h 26.03469 v 28.76768 h 9.28125 v -61.66526 h -8.96663 v 25.72008 h -26.42796 l 0.22247,-26.09986 z"/></g></svg>`;
  const toyhouseIconUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(toyhouseSvg);

  const toyhousePlatform = {
    type: "toyhouse",
    name: "Toyhouse",
    color: "#588a99",
    icon: {
      lightPNG: toyhouseIconUri,
      darkPNG: toyhouseIconUri,
      whitePNG: toyhouseIconUri,
      lightSVG: toyhouseIconUri,
      darkSVG: toyhouseIconUri,
      whiteSVG: toyhouseIconUri,
    },
    enabled: true,
    hasMetadata: false,
    domains: ["toyhou.se"],
    getPlatformUserUrl: (account) => {
      const username = account?.name || account?.id || "";
      return `https://toyhou.se/${encodeURIComponent(username)}`;
    },
  };

  const registerToyhouse = (platforms) => {
    if (!platforms || platforms._toyhouseRegistered) return;
    platforms._toyhouseRegistered = true;

    // Grab array c if accessible via find/map
    let cArray;
    try {
      platforms.find((_, __, arr) => {
        if (Array.isArray(arr)) cArray = arr;
        return false;
      });
    } catch {}

    if (cArray && !cArray.some((p) => p.type === "toyhouse")) {
      cArray.push(toyhousePlatform);
    }

    const origGet = platforms.get?.bind(platforms);
    if (origGet) {
      platforms.get = (type) => (type === "toyhouse" ? toyhousePlatform : origGet(type));
    }

    const origIsSupported = platforms.isSupported?.bind(platforms);
    if (origIsSupported) {
      platforms.isSupported = (type) => (type === "toyhouse" ? true : origIsSupported(type));
    }

    const origGetByUrl = platforms.getByUrl?.bind(platforms);
    if (origGetByUrl) {
      platforms.getByUrl = (url) => {
        if (typeof url === "string" && url.includes("toyhou.se")) return toyhousePlatform;
        return origGetByUrl(url);
      };
    }

    const origMap = platforms.map?.bind(platforms);
    if (origMap && !cArray) {
      platforms.map = (fn) => {
        const res = origMap(fn);
        if (toyhousePlatform.enabled) res.push(fn(toyhousePlatform));
        return res;
      };
    }

    const origFilter = platforms.filter?.bind(platforms);
    if (origFilter && !cArray) {
      platforms.filter = (fn) => {
        const res = origFilter(fn);
        if (fn(toyhousePlatform)) res.push(toyhousePlatform);
        return res;
      };
    }
  };

  const config = fetch(
    `${window.GLOBAL_ENV?.API_ENDPOINT ?? "/api"}/v${window.GLOBAL_ENV?.API_VERSION ?? 9}/connections`,
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  let attempts = 0;
  const timer = setInterval(async () => {
    const platforms = findPlatforms();
    if (!platforms && ++attempts < 120) return;
    clearInterval(timer);
    if (!platforms) return;

    registerToyhouse(platforms);

    const enabled = await config;
    if (!enabled) return;

    if (enabled.toyhouse) {
      toyhousePlatform.enabled = !!enabled.toyhouse.enabled;
    }

    platforms.map((platform) => {
      if (platform.enabled && !enabled[platform.type]?.enabled) platform.enabled = false;
      return platform;
    });
  }, 500);
})();
