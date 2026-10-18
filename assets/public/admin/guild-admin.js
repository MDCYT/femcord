"use strict";

const TIMEOUT_CHOICES = [
  [60, "60 seconds"],
  [300, "5 minutes"],
  [600, "10 minutes"],
  [3600, "1 hour"],
  [86400, "1 day"],
  [604800, "1 week"],
  [2419200, "28 days"],
];

const GUILD_SECTIONS = {};

function bindGuildSections(body, guild, open) {
  for (const details of $$("details[data-section]", body)) {
    let loaded = false;
    const load = () => {
      if (!details.open || loaded) return;
      loaded = true;
      GUILD_SECTIONS[details.dataset.section]?.($("[data-section-body]", details), guild);
    };
    details.addEventListener("toggle", load);
    if (details.dataset.section === open) {
      details.open = true;
      load();
    }
  }
}

function cursorSection(target, { label, placeholder, path, key, row, bind, empty, noMatch, more }) {
  const state = { q: "", next: null, items: [], generation: 0 };
  mount(
    target,
    html`
      <label class="list-search">${label}<input type="search" data-search placeholder="${placeholder}" autocomplete="off" spellcheck="false" /></label>
      <p class="muted list-status" data-status role="status" aria-live="polite">Loading…</p>
      <div class="resource-list" data-rows></div>
      <div class="form-actions" data-more-row hidden><button class="btn" type="button" data-more>${more}</button></div>
    `,
  );
  const rows = $("[data-rows]", target);
  const status = $("[data-status]", target);
  const search = $("[data-search]", target);
  const draw = (total) => {
    status.textContent =
      total == null
        ? `${fmtNumber(state.items.length)}${state.next ? "+" : ""} ${state.items.length === 1 && !state.next ? "match" : "matches"}`
        : `${fmtNumber(state.items.length)} of ${fmtNumber(total)} shown`;
    $("[data-more-row]", target).hidden = !state.next;
    if (state.items.length) {
      mount(rows, state.items.map(row));
      bind(rows, state.items, reload);
      return;
    }
    const emptyState = state.q ? noMatch : empty;
    mount(
      rows,
      html`<div class="empty-state"><p class="muted">${emptyState.text}</p>${emptyState.action ? html`<button class="btn small" type="button" data-empty-action>${emptyState.action}</button>` : ""}</div>`,
    );
    $("[data-empty-action]", rows)?.addEventListener("click", () => {
      if (state.q) {
        search.value = "";
        state.q = "";
        reload();
        search.focus();
        return;
      }
      emptyState.run?.(target);
    });
  };
  const fetchPage = async (after) => {
    const generation = ++state.generation;
    const params = new URLSearchParams({ limit: "50" });
    if (state.q) params.set("q", state.q);
    if (after) params.set("after", after);
    status.textContent = "Loading…";
    try {
      const data = await api(`${path}?${params}`);
      if (generation !== state.generation || !target.isConnected) return;
      state.items = after ? [...state.items, ...data[key]] : data[key];
      state.next = data.next;
      draw(data.total);
    } catch (error) {
      if (generation !== state.generation || error.status === 499 || error.status === 401) return;
      status.textContent = error.message;
    }
  };
  const reload = () => fetchPage(null);
  search.addEventListener(
    "input",
    debounce(() => {
      state.q = search.value.trim();
      reload();
    }),
  );
  $("[data-more]", target).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const before = state.items.length;
    await fetchPage(state.next);
    button.disabled = false;
    $$("[data-row]", rows)[before]?.focus();
  });
  reload();
  return { reload, focus: () => search.focus() };
}

const memberName = (member) => member.nick || userName(member.user);
const timedOutUntil = (member) =>
  member.communication_disabled_until && new Date(member.communication_disabled_until).getTime() > Date.now() ? member.communication_disabled_until : null;

GUILD_SECTIONS.members = (target, guild) => {
  const rolesRequest = api(`/admin/guilds/${guild.id}/roles`).catch(() => ({ roles: [] }));
  cursorSection(target, {
    label: "Find members",
    placeholder: "Search names, nicknames or IDs",
    path: `/admin/guilds/${guild.id}/members`,
    key: "members",
    more: "Load more members",
    empty: { text: "This server has no members yet." },
    noMatch: { text: "No members match this search.", action: "Clear search" },
    row: (member) => html`<button class="resource-row" type="button" data-row data-member="${member.id}">
      ${avatar(member.user)}
      <strong>${memberName(member)}<span class="muted"> @${member.user.username}</span></strong>
      ${member.owner ? html`<span class="badge accent">Owner</span>` : ""}
      ${timedOutUntil(member) ? html`<span class="badge warn">Timed out</span>` : ""}
      ${member.protected ? html`<span class="badge">Staff above you</span>` : ""}
      <span class="muted">Manage</span>
    </button>`,
    bind: (rows, members, reload) => {
      for (const button of $$("[data-member]", rows))
        button.addEventListener("click", async () =>
          openAdminMember(guild, members.find((member) => member.id === button.dataset.member), (await rolesRequest).roles, reload),
        );
    },
  });
};

