import dedent from "dedent-js";
import test from "tape";
import { formatDocs, getDocs, processDocs } from "..";
import {
  applyFileContexts,
  bucketSuffix,
  collectAllContexts,
  findMultiContextTables,
  generateClassDeclarations,
  getDocContexts,
  getDocTableName,
  partitionDocsByContext,
  remapDocTableNames,
} from "../context";
import { Doc } from "../doc";
import { testInput } from "./utility/harness";

function parseDocs(input: string, path = "test.cpp"): Doc[] {
  const [result, err] = getDocs(input, path);
  if (err != null) throw err;
  return result[0];
}

// --- getDocContexts ---

test("getDocContexts: single context", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced
     */
  `);
  t.deepEqual(getDocContexts(docs[0]), ["synced"]);
  t.end();
});

test("getDocContexts: comma-separated contexts", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced, unsynced
     */
  `);
  t.deepEqual(getDocContexts(docs[0]), ["synced", "unsynced"]);
  t.end();
});

test("getDocContexts: multiple @context tags", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced
     * @context unsynced
     */
  `);
  t.deepEqual(getDocContexts(docs[0]), ["synced", "unsynced"]);
  t.end();
});

test("getDocContexts: deduplicated across tags and commas", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced, unsynced
     * @context synced
     */
  `);
  t.deepEqual(getDocContexts(docs[0]), ["synced", "unsynced"]);
  t.end();
});

test("getDocContexts: no context returns empty", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     */
  `);
  t.deepEqual(getDocContexts(docs[0]), []);
  t.end();
});

// --- applyFileContexts ---

test("applyFileContexts: standalone context applies to all docs in file", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @context synced
     */
    /***
     * @function Foo
     */
    /***
     * @function Bar
     */
  `,
    "test.cpp"
  );

  const entries: [string, Doc[]][] = [["test.cpp", docs]];
  applyFileContexts(entries);

  const [, fileDocs] = entries[0];
  t.equal(fileDocs.length, 2, "standalone doc removed");
  t.deepEqual(getDocContexts(fileDocs[0]), ["synced"], "Foo gets synced");
  t.deepEqual(getDocContexts(fileDocs[1]), ["synced"], "Bar gets synced");
  t.end();
});

test("applyFileContexts: per-function context overrides file-level", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @context synced
     */
    /***
     * @function Foo
     * @context unsynced
     */
    /***
     * @function Bar
     */
  `,
    "test.cpp"
  );

  const entries: [string, Doc[]][] = [["test.cpp", docs]];
  applyFileContexts(entries);

  const [, fileDocs] = entries[0];
  t.deepEqual(
    getDocContexts(fileDocs[0]),
    ["unsynced"],
    "Foo keeps its own context"
  );
  t.deepEqual(
    getDocContexts(fileDocs[1]),
    ["synced"],
    "Bar inherits file-level"
  );
  t.end();
});

test("applyFileContexts: no standalone context is a no-op", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced
     */
  `);
  const entries: [string, Doc[]][] = [["test.cpp", docs]];
  const errors = applyFileContexts(entries);

  t.equal(errors.length, 0, "no errors");
  const [, fileDocs] = entries[0];
  t.equal(fileDocs.length, 1);
  t.deepEqual(getDocContexts(fileDocs[0]), ["synced"]);
  t.end();
});

test("applyFileContexts: errors on duplicate file-level context docs", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @context synced
     */
    /***
     * @context unsynced
     */
    /***
     * @function Foo
     */
  `,
    "dup.cpp"
  );

  const entries: [string, Doc[]][] = [["dup.cpp", docs]];
  const errors = applyFileContexts(entries);

  t.equal(errors.length, 1, "one error returned");
  t.ok(errors[0].includes("multiple file-level attribute docs"), "error mentions duplicates");
  t.equal(entries[0][1].length, 3, "docs unchanged on error");
  t.end();
});

test("applyFileContexts: errors when file-level context is not first", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @function Foo
     */
    /***
     * @context synced
     */
    /***
     * @function Bar
     */
  `,
    "late.cpp"
  );

  const entries: [string, Doc[]][] = [["late.cpp", docs]];
  const errors = applyFileContexts(entries);

  t.equal(errors.length, 1, "one error returned");
  t.ok(errors[0].includes("must be the first doc"), "error mentions position");
  t.equal(entries[0][1].length, 3, "docs unchanged on error");
  t.end();
});

