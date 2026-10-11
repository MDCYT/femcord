(() => {
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
