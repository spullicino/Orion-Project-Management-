import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gmail for Aftersales (support@): sign-in with Google once, then read and send
 * through the Gmail API. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Vercel).
 * The mailbox's keys are kept in as_mail_settings, which only the server can read.
 */
type Admin = ReturnType<typeof createAdminClient>;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
// Read, label and send — nothing is ever deleted.
const SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const LABEL_NAME = "Orion-Projects";

// Trimmed: a space or line break pasted into Vercel would make Google answer "client not found".
const clientId = () => (process.env.GOOGLE_CLIENT_ID ?? "").trim().replace(/^["']|["']$/g, "");
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
export const gmailConfigured = () => !!(clientId() && clientSecret());
export const gmailRedirectUri = (site: string) => `${site}/api/aftersales/gmail/callback`;

export function gmailAuthUrl(site: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: gmailRedirectUri(site),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; error?: string; error_description?: string };

async function token(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new GmailError(json.error_description || json.error || `Google sign-in failed (${res.status})`, json.error === "invalid_grant");
  return json;
}

export const exchangeCode = (code: string, site: string) => token({ grant_type: "authorization_code", code, redirect_uri: gmailRedirectUri(site) });

export async function revokeToken(t: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: "POST" }).catch(() => {});
}

export class GmailError extends Error {
  constructor(
    message: string,
    /** The mailbox has to be connected again (access was removed or expired). */
    public reconnect = false,
  ) {
    super(message);
  }
}

/** A Gmail API client with a fresh access key (renewed and saved when needed). */
export async function gmailFor(admin: Admin) {
  const { data: s } = await admin.from("as_mail_settings").select("*").eq("id", true).maybeSingle();
  if (!s?.refresh_token) return null;
  let accessToken = s.access_token;
  if (!accessToken || !s.access_expires_at || new Date(s.access_expires_at).getTime() < Date.now() + 60_000) {
    const t = await token({ grant_type: "refresh_token", refresh_token: s.refresh_token });
    accessToken = t.access_token;
    await admin
      .from("as_mail_settings")
      .update({ access_token: t.access_token, access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() })
      .eq("id", true);
  }
  return { settings: s, api: gmailApi(accessToken!) };
}

export function gmailApi(accessToken: string) {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GmailError(`Gmail ${res.status}: ${text.slice(0, 300)}`, res.status === 401);
    }
    return (await res.json()) as T;
  }
  return {
    profile: () => call<{ emailAddress: string }>("/profile"),
    labels: () => call<{ labels?: { id: string; name: string }[] }>("/labels"),
    createLabel: (name: string) =>
      call<{ id: string }>("/labels", { method: "POST", body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }) }),
    list: (q: string, max = 20) => call<{ messages?: { id: string; threadId: string }[] }>(`/messages?${new URLSearchParams({ q, maxResults: String(max) })}`),
    raw: (id: string) => call<{ id: string; threadId: string; raw: string }>(`/messages/${id}?format=raw`),
    addLabel: (id: string, labelId: string) => call(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [labelId] }) }),
    send: (raw: Buffer, threadId?: string | null) =>
      call<{ id: string; threadId: string }>("/messages/send", { method: "POST", body: JSON.stringify({ raw: raw.toString("base64url"), ...(threadId ? { threadId } : {}) }) }),
  };
}
export type GmailApi = ReturnType<typeof gmailApi>;

/** Our label on imported emails ("Orion-Projects"), made the first time. */
export async function ensureLabel(admin: Admin, api: GmailApi, current: string | null): Promise<string> {
  if (current) return current;
  const existing = (await api.labels()).labels?.find((l) => l.name === LABEL_NAME);
  const id = existing?.id ?? (await api.createLabel(LABEL_NAME)).id;
  await admin.from("as_mail_settings").update({ label_id: id }).eq("id", true);
  return id;
}
