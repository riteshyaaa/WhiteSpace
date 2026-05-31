import {
  EntityField,
  EntityShape,
  ENTITY_HEADER_H,
  ENTITY_ROW_H,
  ENTITY_WIDTH,
  RelationShape,
  Shape,
} from "./types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface ParsedEntity {
  name: string;
  fields: EntityField[];
}

interface ParsedRelation {
  from: string;
  to: string;
}

interface ParsedSchema {
  entities: ParsedEntity[];
  relations: ParsedRelation[];
}

/**
 * Minimal Prisma-schema parser. Handles `model` blocks, scalar/enum columns,
 * `@id` / `@@id` primary keys, and `@relation(fields: [...])` foreign keys.
 * Relation navigation fields (Model / Model[] / Model?) become edges, not rows.
 */
export function parsePrismaSchema(input: string): ParsedSchema {
  // Strip comments.
  const text = input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
  const enumRegex = /enum\s+(\w+)\s*\{/g;

  const modelNames = new Set<string>();
  let m: RegExpExecArray | null;
  const bodies: { name: string; body: string }[] = [];
  while ((m = modelRegex.exec(text)) !== null) {
    modelNames.add(m[1]!);
    bodies.push({ name: m[1]!, body: m[2]! });
  }
  const enumNames = new Set<string>();
  while ((m = enumRegex.exec(text)) !== null) enumNames.add(m[1]!);

  const entities: ParsedEntity[] = [];
  const explicit: ParsedRelation[] = [];
  const candidates: ParsedRelation[] = [];

  for (const { name, body } of bodies) {
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Foreign-key columns referenced by any @relation(fields: [...]).
    const fkCols = new Set<string>();
    for (const line of lines) {
      const rel = line.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
      if (rel) {
        rel[1]!
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((c) => fkCols.add(c));
      }
    }
    // Composite primary key: @@id([a, b])
    const compositePk = new Set<string>();
    for (const line of lines) {
      const cpk = line.match(/@@id\(\[([^\]]*)\]/);
      if (cpk) {
        cpk[1]!
          .split(",")
          .map((s) => s.trim())
          .forEach((c) => compositePk.add(c));
      }
    }

    const fields: EntityField[] = [];
    for (const line of lines) {
      if (line.startsWith("@@") || line.startsWith("@")) continue;
      const tokens = line.split(/\s+/);
      const fieldName = tokens[0];
      const rawType = tokens[1];
      if (!fieldName || !rawType) continue;
      if (!/^[A-Za-z_]\w*$/.test(fieldName)) continue;

      const baseType = rawType.replace(/[[\]?]/g, "");
      const isList = rawType.includes("[]");
      const optional = rawType.includes("?");

      if (modelNames.has(baseType)) {
        // Relation navigation field -> edge, not a column.
        const hasRelFields = /@relation\([^)]*fields:/.test(line);
        if (hasRelFields) {
          explicit.push({ from: name, to: baseType });
        } else if (!isList) {
          candidates.push({ from: name, to: baseType });
        }
        continue;
      }

      // Scalar / enum column.
      const isEnum = enumNames.has(baseType);
      fields.push({
        name: fieldName,
        type: baseType + (optional ? "?" : "") + (isList ? "[]" : "") + (isEnum ? "" : ""),
        pk: /@id\b/.test(line) || compositePk.has(fieldName),
        fk: fkCols.has(fieldName),
      });
    }

    entities.push({ name, fields });
  }

  // Merge edges: keep all explicit; add a candidate only if that pair isn't
  // already connected (in either direction).
  const relations: ParsedRelation[] = [...explicit];
  const pairKey = (a: string, b: string) => [a, b].sort().join("::");
  const connected = new Set(explicit.map((r) => pairKey(r.from, r.to)));
  for (const c of candidates) {
    const key = pairKey(c.from, c.to);
    if (!connected.has(key)) {
      relations.push(c);
      connected.add(key);
    }
  }

  return { entities, relations };
}

const ENTITY_STROKE = "#4dabf7";
const ENTITY_FILL = "#1b1b1b";
const RELATION_STROKE = "#868e96";

/**
 * Lay parsed entities out in a grid and produce canvas shapes. Relations are
 * returned first so they render behind the entity boxes.
 */
export function schemaToShapes(
  parsed: ParsedSchema,
  originX: number,
  originY: number
): Shape[] {
  const gapX = 70;
  const gapY = 50;
  const perRow = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(parsed.entities.length))));

  const nameToId = new Map<string, string>();
  const entityShapes: EntityShape[] = [];

  let rowTop = originY;
  let rowMaxH = 0;
  parsed.entities.forEach((e, i) => {
    const col = i % perRow;
    if (col === 0 && i > 0) {
      rowTop += rowMaxH + gapY;
      rowMaxH = 0;
    }
    const height = ENTITY_HEADER_H + e.fields.length * ENTITY_ROW_H + 8;
    rowMaxH = Math.max(rowMaxH, height);
    const id = uid();
    nameToId.set(e.name, id);
    entityShapes.push({
      id,
      type: "entity",
      x: originX + col * (ENTITY_WIDTH + gapX),
      y: rowTop,
      width: ENTITY_WIDTH,
      height,
      name: e.name,
      fields: e.fields,
      stroke: ENTITY_STROKE,
      fill: ENTITY_FILL,
      strokeWidth: 1,
      strokeStyle: "solid",
    });
  });

  const relationShapes: RelationShape[] = [];
  for (const r of parsed.relations) {
    const fromId = nameToId.get(r.from);
    const toId = nameToId.get(r.to);
    if (!fromId || !toId || fromId === toId) continue;
    relationShapes.push({
      id: uid(),
      type: "relation",
      fromId,
      toId,
      stroke: RELATION_STROKE,
      fill: "transparent",
      strokeWidth: 1.5,
      strokeStyle: "solid",
    });
  }

  return [...relationShapes, ...entityShapes];
}
