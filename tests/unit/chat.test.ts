import { describe, expect, it } from "vitest";
import { buildList, filterPeople, mentionQuery, mergeMessages, segmentBody } from "@/lib/chat";
import type { ChatMessage } from "@/types/chat";

const msg = (id: string, author: string, at: string, extra: Partial<ChatMessage> = {}) =>
  ({ id, author_id: author, created_at: at, deleted: false, body: "", attachments: [], reactions: [], mentions: [], ...extra }) as ChatMessage;

describe("buildList", () => {
  it("adds day separators and groups quick messages from the same person", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const items = buildList(
      [
        msg("a", "u1", "2026-03-09T09:00:00Z"),
        msg("b", "u1", "2026-03-10T09:00:00Z"),
        msg("c", "u1", "2026-03-10T09:03:00Z"),
        msg("d", "u2", "2026-03-10T09:04:00Z"),
        msg("e", "u2", "2026-03-10T09:20:00Z"),
      ],
      now,
    );
    expect(items.map((i) => (i.kind === "day" ? `[${i.label}]` : `${i.key}${i.showHeader ? "*" : ""}`))).toEqual([
      "[Yesterday]", "a*", "[Today]", "b*", "c", "d*", "e*",
    ]);
  });
});

describe("mergeMessages", () => {
  it("replaces by id and keeps time order", () => {
    const list = [msg("a", "u", "2026-01-01T10:00:00Z"), msg("b", "u", "2026-01-01T11:00:00Z", { body: "old" })];
    const merged = mergeMessages(list, [msg("b", "u", "2026-01-01T11:00:00Z", { body: "new" }), msg("c", "u", "2026-01-01T10:30:00Z")]);
    expect(merged.map((m) => `${m.id}:${m.body}`)).toEqual(["a:", "c:", "b:new"]);
  });
});

describe("mentions", () => {
  it("finds the name being typed after @", () => {
    expect(mentionQuery("Hi @Ti", 6)).toEqual({ query: "Ti", start: 3 });
    expect(mentionQuery("@", 1)).toEqual({ query: "", start: 0 });
    expect(mentionQuery("email@test", 10)).toBeNull();
    expect(mentionQuery("Hi @Tina done", 13)).toBeNull();
  });

  it("matches first or last names", () => {
    const people = [
      { user_id: "1", first_name: "Tina", last_name: "Camilleri", email: null, avatar_url: null },
      { user_id: "2", first_name: "Tom", last_name: "Debono", email: null, avatar_url: null },
    ];
    expect(filterPeople(people, "t").map((p) => p.user_id)).toEqual(["1", "2"]);
    expect(filterPeople(people, "deb").map((p) => p.user_id)).toEqual(["2"]);
  });

  it("highlights mentions and links in a message", () => {
    const segs = segmentBody("@Tina Camilleri see https://example.com/plan.pdf.", [{ id: "u1", name: "Tina Camilleri" }], "u1");
    expect(segs).toEqual([
      { type: "mention", text: "@Tina Camilleri", me: true },
      { type: "text", text: " see " },
      { type: "link", text: "https://example.com/plan.pdf", href: "https://example.com/plan.pdf" },
      { type: "text", text: "." },
    ]);
  });
});
