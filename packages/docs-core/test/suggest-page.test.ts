import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyOps,
  blocksToMarkdown,
  type DocState,
  parseMarkdown,
  proposalIds,
  Refusal,
  type Session,
} from "../src/index.ts";

// What a page writes in Suggesting mode: `suggest` on each op, the server naming the author.

const idsFor = (session: Session) => ({
  take: () => `${session.sess}.${session.next++}`,
});

function start(markdown: string): { doc: DocState; session: Session } {
  const session: Session = { sess: "s1", next: 1 };
  return {
    doc: { rev: 1, blocks: parseMarkdown(markdown, idsFor(session)) },
    session,
  };
}

const inline = (text: string) => ({
  as: "inline",
  from: { kind: "inline", content: [{ type: "text", text }] },
});
const firstBlock = (doc: DocState) => doc.blocks[0]!;
const charIds = (doc: DocState) =>
  firstBlock(doc).inline!.map((item) => item.id);
const refusalCode = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof Refusal, String(error));
    return error.code;
  }
  assert.fail("expected a refusal");
};

test("typed words go in as an addition recorded as the author’s", () => {
  const { doc, session } = start("Hello world");
  const ids = charIds(doc);
  const { doc: after } = applyOps(
    doc,
    [
      {
        op: "insert",
        target: { kind: "chars", range: [ids[4], ids[4]] },
        side: "after",
        with: inline(" there"),
        suggest: "sg_a",
      },
    ],
    session,
    {
      author: "u1",
    },
  );
  const items = firstBlock(after).inline!;
  assert.equal(
    items.map((item) => ("ch" in item ? item.ch : "")).join(""),
    "Hello there world",
  );
  assert.deepEqual(
    items.filter((item) => item.suggest).map((item) => item.suggest),
    Array.from({ length: 6 }, () => ({ id: "sg_a", op: "ins" })),
  );
  assert.equal(after.suggestions?.sg_a?.by, "u1");
  assert.equal(after.suggestions?.sg_a?.via, undefined);
  assert.deepEqual(proposalIds(after.blocks), ["sg_a"]);
});

test("deleted words stay, struck; the author’s own added words go outright", () => {
  const { doc, session } = start("Hello world");
  const ids = charIds(doc);
  const struck = applyOps(
    doc,
    [
      {
        op: "delete",
        target: { kind: "chars", range: [ids[6], ids[10]] },
        suggest: "sg_d",
      },
    ],
    session,
    { author: "u1" },
  ).doc;
  assert.equal(
    firstBlock(struck)
      .inline!.filter((item) => item.suggest?.op === "del")
      .map((item) => ("ch" in item ? item.ch : ""))
      .join(""),
    "world",
  );
  assert.equal(blocksToMarkdown(struck.blocks).includes("world"), true);
  // Words added, then deleted again by the same person: nothing is left of them.
  const added = applyOps(
    struck,
    [
      {
        op: "insert",
        target: { kind: "chars", range: [ids[5], ids[5]] },
        side: "after",
        with: inline("big "),
        suggest: "sg_d",
      },
    ],
    session,
    { author: "u1" },
  ).doc;
  const mine = firstBlock(added)
    .inline!.filter((item) => item.suggest?.op === "ins")
    .map((item) => item.id);
  assert.equal(mine.length, 4);
  const gone = applyOps(
    added,
    [
      {
        op: "delete",
        target: { kind: "chars", range: [mine[0], mine[3]] },
        suggest: "sg_d",
      },
    ],
    session,
    { author: "u1" },
  ).doc;
  assert.equal(
    firstBlock(gone)
      .inline!.map((item) => ("ch" in item ? item.ch : ""))
      .join(""),
    "Hello world",
  );
  assert.equal(
    firstBlock(gone).inline!.some((item) => item.suggest?.op === "ins"),
    false,
  );
});

