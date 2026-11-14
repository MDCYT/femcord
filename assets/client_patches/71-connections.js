(() => {
  const minecraftWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><polygon points="12,2 22,7.5 12,13 2,7.5" fill="#ffffff"/><polygon points="2,7.5 12,13 12,22 2,16.5" fill="#ffffff" fill-opacity="0.8"/><polygon points="12,13 22,7.5 22,16.5 12,22" fill="#ffffff" fill-opacity="0.6"/></svg>`;
  const minecraftWhiteIconUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(minecraftWhiteSvg);
  const minecraftIconUri = "data:image/png;base64,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";
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

    if (provider === "minecraft" && !code) {
      document.title = "Vincular Minecraft - FemCord";
      const escapeHtml = (s) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const mountMinecraft = () => {
        let box = document.getElementById("connection-callback-box");
        if (!box) {
          box = document.createElement("div");
          box.id = "connection-callback-box";
          box.style.cssText =
            "position:fixed;top:0;left:0;width:100vw;height:100vh;background:#1e1f22;color:#f2f3f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;z-index:99999999;padding:20px;box-sizing:border-box;";
          (document.body || document.documentElement).appendChild(box);
        }
        const mcLogo = `<img src="${minecraftIconUri}" width="56" height="56" style="image-rendering:pixelated;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4));" alt="Minecraft" />`;

        let pollInterval = null;
        let countdownInterval = null;

        const renderForm = (initialUsername = "", errMsg = "") => {
          if (pollInterval) clearInterval(pollInterval);
          if (countdownInterval) clearInterval(countdownInterval);

          box.innerHTML = `
            <div style="background:#2b2d31;padding:36px 40px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:440px;width:100%;text-align:center;">
              <div style="display:flex;justify-content:center;margin-bottom:14px;position:relative;">
                ${mcLogo}
                <img id="mc-head-preview" src="https://mc-heads.net/avatar/${encodeURIComponent(initialUsername || "MHF_Steve")}/36" style="width:36px;height:36px;position:absolute;bottom:-6px;right:calc(50% - 34px);border-radius:4px;border:2px solid #2b2d31;image-rendering:pixelated;box-shadow:0 2px 6px rgba(0,0,0,0.6);" alt="Head" />
              </div>
              <h2 style="margin:0 0 8px 0;font-size:22px;color:#fff;font-weight:700;">Vincular Minecraft</h2>
              <p style="margin:0 0 20px 0;font-size:14px;color:#b5bac1;line-height:1.5;">
                Ingresa tu nombre de Minecraft Java Edition. Para verificar que la cuenta es tuya, FemCord encenderá un miniserver temporal al que deberás conectarte.
              </p>
              <form id="mc-link-form" style="display:flex;flex-direction:column;gap:14px;text-align:left;">
                <div>
                  <label style="display:block;font-size:12px;font-weight:700;color:#b5bac1;text-transform:uppercase;margin-bottom:8px;letter-spacing:0.02em;">
                    Usuario de Minecraft
                  </label>
                  <input id="mc-username-input" type="text" placeholder="Ej: Notch" maxlength="16" value="${initialUsername ? escapeHtml(initialUsername) : ""}" required autofocus
                    style="width:100%;box-sizing:border-box;padding:10px 12px;background:#1e1f22;border:1px solid #3f4147;border-radius:6px;color:#fff;font-size:15px;outline:none;" />
                  <div id="mc-error-msg" style="color:#ed4245;font-size:13px;margin-top:6px;${errMsg ? "" : "display:none;"}">${errMsg ? escapeHtml(errMsg) : ""}</div>
                </div>
                <button type="submit" id="mc-submit-btn" style="background:#52a535;color:#fff;border:none;padding:12px;border-radius:6px;font-weight:600;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;">
                  Iniciar Verificación
                </button>
              </form>
            </div>
          `;

          const input = document.getElementById("mc-username-input");
          const form = document.getElementById("mc-link-form");
          const submitBtn = document.getElementById("mc-submit-btn");
          const errorDiv = document.getElementById("mc-error-msg");

          if (input) {
            input.focus();
            let debounce = null;
            input.oninput = () => {
              if (errorDiv) errorDiv.style.display = "none";
              clearTimeout(debounce);
              const val = input.value.trim();
              if (val.length >= 2) {
                debounce = setTimeout(() => {
                  const preview = document.getElementById("mc-head-preview");
                  if (preview) preview.src = `https://mc-heads.net/avatar/${encodeURIComponent(val)}/36`;
                }, 350);
              }
            };
          }

          if (form) {
            form.onsubmit = async (e) => {
              e.preventDefault();
              const username = input.value.trim();
              if (!username) return;

              submitBtn.disabled = true;
              submitBtn.style.opacity = "0.7";
              submitBtn.textContent = "Iniciando servidor de verificación...";
              if (errorDiv) errorDiv.style.display = "none";

              let authToken = null;
              try {
                const raw = localStorage.getItem("token");
                if (raw) authToken = raw.replace(/^"|"$/g, "");
              } catch {}

              try {
                const res = await fetch("/api/v9/connections/minecraft/start", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(authToken ? { Authorization: authToken } : {}),
                  },
                  body: JSON.stringify({ username }),
                });

                if (!res.ok) {
                  let errText = "Error al iniciar verificación.";
                  try {
                    const data = await res.json();
                    if (data.message) errText = data.message;
                  } catch {}
                  renderForm(username, errText);
                  return;
                }

                const data = await res.json();
                renderWaiting(data.username, data.server, data.expiresAt);
              } catch (err) {
                renderForm(username, err?.message || String(err));
              }
            };
          }
        };

        const renderWaiting = (username, serverHost, expiresAt) => {
          let timeLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

          box.innerHTML = `
            <div style="background:#2b2d31;padding:32px 36px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:460px;width:100%;text-align:center;">
              <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:18px;">
                <img src="https://mc-heads.net/avatar/${encodeURIComponent(username)}/48" style="width:48px;height:48px;border-radius:8px;image-rendering:pixelated;box-shadow:0 4px 12px rgba(0,0,0,0.4);" alt="${escapeHtml(username)}" />
                <div style="text-align:left;">
                  <div style="font-weight:700;font-size:17px;color:#f2f3f5;">${escapeHtml(username)}</div>
                  <div style="font-size:12px;color:#57f287;display:flex;align-items:center;gap:5px;font-weight:600;">
                    <span style="display:inline-block;width:8px;height:8px;background:#57f287;border-radius:50%;box-shadow:0 0 8px #57f287;"></span>
                    Servidor activo en vivo
                  </div>
                </div>
              </div>

              <div style="background:#1e1f22;border:1px solid #3f4147;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#949ba4;margin-bottom:6px;font-weight:700;">IP del Servidor Minecraft</div>
                <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                  <code id="mc-server-ip" style="font-size:17px;font-weight:700;color:#5865f2;font-family:monospace;letter-spacing:0.5px;">${escapeHtml(serverHost)}</code>
                  <button id="mc-copy-btn" style="background:#35373c;color:#fff;border:1px solid #4e5058;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600;">Copiar IP</button>
                </div>
              </div>

              <div style="font-size:13px;color:#dbdee1;line-height:1.6;margin-bottom:18px;text-align:left;background:rgba(88,101,242,0.1);border-left:3px solid #5865f2;padding:12px 14px;border-radius:4px;">
                <strong>Instrucciones:</strong><br/>
                1. Abre tu Minecraft (cualquier versión).<br/>
                2. En <strong>Multijugador &gt; Conexión directa</strong>, entra a <code style="color:#5865f2;font-weight:700;">${escapeHtml(serverHost)}</code>.<br/>
                3. El servidor verificará tu cuenta con Mojang y se apagará automáticamente.
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#949ba4;margin-bottom:16px;">
                <span style="display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:12px;height:12px;border:2px solid #5865f2;border-top-color:transparent;border-radius:50%;animation:mc-spin 1s linear infinite;"></span>
                  Esperando tu conexión...
                </span>
                <span id="mc-timer" style="font-family:monospace;font-weight:700;color:#f2f3f5;font-size:13px;">03:00</span>
              </div>

              <button id="mc-cancel-btn" style="background:transparent;color:#ed4245;border:1px solid rgba(237,66,69,0.3);padding:9px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
                Cancelar verificación
              </button>
            </div>
            <style>
              @keyframes mc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          `;

          const copyBtn = document.getElementById("mc-copy-btn");
          if (copyBtn) {
            copyBtn.onclick = () => {
              try {
                navigator.clipboard.writeText(serverHost);
                copyBtn.textContent = "¡Copiado!";
                copyBtn.style.background = "#57f287";
                copyBtn.style.color = "#000";
                setTimeout(() => {
                  copyBtn.textContent = "Copiar IP";
                  copyBtn.style.background = "#35373c";
                  copyBtn.style.color = "#fff";
                }, 1500);
              } catch {}
            };
          }

          const cancelBtn = document.getElementById("mc-cancel-btn");
          if (cancelBtn) {
            cancelBtn.onclick = async () => {
              if (pollInterval) clearInterval(pollInterval);
              if (countdownInterval) clearInterval(countdownInterval);
              let authToken = null;
              try {
                const raw = localStorage.getItem("token");
                if (raw) authToken = raw.replace(/^"|"$/g, "");
              } catch {}
              try {
                await fetch("/api/v9/connections/minecraft/cancel", {
                  method: "POST",
                  headers: { ...(authToken ? { Authorization: authToken } : {}) },
                });
              } catch {}
              renderForm(username);
            };
          }

          const timerEl = document.getElementById("mc-timer");
          const updateTimer = () => {
            const min = Math.floor(timeLeft / 60);
            const sec = timeLeft % 60;
            if (timerEl) timerEl.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
          };
          updateTimer();

          countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
              clearInterval(countdownInterval);
              clearInterval(pollInterval);
              renderForm(username, "El tiempo de verificación expiró y el servidor se apagó. Inténtalo de nuevo.");
            } else {
              updateTimer();
            }
          }, 1000);

          let authToken = null;
          try {
            const raw = localStorage.getItem("token");
            if (raw) authToken = raw.replace(/^"|"$/g, "");
          } catch {}

          pollInterval = setInterval(async () => {
            try {
              const res = await fetch("/api/v9/connections/minecraft/status", {
                headers: { ...(authToken ? { Authorization: authToken } : {}) },
              });
              if (!res.ok) return;
              const status = await res.json();
              if (status.verified) {
                clearInterval(pollInterval);
                clearInterval(countdownInterval);
                renderBox(
                  `<div style="display:flex;justify-content:center;margin-bottom:12px;"><img src="https://mc-heads.net/avatar/${encodeURIComponent(status.username || username)}/64" style="width:64px;height:64px;border-radius:10px;image-rendering:pixelated;box-shadow:0 4px 16px rgba(0,0,0,0.5);" /></div>`,
                  "¡Cuenta verificada exitosamente!",
                  `Tu cuenta de Minecraft "${status.username || username}" se ha vinculado a FemCord. Esta ventana se cerrará automáticamente.`,
                  false
                );
                try {
                  if (window.opener) {
                    window.opener.postMessage({ type: "CONNECTION_CALLBACK", provider: "minecraft" }, "*");
                  }
                } catch {}
                setTimeout(() => {
                  try { window.close(); } catch {}
                }, 2000);
              } else if (status.expired) {
                clearInterval(pollInterval);
                clearInterval(countdownInterval);
                renderForm(username, "El tiempo expiró. Haz clic para reintentar.");
              }
            } catch {}
          }, 1200);
        };

        renderForm();
      };

      if (document.body || document.documentElement) {
        mountMinecraft();
      } else {
        window.addEventListener("DOMContentLoaded", mountMinecraft);
      }
      return;
    }

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

