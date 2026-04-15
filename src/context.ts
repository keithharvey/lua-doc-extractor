import {
  EnumAttribute,
  FieldAttribute,
  FunctionAttribute,
  GlobalAttribute,
  TableAttribute,
} from "./attribute";
import { Doc, removeAttributes } from "./doc";
import { FileOutput } from "./output";

// Defensive no-op stripper: the `@context` tag was removed entirely from the
// grammar of this tool (it used to drive per-file bucket assignment before
// the split-tables-as-primary model). Any stray `@context` that sneaks into
// a doc comment gets silently removed here so it doesn't leak into stubs.
export function removeContextAttributes(docs: Doc[]): Doc[] {
  for (const doc of docs) {
    removeAttributes(doc, "context");
  }
  return docs;
}

// Each doc that declares a table method has a qualified name like
// `SpringSynced.GiveOrderToUnit` — the first identifier is the "table name",
// the rest is the method path. Used both for output-file grouping and for
// duplicate-declaration linting.
const NAME_ATTR_TYPES = [
  "function",
  "table",
  "enum",
  "global",
  "field",
] as const;

export function getDocTableName(doc: Doc): string | null {
  for (const attr of doc.attributes) {
    switch (attr.attributeType) {
      case "table":
      case "enum":
        return (attr as TableAttribute | EnumAttribute).args.name[0] ?? null;
      case "function": {
        const name = (attr as FunctionAttribute).args.name;
        return name.length > 1 ? name[0] : null;
      }
      case "global":
      case "field": {
        const name = (attr as GlobalAttribute | FieldAttribute).args.name;
        return name.length > 1 ? name[0] : null;
      }
    }
  }
  return null;
}

function getDocQualifiedName(doc: Doc): string | null {
  for (const attr of doc.attributes) {
    if (!NAME_ATTR_TYPES.includes(attr.attributeType as any)) continue;
    const name = (attr.args as { name?: readonly string[] }).name;
    if (name && name.length > 0) return name.join(".");
  }
  return null;
}

// Authors declare Spring API methods under one of three top-level tables;
// each maps to its own output stub file. Tables outside this set (MoveCtrl,
// UnitScript, etc.) fall through to `shared.lua` — they're accessible in
// every Lua context.
const SPRING_OUTPUTS: ReadonlyMap<string, { file: string; preamble: string }> =
  new Map([
    [
      "SpringShared",
      {
        file: "shared.lua",
        preamble: "---@class SpringShared\nSpringShared = {}",
      },
    ],
    [
      "SpringSynced",
      {
        file: "synced.lua",
        preamble: "---@class SpringSynced\nSpringSynced = {}",
      },
    ],
    [
      "SpringUnsynced",
      {
        file: "unsynced.lua",
        preamble: "---@class SpringUnsynced\nSpringUnsynced = {}",
      },
    ],
  ]);

const FALLBACK_OUTPUT = "shared.lua";

function outputFileFor(doc: Doc): string {
  const table = getDocTableName(doc);
  if (table != null) {
    const entry = SPRING_OUTPUTS.get(table);
    if (entry) return entry.file;
  }
  return FALLBACK_OUTPUT;
}

// Lint pass over all input docs: flag any `@function Table.Name` declared in
// more than one file. In the split-tables-as-primary model these collisions
// are authoring bugs — the extractor used to auto-dedup them via a "promote
// to shared" step, but that magic is gone; duplicates must be consolidated
// by hand at the source.
export function lintDuplicateDeclarations(
  fileEntries: readonly (readonly [string, Doc[]])[]
): string[] {
  const errors: string[] = [];
  const firstSeen = new Map<string, string>();

  for (const [path, docs] of fileEntries) {
    for (const doc of docs) {
      // Only flag function-attribute duplicates — class/table/enum/global can
      // legitimately appear in multiple files as repeated declarations.
      const hasFunction = doc.attributes.some(
        (a) => a.attributeType === "function"
      );
      if (!hasFunction) continue;

      const qual = getDocQualifiedName(doc);
      if (qual == null) continue;

      const prev = firstSeen.get(qual);
      if (prev != null && prev !== path) {
        errors.push(
          `'${path}': duplicate @function ${qual} (also declared in '${prev}')`
        );
      } else if (prev == null) {
        firstSeen.set(qual, path);
      }
    }
  }

  return errors;
}

// Group all docs into output files based on the table prefix of each doc's
// declaration. Preamble is synthesized for the three Spring* outputs; for
// any other table (MoveCtrl et al.), the author is expected to provide a
// `@class` declaration in the source.
export function projectOutputs(
  fileEntries: readonly (readonly [string, Doc[]])[]
): FileOutput[] {
  const byOutput = new Map<
    string,
    { docs: Doc[]; sources: Set<string>; preambleParts: Set<string> }
  >();

  for (const [path, docs] of fileEntries) {
    for (const doc of docs) {
      const outFile = outputFileFor(doc);
      let entry = byOutput.get(outFile);
      if (!entry) {
        entry = { docs: [], sources: new Set(), preambleParts: new Set() };
        byOutput.set(outFile, entry);
      }
      entry.docs.push(doc);
      entry.sources.add(path);

      const table = getDocTableName(doc);
      if (table != null) {
        const springPreamble = SPRING_OUTPUTS.get(table)?.preamble;
        if (springPreamble != null) entry.preambleParts.add(springPreamble);
      }
    }
  }

  const outputs: FileOutput[] = [];
  for (const [name, { docs, sources, preambleParts }] of byOutput) {
    outputs.push({
      name,
      docs,
      sources: [...sources],
      preamble: [...preambleParts].join("\n\n"),
    });
  }
  return outputs;
}