test("applyFileContexts: valid first-position context returns no errors", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @context synced
     */
    /***
     * @function Foo
     */
  `,
    "ok.cpp"
  );

  const entries: [string, Doc[]][] = [["ok.cpp", docs]];
  const errors = applyFileContexts(entries);

  t.equal(errors.length, 0, "no errors");
  t.equal(entries[0][1].length, 1, "standalone doc removed");
  t.deepEqual(getDocContexts(entries[0][1][0]), ["synced"]);
  t.end();
});

// --- collectAllContexts ---

test("collectAllContexts: gathers from all files", (t) => {
  const docsA = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced
     */
  `);
  const docsB = parseDocs(dedent`
    /***
     * @function Bar
     * @context unsynced
     */
  `);
  const entries: [string, Doc[]][] = [
    ["a.cpp", docsA],
    ["b.cpp", docsB],
  ];

  const all = collectAllContexts(entries);
  t.deepEqual([...all].sort(), ["synced", "unsynced"]);
  t.end();
});

test("collectAllContexts: empty when no contexts", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     */
  `);
  const all = collectAllContexts([["a.cpp", docs]]);
  t.equal(all.size, 0);
  t.end();
});

// --- partitionDocsByContext ---

test("partitionDocsByContext: single context goes to named bucket", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced
     */
  `);
  const all = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], all);

  const syncedDocs = buckets.get("synced")!.flatMap(([, d]) => d);
  t.equal(syncedDocs.length, 1);
  t.end();
});

test("partitionDocsByContext: no context goes to shared", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     */
  `);
  const all = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], all);

  const sharedDocs = buckets.get("shared")!.flatMap(([, d]) => d);
  t.equal(sharedDocs.length, 1);
  t.end();
});

test("partitionDocsByContext: all contexts goes to shared", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced, unsynced
     */
  `);
  const all = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], all);

  const sharedDocs = buckets.get("shared")!.flatMap(([, d]) => d);
  t.equal(sharedDocs.length, 1);
  t.end();
});

test("partitionDocsByContext: strict subset gets combined name", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     * @context synced, unsynced
     */
  `);
  const all = new Set(["synced", "unsynced", "widget"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], all);

  const combinedDocs = buckets.get("synced_unsynced")!.flatMap(([, d]) => d);
  t.equal(combinedDocs.length, 1);
  t.end();
});

test("partitionDocsByContext: mixed docs across files", (t) => {
  const docsA = parseDocs(
    dedent`
    /***
     * @function Foo
     * @context synced
     */
    /***
     * @function Bar
     */
  `,
    "a.cpp"
  );
  const docsB = parseDocs(
    dedent`
    /***
     * @function Baz
     * @context unsynced
     */
  `,
    "b.cpp"
  );

  const all = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext(
    [
      ["a.cpp", docsA],
      ["b.cpp", docsB],
    ],
    all
  );

  t.ok(buckets.has("synced"), "has synced bucket");
  t.ok(buckets.has("unsynced"), "has unsynced bucket");
  t.ok(buckets.has("shared"), "has shared bucket");

  const syncedDocs = buckets.get("synced")!.flatMap(([, d]) => d);
  const unsyncedDocs = buckets.get("unsynced")!.flatMap(([, d]) => d);
  const sharedDocs = buckets.get("shared")!.flatMap(([, d]) => d);

  t.equal(syncedDocs.length, 1, "one synced doc");
  t.equal(unsyncedDocs.length, 1, "one unsynced doc");
  t.equal(sharedDocs.length, 1, "one shared doc");
  t.end();
});

test("partitionDocsByContext: 3-context combinatorics (a, b, c)", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @function OnlyA
     * @context a
     */
    /***
     * @function OnlyB
     * @context b
     */
    /***
     * @function OnlyC
     * @context c
     */
    /***
     * @function AB
     * @context a, b
     */
    /***
     * @function BC
     * @context b, c
     */
    /***
     * @function AC
     * @context a, c
     */
    /***
     * @function ABC
     * @context a, b, c
     */
    /***
     * @function NoCtx
     */
  `,
    "combo.cpp"
  );

  const all = new Set(["a", "b", "c"]);
  const buckets = partitionDocsByContext([["combo.cpp", docs]], all);

  const getName = (bucket: string) =>
    buckets
      .get(bucket)
      ?.flatMap(([, d]) => d)
      .map((d) => (d.attributes.find((a) => a.attributeType === "function") as any).args.name.join(".")) ?? [];

  t.deepEqual(getName("a"), ["OnlyA"], "single context a");
  t.deepEqual(getName("b"), ["OnlyB"], "single context b");
  t.deepEqual(getName("c"), ["OnlyC"], "single context c");
  t.deepEqual(getName("a_b"), ["AB"], "pair a+b is a_b, not shared");
  t.deepEqual(getName("b_c"), ["BC"], "pair b+c is b_c, not shared");
  t.deepEqual(getName("a_c"), ["AC"], "pair a+c is a_c, not shared");

  const sharedNames = getName("shared");
  t.ok(sharedNames.includes("ABC"), "all contexts -> shared");
  t.ok(sharedNames.includes("NoCtx"), "no context -> shared");
  t.equal(sharedNames.length, 2, "only ABC and NoCtx in shared");

  t.deepEqual(
    [...buckets.keys()].sort(),
    ["a", "a_b", "a_c", "b", "b_c", "c", "shared"],
    "exactly 7 buckets"
  );
  t.end();
});

