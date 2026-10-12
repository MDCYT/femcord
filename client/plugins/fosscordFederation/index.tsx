/* SPDX-License-Identifier: AGPL-3.0-only */
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { RestAPI, showToast, Text, useEffect, useState } from "@webpack/common";
import type { UIEvent } from "react";

import { FosscordAuthor } from "../fosscordCore/shared";
import managedStyle from "./style.css?managed";

const TAB = "fosscord-other-instances";
const SECTION = "FOSSCORD_OTHER_INSTANCES";
const GuildSettingsStore = findStoreLazy("GuildSettingsStore") as { getGuildId(): string | null };

type Registration = "open" | "invite" | "approval" | "closed";
type RemoteInstance = { id: string; name: string; description: string; icon_url: string | null; url: string; registration: Registration; state: string };
type RemoteGuild = { id: string; instance: string; instance_name: string; name: string; description: string; icon_url: string | null; member_count: number; invite_url: string };
type Directory = { available: false; reason: string } | { available: true; verification: "registry" | "instance"; instances: RemoteInstance[]; guilds: RemoteGuild[] };
type OwnerState = {
    enabled: boolean;
    hidden: boolean;
    status: "off" | "hidden" | "no_invite" | "pending" | "verified" | "blocked" | "unknown";
    canonical_id: string | null;
    invite_url: string | null;
    federation_enabled: boolean;
    registry_live: boolean;
};

const number = new Intl.NumberFormat();
const REGISTRATION: Record<Registration, string> = {
    open: "Open signups",
    invite: "Invite only",
    approval: "Signups need approval",
    closed: "Signups closed",
};
const STATUS: Record<OwnerState["status"], string> = {
    off: "Only people on this instance can find this server in Discovery.",
    hidden: "This instance's admins hid this server from other instances. Ask them if you think that's a mistake.",
    no_invite: "This server needs a text channel before it can show on other instances.",
    pending: "Waiting for verification. Once it's verified, people on other instances can find it in Discovery.",
    verified: "Verified. People on other instances can find this server in Discovery.",
    blocked: "The registry blocked this server, so other instances don't show it.",
    unknown: "This instance hasn't reached the federation registry yet, so other instances can't see this server for now.",
};

function Initials({ name, className }: { name: string; className: string }) {
    const letters = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => [...word][0])
        .join("");
    return (
        <span className={`${className} fosscord-federation-initials`} aria-hidden="true">
            {letters || "?"}
        </span>
    );
}

function Icon({ src, name, className }: { src: string | null; name: string; className: string }) {
    const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
    return (
        <span className={`${className} fosscord-federation-icon`}>
            <Initials name={name} className="fosscord-federation-icon-fill" />
            {src && state !== "failed" && (
                <img
                    className="fosscord-federation-icon-fill"
                    data-loaded={state === "loaded"}
                    src={src}
                    alt=""
                    loading="lazy"
                    onLoad={() => setState("loaded")}
                    onError={() => setState("failed")}
                />
            )}
        </span>
    );
}

function GuildCard({ guild }: { guild: RemoteGuild }) {
    return (
        <a
            className="fosscord-federation-card fosscord-federation-guild"
            href={guild.invite_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the invite to ${guild.name} on ${guild.instance_name} in a new tab`}
        >
            <div className="fosscord-federation-guild-head">
                <Icon src={guild.icon_url} name={guild.name} className="fosscord-federation-guild-icon" />
                <span className="fosscord-federation-instance-tag" title={guild.instance}>
                    {guild.instance_name}
                </span>
            </div>
            <Text variant="heading-md/semibold" color="text-strong" className="fosscord-federation-title">
                {guild.name}
            </Text>
            {guild.description && (
                <Text variant="text-sm/normal" color="text-default" className="fosscord-federation-description">
                    {guild.description}
                </Text>
            )}
            <div className="fosscord-federation-meta">
                <span className="fosscord-federation-dot" aria-hidden="true" />
                <Text variant="text-xs/normal" color="text-muted" className="fosscord-federation-number">
                    {number.format(guild.member_count)} {guild.member_count === 1 ? "member" : "members"}
                </Text>
            </div>
        </a>
    );
}

function InstanceCard({ instance }: { instance: RemoteInstance }) {
    return (
        <a
            className="fosscord-federation-card fosscord-federation-instance"
            href={instance.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${instance.name} in a new tab`}
        >
            <Icon src={instance.icon_url} name={instance.name} className="fosscord-federation-instance-icon" />
            <div className="fosscord-federation-instance-text">
                <Text variant="text-md/semibold" color="text-strong" className="fosscord-federation-ellipsis">
                    {instance.name}
                </Text>
                <Text variant="text-xs/normal" color="text-muted" className="fosscord-federation-ellipsis">
                    {instance.id} · {REGISTRATION[instance.registration]}
                </Text>
                {instance.description && (
                    <Text variant="text-sm/normal" color="text-default" className="fosscord-federation-description">
                        {instance.description}
                    </Text>
                )}
            </div>
        </a>
    );
}

