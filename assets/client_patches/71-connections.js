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

  const lastfmSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#d51007" d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z"/></svg>`;
  const lastfmWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="#ffffff" d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z"/></svg>`;
  const lastfmWhiteIconUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(lastfmWhiteSvg);
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
    color: "#d51007",
    icon: {
      lightPNG: lastfmIconUri,
      darkPNG: lastfmIconUri,
      whitePNG: lastfmWhiteIconUri,
      lightSVG: lastfmIconUri,
      darkSVG: lastfmIconUri,
      whiteSVG: lastfmWhiteIconUri,
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

  // Enable rich presence status toggle ("Display Last.fm as your status")
  const enableStatusToggle = () => {
    if (!require) return false;
    let ok = false;
    try {
      const m = require("652215");
      if (m?.ewM instanceof Set) {
        m.ewM.add("lastfm");
        ok = true;
      }
    } catch {}
    if (require.c) {
      for (const id in require.c) {
        try {
          const exp = require.c[id]?.exports;
          if (exp?.ewM instanceof Set) {
            exp.ewM.add("lastfm");
            ok = true;
          }
        } catch {}
      }
    }
    return ok;
  };

  // Support direct and mp: URLs in getAssetImage and Spotify IMAGE for listening activity
  const patchAssetUtils = () => {
    if (!require) return false;
    try {
      const mod = require("970928");
      if (mod && typeof mod.uD === "function" && !mod.uD._lastfmPatched) {
        const origUD = mod.uD;
        mod.uD = function (appId, assetId, size) {
          if (typeof assetId === "string") {
            if (assetId.startsWith("mp:")) return assetId.slice(3);
            if (assetId.startsWith("https://") || assetId.startsWith("http://")) return assetId;
          }
          return origUD.apply(this, arguments);
        };
        mod.uD._lastfmPatched = true;
      }
    } catch {}
    if (require.c) {
      for (const id in require.c) {
        try {
          const exp = require.c[id]?.exports;
          if (exp && typeof exp.uD === "function" && !exp.uD._lastfmPatched) {
            const origUD = exp.uD;
            exp.uD = function (appId, assetId, size) {
              if (typeof assetId === "string") {
                if (assetId.startsWith("mp:")) return assetId.slice(3);
                if (assetId.startsWith("https://") || assetId.startsWith("http://")) return assetId;
              }
              return origUD.apply(this, arguments);
            };
            exp.uD._lastfmPatched = true;
          }
          if (exp && typeof exp.IMAGE === "function" && !exp.IMAGE._lastfmPatched) {
            const origImage = exp.IMAGE;
            exp.IMAGE = function (e) {
              if (typeof e === "string") {
                if (e.startsWith("http://") || e.startsWith("https://")) return e;
                if (e.startsWith("mp:")) return e.slice(3);
              }
              return origImage(e);
            };
            exp.IMAGE._lastfmPatched = true;
          }
        } catch {}
      }
    }
    return false;
  };

  // Intercept chunk loading to patch module 598493 for native metadata chips
  const patchModule598493 = (modules) => {
    if (!modules || !modules["598493"] || modules["598493"]._lastfmPatched) return;
    const orig = modules["598493"];
    const fnStr = orig.toString();
    const target = 'case I.fg2.TIKTOK:n=(0,xk.HU)(t,pr.Nz)';
    if (!fnStr.includes(target)) return;
    const replacement =
      target +
      ';break;case"lastfm":n=t.scrobbles!=null?[(0,S.jsx)("div",{className:pr.Nz,children:(0,S.jsx)(Q.E,{variant:"text-xxs/normal",color:"text-default",children:(0,S.jsxs)("span",{children:[Number(t.scrobbles).toLocaleString()," scrobbles"]})})},"scrobbles")]:[]';
    try {
      const paramMatch = fnStr.match(/^[a-zA-Z0-9_$]*\s*\(([a-zA-Z0-9_$,\s]*)\)\s*\{/);
      const params = paramMatch ? paramMatch[1].split(",").map((s) => s.trim()) : ["e", "t", "n"];
      const body = fnStr.replace(/^[a-zA-Z0-9_$]*\s*\([a-zA-Z0-9_$,\s]*\)\s*\{/, "").replace(/\}$/, "");
      const patchedBody = body.replace(target, replacement);
      const patchedFn = new Function(...params, patchedBody);
      patchedFn._lastfmPatched = true;
      modules["598493"] = patchedFn;
    } catch (e) {
      console.warn("[71-connections] Error patching 598493:", e);
    }
  };

  try {
    const origPush = window.webpackChunkdiscord_app.push.bind(window.webpackChunkdiscord_app);
    window.webpackChunkdiscord_app.push = function (chunk) {
      try {
        if (chunk && chunk[1]) {
          patchModule598493(chunk[1]);
        }
      } catch {}
      return origPush(chunk);
    };
  } catch {}

  // Mutation observer to guarantee Scrobbles chip is displayed in connection settings
  const observeConnectionsDOM = () => {
    const observer = new MutationObserver(() => {
      // Also inject scrobbles chip in "Edit Connection Details" modal (e.g. member-since container)
      const modals = document.querySelectorAll('div[class*="modal_"], div[class*="focusLock_"], div[role="dialog"]');
      for (const modal of modals) {
        if (!modal.textContent.includes("Last.fm") && !modal.querySelector('svg path[d*="10.584"]')) continue;
        const memberSinceElem = modal.querySelector('div[class*="memberSince_"], div[class*="pr-M4"], span[class*="pr-M4"]');
        const container = memberSinceElem?.parentElement || modal.querySelector('div[class*="connectionContainer__"], div[class*="connectedAccount__"]');
        if (container && !container.querySelector(".lastfm-scrobbles-chip")) {
          let scrobbles = null;
          try {
            const accountStore = Object.values(require?.c ?? {})
              .map((m) => m?.exports?.default ?? m?.exports)
              .find((e) => typeof e?.getAccounts === "function");
            if (accountStore) {
              const accounts = accountStore.getAccounts() || [];
              const lastfmAcc = accounts.find((a) => a.type === "lastfm");
              if (lastfmAcc?.metadata?.scrobbles != null) {
                scrobbles = Number(lastfmAcc.metadata.scrobbles);
              }
            }
          } catch {}
          if (scrobbles != null) {
            const chip = document.createElement("div");
            chip.className = "metadataItem__41de9 lastfm-scrobbles-chip";
            chip.style.cssText =
              "align-self:center;margin-top:0!important;margin-right:8px;background:rgba(255,255,255,0.07);padding:2px 8px;border-radius:12px;font-size:12px;font-weight:500;color:#f2f3f5;display:inline-flex;align-items:center;gap:4px;";
            chip.innerHTML = `🎵 <strong>${scrobbles.toLocaleString()}</strong> scrobbles`;
            if (memberSinceElem) {
              container.insertBefore(chip, memberSinceElem);
            } else {
              container.appendChild(chip);
            }
          }
        }
      }

      enableStatusToggle();
      patchAssetUtils();

      const connectionCards = document.querySelectorAll('div[class*="connection__"]');
      for (const card of connectionCards) {
        const isLastfm =
          card.querySelector('svg path[fill="#ba0000"]') ||
          card.textContent.includes("Last.fm") ||
          card.innerHTML.includes("last.fm");
        if (!isLastfm) continue;

        const metadataContainer = card.querySelector('div[class*="metadataContainer__"]');
        if (!metadataContainer) continue;

        // If scrobbles chip already present, continue
        if (metadataContainer.querySelector(".lastfm-scrobbles-chip")) continue;

        let scrobbles = null;
        try {
          const accountStore = Object.values(require?.c ?? {})
            .map((m) => m?.exports?.default ?? m?.exports)
            .find((e) => typeof e?.getAccounts === "function");
          if (accountStore) {
            const accounts = accountStore.getAccounts() || [];
            const lastfmAcc = accounts.find((a) => a.type === "lastfm");
            if (lastfmAcc?.metadata?.scrobbles != null) {
              scrobbles = Number(lastfmAcc.metadata.scrobbles);
            }
          }
        } catch {}

        if (scrobbles != null) {
          // Hide "NEW Add connection details" banner if visible
          const upsellTag = metadataContainer.querySelector('div[class*="connectionMetadataUpsellTag__"]');
          const upsellDesc = metadataContainer.querySelector(
            'div[class*="connectionMetadataUpsellDescription__"], span[class*="connectionMetadataUpsellDescription__"]'
          );
          if (upsellTag) upsellTag.style.display = "none";
          if (upsellDesc) upsellDesc.style.display = "none";

          const createdAt = metadataContainer.querySelector(
            'div[class*="connectedAccountVanityMetadataCreatedAt__"]'
          );
          const refreshBtn = metadataContainer.querySelector('div[class*="metadataRefreshButton__"]');

          const chip = document.createElement("div");
          chip.className = "metadataItem__41de9 lastfm-scrobbles-chip";
          chip.style.cssText =
            "align-self:center;margin-top:0!important;margin-right:8px;background:rgba(255,255,255,0.07);padding:2px 8px;border-radius:12px;font-size:12px;font-weight:500;color:#f2f3f5;display:inline-flex;align-items:center;gap:4px;";
          chip.innerHTML = `🎵 <strong>${scrobbles.toLocaleString()}</strong> scrobbles`;

          if (createdAt) {
            metadataContainer.insertBefore(chip, createdAt);
          } else if (refreshBtn) {
            metadataContainer.insertBefore(chip, refreshBtn);
          } else {
            metadataContainer.appendChild(chip);
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  if (document.body || document.documentElement) {
    observeConnectionsDOM();
  } else {
    window.addEventListener("DOMContentLoaded", observeConnectionsDOM);
  }

  const config = fetch(
    `${window.GLOBAL_ENV?.API_ENDPOINT ?? "/api"}/v${window.GLOBAL_ENV?.API_VERSION ?? 9}/connections`,
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  let attempts = 0;
  const timer = setInterval(async () => {
    enableStatusToggle();
    patchAssetUtils();
    if (require?.m) {
      patchModule598493(require.m);
    }

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
