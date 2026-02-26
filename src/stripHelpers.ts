import { isAttribute } from "./attribute";
import { Doc } from "./doc";

/**
 * Strip docs that only define helper types (classes, enums, aliases).
 * Keep docs that define functions or tables -- these are the table-scoped
 * API members that benefit from --table-mapping.
 */
export function stripHelperTypes(docs: Doc[]): Doc[] {
  return docs.filter((doc) =>
    doc.attributes.some(
      (a) => isAttribute(a, "function") || isAttribute(a, "table")
    )
  );
}