function OtherInstances({ onScroll }: { onScroll?: (event: UIEvent<HTMLDivElement>) => void }) {
    const [directory, setDirectory] = useState<Directory | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        RestAPI.get({ url: "/federation/discovery" })
            .then((res: { body: Directory }) => active && setDirectory(res.body))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, []);

    const empty = (title: string, body: string) => (
        <div className="fosscord-federation-empty" role="status">
            <Text variant="heading-md/semibold" color="text-strong">
                {title}
            </Text>
            <Text variant="text-sm/normal" color="text-muted">
                {body}
            </Text>
        </div>
    );

    return (
        <div className="fosscord-federation-page" onScroll={onScroll}>
            <header className="fosscord-federation-hero">
                <Text variant="heading-xl/semibold" color="text-strong" tag="h2">
                    Other instances
                </Text>
                <Text variant="text-md/normal" color="text-default" className="fosscord-federation-lede">
                    Servers and communities on other approved instances. Joining one opens its invite on that instance in a new tab, where you sign up or sign in there.
                </Text>
            </header>
            {failed ? (
                empty("Couldn't load other instances", "Check your connection and open this tab again.")
            ) : !directory ? (
                <div className="fosscord-federation-loading" role="status" aria-label="Loading other instances" />
            ) : !directory.available ? (
                empty(
                    directory.reason === "disabled" ? "This instance doesn't connect to other instances" : "Other instances aren't available right now",
                    directory.reason === "disabled"
                        ? "Its admins turned federation off."
                        : "This instance hasn't got a current list from the registry. It checks again every 5 minutes.",
                )
            ) : (
                <>
                    <section className="fosscord-federation-section" aria-labelledby="fosscord-federation-servers">
                        <Text variant="heading-lg/semibold" color="text-strong" tag="h3" id="fosscord-federation-servers">
                            Servers
                        </Text>
                        {directory.guilds.length ? (
                            <div className="fosscord-federation-grid">
                                {directory.guilds.map((guild) => (
                                    <GuildCard key={guild.id} guild={guild} />
                                ))}
                            </div>
                        ) : (
                            empty(
                                "No servers yet",
                                directory.verification === "instance"
                                    ? "This instance's admins haven't verified any servers from other instances yet."
                                    : "No server on another instance has been verified for global discovery yet.",
                            )
                        )}
                    </section>
                    <section className="fosscord-federation-section" aria-labelledby="fosscord-federation-instances">
                        <Text variant="heading-lg/semibold" color="text-strong" tag="h3" id="fosscord-federation-instances">
                            Instances
                        </Text>
                        {directory.instances.length ? (
                            <div className="fosscord-federation-list">
                                {directory.instances.map((instance) => (
                                    <InstanceCard key={instance.id} instance={instance} />
                                ))}
                            </div>
                        ) : (
                            empty("No other instances yet", "Approved instances show up here as the registry lists them.")
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

function OwnerSettings() {
    const guildId = GuildSettingsStore.getGuildId();
    const [state, setState] = useState<OwnerState | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!guildId) return;
        RestAPI.get({ url: `/guilds/${guildId}/global-discovery` })
            .then((res: { body: OwnerState }) => setState(res.body))
            .catch((err: { body?: { message?: string } }) => setError(err?.body?.message ?? "Couldn't load this setting."));
    }, [guildId]);

    const change = async (enabled: boolean) => {
        if (!guildId) return;
        setSaving(true);
        setError(null);
        try {
            const res = await RestAPI.patch({ url: `/guilds/${guildId}/global-discovery`, body: { enabled } });
            setState(res.body);
            showToast(enabled ? "This server can now show on other instances" : "This server no longer shows on other instances", "success");
        } catch (err) {
            setError((err as { body?: { message?: string } })?.body?.message ?? "Couldn't save. Try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fosscord-federation-settings">
            <Text variant="heading-lg/semibold" color="text-strong" tag="h2">
                Other instances
            </Text>
            <Text variant="text-sm/normal" color="text-muted" className="fosscord-federation-lede">
                Let people on other approved instances find this server in their Discovery. They join through a permanent invite link, which is created for you if the server
                doesn't have one.
            </Text>
            {state && (
                <>
                    <FormSwitch
                        title="Show on other instances"
                        description="Lists this server's name, icon, description and member count on other instances after verification."
                        value={state.enabled}
                        disabled={saving || !state.federation_enabled}
                        onChange={change}
                    />
                    <div className="fosscord-federation-status" role="status">
                        <Text variant="text-sm/medium" color="text-default">
                            {!state.federation_enabled ? "This instance's admins turned federation off." : STATUS[state.status]}
                        </Text>
                        {state.enabled && state.invite_url && (
                            <div className="fosscord-federation-invite">
                                <Text variant="text-xs/normal" color="text-muted">
                                    Invite link people from other instances use
                                </Text>
                                <div className="fosscord-federation-invite-row">
                                    <span className="fosscord-federation-link">{state.invite_url}</span>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => navigator.clipboard.writeText(state.invite_url as string).then(() => showToast("Invite link copied", "success"))}
                                    >
                                        Copy link
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
            {error && (
                <Text variant="text-sm/normal" color="text-feedback-critical" role="alert">
                    {error}
                </Text>
            )}
        </div>
    );
}

export default definePlugin({
    name: "FosscordFederation",
    description: "Adds Other instances to Discover, with servers and instances from the federation registry, and the Show on other instances switch to Server Settings for owners.",
    authors: [FosscordAuthor],
    required: true,
    managedStyle,

    tabs: () => [{ id: TAB, label: "Other instances" }],
    renderOtherInstances: (props: { onScroll?: (event: UIEvent<HTMLDivElement>) => void }) => <OtherInstances {...props} />,
    settingsSection: (props: { isOwner?: boolean }) => ({
        section: SECTION,
        label: "Other instances",
        ariaLabel: "Other instances",
        element: OwnerSettings,
        predicate: () => !!props.isOwner,
    }),

    patches: [
        {
            find: "[getGlobalDiscoveryServerTabTitle] Unsupported tab",
            replacement: {
                match: /case (\i)\.\i\.HUBS:return \1\.(\i);(?=default:)/,
                replace: `$&case"${TAB}":return $1.$2;`,
            },
        },
        {
            find: "[getSectionHeight] Failed for section",
            replacement: [
                {
                    match: /(\]\.map\((\i)=>\(\{id:\2,label:\(0,\i\.\i\)\(\2\)\}\)\))/,
                    replace: "$1.concat($self.tabs())",
                },
                {
                    match: /(case \i\.\i\.HUBS:return\(0,\i\.jsx\)\(\i,\{onScroll:(\i)\}\);?)(default:)/,
                    replace: `$1case"${TAB}":return $self.renderOtherInstances({onScroll:$2});$3`,
                },
            ],
        },
        {
            find: ".GUILD_SETTINGS_DISCOVERY_LANDING_PAGE,label",
            replacement: {
                match: /(\i)\.push\((\i)\(\i\.\i\.DISCOVERY_LANDING_PAGE,(\i)\)\)/,
                replace: "$&,$1.push($self.settingsSection($3))",
            },
        },
    ],
});