// --- @context stripped from output ---

testInput(
  "context attribute stripped from output",
  dedent`
    /***
     * Does stuff.
     *
     * @function Spring.Foo
     * @context synced
     * @param x integer
     */
  `,
  dedent`
    ---Does stuff.
    ---
    ---@param x integer
    function Spring.Foo(x) end
  `
);

testInput(
  "multiple context attributes stripped from output",
  dedent`
    /***
     * Does stuff.
     *
     * @function Spring.Foo
     * @context synced
     * @context unsynced
     * @param x integer
     */
  `,
  dedent`
    ---Does stuff.
    ---
    ---@param x integer
    function Spring.Foo(x) end
  `
);

testInput(
  "comma-separated context stripped from output",
  dedent`
    /***
     * Does stuff.
     *
     * @function Spring.Foo
     * @context synced, unsynced
     */
  `,
  dedent`
    ---Does stuff.
    function Spring.Foo() end
  `
);

// --- getDocTableName ---

test("getDocTableName: function with table prefix", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Spring.Foo
     */
  `);
  t.equal(getDocTableName(docs[0]), "Spring");
  t.end();
});

test("getDocTableName: bare function returns null", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Foo
     */
  `);
  t.equal(getDocTableName(docs[0]), null);
  t.end();
});

test("getDocTableName: table declaration", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @table Spring
     */
  `);
  t.equal(getDocTableName(docs[0]), "Spring");
  t.end();
});

test("getDocTableName: no relevant attribute", (t) => {
  const docs = parseDocs(dedent`
    /***
     * Just a description.
     * @context synced
     */
  `);
  t.equal(getDocTableName(docs[0]), null);
  t.end();
});

// --- bucketSuffix ---

test("bucketSuffix: single word", (t) => {
  t.equal(bucketSuffix("synced"), "Synced");
  t.end();
});

test("bucketSuffix: compound name", (t) => {
  t.equal(bucketSuffix("synced_unsynced"), "SyncedUnsynced");
  t.end();
});

test("bucketSuffix: shared", (t) => {
  t.equal(bucketSuffix("shared"), "Shared");
  t.end();
});

// --- findMultiContextTables ---

test("findMultiContextTables: table spanning two buckets", (t) => {
  const docsA = parseDocs(dedent`
    /***
     * @function Spring.Foo
     * @context synced
     */
  `);
  const docsB = parseDocs(dedent`
    /***
     * @function Spring.Bar
     * @context unsynced
     */
  `);
  const allContexts = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext(
    [
      ["a.cpp", docsA],
      ["b.cpp", docsB],
    ],
    allContexts
  );

  const tableBuckets = findMultiContextTables(buckets);
  t.ok(tableBuckets.has("Spring"));
  t.deepEqual([...tableBuckets.get("Spring")!].sort(), ["synced", "unsynced"]);
  t.end();
});

test("findMultiContextTables: single-bucket table not flagged as multi", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function VFS.LoadFile
     * @context synced, unsynced
     */
  `);
  const allContexts = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], allContexts);

  const tableBuckets = findMultiContextTables(buckets);
  t.ok(tableBuckets.has("VFS"));
  t.equal(tableBuckets.get("VFS")!.size, 1, "VFS only in shared bucket");
  t.end();
});

