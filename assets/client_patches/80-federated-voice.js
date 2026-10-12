(() => {
  const NativeSocket = window.WebSocket;
  const NativeConnection = window.RTCPeerConnection;
  if (!NativeSocket || !NativeConnection) return;
  const sockets = new Map();
  const relayed = new WeakMap();
  const federated = (url) => {
    try {
      return new URL(String(url), location.href).pathname.startsWith("/federated-voice");
    } catch {
      return false;
    }
  };
  window.WebSocket = new Proxy(NativeSocket, {
    construct(target, args) {
      const socket = new target(...args);
      if (!federated(args[0])) return socket;
      sockets.set(socket, null);
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string" || !event.data.includes("meowcord_relay")) return;
        try {
          const message = JSON.parse(event.data);
          if (message.op === 2 && message.d?.meowcord_relay) sockets.set(socket, message.d.meowcord_relay);
        } catch {}
      });
      socket.addEventListener("close", () => sockets.delete(socket));
      return socket;
    },
  });
  const relayFor = () => {
    const open = [...sockets].filter(([socket]) => socket.readyState <= NativeSocket.OPEN);
    if (!open.length) return null;
    const credentials = open.map(([, value]) => value).filter(Boolean).at(-1);
    return {
      iceServers: credentials
        ? [{ urls: credentials.urls, username: credentials.username, credential: credentials.credential }]
        : [],
      iceTransportPolicy: "relay",
    };
  };
  window.RTCPeerConnection = new Proxy(NativeConnection, {
    construct(target, [config, ...rest]) {
      const relay = relayFor();
      const connection = new target(relay ? { ...(config ?? {}), ...relay } : config, ...rest);
      if (relay) relayed.set(connection, relay);
      return connection;
    },
  });
  const setConfiguration = NativeConnection.prototype.setConfiguration;
  NativeConnection.prototype.setConfiguration = function (config) {
    const relay = relayed.get(this);
    return setConfiguration.call(this, relay ? { ...(config ?? {}), ...relay } : config);
  };
})();
