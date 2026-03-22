import {
  DefaultAttribute,
  EnumAttribute,
  FieldAttribute,
  FunctionAttribute,
  GlobalAttribute,
  TableAttribute,
} from "./attribute";
import { Doc, filterAttributes, hasAttribute, removeAttributes } from "./doc";
import { FileOutput } from "./output";

const KNOWN_DOC_TYPES = [
  "function",
  "table",
  "class",
  "enum",
  "global",
] as const;

const FILE_ATTRIBUTE_TYPES = ["context"] as const;

function isFileAttributeDoc(doc: Doc): boolean {
  return (
    FILE_ATTRIBUTE_TYPES.some((t) => hasAttribute(doc, t)) &&
    !KNOWN_DOC_TYPES.some((t) => hasAttribute(doc, t))
  );
}

export function getDocContexts(doc: Doc): string[] {
  const contextAttrs = filterAttributes(doc, "context") as DefaultAttribute[];
  const contexts = new Set<string>();
  for (const attr of contextAttrs) {
    for (const part of attr.args.description.split(",")) {
      const trimmed = part.trim();
      if (trimmed) contexts.add(trimmed);
    }
  }
  return [...contexts];
}

export function removeContextAttributes(docs: Doc[]): Doc[] {
  for (const doc of docs) {
    removeAttributes(doc, "context");
  }
  return docs;
}

export function applyFileContexts(
  fileEntries: readonly (readonly [string, Doc[]])[]
): string[] {
  const errors: string[] = [];

  for (const [path, docs] of fileEntries) {
    const fileAttrIndices: number[] = [];
    for (let i = 0; i < docs.length; i++) {
      if (isFileAttributeDoc(docs[i])) fileAttrIndices.push(i);
    }

    if (fileAttrIndices.length === 0) continue;

    if (fileAttrIndices.length > 1) {
      errors.push(
        `'${path}': multiple file-level attribute docs (found ${fileAttrIndices.length}, expected at most 1)`
      );
      continue;
    }

    if (fileAttrIndices[0] !== 0) {
      errors.push(
        `'${path}': file-level attribute doc must be the first doc in the file`
      );
      continue;
    }

    const fileContexts = getDocContexts(docs[0]);
    docs.splice(0, 1);

    for (const doc of docs) {
      if (!hasAttribute(doc, "context") && fileContexts.length > 0) {
        for (const ctx of fileContexts) {
          doc.attributes.push({
            attributeType: "context",
            args: { description: ctx },
          });
        }
      }
    }
  }

  return errors;
}

export function collectAllContexts(
  fileEntries: readonly (readonly [string, Doc[]])[]
): Set<string> {
  const all = new Set<string>();
  for (const [, docs] of fileEntries) {
    for (const doc of docs) {
      for (const ctx of getDocContexts(doc)) {
        all.add(ctx);
      }
    }
  }
  return all;
}

function contextBucketName(
  docContexts: string[],
  allContexts: Set<string>
): string {
  if (docContexts.length === 0) return "shared";

  const sorted = [...new Set(docContexts)].sort();
  if (sorted.length === allContexts.size) {
    const allSorted = [...allContexts].sort();
    if (sorted.every((c, i) => c === allSorted[i])) return "shared";
  }

  return sorted.join("_");
}

export function partitionDocsByContext(
  fileEntries: readonly (readonly [string, Doc[]])[],
  allContexts: Set<string>
): Map<string, [string, Doc[]][]> {
  const buckets = new Map<string, [string, Doc[]][]>();

  for (const [path, docs] of fileEntries) {
    for (const doc of docs) {
      const contexts = getDocContexts(doc);
      const bucket = contextBucketName(contexts, allContexts);

      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }

      const entries = buckets.get(bucket)!;
      let fileEntry = entries.find(([p]) => p === path);
      if (!fileEntry) {
        fileEntry = [path, []];
        entries.push(fileEntry);
      }
      fileEntry[1].push(doc);
    }
  }

  return buckets;
}

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