test("findMultiContextTables: mixed multi and single-bucket tables", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Spring.Foo
     * @context synced
     */
    /***
     * @function Spring.Bar
     * @context synced, unsynced
     */
    /***
     * @function VFS.LoadFile
     * @context synced, unsynced
     */
  `);
  const allContexts = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], allContexts);
  const tableBuckets = findMultiContextTables(buckets);

  t.equal(tableBuckets.get("Spring")!.size, 2, "Spring spans synced + shared");
  t.equal(tableBuckets.get("VFS")!.size, 1, "VFS only in shared");
  t.end();
});

// --- remapDocTableNames ---

test("remapDocTableNames: renames function table prefix", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Spring.Foo
     */
  `);
  remapDocTableNames(docs, "Spring", "SpringSynced");
  const attr = docs[0].attributes.find((a) => a.attributeType === "function");
  t.deepEqual((attr as any).args.name, ["SpringSynced", "Foo"]);
  t.end();
});

test("remapDocTableNames: nested name preserves inner segments", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Spring.MoveCtrl.Enable
     */
  `);
  remapDocTableNames(docs, "Spring", "SpringSynced");
  const attr = docs[0].attributes.find((a) => a.attributeType === "function");
  t.deepEqual((attr as any).args.name, ["SpringSynced", "MoveCtrl", "Enable"]);
  t.end();
});

test("remapDocTableNames: non-matching table not touched", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function VFS.LoadFile
     */
  `);
  remapDocTableNames(docs, "Spring", "SpringSynced");
  const attr = docs[0].attributes.find((a) => a.attributeType === "function");
  t.deepEqual((attr as any).args.name, ["VFS", "LoadFile"]);
  t.end();
});

