"use strict";

const AUTOMOD_RULES = [
  ["hard_r", "Slur (hard R)"],
  ["soft_a", "Slur (soft A)"],
  ["word", "Word list"],
  ["name_blocklist", "Blocked name word"],
  ["ip_limit", "Per-IP signup limit"],
  ["everyone_spam", "@everyone spam"],
  ["mention_spam", "Mass mentions"],
  ["flood", "Message flood"],
  ["duplicate", "Repeated content"],
  ["link_spam", "Link and invite spam"],
  ["new_account_burst", "New account burst"],
  ["join_raid", "Join raid"],
  ["mention_raid", "Mention raid"],
  ["dm_raid", "DM raid"],
];
const RAID_RULES = new Set(["everyone_spam", "mention_spam", "flood", "duplicate", "link_spam", "new_account_burst", "join_raid", "mention_raid", "dm_raid"]);
const AUTOMOD_ACTIONS = [
  ["suspend", "Suspended"],
  ["delete", "Message deleted"],
  ["block", "Blocked"],
  ["log", "Logged"],
  ["timeout", "Timed out"],
  ["disable", "Disabled"],
  ["federation_block", "Blocked from federating"],
  ["ban", "IP banned"],
];
const SPAM_ACTIONS = [
  ["log", "Log only"],
  ["delete", "Delete the messages"],
  ["timeout", "Delete and time out"],
  ["suspend", "Delete and suspend the account"],
  ["disable", "Delete and disable the account"],
];
const SPAM_RULES = [
  {
    key: "everyone",
    title: "@everyone and @here spam",
    about:
      "Counts @everyone and @here pings per account. Attempts without the permission count against a lower limit than pings that go through. Members who can manage the server and pings in DMs are never counted.",
    fields: [
      ["unpermittedLimit", "Attempts without permission", "Act when an account reaches this many.", 1, 1000],
      ["permittedLimit", "Pings with permission", "Act when an account reaches this many.", 1, 1000],
      ["windowSeconds", "Counted over", "Seconds", 1, 86400],
    ],
  },
  {
    key: "mentions",
    title: "Mass mentions",
    about: "Counts user and role mentions in one message and across messages. Members who can manage the server are exempt.",
    fields: [
      ["messageLimit", "Mentions in one message", "", 1, 1000],
      ["windowLimit", "Mentions across messages", "Inside the window.", 1, 10000],
      ["windowSeconds", "Window", "Seconds", 1, 86400],
    ],
  },
  {
    key: "flood",
    title: "Message flood",
    about: "Stops an account that sends many messages quickly or posts in many channels in a short time.",
    fields: [
      ["messageLimit", "Messages", "Inside the message window.", 2, 1000],
      ["windowSeconds", "Message window", "Seconds", 1, 86400],
      ["channelLimit", "Channels", "Inside the channel window.", 2, 1000],
      ["channelWindowSeconds", "Channel window", "Seconds", 1, 86400],
    ],
  },
  {
    key: "duplicates",
    title: "Repeated content",
    about:
      "Catches the same or nearly the same text posted in many channels by one account, or by many accounts at once. Comparing ignores case, spacing, numbers, look-alike letters and the path of links.",
    fields: [
      ["minLength", "Shortest text checked", "Characters", 1, 2000],
      ["channelLimit", "Channels for one account", "", 2, 1000],
      ["accountLimit", "Accounts sending the same text", "", 2, 1000],
      ["windowSeconds", "Window", "Seconds", 1, 86400],
    ],
  },
  {
    key: "links",
    title: "Link and invite spam",
    about: "Limits how many invites and links an account can post. Accounts older than the exemption age are not checked.",
    fields: [
      ["inviteLimit", "Invite links", "Inside the window.", 1, 1000],
      ["linkLimit", "Other links", "Inside the window.", 1, 1000],
      ["windowSeconds", "Window", "Seconds", 1, 86400],
    ],
  },
  {
    key: "burst",
    title: "New account burst",
    about: "Catches several new accounts posting the same text inside the window. Only accounts younger than the age below count.",
    fields: [
      ["accountLimit", "Accounts", "", 2, 1000],
      ["minLength", "Shortest text checked", "Characters", 1, 2000],
      ["windowSeconds", "Window", "Seconds", 1, 86400],
    ],
    ageLabel: "Counts accounts younger than",
  },
];
const RAID_SETTINGS = [
  ["raidJoinThreshold", "Joins that count as a raid", "Joins to one server inside the join window. 0 turns this off.", 0, 100000],
  ["raidJoinWindowSeconds", "Join window", "Seconds", 10, 86400],
  ["raidNewAccountJoinThreshold", "New account joins that count as a raid", "Inside the join window. 0 turns this off.", 0, 100000],
  ["raidNewAccountHours", "New account age", "Hours. Accounts younger than this count as new.", 1, 8760],
  ["raidInviteJoinThreshold", "Joins through one invite", "Inside the join window. 0 turns this off.", 0, 100000],
  ["raidPauseInvitesMinutes", "Pause invites for", "Minutes after a join raid. 0 only raises the alert.", 0, 1440],
  ["dmRaidThreshold", "Members starting DMs with other members", "Accounts inside the DM window. 0 turns this off.", 0, 100000],
  ["dmRaidWindowSeconds", "DM window", "Seconds", 10, 86400],
  ["dmRaidPauseDmsMinutes", "Disable DMs for", "Minutes after a DM raid. 0 only raises the alert.", 0, 1440],
  ["mentionRaidThreshold", "Accounts sending mention spam", "Accounts inside the mention window. 0 turns this off.", 0, 100000],
  ["mentionRaidWindowSeconds", "Mention window", "Seconds", 10, 86400],
];
const INCIDENT_ACTIONS = [
  ["delete_messages", "Delete messages", "Delete every message sent by"],
  ["suspend", "Suspend", "Suspend"],
  ["disable", "Disable", "Disable"],
  ["ban_ip", "Ban IP addresses", "Ban the IP addresses of"],
];
const AUTOMOD_LIST_ACTIONS = [
  ["delete", "Delete the message"],
  ["suspend", "Delete the message and suspend the account"],
  ["name", "Block names only"],
];
const AUTOMOD_SOURCES = {
  message: "Message",
  message_edit: "Message edit",
  thread_name: "Thread name",
  channel_name: "Channel name",
  guild_name: "Server name",
  report: "Verified encrypted report",
  registration: "Signup",
  username: "Username",
  global_name: "Display name",
  nick: "Server nickname",
  guild_join: "Server join",
  direct_message: "Direct message",
  admin: "Admin dashboard",
};
const JOIN_STATUSES = [
  ["pending", "Waiting"],
  ["low_effort", "Looks low effort"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
];

const automodState = {
  log: { rule: "", action: "", user: "", reversed: "", offset: 0, limit: 25 },
  raids: { offset: 0, limit: 10 },
  join: { status: "pending", offset: 0, limit: 25 },
  names: { after: null, users: [], scanned: 0, done: false },
};

const ruleLabel = (rule) => AUTOMOD_RULES.find(([key]) => key === rule)?.[1] ?? rule;
const linesOf = (value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const automodWhere = (entry) => {
  if (entry.guild)
    return html`<span>${entry.guild.name ?? "Server"}</span>${entry.channel ? html`<span class="muted"> · #${entry.channel.name ?? entry.channel.id}</span>` : ""}`;
  if (entry.channel)
    return html`<span>${entry.channel.type === 3 ? "Group DM" : entry.channel.type === 1 ? "Direct message" : `#${entry.channel.name ?? entry.channel.id}`}</span>`;
  return html`<span class="muted">${AUTOMOD_SOURCES[entry.source] ?? entry.source}</span>`;
};

const automodActionBadge = (entry) => {
  const label = AUTOMOD_ACTIONS.find(([key]) => key === entry.action)?.[1] ?? entry.action;
  const kind = ["suspend", "disable", "ban", "federation_block"].includes(entry.action)
    ? "danger"
    : ["delete", "timeout"].includes(entry.action)
      ? "warn"
      : "info";
  return html`<span class="badge ${kind}">${label}</span>${
    (entry.action === "suspend" || entry.action === "timeout") && entry.suspended_until
      ? html`<span class="muted automod-sub">until ${fmtDate(entry.suspended_until)}</span>`
      : ""
  }${entry.deleted_messages ? html`<span class="muted automod-sub">${fmtNumber(entry.deleted_messages)} messages wiped</span>` : ""}`;
};

async function renderAutomod(view) {
  const overview = await api("/admin/automod");
  const s = overview.settings;
  const countChips = (counts) =>
    AUTOMOD_RULES.filter(([key]) => counts.by_rule[key]).map(
      ([key, label]) => html`<span class="badge">${label}: ${fmtNumber(counts.by_rule[key])}</span>`,
    );
  const toggle = (name, checked, label, hint) =>
    html`<label class="toggle"
      ><input type="checkbox" name="${name}" ${checked ? raw("checked") : ""} /><span
        >${label}${hint ? html`<span class="hint">${hint}</span>` : ""}</span
      ></label
    >`;
  const number = (name, value, label, hint, min, max) =>
    html`<label
      >${label}${hint ? html`<span class="hint">${hint}</span>` : ""}<input
        type="number"
        name="${name}"
        value="${value}"
        min="${min}"
        max="${max}"
        step="1"
        required
    /></label>`;

  mount(
    view,
    html`
      <div class="page-head">
        <div>
          <h1>Automod</h1>
          <p class="muted">
            Instance-wide rules that run on every message, name and signup. Each section saves on its own,
            and everything automod does is logged below.
          </p>
        </div>
      </div>
      <div class="row automod-jump" role="navigation" aria-label="Automod sections">
        <a class="btn small ghost" href="#automod-raids" data-jump>Raids</a>
        <a class="btn small ghost" href="#automod-log" data-jump>Log</a>
        <a class="btn small ghost" href="#automod-join" data-jump>Join requests</a>
        <a class="btn small ghost" href="#automod-test" data-jump>Test text</a>
        <a class="btn small ghost" href="#automod-spam" data-jump>Spam rules</a>
        <a class="btn small ghost" href="#automod-raid-settings" data-jump>Raid detection</a>
        <a class="btn small ghost" href="#automod-slurs" data-jump>Slur auto-ban</a>
        <a class="btn small ghost" href="#automod-lists" data-jump>Word lists</a>
        <a class="btn small ghost" href="#automod-names" data-jump>Names</a>
        <a class="btn small ghost" href="#automod-registration" data-jump>Signups</a>
        <a class="btn small ghost" href="#automod-login" data-jump>Sign-in</a>
      </div>
      <div class="stack">
        <div class="stats automod-stats">
        <div class="card stat">
          <span class="muted">Actions in the last 24 hours</span>
          <div class="value">${fmtNumber(overview.counts.day.total)}</div>
          <div class="badges">${countChips(overview.counts.day)}</div>
        </div>
        <div class="card stat">
          <span class="muted">Actions in the last 7 days</span>
          <div class="value">${fmtNumber(overview.counts.week.total)}</div>
          <div class="badges">${countChips(overview.counts.week)}</div>
        </div>
        <div class="card stat">
          <span class="muted">Accounts waiting for approval</span>
          <div class="value">${fmtNumber(overview.pending_accounts)}</div>
        </div>
        <div class="card stat">
          <span class="muted">Accounts suspended right now</span>
          <div class="value">${fmtNumber(overview.suspended_accounts)}</div>
        </div>
        <div class="card stat">
          <span class="muted">Raid and spam incidents going on</span>
          <div class="value" id="automod-live-count">${fmtNumber(overview.live_incidents)}</div>
        </div>
      </div>

      <section class="card" id="automod-raids" aria-labelledby="automod-raids-title">
        <div class="automod-section-head">
          <h2 id="automod-raids-title">Raids</h2>
          <button class="btn small" type="button" id="automod-raids-refresh">Refresh</button>
        </div>
        <p class="muted">
          Spam waves and server raids grouped into incidents. An incident stays live until 10 minutes pass without a
          new event. Open one to act on every account in it at once. This list refreshes every 15 seconds.
        </p>
        <div class="list-status muted" id="automod-raids-status" role="status" aria-live="polite" hidden></div>
        <h3>Going on now</h3>
        <div id="automod-raids-live"><div class="spinner">Loading…</div></div>
        <h3>Recent incidents</h3>
        <div id="automod-raids-recent"></div>
        <h3>Top offenders this week</h3>
        <div id="automod-raids-offenders"></div>
      </section>

      <section class="card" id="automod-log" aria-labelledby="automod-log-title">
        <h2 id="automod-log-title">Automod log</h2>
        <p class="muted">Every message, name and signup automod stopped, newest first. Excerpts hide the matched word.</p>
        <div class="row automod-filters">
          <label
            >Rule<select id="automod-rule">
              ${options([["", "Any rule"], ...AUTOMOD_RULES], automodState.log.rule)}
            </select></label
          >
          <label
            >Action<select id="automod-action">
              ${options([["", "Any action"], ...AUTOMOD_ACTIONS], automodState.log.action)}
            </select></label
          >
          <label
            >Reversed<select id="automod-reversed">
              ${options(
                [
                  ["", "Either"],
                  ["no", "Still in effect"],
                  ["yes", "Reversed"],
                ],
                automodState.log.reversed,
              )}
            </select></label
          >
          <label class="grow"
            >User<input id="automod-user" type="search" placeholder="User ID or username" value="${automodState.log.user}"
          /></label>
        </div>
        <div class="list-status muted" id="automod-log-status" role="status" aria-live="polite" hidden></div>
        <div id="automod-log-results"><div class="spinner">Loading…</div></div>
      </section>

      <section class="card" id="automod-join" aria-labelledby="automod-join-title">
        <h2 id="automod-join-title">Join requests</h2>
        <p class="muted">
          Reasons people gave when they signed up. "Looks low effort" flags answers that are very short, repeat
          characters, look like keyboard mashing or match two or more other signups from the last 7 days.
        </p>
        <div class="row" id="automod-join-tabs"></div>
        <div class="row automod-bulk">
          <button class="btn small primary" type="button" data-join-action="approve" disabled>Approve selected</button>
          <button class="btn small danger" type="button" data-join-action="reject" disabled>Reject selected</button>
          <span class="muted" id="automod-join-selected" aria-live="polite"></span>
        </div>
        <div id="automod-join-results"><div class="spinner">Loading…</div></div>
      </section>

      <section class="card" id="automod-test" aria-labelledby="automod-test-title">
        <h2 id="automod-test-title">Test text</h2>
        <p class="muted">Check text against the saved rules without acting on anyone. Save a word list first to test it.</p>
        <label
          >Text to check<textarea id="automod-test-text" rows="3" maxlength="4000" placeholder="Paste a message or a name"></textarea>
        </label>
        <div class="row" style="margin-top:12px">
          <button class="btn" type="button" id="automod-test-run">Check text</button>
        </div>
        <div id="automod-test-result" class="automod-test-result" role="status" aria-live="polite"></div>
      </section>

      <form class="card" id="automod-spam" aria-labelledby="automod-spam-title">
        <h2 id="automod-spam-title">Spam rules</h2>
        <p class="muted">
          Instance-wide checks on every message, edit and thread, including from accounts on other instances. The
          message that trips a rule is refused, and any action other than log also deletes the earlier messages that
          counted toward it. Accounts from other instances are blocked from federating instead of suspended or disabled.
        </p>
        <div class="stack">
          ${SPAM_RULES.map(
            (rule) => html`
              <fieldset class="automod-list" data-spam-rule="${rule.key}">
                <legend>${rule.title}</legend>
                <p class="muted automod-about">${rule.about}</p>
                ${toggle("enabled", s.spam[rule.key].enabled, `Check for ${rule.title.toLowerCase()}`)}
                <div class="form-grid" style="margin-top:12px">
                  <label
                    >When it trips<select name="action">
                      ${options(SPAM_ACTIONS, s.spam[rule.key].action)}
                    </select></label
                  >
                  ${rule.fields.map(([key, label, hint, min, max]) => number(key, s.spam[rule.key][key], label, hint, min, max))}
                  ${number(
                    "exemptAccountAgeDays",
                    s.spam[rule.key].exemptAccountAgeDays,
                    rule.ageLabel ?? "Skip accounts older than",
                    rule.ageLabel ? "Days" : "Days. 0 checks every account.",
                    0,
                    3650,
                  )}
                </div>
              </fieldset>
            `,
          )}
        </div>
        <h3>Penalties</h3>
        <div class="form-grid" data-spam-shared>
          ${number("timeoutMinutes", s.spam.timeoutMinutes, "Timeout length", "Minutes. Spam in a server times the account out there. Spam in DMs stops it sending messages anywhere on this instance.", 1, 40320)}
          ${number("suspendHours", s.spam.suspendHours, "Suspension length", "Hours", 1, 8760)}
          ${number("escalateAfterStrikes", s.spam.escalateAfterStrikes, "Step up after this many strikes", "Each further hit moves one step up, from log to delete to timeout to suspend. 0 never steps up.", 0, 100)}
          ${number("strikeWindowHours", s.spam.strikeWindowHours, "Strikes count for", "Hours", 1, 720)}
        </div>
        <div class="form-actions"><button class="btn primary" type="submit">Save spam rules</button></div>
      </form>

      <form class="card" id="automod-raid-settings" aria-labelledby="automod-raid-settings-title">
        <h2 id="automod-raid-settings-title">Raid detection</h2>
        <p class="muted">
          Per-server raid checks. A raid sets the server's raid alert, posts it to the safety alerts channel when the
          server has one, and pauses invites or DMs for the time below. Server owners can lift the pause from Discord's
          raid banner.
        </p>
        <div class="form-grid">
          ${RAID_SETTINGS.map(([key, label, hint, min, max]) => number(key, s.raids[key], label, hint, min, max))}
        </div>
        <div class="form-actions"><button class="btn primary" type="submit">Save raid detection</button></div>
      </form>

      <form class="card" id="automod-slurs" aria-labelledby="automod-slurs-title">
        <h2 id="automod-slurs-title">Slur auto-ban</h2>
        <p class="muted">
          Catches the hard-R slur in messages, edits, polls, thread, channel and server names, including spaced
          out, leetspeak, look-alike letters and full-width spellings. It ignores Niger, Nigeria, Nigerian, snigger
          and niggardly. Encrypted DMs are only checked when someone reports a message.
        </p>
        <div class="stack">
          ${toggle("enabled", s.slurs.enabled, "Turn on the slur auto-ban", "Rejects the message, suspends the account and records a violation on its Account Standing page.")}
          ${toggle("includeSoftA", s.slurs.includeSoftA, "Also act on the soft-A spelling", "Off by default. When on, the soft-A spelling gets the same suspension.")}
          ${toggle("deleteAllMessages", s.slurs.deleteAllMessages, "Delete all of the user's messages", "Removes every message the account ever sent, in every server and DM, right after the suspension.")}
          ${toggle("actOnVerifiedReports", s.slurs.actOnVerifiedReports, "Act on verified encrypted reports", "When a report of an encrypted message carries a signature-verified copy of the text, the same action runs.")}
        </div>
        <div class="form-grid" style="margin-top:16px">
          ${number("suspendDays", s.slurs.suspendDays, "Suspension length", "Days. The account can't sign in until it ends, then it lifts by itself.", 1, 365)}
          ${number("violationDays", s.slurs.violationDays, "Violation stays on record for", "Days shown on the user's Account Standing page.", 1, 3650)}
        </div>
        <div class="form-actions"><button class="btn primary" type="submit">Save slur auto-ban</button></div>
      </form>

      <form class="card" id="automod-lists" aria-labelledby="automod-lists-title">
        <h2 id="automod-lists-title">Word lists</h2>
        <p class="muted">
          Extra words to stop, each list with its own action. One word or phrase per line. A word matches on its
          own, so "ass" doesn't stop "class". Put <code>*</code> at either end to also match longer words, like
          <code>scam*</code>. Every list also blocks usernames, display names, nicknames and server names.
        </p>
        <div id="automod-list-editor" class="stack"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn" type="button" id="automod-list-add">Add a word list</button>
        </div>
        <div class="form-actions"><button class="btn primary" type="submit">Save word lists</button></div>
      </form>

      <form class="card" id="automod-allow" aria-labelledby="automod-allow-title">
        <h2 id="automod-allow-title">Allow list</h2>
        <p class="muted">
          Words automod should never act on, one per line. "Not a match" in the log adds the matched word here.
        </p>
        <label
          >Allowed words<textarea name="allowList" rows="4">${s.allowList.join("\n")}</textarea>
        </label>
        <div class="form-actions"><button class="btn primary" type="submit">Save allow list</button></div>
      </form>

      <form class="card" id="automod-names" aria-labelledby="automod-names-title">
        <h2 id="automod-names-title">Blocked name words</h2>
        <p class="muted">
          Words nobody can use in a username, display name or server nickname, one per line, letters and numbers
          only. Matching ignores case, spacing and common number swaps. Existing names are kept, so scan for them below.
        </p>
        <label
          >Blocked name words<textarea name="identityBlockedTerms" rows="5">${s.identityBlockedTerms.join("\n")}</textarea>
        </label>
        <div class="form-actions"><button class="btn primary" type="submit">Save blocked name words</button></div>
      </form>

      <section class="card" id="automod-name-scan" aria-labelledby="automod-name-scan-title">
        <h2 id="automod-name-scan-title">Accounts with names that break the rules</h2>
        <p class="muted">Scans existing usernames and display names against the slur rule, the word lists and the blocked name words, 10,000 accounts at a time.</p>
        <div class="row automod-bulk">
          <button class="btn small" type="button" id="automod-name-scan-run">Scan accounts</button>
          <button class="btn small danger" type="button" id="automod-name-disable" disabled>Disable selected</button>
          <span class="muted" id="automod-name-status" aria-live="polite"></span>
        </div>
        <div id="automod-name-results"></div>
      </section>

      <form class="card" id="automod-registration" aria-labelledby="automod-registration-title">
        <h2 id="automod-registration-title">Signups</h2>
        <div class="stack">
          ${toggle("joinReasonRequired", s.registration.joinReasonRequired, 'Ask "Why do you want to join?" at signup', "Adds a required answer to the signup form. Moderators see it in Join requests.")}
          ${toggle("requireApproval", s.registration.requireApproval, "Approve new accounts by hand", "New accounts can't sign in until a moderator approves them in Join requests. The signup form tells them to wait.")}
        </div>
        <div class="form-grid" style="margin-top:16px">
          ${number("joinReasonMinLength", s.registration.joinReasonMinLength, "Shortest answer allowed", "Characters, when the question is required.", 1, 1000)}
          ${number("maxAccountsPerIpPerDay", s.registration.maxAccountsPerIpPerDay, "Accounts per IP address per day", "0 turns this limit off. Counts every account created, including ones waiting for approval.", 0, 100000)}
        </div>
        <p class="hint muted">
          The signup rate limit also applies:
          ${fmtNumber(s.registration.rateLimit.count)} successful signups per IP every
          ${fmtDuration(s.registration.rateLimit.window)}${s.registration.rateLimit.enabled ? "" : " (rate limits are off)"}.
          Change it under Site settings, Rate limits.
        </p>
        <div class="form-actions"><button class="btn primary" type="submit">Save signup rules</button></div>
      </form>

      <form class="card" id="automod-login" aria-labelledby="automod-login-title">
        <h2 id="automod-login-title">Sign-in protection</h2>
        <p class="muted">Locks an account after repeated wrong passwords, whichever IP addresses they come from. The per-IP sign-in rate limit applies too.</p>
        <div class="form-grid">
          ${number("maxFailedAttemptsPerAccount", s.login.maxFailedAttemptsPerAccount, "Wrong passwords before a lock", "0 turns the lock off.", 0, 1000)}
          ${number("lockoutMinutes", s.login.lockoutMinutes, "Lock length", "Minutes, counted from the first wrong password.", 1, 10080)}
        </div>
        <div class="form-actions"><button class="btn primary" type="submit">Save sign-in protection</button></div>
      </form>
      </div>
    `,
  );

  for (const link of $$("[data-jump]", view))
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector(link.getAttribute("href"))?.scrollIntoView({ block: "start" });
    });

  const save = async (form, body, success) => {
    const saved = await act($("button[type=submit]", form), () => api("/admin/automod/settings", { method: "PATCH", body }), success);
    if (saved) Object.assign(s, saved);
    return saved;
  };
  const values = (form) => Object.fromEntries(
    $$("input[name]", form).map((input) => [input.name, input.type === "checkbox" ? input.checked : Number(input.value)]),
  );

  $("#automod-slurs", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(event.currentTarget, { slurs: values(event.currentTarget) }, "Slur auto-ban saved");
  });
  $("#automod-registration", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(event.currentTarget, { registration: values(event.currentTarget) }, "Signup rules saved");
  });
  $("#automod-login", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(event.currentTarget, { login: values(event.currentTarget) }, "Sign-in protection saved");
  });
  $("#automod-spam", view).addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const spam = Object.fromEntries(
      $$("[data-spam-rule]", form).map((fieldset) => [
        fieldset.dataset.spamRule,
        { ...values(fieldset), action: $("select[name=action]", fieldset).value },
      ]),
    );
    save(form, { spam: { ...spam, ...values($("[data-spam-shared]", form)) } }, "Spam rules saved");
  });
  $("#automod-raid-settings", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(event.currentTarget, { raids: values(event.currentTarget) }, "Raid detection saved");
  });
  $("#automod-allow", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(event.currentTarget, { allowList: linesOf(event.currentTarget.elements.allowList.value) }, "Allow list saved");
  });
  $("#automod-names", view).addEventListener("submit", (event) => {
    event.preventDefault();
    save(
      event.currentTarget,
      { identityBlockedTerms: linesOf(event.currentTarget.elements.identityBlockedTerms.value) },
      "Blocked name words saved",
    );
  });

  const editor = $("#automod-list-editor", view);
  let lists = s.wordLists.map((list) => ({ ...list }));
  const listCard = (list, index) => html`
    <fieldset class="automod-list" data-index="${index}">
      <legend>${list.name || "New word list"}</legend>
      <div class="form-grid">
        <label>Name<input data-field="name" value="${list.name}" maxlength="64" required placeholder="Spam phrases" /></label>
        <label
          >When a word matches<select data-field="action">
            ${options(AUTOMOD_LIST_ACTIONS, list.action)}
          </select></label
        >
        <label ${list.action === "suspend" ? "" : raw("hidden")} data-suspend
          >Suspension length<span class="hint">Days</span
          ><input data-field="suspendDays" type="number" min="1" max="365" step="1" value="${list.suspendDays ?? 7}"
        /></label>
        <label class="span"
          >Words<span class="hint">One per line, up to 500.</span
          ><textarea data-field="terms" rows="4">${list.terms.join("\n")}</textarea>
        </label>
      </div>
      <div class="row"><button class="btn small ghost" type="button" data-remove>Remove this list</button></div>
    </fieldset>
  `;
  const readLists = () =>
    $$(".automod-list", editor).map((fieldset, index) => ({
      ...(lists[index]?.id ? { id: lists[index].id } : {}),
      name: $("[data-field=name]", fieldset).value.trim(),
      action: $("[data-field=action]", fieldset).value,
      suspendDays: Number($("[data-field=suspendDays]", fieldset).value) || 7,
      terms: linesOf($("[data-field=terms]", fieldset).value),
    }));
  const drawLists = () => {
    mount(
      editor,
      lists.length
        ? lists.map(listCard)
        : html`<p class="muted">No word lists yet. Add one to stop extra words or phrases.</p>`,
    );
    for (const fieldset of $$(".automod-list", editor)) {
      $("[data-field=action]", fieldset).addEventListener("change", (event) => {
        $("[data-suspend]", fieldset).hidden = event.target.value !== "suspend";
      });
      $("[data-remove]", fieldset).addEventListener("click", () => {
        lists = readLists();
        lists.splice(Number(fieldset.dataset.index), 1);
        $("#automod-lists").dataset.dirty = "true";
        drawLists();
      });
    }
  };
  drawLists();
  $("#automod-list-add", view).addEventListener("click", () => {
    lists = [...readLists(), { name: "", action: "delete", suspendDays: 7, terms: [] }];
    drawLists();
    $$(".automod-list [data-field=name]", editor).at(-1)?.focus();
  });
  $("#automod-lists", view).addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await save(event.currentTarget, { wordLists: readLists() }, "Word lists saved");
    if (saved) {
      lists = saved.wordLists.map((list) => ({ ...list }));
      drawLists();
    }
  });

  $("#automod-test-run", view).addEventListener("click", async () => {
    const text = $("#automod-test-text", view).value;
    const target = $("#automod-test-result", view);
    if (!text.trim()) {
      target.textContent = "Type or paste some text to check.";
      return;
    }
    const result = await act($("#automod-test-run", view), () => api("/admin/automod/test", { method: "POST", body: { text } }));
    if (!result) return;
    const ruleText = (match) =>
      match.rule === "word" && match.list ? `the "${match.list.name}" word list (${match.term})` : ruleLabel(match.rule);
    mount(
      target,
      html`
        <p>
          ${result.message
            ? html`<span class="badge danger">Message would be stopped</span> by ${ruleText(result.message)}. Automod would
                ${result.message.action}.`
            : html`<span class="badge ok">Messages pass</span> No message rule matches.`}
        </p>
        <p>
          ${result.name
            ? html`<span class="badge warn">Name would be refused</span> by ${ruleText(result.name)}.`
            : html`<span class="badge ok">Names pass</span> No name rule matches.`}
        </p>
        ${result.message || result.name ? html`<p class="muted">Logged as: ${result.excerpt}</p>` : ""}
      `,
    );
  });

  const logResults = $("#automod-log-results", view);
  const logRequests = latestList(view, logResults, $("#automod-log-status", view));
  const loadLog = async () => {
    const st = automodState.log;
    const params = new URLSearchParams({ limit: st.limit, offset: st.offset });
    if (st.rule) params.set("rule", st.rule);
    if (st.action) params.set("action", st.action);
    if (st.reversed) params.set("reversed", st.reversed);
    if (st.user) params.set("user_id", st.user);
    await logRequests.load(
      `/admin/automod/actions?${params}`,
      ({ actions, total }) => {
        mount(
          logResults,
          actions.length
            ? html`
                <div class="table-wrap">
                  <table class="automod-log">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Rule</th>
                        <th class="hide-sm">Where</th>
                        <th>Action</th>
                        <th class="hide-sm">Excerpt</th>
                        <th><span class="visually-hidden">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${actions.map(
                        (entry) => html`
                          <tr data-id="${entry.id}" class="${entry.reversed ? "automod-reversed" : ""}">
                            <td>${fmtDate(entry.created_at)}</td>
                            <td>
                              ${entry.user
                                ? html`<div class="ident">${avatar(entry.user)}<div><strong>${userName(entry.user)}</strong><span class="muted">${userTag(entry.user)}</span></div></div>`
                                : html`<span class="muted">${entry.username ? `@${entry.username}` : "No account"}</span>`}
                            </td>
                            <td>
                              ${ruleLabel(entry.rule)}${entry.list_name ? html`<span class="muted automod-sub">${entry.list_name}</span>` : ""}
                              <span class="muted automod-sub">${AUTOMOD_SOURCES[entry.source] ?? entry.source}</span>
                            </td>
                            <td class="hide-sm">${automodWhere(entry)}</td>
                            <td>
                              ${automodActionBadge(entry)}
                              ${entry.reversed
                                ? html`<span class="badge ok automod-sub">${entry.reversal === "not_a_match" ? "Not a match" : "Undone"}</span>`
                                : ""}
                            </td>
                            <td class="hide-sm automod-excerpt">${entry.excerpt || html`<span class="muted">None</span>`}</td>
                            <td>
                              <div class="row automod-row-actions">
                                ${entry.user_id ? html`<button class="btn small" type="button" data-open="${entry.user_id}">Open user</button>` : ""}
                                ${entry.reversed
                                  ? ""
                                  : html`${["block", "log", "ban"].includes(entry.action) || !entry.user_id ? "" : html`<button class="btn small" type="button" data-reverse="undo">Undo</button>`}
                                      ${entry.rule === "ip_limit" || RAID_RULES.has(entry.rule) ? "" : html`<button class="btn small ghost" type="button" data-reverse="not_a_match">Not a match</button>`}`}
                              </div>
                            </td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
                ${pager(total, st)}
              `
            : html`<div class="card empty">Nothing here yet. Automod actions show up as soon as they happen.</div>`,
        );
        for (const button of $$("[data-open]", logResults)) button.addEventListener("click", () => openUser(button.dataset.open, loadLog));
        for (const button of $$("[data-reverse]", logResults))
          button.addEventListener("click", async () => {
            const id = button.closest("tr").dataset.id;
            const reversal = button.dataset.reverse;
            const question =
              reversal === "not_a_match"
                ? "Add the matched word to the allow list and lift any suspension this caused? Deleted messages stay deleted."
                : "Lift any suspension this caused and overturn its violation? Deleted messages stay deleted.";
            if (!confirm(question)) return;
            const done = await act(
              button,
              () => api(`/admin/automod/actions/${id}/reverse`, { method: "POST", body: { reversal } }),
              reversal === "not_a_match" ? "Added to the allow list" : "Action undone",
            );
            if (done !== undefined) loadLog();
          });
        bindPager(logResults, total, st, loadLog);
      },
      loadLog,
    );
  };
  const filterLog = (key, value) => {
    automodState.log[key] = value;
    automodState.log.offset = 0;
    loadLog();
  };
  $("#automod-rule", view).addEventListener("change", (event) => filterLog("rule", event.target.value));
  $("#automod-action", view).addEventListener("change", (event) => filterLog("action", event.target.value));
  $("#automod-reversed", view).addEventListener("change", (event) => filterLog("reversed", event.target.value));
  const searchUser = debounce((value) => filterLog("user", value));
  $("#automod-user", view).addEventListener("input", (event) => {
    logRequests.cancel();
    searchUser(event.target.value.trim());
  });

  const joinResults = $("#automod-join-results", view);
  const joinTabs = $("#automod-join-tabs", view);
  const joinButtons = $$("[data-join-action]", view);
  const syncJoinSelection = () => {
    const count = $$("input[data-select]:checked", joinResults).length;
    for (const button of joinButtons) button.disabled = count === 0;
    $("#automod-join-selected", view).textContent = count ? `${fmtNumber(count)} selected` : "";
  };
  const loadJoin = async () => {
    const st = automodState.join;
    mount(
      joinTabs,
      JOIN_STATUSES.map(
        ([key, label]) =>
          html`<button class="btn small ${st.status === key ? "primary" : ""}" type="button" data-join-status="${key}" aria-pressed="${st.status === key}">${label}</button>`,
      ),
    );
    for (const button of $$("[data-join-status]", joinTabs))
      button.addEventListener("click", () => {
        st.status = button.dataset.joinStatus;
        st.offset = 0;
        loadJoin();
      });
    const { users, total } = await api(`/admin/automod/join-requests?${new URLSearchParams({ status: st.status, limit: st.limit, offset: st.offset })}`);
    if (!joinResults.isConnected) return;
    mount(
      joinResults,
      users.length
        ? html`
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" data-select-all aria-label="Select every account on this page" /></th>
                    <th>Account</th>
                    <th>Why they want to join</th>
                    <th class="hide-sm">Signed up</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${users.map(
                    (u) => html`
                      <tr data-id="${u.id}">
                        <td><input type="checkbox" data-select="${u.id}" aria-label="Select ${userName(u)}" /></td>
                        <td><button class="link-button ident" type="button" data-open="${u.id}">${avatar(u)}<span><strong>${userName(u)}</strong><span class="muted">${userTag(u)}</span></span></button></td>
                        <td class="automod-reason">
                          ${u.join_reason ? html`<p>${u.join_reason}</p>` : html`<span class="muted">No reason given</span>`}
                          ${u.signals.length ? html`<div class="badges">${u.signals.map((signal) => html`<span class="badge warn">${signal.label}</span>`)}</div>` : ""}
                        </td>
                        <td class="hide-sm">${fmtDate(u.created_at)}</td>
                        <td>
                          <span class="badge ${u.join_status === "pending" ? "warn" : u.join_status === "rejected" ? "danger" : u.join_status === "approved" ? "ok" : ""}"
                            >${u.join_status === "pending" ? "Waiting" : u.join_status === "rejected" ? "Rejected" : u.join_status === "approved" ? "Approved" : "Active"}</span
                          >
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
            ${pager(total, st)}
          `
        : html`<div class="card empty">${st.status === "pending" ? "Nobody is waiting for approval." : "No accounts here."}</div>`,
    );
    $("[data-select-all]", joinResults)?.addEventListener("change", (event) => {
      for (const box of $$("input[data-select]", joinResults)) box.checked = event.target.checked;
      syncJoinSelection();
    });
    for (const box of $$("input[data-select]", joinResults)) box.addEventListener("change", syncJoinSelection);
    for (const button of $$("[data-open]", joinResults)) button.addEventListener("click", () => openUser(button.dataset.open, loadJoin));
    bindPager(joinResults, total, st, loadJoin);
    syncJoinSelection();
  };
  for (const button of joinButtons)
    button.addEventListener("click", async () => {
      const user_ids = $$("input[data-select]:checked", joinResults).map((box) => box.dataset.select);
      const action = button.dataset.joinAction;
      if (action === "reject" && !confirm(`Reject ${user_ids.length} ${user_ids.length === 1 ? "account" : "accounts"}? They won't be able to sign in.`)) return;
      const done = await act(
        button,
        () => api("/admin/automod/join-requests", { method: "POST", body: { user_ids, action } }),
        action === "approve" ? "Accounts approved" : "Accounts rejected",
      );
      if (done) loadJoin();
    });

  const nameResults = $("#automod-name-results", view);
  const nameStatus = $("#automod-name-status", view);
  const disableButton = $("#automod-name-disable", view);
  const scanButton = $("#automod-name-scan-run", view);
  const syncNameSelection = () => {
    disableButton.disabled = !$$("input[data-name-select]:checked", nameResults).length;
  };
  const drawNames = () => {
    const st = automodState.names;
    mount(
      nameResults,
      st.users.length
        ? html`<div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><span class="visually-hidden">Select</span></th>
                  <th>Account</th>
                  <th>Matched</th>
                  <th class="hide-sm">Joined</th>
                </tr>
              </thead>
              <tbody>
                ${st.users.map(
                  (u) => html`<tr>
                    <td><input type="checkbox" data-name-select="${u.id}" ${u.disabled ? raw("disabled") : ""} aria-label="Select ${u.username}" /></td>
                    <td><button class="link-button ident" type="button" data-open="${u.id}">${avatar(u)}<span><strong>${userName(u)}</strong><span class="muted">${userTag(u)}</span></span></button>${u.disabled ? html` <span class="badge danger">Disabled</span>` : ""}</td>
                    <td>${u.field === "username" ? "Username" : "Display name"} · ${u.rule === "word" && u.list ? u.list.name : ruleLabel(u.rule)}</td>
                    <td class="hide-sm">${fmtDay(u.created_at)}</td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>`
        : st.scanned
          ? html`<div class="card empty">No names break the rules.</div>`
          : "",
    );
    for (const box of $$("input[data-name-select]", nameResults)) box.addEventListener("change", syncNameSelection);
    for (const button of $$("[data-open]", nameResults)) button.addEventListener("click", () => openUser(button.dataset.open));
    nameStatus.textContent = st.scanned ? `${fmtNumber(st.scanned)} accounts scanned${st.done ? "" : ", more to go"}` : "";
    scanButton.textContent = st.scanned && !st.done ? "Scan more" : st.scanned ? "Scan again" : "Scan accounts";
    syncNameSelection();
  };
  scanButton.addEventListener("click", async () => {
    const st = automodState.names;
    if (st.done) Object.assign(st, { after: null, users: [], scanned: 0, done: false });
    const result = await act(scanButton, () => api(`/admin/automod/names${st.after ? `?after=${st.after}` : ""}`));
    if (!result) return;
    st.users.push(...result.users.filter((u) => !st.users.some((known) => known.id === u.id)));
    st.scanned += result.scanned;
    st.after = result.next;
    st.done = !result.next;
    drawNames();
  });
  disableButton.addEventListener("click", async () => {
    const user_ids = $$("input[data-name-select]:checked", nameResults).map((box) => box.dataset.nameSelect);
    if (!confirm(`Disable ${user_ids.length} ${user_ids.length === 1 ? "account" : "accounts"} and sign them out everywhere?`)) return;
    const result = await act(disableButton, () => api("/admin/automod/names/disable", { method: "POST", body: { user_ids } }), "Accounts disabled");
    if (!result) return;
    for (const u of automodState.names.users) if (result.disabled.includes(u.id)) u.disabled = true;
    drawNames();
  });
  drawNames();

  const plural = (count, word, many = `${word}s`) => `${fmtNumber(count)} ${count === 1 ? word : many}`;
  const incidentWhere = (incident) =>
    incident.guild
      ? html`<span>${incident.guild.name ?? "Deleted server"}</span>`
      : html`<span class="muted">${incident.kind === "dm_raid" ? "Direct messages" : "Across the instance"}</span>`;
  const incidentState = (incident) =>
    incident.live
      ? html`<span class="badge warn">Live</span>`
      : incident.ended_at
        ? html`<span class="badge ok">Ended</span>`
        : html`<span class="badge">Quiet</span>`;
  const accountState = (u) =>
    u?.disabled
      ? html`<span class="badge danger">Disabled</span>`
      : u?.suspended_until && new Date(u.suspended_until) > new Date()
        ? html`<span class="badge danger">Suspended</span><span class="muted automod-sub">until ${fmtDate(u.suspended_until)}</span>`
        : html`<span class="badge">Active</span>`;
  const incidentTable = (incidents) => html`
    <div class="table-wrap">
      <table class="automod-incidents">
        <thead>
          <tr>
            <th>Incident</th>
            <th class="hide-sm">Where</th>
            <th>Accounts</th>
            <th class="hide-sm">Last event</th>
            <th>State</th>
            <th><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          ${incidents.map(
            (incident) => html`
              <tr>
                <td>
                  <strong>${ruleLabel(incident.kind)}</strong>
                  <span class="muted automod-sub">started ${fmtDate(incident.started_at)}</span>
                </td>
                <td class="hide-sm">${incidentWhere(incident)}</td>
                <td class="automod-num">
                  ${fmtNumber(incident.user_count)}
                  <span class="muted automod-sub">${plural(incident.event_count, "event")}${incident.deleted_messages ? `, ${plural(incident.deleted_messages, "message")} deleted` : ""}</span>
                </td>
                <td class="hide-sm">${fmtDate(incident.last_event_at)}</td>
                <td>${incidentState(incident)}${incident.actions.length ? html`<span class="muted automod-sub">${plural(incident.actions.length, "staff action")}</span>` : ""}</td>
                <td><button class="btn small" type="button" data-incident="${incident.id}">Open incident</button></td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;

  const raidState = automodState.raids;
  const raidLive = $("#automod-raids-live", view);
  const raidRecent = $("#automod-raids-recent", view);
  const raidOffenders = $("#automod-raids-offenders", view);
  const raidStatus = $("#automod-raids-status", view);
  let raidLoading = false;
  const loadRaids = async () => {
    if (raidLoading) return;
    raidLoading = true;
    try {
      const data = await api(`/admin/automod/raids?${new URLSearchParams({ limit: raidState.limit, offset: raidState.offset })}`);
      if (!view.isConnected) return;
      raidStatus.hidden = true;
      $("#automod-live-count", view).textContent = fmtNumber(data.live.length);
      mount(
        raidLive,
        data.live.length
          ? incidentTable(data.live)
          : html`<div class="card empty">No raids or spam waves right now. Incidents show up here as soon as automod groups two or more events.</div>`,
      );
      mount(
        raidRecent,
        data.recent.incidents.length
          ? html`${incidentTable(data.recent.incidents)}${pager(data.recent.total, raidState)}`
          : html`<div class="card empty">No incidents in the last 7 days.</div>`,
      );
      bindPager(raidRecent, data.recent.total, raidState, loadRaids);
      mount(
        raidOffenders,
        data.offenders.length
          ? html`<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Times caught</th>
                    <th class="hide-sm">Rules</th>
                    <th class="hide-sm">Last caught</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.offenders.map(
                    (row) => html`<tr>
                      <td>
                        ${row.user
                          ? html`<button class="link-button ident" type="button" data-open="${row.user_id}">${avatar(row.user)}<span><strong>${userName(row.user)}</strong><span class="muted">${userTag(row.user)}</span></span></button>`
                          : html`<span class="muted">Deleted account</span>`}
                      </td>
                      <td class="automod-num">${fmtNumber(row.count)}<span class="muted automod-sub">${plural(row.incidents, "incident")}</span></td>
                      <td class="hide-sm"><div class="badges">${Object.entries(row.rules).map(([rule, count]) => html`<span class="badge">${ruleLabel(rule)}: ${fmtNumber(count)}</span>`)}</div></td>
                      <td class="hide-sm">${fmtDate(row.last_at)}</td>
                      <td>${accountState(row.user)}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<div class="card empty">Nobody has tripped a spam or raid rule this week.</div>`,
      );
      for (const button of $$("[data-incident]", view)) button.addEventListener("click", () => openIncident(button.dataset.incident));
      for (const button of $$("[data-open]", raidOffenders)) button.addEventListener("click", () => openUser(button.dataset.open, loadRaids));
    } catch (error) {
      if (!view.isConnected || error.status === 499 || error.status === 401) return;
      raidStatus.hidden = false;
      raidStatus.textContent = `Couldn't load incidents: ${error.message ?? error}`;
    } finally {
      raidLoading = false;
    }
  };

  const openIncident = async (id) => {
    const body = openDrawer("Incident", html`<div class="spinner">Loading…</div>`);
    if (!body) return;
    const draw = async () => {
      const incident = await api(`/admin/automod/raids/${id}`);
      if (!body.isConnected) return;
      $("#drawer-title").textContent = `${ruleLabel(incident.kind)} incident`;
      const users = incident.users;
      mount(
        body,
        html`
          <div class="stack">
            <dl class="automod-facts">
              <div><dt>Where</dt><dd>${incidentWhere(incident)}</dd></div>
              <div><dt>State</dt><dd>${incidentState(incident)}</dd></div>
              <div><dt>Started</dt><dd>${fmtDate(incident.started_at)}</dd></div>
              <div><dt>Last event</dt><dd>${fmtDate(incident.last_event_at)}</dd></div>
              <div><dt>Accounts</dt><dd>${fmtNumber(incident.user_count)}</dd></div>
              <div><dt>Events</dt><dd>${fmtNumber(incident.event_count)}</dd></div>
              <div><dt>Messages deleted by automod</dt><dd>${fmtNumber(incident.deleted_messages)}</dd></div>
              ${incident.invite_code ? html`<div><dt>Invite used</dt><dd>${incident.invite_code}</dd></div>` : ""}
            </dl>
            ${incident.actions.length
              ? html`<div>
                  <h3>What staff did</h3>
                  <ul class="automod-history">
                    ${incident.actions.map(
                      (entry) => html`<li>
                        ${INCIDENT_ACTIONS.find(([key]) => key === entry.action)?.[1] ?? entry.action} on ${plural(entry.processed, "account")}${entry.skipped ? `, ${fmtNumber(entry.skipped)} skipped` : ""}${entry.messages_deleted !== undefined ? `, ${plural(entry.messages_deleted, "message")} deleted` : ""}${entry.ips_banned !== undefined ? `, ${plural(entry.ips_banned, "IP address", "IP addresses")} banned` : ""}
                        <span class="muted">${fmtDate(entry.at)}</span>
                      </li>`,
                    )}
                  </ul>
                </div>`
              : ""}
            <div>
              <h3>Act on the accounts</h3>
              <p class="muted">
                Acts on the accounts you select, or on everyone in the incident when none are selected. Your own account
                is always skipped. Accounts from other instances are blocked from federating instead of suspended,
                disabled or IP banned.
              </p>
              <label>Reason<span class="hint">Optional. Shown in the automod log and on suspensions.</span><input id="incident-reason" maxlength="512" placeholder="Raid on ${incident.guild?.name ?? "the instance"}" /></label>
              <div class="row automod-bulk">
                ${INCIDENT_ACTIONS.map(([key, label]) => html`<button class="btn small danger" type="button" data-incident-action="${key}">${label}</button>`)}
                ${incident.ended_at ? "" : html`<button class="btn small ghost" type="button" id="incident-end">End incident</button>`}
              </div>
              <p class="muted" id="incident-target" role="status" aria-live="polite"></p>
            </div>
            ${users.length
              ? html`<div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th><input type="checkbox" data-incident-all aria-label="Select every account in this incident" /></th>
                        <th>Account</th>
                        <th class="hide-sm">Created</th>
                        <th>Caught</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${users.map(
                        (entry) => html`<tr>
                          <td><input type="checkbox" data-incident-user="${entry.id}" aria-label="Select ${entry.user ? userName(entry.user) : entry.id}" /></td>
                          <td>
                            ${entry.user
                              ? html`<button class="link-button ident" type="button" data-open="${entry.id}">${avatar(entry.user)}<span><strong>${userName(entry.user)}</strong><span class="muted">${userTag(entry.user)}</span></span></button>`
                              : html`<span class="muted">Deleted account ${entry.id}</span>`}
                            ${entry.user?.federated_instance ? html`<span class="muted automod-sub">from ${entry.user.federated_instance}</span>` : ""}
                          </td>
                          <td class="hide-sm">${entry.user ? fmtDate(entry.user.created_at) : ""}</td>
                          <td class="automod-num">${fmtNumber(entry.actions)}</td>
                          <td>${accountState(entry.user)}</td>
                        </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>`
              : html`<div class="card empty">This incident has no accounts. Raid alerts from joins list the accounts that joined.</div>`}
          </div>
        `,
      );
      const selected = () => $$("input[data-incident-user]:checked", body).map((box) => box.dataset.incidentUser);
      const syncTarget = () => {
        const count = selected().length;
        $("#incident-target", body).textContent = count
          ? `Buttons act on the ${plural(count, "selected account")}.`
          : `Buttons act on all ${plural(users.length, "account")}.`;
      };
      $("[data-incident-all]", body)?.addEventListener("change", (event) => {
        for (const box of $$("input[data-incident-user]", body)) box.checked = event.target.checked;
        syncTarget();
      });
      for (const box of $$("input[data-incident-user]", body)) box.addEventListener("change", syncTarget);
      for (const button of $$("[data-open]", body)) button.addEventListener("click", () => openUser(button.dataset.open));
      syncTarget();
      for (const button of $$("[data-incident-action]", body))
        button.addEventListener("click", async () => {
          const action = button.dataset.incidentAction;
          const user_ids = selected();
          const count = user_ids.length || users.length;
          const phrase = INCIDENT_ACTIONS.find(([key]) => key === action)[2];
          const warning =
            action === "delete_messages"
              ? " This removes every message they ever sent, in every server and DM, and can't be undone."
              : action === "ban_ip"
                ? " Everyone else on those IP addresses is blocked too, and the accounts are signed out."
                : action === "disable"
                  ? " They are signed out and can't sign in again until an admin enables them."
                  : "";
          if (!confirm(`${phrase} ${plural(count, "account")}?${warning}`)) return;
          const reason = $("#incident-reason", body).value.trim();
          const result = await act(button, () =>
            api(`/admin/automod/raids/${id}/action`, { method: "POST", body: { action, ...(user_ids.length ? { user_ids } : {}), ...(reason ? { reason } : {}) } }),
          );
          if (!result) return;
          const extra =
            action === "delete_messages"
              ? `, ${plural(result.messages_deleted, "message")} deleted`
              : action === "ban_ip"
                ? `, ${fmtNumber(result.ips_banned.length)} IP ${result.ips_banned.length === 1 ? "address" : "addresses"} banned`
                : "";
          toast(`Done for ${plural(result.processed.length, "account")}${result.skipped.length ? `, ${fmtNumber(result.skipped.length)} skipped` : ""}${extra}`);
          await draw();
          loadRaids();
        });
      $("#incident-end", body)?.addEventListener("click", async (event) => {
        const done = await act(event.currentTarget, () => api(`/admin/automod/raids/${id}/end`, { method: "POST" }), "Incident ended");
        if (!done) return;
        await draw();
        loadRaids();
      });
    };
    try {
      await draw();
    } catch (error) {
      if (body.isConnected) mount(body, html`<div class="card empty">Couldn't load this incident: ${error.message ?? error}</div>`);
    }
  };

  $("#automod-raids-refresh", view).addEventListener("click", loadRaids);
  const raidTimer = setInterval(() => {
    if (!view.isConnected) {
      clearInterval(raidTimer);
      return;
    }
    if (!document.hidden) loadRaids();
  }, 15000);

  await Promise.all([loadLog(), loadJoin(), loadRaids()]);
}

TABS.automod = renderAutomod;
