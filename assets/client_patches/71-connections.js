(() => {
  // 1. Detect if this window is on the OAuth callback URL
  const path = window.location.pathname;
  const match = path.match(/^\/connections\/([a-zA-Z0-9_-]+)(?:\/(?:callback|error))?\/?$/i);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || params.get("token");
  const state = params.get("state");

  if (match) {
    const provider = match[1].toLowerCase();
    document.title = "Conectando " + provider + "...";

    const renderBox = (icon, title, message, showCloseBtn) => {
      const mount = () => {
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
      if (document.body || document.documentElement) {
        mount();
      } else {
        window.addEventListener("DOMContentLoaded", mount);
      }
    };

    const spinner = `<div style="width:48px;height:48px;border:4px solid #ba0000;border-top-color:transparent;border-radius:50%;margin:0 auto;animation:th-spin 1s linear infinite;"></div><style>@keyframes th-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>`;
    const successIcon = `<div style="font-size:48px;color:#57f287;line-height:1;">✓</div>`;
    const errorIcon = `<div style="font-size:48px;color:#ed4245;line-height:1;">✗</div>`;

    if (!code) {
      renderBox(errorIcon, "Autorización cancelada", "No se recibió el código de autorización.", true);
      return;
    }

    let authToken = null;
    try {
      const raw = localStorage.getItem("token");
      if (raw) authToken = raw.replace(/^"|"$/g, "");
    } catch {}

    renderBox(spinner, "Vinculando cuenta...", `Verificando autorización con ${provider}...`, false);

    fetch(`/api/v9/connections/${provider}/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: authToken } : {}),
      },
      body: JSON.stringify({
        code,
        token: code,
        state: state || "",
        insecure: false,
        friend_sync: false,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          renderBox(
            successIcon,
            "¡Conexión exitosa!",
            `Tu cuenta de ${provider} se ha vinculado correctamente a FemCord. Esta ventana se cerrará automáticamente.`,
            true
          );
          try {
            if (window.opener) {
              window.opener.postMessage({ type: "CONNECTION_CALLBACK", provider }, "*");
            }
          } catch {}
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

    return;
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

  const lastfmSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#ba0000" d="M10.554 15.422c-.628.919-1.579 1.488-2.738 1.488-1.921 0-3.176-1.464-3.176-3.708 0-2.529 1.416-3.805 3.32-3.805 1.579 0 2.506.845 2.946 2.198l1.792-.604c-.676-1.933-2.174-3.14-4.738-3.14-2.923 0-5.266 2.053-5.266 5.385 0 3.237 2.15 5.241 5.169 5.241 1.836 0 3.261-.87 4.082-2.319l-1.391-.736zm7.426-3.212c-.99 0-1.74.507-2.174 1.353l-.266.531-.87-4.106h-1.884l1.836 8.473h1.836l.241-1.377c.483.918 1.353 1.498 2.536 1.498 1.932 0 3.164-1.546 3.164-3.816 0-2.343-1.28-3.856-3.233-3.856zm-.435 6.135c-1.135 0-1.836-.845-1.836-2.222 0-1.425.749-2.295 1.884-2.295 1.111 0 1.763.894 1.763 2.271 0 1.425-.652 2.246-1.811 2.246z"/></svg>`;
  const lastfmIconUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(lastfmSvg);

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

  const lastfmPlatform = {
    type: "lastfm",
    name: "Last.fm",
    color: "#ba0000",
    icon: {
      lightPNG: lastfmIconUri,
      darkPNG: lastfmIconUri,
      whitePNG: lastfmIconUri,
      lightSVG: lastfmIconUri,
      darkSVG: lastfmIconUri,
      whiteSVG: lastfmIconUri,
    },
    enabled: true,
    hasMetadata: true,
    domains: ["last.fm"],
    getPlatformUserUrl: (account) => {
      const username = account?.name || account?.id || "";
      return `https://www.last.fm/user/${encodeURIComponent(username)}`;
    },
  };

  const customPlatforms = [toyhousePlatform, lastfmPlatform];

  const registerCustomPlatforms = (platforms) => {
    if (!platforms || platforms._customPlatformsRegistered) return;
    platforms._customPlatformsRegistered = true;

    // Grab array c if accessible via find/map
    let cArray;
    try {
      platforms.find((_, __, arr) => {
        if (Array.isArray(arr)) cArray = arr;
        return false;
      });
    } catch {}

    if (cArray) {
      for (const p of customPlatforms) {
        if (!cArray.some((existing) => existing.type === p.type)) {
          cArray.push(p);
        }
      }
    }

    const origGet = platforms.get?.bind(platforms);
    if (origGet) {
      platforms.get = (type) => {
        const found = customPlatforms.find((p) => p.type === type);
        return found ? found : origGet(type);
      };
    }

    const origIsSupported = platforms.isSupported?.bind(platforms);
    if (origIsSupported) {
      platforms.isSupported = (type) => (customPlatforms.some((p) => p.type === type) ? true : origIsSupported(type));
    }

    const origGetByUrl = platforms.getByUrl?.bind(platforms);
    if (origGetByUrl) {
      platforms.getByUrl = (url) => {
        if (typeof url === "string") {
          if (url.includes("toyhou.se")) return toyhousePlatform;
          if (url.includes("last.fm")) return lastfmPlatform;
        }
        return origGetByUrl(url);
      };
    }

    const origMap = platforms.map?.bind(platforms);
    if (origMap && !cArray) {
      platforms.map = (fn) => {
        const res = origMap(fn);
        for (const p of customPlatforms) {
          if (p.enabled) res.push(fn(p));
        }
        return res;
      };
    }

    const origFilter = platforms.filter?.bind(platforms);
    if (origFilter && !cArray) {
      platforms.filter = (fn) => {
        const res = origFilter(fn);
        for (const p of customPlatforms) {
          if (fn(p)) res.push(p);
        }
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

    registerCustomPlatforms(platforms);

    const enabled = await config;
    if (!enabled) return;

    if (enabled.toyhouse) {
      toyhousePlatform.enabled = !!enabled.toyhouse.enabled;
    }
    if (enabled.lastfm) {
      lastfmPlatform.enabled = !!enabled.lastfm.enabled;
    }

    platforms.map((platform) => {
      if (platform.enabled && !enabled[platform.type]?.enabled) platform.enabled = false;
      return platform;
    });
  }, 500);
})();