test("remapDocTableNames: table declaration renamed", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @table Spring
     */
  `);
  remapDocTableNames(docs, "Spring", "SpringSynced");
  const attr = docs[0].attributes.find((a) => a.attributeType === "table");
  t.deepEqual((attr as any).args.name, ["SpringSynced"]);
  t.end();
});

// --- generateClassDeclarations ---

test("generateClassDeclarations: shared bucket gets base class", (t) => {
  const tableBuckets = new Map([
    ["Spring", new Set(["synced", "unsynced", "shared"])],
  ]);
  const result = generateClassDeclarations(tableBuckets, "shared");
  t.ok(result.includes("---@class SpringShared"));
  t.ok(result.includes("SpringShared = {}"));
  t.ok(!result.includes(":"), "no inheritance for shared");
  t.end();
});

test("generateClassDeclarations: non-shared bucket inherits from shared", (t) => {
  const tableBuckets = new Map([
    ["Spring", new Set(["synced", "unsynced", "shared"])],
  ]);
  const result = generateClassDeclarations(tableBuckets, "synced");
  t.ok(result.includes("---@class SpringSynced : SpringShared"));
  t.ok(result.includes("SpringSynced = {}"));
  t.end();
});

test("generateClassDeclarations: skips single-bucket tables", (t) => {
  const tableBuckets = new Map([
    ["Spring", new Set(["synced", "shared"])],
    ["VFS", new Set(["shared"])],
  ]);
  const result = generateClassDeclarations(tableBuckets, "shared");
  t.ok(result.includes("SpringShared"), "Spring remapped");
  t.ok(!result.includes("VFS"), "VFS not remapped");
  t.end();
});

test("generateClassDeclarations: multiple multi-context tables", (t) => {
  const tableBuckets = new Map([
    ["Spring", new Set(["synced", "shared"])],
    ["Game", new Set(["synced", "shared"])],
  ]);
  const result = generateClassDeclarations(tableBuckets, "synced");
  t.ok(result.includes("---@class SpringSynced : SpringShared"));
  t.ok(result.includes("---@class GameSynced : GameShared"));
  t.end();
});

// --- Integration: file-level context + processDocs ---

test("integration: file-level context + processDocs strips @context", (t) => {
  const docs = parseDocs(
    dedent`
    /***
     * @context synced
     */
    /***
     * Does stuff.
     *
     * @function Foo
     * @param x integer
     */
  `,
    "test.cpp"
  );

  const entries: [string, Doc[]][] = [["test.cpp", docs]];
  applyFileContexts(entries);

  const allContexts = collectAllContexts(entries);
  t.deepEqual([...allContexts], ["synced"]);

  const [, fileDocs] = entries[0];
  const processed = processDocs(fileDocs, null);
  const output = formatDocs(processed);

  t.ok(!output.includes("@context"), "no @context in output");
  t.ok(output.includes("function Foo(x) end"), "function present");
  t.end();
});

// --- End-to-end: remapping + class declarations ---

function processBucket(
  bucketName: string,
  buckets: Map<string, [string, Doc[]][]>,
  tableBuckets: Map<string, Set<string>>
): string {
  const docs = buckets
    .get(bucketName)!
    .flatMap(([, ds]) => ds)
    .map((d) => structuredClone(d));

  for (const [table, bucketSet] of tableBuckets) {
    if (bucketSet.size < 2) continue;
    remapDocTableNames(docs, table, table + bucketSuffix(bucketName));
  }

  return formatDocs(processDocs(docs, null));
}

test("end-to-end: context projection remaps multi-bucket tables with class inheritance", (t) => {
  const docs = parseDocs(dedent`
    /***
     * @function Spring.Foo
     * @context synced
     */
    /***
     * @function Spring.Baz
     * @context synced, unsynced
     */
    /***
     * @function VFS.LoadFile
     * @context synced, unsynced
     */
  `);
  const allContexts = new Set(["synced", "unsynced"]);
  const buckets = partitionDocsByContext([["a.cpp", docs]], allContexts);
  const tableBuckets = findMultiContextTables(buckets);

  t.deepEqual(
    [...buckets.keys()].sort(),
    ["shared", "synced"],
    "partition produces expected buckets"
  );
  t.equal(tableBuckets.get("Spring")!.size, 2, "Spring spans synced + shared");
  t.equal(tableBuckets.get("VFS")!.size, 1, "VFS only in shared");

  const syncedOutput = processBucket("synced", buckets, tableBuckets);
  t.ok(
    syncedOutput.includes("function SpringSynced.Foo() end"),
    "Spring.Foo remapped to SpringSynced.Foo"
  );
  t.ok(!syncedOutput.includes("function Spring.Foo"), "original name gone");
  t.ok(!syncedOutput.includes("VFS"), "VFS not in synced bucket");

  const sharedOutput = processBucket("shared", buckets, tableBuckets);
  t.ok(
    sharedOutput.includes("function SpringShared.Baz() end"),
    "Spring.Baz remapped to SpringShared.Baz"
  );
  t.ok(
    sharedOutput.includes("function VFS.LoadFile() end"),
    "VFS.LoadFile unchanged"
  );

  const syncedPreamble = generateClassDeclarations(tableBuckets, "synced");
  t.ok(syncedPreamble.includes("---@class SpringSynced : SpringShared"));
  t.ok(!syncedPreamble.includes("VFS"), "VFS not in class declarations");

  const sharedPreamble = generateClassDeclarations(tableBuckets, "shared");
  t.ok(sharedPreamble.includes("---@class SpringShared"));
  t.ok(!sharedPreamble.includes(":"), "shared class has no parent");

  t.end();
});
