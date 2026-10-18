import { HTTPError } from "lambert-server/HTTPError";

const SNOWFLAKE = /^\d{1,20}$/;
const MAX_SNOWFLAKE = 9223372036854775807n;

const single = (value: unknown, name: string) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new HTTPError(`${name} must be supplied once as a string`, 400);
    return value;
};

export function snowflakeCursor(value: unknown, name: string) {
    const text = single(value, name);
    if (text === undefined || text === "") return undefined;
    if (!SNOWFLAKE.test(text) || BigInt(text) > MAX_SNOWFLAKE) throw new HTTPError(`${name} must be an ID`, 400);
    return text;
}

export function cursorLimit(value: unknown, fallback: number, max: number) {
    const text = single(value, "limit");
    if (text === undefined) return fallback;
    if (!/^\d{1,4}$/.test(text) || Number(text) < 1 || Number(text) > max) throw new HTTPError(`limit must be between 1 and ${max}`, 400);
    return Number(text);
}

export function searchText(value: unknown, max = 100) {
    const text = (single(value, "q") ?? "").trim();
    if (text.length > max) throw new HTTPError(`q must be no longer than ${max} characters`, 400);
    return text;
}

export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

export function cursorPage<T>(rows: T[], limit: number, key: (row: T) => string) {
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;
    return { page, next: more && page.length ? key(page[page.length - 1]) : null };
}