export function findMultiContextTables(
  buckets: Map<string, [string, Doc[]][]>
): Map<string, Set<string>> {
  const tableBuckets = new Map<string, Set<string>>();
  for (const [bucketName, entries] of buckets) {
    for (const [, docs] of entries) {
      for (const doc of docs) {
        const table = getDocTableName(doc);
        if (table == null) continue;
        if (!tableBuckets.has(table)) tableBuckets.set(table, new Set());
        tableBuckets.get(table)!.add(bucketName);
      }
    }
  }
  return tableBuckets;
}

export function bucketSuffix(bucketName: string): string {
  return bucketName
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function remapDocTableNames(
  docs: Doc[],
  tableName: string,
  newTableName: string
): void {
  for (const doc of docs) {
    for (const attr of doc.attributes) {
      if (!NAME_ATTR_TYPES.includes(attr.attributeType as any)) continue;
      const args = attr.args as { name: readonly string[] };
      if (args.name[0] !== tableName) continue;
      (args as { name: string[] }).name = [
        newTableName,
        ...args.name.slice(1),
      ];
    }
  }
}

export function generateClassDeclarations(
  tableBuckets: Map<string, Set<string>>,
  bucketName: string
): string {
  const suffix = bucketSuffix(bucketName);
  const lines: string[] = [];

  for (const [table, buckets] of tableBuckets) {
    if (buckets.size < 2) continue;
    const className = `${table}${suffix}`;
    if (bucketName === "shared") {
      lines.push(`---@class ${className}\n${className} = {}`);
    } else {
      const sharedClass = `${table}${bucketSuffix("shared")}`;
      lines.push(
        `---@class ${className} : ${sharedClass}\n${className} = {}`
      );
    }
  }

  return lines.join("\n\n");
}

function cloneAndRemapDocs(
  entries: [string, Doc[]][],
  tableBuckets: Map<string, Set<string>>,
  bucketName: string
): Doc[] {
  const docs = entries.flatMap(([, ds]) => ds).map((d) => structuredClone(d));
  for (const [table, bucketSet] of tableBuckets) {
    if (bucketSet.size < 2) continue;
    remapDocTableNames(docs, table, table + bucketSuffix(bucketName));
  }
  return docs;
}

export function projectContextOutputs(
  fileEntries: readonly (readonly [string, Doc[]])[],
  resolveOutputName: (sourcePath: string) => string,
): FileOutput[] {
  const allContexts = collectAllContexts(fileEntries);

  if (allContexts.size === 0) {
    const outputs: FileOutput[] = [];
    for (const [path, docs] of fileEntries) {
      if (docs.length === 0) continue;
      outputs.push({
        name: `${resolveOutputName(path)}.lua`,
        docs: [...docs],
        sources: [path],
        preamble: "",
      });
    }
    return outputs;
  }

  const buckets = partitionDocsByContext(fileEntries, allContexts);
  const tableBuckets = findMultiContextTables(buckets);

  const sharedRawEntries = buckets.get("shared") ?? [];
  buckets.delete("shared");

  const outputs: FileOutput[] = [];

  for (const [name, entries] of buckets) {
    outputs.push({
      name: `${name}.lua`,
      docs: cloneAndRemapDocs(entries, tableBuckets, name),
      sources: entries.map(([p]) => p),
      preamble: generateClassDeclarations(tableBuckets, name),
    });
  }

  const sharedPreamble = generateClassDeclarations(tableBuckets, "shared");
  if (sharedPreamble) {
    outputs.push({
      name: "shared.lua",
      docs: [],
      sources: [],
      preamble: sharedPreamble,
    });
  }

  for (const [path, rawDocs] of sharedRawEntries) {
    if (rawDocs.length === 0) continue;
    const docs = rawDocs.map((d) => structuredClone(d));
    for (const [table, bucketSet] of tableBuckets) {
      if (bucketSet.size < 2) continue;
      remapDocTableNames(docs, table, table + bucketSuffix("shared"));
    }
    outputs.push({
      name: `${resolveOutputName(path)}.lua`,
      docs,
      sources: [path],
      preamble: "",
    });
  }

  return outputs;
}
