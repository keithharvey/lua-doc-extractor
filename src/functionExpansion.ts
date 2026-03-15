
import {
  isAttribute,
} from "./attribute";
import { Doc, filterAttributes } from "./doc";

export function functionExpansion(docs: Doc[]): Doc[] {
  return docs.flatMap(expandAndApply);
}

function expandAndApply(doc: Doc): Doc[] {
  const functionAttrs = filterAttributes(doc, "function");

  if (functionAttrs.length <= 1) {
    return [doc];
  }

  const nonFunctionAttrs = doc.attributes.filter(
    (a) => !isAttribute(a, "function")
  );

  return functionAttrs.map((funcAttr) => {
    const clone: Doc = {
      ...doc,
      attributes: [...nonFunctionAttrs, funcAttr],
      lua: [],
    };
    return clone;
  });
}