function openAdminMember(guild, member, roles) {
  const until = timedOutUntil(member);
  const assignable = roles.filter((role) => role.id !== guild.id);
  const locked = member.protected;
  const body = openDrawer(
    `Manage ${memberName(member)}`,
    html`
      <div class="ident">
        ${avatar(member.user, "large")}
        <div>
          <h2>${memberName(member)}</h2>
          <span class="muted">@${member.user.username} in ${guild.name}</span>
        </div>
      </div>
      ${locked ? html`<p class="notice">This account is staff at or above your level, so you can't change its membership.</p>` : ""}
      <div class="card">
        <div class="list">
          <div class="list-item"><span class="grow muted">Joined</span><span>${fmtDate(member.joined_at)}</span></div>
          <div class="list-item"><span class="grow muted">User ID</span><code>${member.user.id}</code></div>
          ${member.owner ? html`<div class="list-item"><span class="grow muted">Role</span><span>Server owner</span></div>` : ""}
        </div>
        ${state.overview.access.users ? html`<div class="form-actions"><button class="btn" type="button" data-open-account>Open account</button></div>` : ""}
      </div>
      <form class="card stack" id="member-form">
        <h3>Nickname and roles</h3>
        <label>Nickname<span class="hint">Up to 32 characters. Leave empty to show their display name.</span><input name="nick" maxlength="32" value="${member.nick ?? ""}" autocomplete="off" /></label>
        <fieldset class="stack">
          <legend>Roles</legend>
          ${
            assignable.length
              ? html`<div class="checks">${assignable.map(
                  (role) =>
                    html`<label class="toggle"><input type="checkbox" data-role="${role.id}" ${member.roles.includes(role.id) ? raw("checked") : ""} ${role.managed ? raw("disabled") : ""} /><span>${role.name}${role.managed ? " (managed by an integration)" : ""}</span></label>`,
                )}</div>`
              : html`<p class="muted">This server has no roles besides everyone. Create one under Manage channels and roles.</p>`
          }
        </fieldset>
        <div class="form-actions"><button class="btn primary" type="submit" ${locked ? raw("disabled") : ""}>Save member</button></div>
      </form>
      <form class="card stack" id="member-timeout">
        <h3>Timeout</h3>
        ${
          until
            ? html`<p class="muted">Timed out until ${fmtDate(until)}. They can read the server but can't send messages, react or join voice.</p>`
            : html`<p class="muted">A timed out member can read the server but can't send messages, react or join voice.</p>
                <label>Length<select name="seconds">${options(TIMEOUT_CHOICES, 3600)}</select></label>`
        }
        <label>Reason<span class="hint">Saved in the server's audit log.</span><input name="reason" maxlength="512" autocomplete="off" /></label>
        <div class="form-actions">
          <button class="btn ${until ? "" : "primary"}" type="submit" ${locked || member.owner ? raw("disabled") : ""}>${until ? "End timeout" : "Time out member"}</button>
        </div>
      </form>
      <form class="card danger-zone stack" id="member-remove">
        <h3>Remove from server</h3>
        <p class="muted">Removing someone lets them join again with an invite.</p>
        <label>Reason<span class="hint">Saved in the server's audit log.</span><input name="reason" maxlength="512" autocomplete="off" /></label>
        <div class="form-actions">
          <button class="btn danger" type="button" data-kick ${locked || member.owner ? raw("disabled") : ""}>Remove from server</button>
        </div>
        ${member.owner ? html`<p class="muted">Transfer the server to someone else before removing its owner.</p>` : ""}
      </form>
      <div class="form-actions"><button class="btn" type="button" data-return-server>Back to server</button></div>
    `,
  );
  if (!body) return;
  const back = () => openGuild(guild.id, undefined, "members");
  $("[data-return-server]", body).addEventListener("click", back);
  $("[data-open-account]", body)?.addEventListener("click", () => openUser(member.user.id));
  $("#member-form", body).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const saved = await act(
      $("button[type=submit]", form),
      () =>
        api(`/admin/guilds/${guild.id}/members/${member.id}`, {
          method: "PATCH",
          body: {
            nick: form.nick.value.trim() || null,
            roles: $$("[data-role]", form)
              .filter((box) => box.checked)
              .map((box) => box.dataset.role),
          },
        }),
      "Member saved",
    );
    if (saved) back();
  });
  $("#member-timeout", body).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const end = until ? null : new Date(Date.now() + Number(form.seconds.value) * 1000).toISOString();
    const saved = await act(
      $("button[type=submit]", form),
      () =>
        api(`/admin/guilds/${guild.id}/members/${member.id}`, {
          method: "PATCH",
          body: { communication_disabled_until: end },
          reason: form.reason.value.trim(),
        }),
      until ? "Timeout ended" : `${memberName(member)} is timed out`,
    );
    if (saved) back();
  });
  const removal = $("#member-remove", body);
  $("[data-kick]", removal).addEventListener("click", async (event) => {
    if (!(await confirmDialog({ title: `Remove ${memberName(member)} from ${guild.name}?`, message: "They can join again with an invite.", confirm: "Remove member" }))) return;
    const done = await act(
      event.currentTarget,
      () => api(`/admin/guilds/${guild.id}/members/${member.id}`, { method: "DELETE", reason: removal.reason.value.trim() }),
      `${memberName(member)} was removed`,
    );
    if (done !== undefined) back();
  });
}