// minecraftIconUri and minecraftWhiteIconUri defined at top level

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

  const minecraftPlatform = {
    type: "minecraft",
    name: "Minecraft",
    color: "#5db334",
    icon: {
      lightPNG: minecraftIconUri,
      darkPNG: minecraftIconUri,
      whitePNG: minecraftWhiteIconUri,
      lightSVG: minecraftIconUri,
      darkSVG: minecraftIconUri,
      whiteSVG: minecraftWhiteIconUri,
    },
    enabled: true,
    hasMetadata: false,
    domains: ["namemc.com", "minecraft.net"],
    getPlatformUserUrl: (account) => {
      const username = account?.name || account?.id || "";
      return `https://namemc.com/profile/${encodeURIComponent(username)}`;
    },
  };

  const customPlatforms = [toyhousePlatform, lastfmPlatform, minecraftPlatform];

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
          if (url.includes("namemc.com") || url.includes("minecraft.net")) return minecraftPlatform;
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

      // Inject Minecraft skin head next to Minecraft connection names in user profiles & connection settings
      const candidateContainers = document.querySelectorAll(
        'div[class*="connectedAccountContainer"], div[class*="connectedAccount_"], div[class*="connectedAccount__"], div[class*="connection__"], div[class*="connectionContainer__"], a[href*="namemc.com"]'
      );

      for (const container of candidateContainers) {
        // Detect if this container belongs to Minecraft
        const img = container.querySelector("img");
        const isMinecraft =
          (img &&
            (img.alt === "Minecraft" ||
              img.title === "Minecraft" ||
              (img.src && (img.src.includes("minecraft") || img.src.startsWith(minecraftIconUri.slice(0, 50)))))) ||
          container.querySelector('a[href*="namemc.com"], a[href*="minecraft.net"]') ||
          (container.href && (container.href.includes("namemc.com") || container.href.includes("minecraft.net"))) ||
          container.querySelector('polygon[points*="12,2"]') ||
          (container.querySelector('[class*="connectionHeader_"], [class*="connectionAccountLabel_"]') &&
            container.textContent.includes("Minecraft"));

        if (!isMinecraft) continue;

        // Extract the Minecraft username
        let username = null;
        const anchor = container.tagName === "A" ? container : container.querySelector('a[href*="namemc.com/profile/"]');
        if (anchor && anchor.href) {
          const m = anchor.href.match(/namemc\.com\/profile\/([^/?#]+)/i);
          if (m) username = decodeURIComponent(m[1]).trim();
        }

        const nameElem = container.querySelector(
          'div[class*="connectedAccountName_"], div[class*="connectedAccountNameText_"], div[class*="connectionAccountValue_"], div[class*="accountValue_"]'
        );

        if (!username && nameElem) {
          const raw = nameElem.textContent.trim();
          const m = raw.match(/[a-zA-Z0-9_]{2,16}/);
          if (m) username = m[0];
        }

        if (!username) {
          const nameContainer = container.querySelector('div[class*="connectedAccountNameContainer"]');
          if (nameContainer) {
            const raw = nameContainer.textContent.trim();
            const m = raw.match(/[a-zA-Z0-9_]{2,16}/);
            if (m) username = m[0];
          }
        }

        if (!username) continue;

        const nameRow =
          container.querySelector('div[class*="connectedAccountName_"]:not([class*="connectedAccountNameContainer"])') ||
          container.querySelector('div[class*="connectedAccountName_"]') ||
          container.querySelector('[class*="connectedAccountNameContainer"] > div');

        // If skin head already exists, ensure it is in the correct position
        const existingHead = container.querySelector(".mc-skin-head");
        if (existingHead) {
          if (nameRow && existingHead.parentElement !== nameRow) {
            existingHead.remove();
          } else {
            if (existingHead.alt !== username) {
              existingHead.src = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/18`;
              existingHead.alt = username;
              existingHead.title = `Skin de ${username}`;
            }
            continue;
          }
        }

        // Create the head avatar element
        const headImg = document.createElement("img");
        headImg.className = "mc-skin-head";
        headImg.src = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/18`;
        headImg.alt = username;
        headImg.title = `Skin de ${username}`;
        headImg.style.cssText =
          "width:18px;height:18px;border-radius:3px;margin:0 4px 0 6px;vertical-align:middle;display:inline-block;image-rendering:pixelated;image-rendering:crisp-edges;box-shadow:0 1px 3px rgba(0,0,0,0.5);flex-shrink:0;cursor:pointer;";
        headImg.onerror = () => {
          headImg.style.display = "none";
        };

        const nameTextContainer = container.querySelector(
          'div[class*="connectedAccountNameTextContainer_"]'
        );

        if (nameTextContainer) {
          nameTextContainer.style.flex = "0 0 auto";
          nameTextContainer.style.width = "auto";
          nameTextContainer.style.maxWidth = "none";
        }

        if (nameRow) {
          nameRow.style.display = "flex";
          nameRow.style.flexDirection = "row";
          nameRow.style.alignItems = "center";
          nameRow.style.flexWrap = "nowrap";

          const openLink = nameRow.querySelector('a, svg[class*="connectedAccountOpenIcon"], svg');
          const anchor = openLink ? (openLink.closest("a") || openLink) : null;

          if (anchor && anchor.parentNode === nameRow) {
            nameRow.insertBefore(headImg, anchor);
          } else if (nameTextContainer && nameTextContainer.parentNode === nameRow) {
            if (nameTextContainer.nextSibling) {
              nameRow.insertBefore(headImg, nameTextContainer.nextSibling);
            } else {
              nameRow.appendChild(headImg);
            }
          } else {
            nameRow.appendChild(headImg);
          }
        } else {
          const settingsAccountValue = container.querySelector(
            'div[class*="connectionAccountValue_"], div[class*="accountValue_"]'
          );
          if (settingsAccountValue) {
            settingsAccountValue.style.display = "inline-flex";
            settingsAccountValue.style.alignItems = "center";
            settingsAccountValue.style.gap = "6px";
            settingsAccountValue.appendChild(headImg);
          } else {
            const leaf = Array.from(container.querySelectorAll("*")).find(
              (el) => el.children.length === 0 && el.textContent.trim() === username
            );
            if (leaf && leaf.parentNode) {
              leaf.parentNode.style.display = "inline-flex";
              leaf.parentNode.style.alignItems = "center";
              leaf.after(headImg);
            } else {
              container.appendChild(headImg);
            }
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
    if (enabled.minecraft) {
      minecraftPlatform.enabled = !!enabled.minecraft.enabled;
    }

    platforms.map((platform) => {
      if (platform.enabled && !enabled[platform.type]?.enabled) platform.enabled = false;
      return platform;
    });
  }, 500);
})();
