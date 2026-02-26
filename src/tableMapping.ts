import { Attribute, isAttribute } from "./attribute";
import { Doc } from "./doc";

function mapName(
  name: readonly string[],
  mapping: ReadonlyMap<string, string>
): readonly string[] {
  if (name.length === 0) return name;
  const mapped = mapping.get(name[0]);
  if (mapped == null) return name;
  return [mapped, ...name.slice(1)];
}

export const applyTableMapping =
  (mapping: ReadonlyMap<string, string> | null) =>
  (docs: Doc[]): Doc[] => {
    if (mapping == null || mapping.size === 0) return docs;

    docs.forEach((doc) => {
      doc.attributes = doc.attributes.map((attr) => {
        if (isAttribute(attr, "function")) {
          return {
            ...attr,
            args: { ...attr.args, name: mapName(attr.args.name, mapping) },
          };
        }
        if (isAttribute(attr, "table")) {
          return {
            ...attr,
            args: { ...attr.args, name: mapName(attr.args.name, mapping) },
          };
        }
        if (isAttribute(attr, "field")) {
          return {
            ...attr,
            args: { ...attr.args, name: mapName(attr.args.name, mapping) },
          };
        }
        if (isAttribute(attr, "enum")) {
          return {
            ...attr,
            args: { ...attr.args, name: mapName(attr.args.name, mapping) },
          };
        }
        if (isAttribute(attr, "global")) {
          return {
            ...attr,
            args: { ...attr.args, name: mapName(attr.args.name, mapping) },
          };
        }
        return attr;
      });
    });

    return docs;
  };

export function parseTableMappings(
  raw: readonly string[]
): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const entry of raw) {
    const colon = entry.indexOf(":");
    if (colon === -1) {
      throw new Error(
        `Invalid table-mapping "${entry}". Expected format: "OldName:NewName"`
      );
    }
    mapping.set(entry.slice(0, colon), entry.slice(colon + 1));
  }
  return mapping;
}