test("a new block from Enter is an addition", () => {
  const { doc, session } = start("One\n\n- a\n- b");
  const first = firstBlock(doc).id;
  const { doc: after } = applyOps(
    doc,
    [
      {
        op: "insert",
        target: { kind: "blocks", ids: [first] },
        side: "after",
        ids: { from: "s1.50", count: 1 },
        with: {
          as: "blocks",
          from: { kind: "blocks", content: [{ type: "paragraph" }] },
        },
        suggest: "sg_p",
      },
    ],
    session,
    { author: "u1" },
  );
  assert.equal(after.blocks[1]!.id, "s1.50");
  assert.deepEqual(after.blocks[1]!.suggest, { id: "sg_p", op: "ins" });
  // In a list: a new item, its id first.
  const list = doc.blocks[1]!;
  const item = list.children![1]!.id;
  const inList = applyOps(
    doc,
    [
      {
        op: "insert",
        target: { kind: "blocks", ids: [item] },
        side: "after",
        ids: { from: "s1.60", count: 2 },
        with: {
          as: "blocks",
          from: { kind: "blocks", content: [{ type: "paragraph" }] },
        },
        suggest: "sg_i",
      },
    ],
    session,
    { author: "u1" },
  ).doc;
  const made = inList.blocks[1]!.children![2]!;
  assert.equal(made.type, "listItem");
  assert.equal(made.id, "s1.60");
  assert.equal(made.children![0]!.id, "s1.61");
  assert.equal(made.suggest?.id, "sg_i");
});

test("a page adds only to suggestions of its author", () => {
  const { doc, session } = start("Hello world");
  const ids = charIds(doc);
  const theirs = applyOps(
    doc,
    [
      {
        op: "delete",
        target: { kind: "chars", range: [ids[0], ids[0]] },
        suggest: "sg_x",
      },
    ],
    session,
    { author: "u2" },
  ).doc;
  const op = {
    op: "delete",
    target: { kind: "chars", range: [ids[1], ids[1]] },
    suggest: "sg_x",
  };
  assert.equal(
    refusalCode(() => applyOps(theirs, [op], session, { author: "u1" })),
    "not_yours",
  );
  // An agent's suggestion takes no additions from the page either.
  const agents = applyOps(
    doc,
    [{ op: "delete", target: { kind: "chars", range: [ids[0], ids[0]] } }],
    session,
    {
      suggest: {
        id: "sg_agent",
        info: { by: "u1", at: "2026-01-01T00:00:00Z", via: "agent" },
      },
    },
  ).doc;
  assert.equal(
    refusalCode(() =>
      applyOps(agents, [{ ...op, suggest: "sg_agent" }], session, {
        author: "u1",
      }),
    ),
    "not_yours",
  );
  // The same author adds to theirs.
  const more = applyOps(theirs, [op], session, { author: "u2" }).doc;
  assert.equal(
    firstBlock(more).inline!.filter((item) => item.suggest?.id === "sg_x")
      .length,
    2,
  );
});

test("a page suggestion takes no formatting, a bad id, or an agent’s guards", () => {
  const { doc, session } = start("Hello world");
  const ids = charIds(doc);
  const target = { kind: "chars", range: [ids[0], ids[4]] };
  assert.notEqual(
    refusalCode(() =>
      applyOps(
        doc,
        [
          {
            op: "format",
            target,
            marks: { add: [{ type: "bold" }] },
            suggest: "sg_f",
          },
        ],
        session,
        { author: "u1" },
      ),
    ),
    undefined,
  );
  assert.equal(
    refusalCode(() =>
      applyOps(doc, [{ op: "delete", target, suggest: "no spaces" }], session, {
        author: "u1",
      }),
    ),
    "bad_op",
  );
  assert.equal(
    refusalCode(() =>
      applyOps(doc, [{ op: "delete", target, suggest: "sg_g" }], session, {
        guards: true,
      }),
    ),
    "suggest_not_here",
  );
});

test("without an author (the page applying its own write) the record names no one yet", () => {
  const { doc, session } = start("Hello");
  const ids = charIds(doc);
  const { doc: after } = applyOps(
    doc,
    [
      {
        op: "delete",
        target: { kind: "chars", range: [ids[0], ids[0]] },
        suggest: "sg_n",
      },
    ],
    session,
  );
  assert.equal(after.suggestions?.sg_n?.by, "");
});

test("an agent’s suggestion is recorded as before", () => {
  const { doc, session } = start("Hello");
  const ids = charIds(doc);
  const info = { by: "u1", at: "2026-01-01T00:00:00Z", via: "agent" };
  const { doc: after } = applyOps(
    doc,
    [{ op: "delete", target: { kind: "chars", range: [ids[0], ids[0]] } }],
    session,
    { suggest: { id: "sg_ag", info } },
  );
  assert.deepEqual(after.suggestions?.sg_ag, info);
  assert.equal(firstBlock(after).inline![0]!.suggest?.op, "del");
});
