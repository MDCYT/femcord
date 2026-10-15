/* SPDX-License-Identifier: AGPL-3.0-only */
import { parseCanonicalId } from "./Protocol";

export const DECORATION_FIELD = "avatar_decoration_data";
export const DECORATION_ASSET = /^(?:a_)?[0-9a-f]{32}$/;
export const DECORATION_ART_MAX_BYTES = 10 * 1024 * 1024;

const SKU = /^\d{1,20}$/;
const MAX_DEPTH = 64;

export interface DecorationData {
    asset: string;
    sku_id: string;
    expires_at: number | string | null;
}

export interface RemoteDecorationRef {
    sku: string;
    asset: string;
}

export const decorationKey = (ref: RemoteDecorationRef) => `${ref.sku}:${ref.asset}`;

export type DecorationSkuResolver = (wanted: RemoteDecorationRef[]) => Promise<Map<string, string>>;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

const liveExpiry = (value: unknown, now: number): number | string | null | undefined => {
    if (value === null || value === undefined) return null;
    const at =
        typeof value === "number" && Number.isSafeInteger(value) && value > 0
            ? value < 1e11
                ? value * 1000
                : value
            : typeof value === "string" && value.length <= 64
              ? Date.parse(value)
              : Number.NaN;
    if (Number.isNaN(at) || at <= now) return undefined;
    return value as number | string;
};

export const readDecoration = (value: unknown, now = Date.now()): DecorationData | null => {
    if (!isObject(value)) return null;
    const { asset, sku_id, expires_at } = value;
    if (typeof asset !== "string" || !DECORATION_ASSET.test(asset) || typeof sku_id !== "string" || !SKU.test(sku_id)) return null;
    const expiry = liveExpiry(expires_at, now);
    return expiry === undefined ? null : { asset, sku_id, expires_at: expiry };
};

export const remoteDecorationSku = (value: unknown, sender: string) => {
    if (typeof value !== "string") return null;
    if (SKU.test(value)) return value;
    const parsed = parseCanonicalId(value);
    return parsed?.instance === sender ? parsed.id : null;
};

export const readRemoteDecoration = (value: unknown, sender: string, now = Date.now()) => {
    if (!isObject(value)) return null;
    const sku = remoteDecorationSku(value.sku_id, sender);
    return sku ? readDecoration({ ...value, sku_id: sku }, now) : null;
};

const decorationHolders = (value: unknown) => {
    const holders: Record<string, unknown>[] = [];
    const visit = (node: unknown, depth: number) => {
        if (depth > MAX_DEPTH) return;
        if (Array.isArray(node)) {
            for (const entry of node) visit(entry, depth + 1);
            return;
        }
        if (!isObject(node)) return;
        if (Object.hasOwn(node, DECORATION_FIELD)) holders.push(node);
        for (const [key, child] of Object.entries(node)) if (key !== DECORATION_FIELD && child && typeof child === "object") visit(child, depth + 1);
    };
    visit(value, 0);
    return holders;
};

export async function localizeDecorations<T>(value: T, sender: string, resolve: DecorationSkuResolver, now = Date.now()): Promise<T> {
    const holders = decorationHolders(value);
    if (!holders.length) return value;
    const parsed = holders.map((holder) => readRemoteDecoration(holder[DECORATION_FIELD], sender, now));
    const refs = parsed.map((decoration) => (decoration ? { sku: decoration.sku_id, asset: decoration.asset } : null));
    const wanted = new Map(refs.flatMap((ref) => (ref ? [[decorationKey(ref), ref] as const] : [])));
    const local = wanted.size ? await resolve([...wanted.values()]).catch(() => new Map<string, string>()) : new Map<string, string>();
    holders.forEach((holder, index) => {
        const decoration = parsed[index];
        const ref = refs[index];
        const sku_id = ref ? local.get(decorationKey(ref)) : undefined;
        holder[DECORATION_FIELD] = decoration && sku_id && SKU.test(sku_id) ? { ...decoration, sku_id } : null;
    });
    return value;
}
