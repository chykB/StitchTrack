// Offline orchestration double only. Snapshot restoration is NOT PostgreSQL proof.
import {PRODUCT_TARGETS} from "../../prisma/product/targets.ts";
export const modelNames = ["user", "account", "session", "verification", "termsVersion", "termsAcceptance", "emailOutbox", "emailVerificationIssuance"];
export function fakeProduct({sessionAccess = false} = {}) {
  let rows = Object.fromEntries(modelNames.map(name => [name, []]));
  let serial = 0, active = false; const events = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "AND") return value.every(part => matches(row, part));
      if (key === "OR") return value.some(part => matches(row, part));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("lt" in value) return row[key] < value.lt;
        if ("in" in value) return value.in.includes(row[key]);
        if ("equals" in value) return row[key] === value.equals;
        throw new Error("Unsupported fake query operators: " + Object.keys(value).join(","));
      }
      return row[key] === value;
    });
  }
  const client = {};
  for (const name of modelNames) client[name] = {
    async create({data}) {
      const row = {id: "offline-" + (++serial), createdAt: new Date(), updatedAt: new Date(), ...data};
      if (name === "user") {row.emailVerified ??= false; row.image ??= null; row.disabledAt ??= null; row.deletionRequestedAt ??= null;}
      if (name === "emailVerificationIssuance") {row.purpose ??= "email-verification"; row.failedAttempts ??= 0; row.consumedAt ??= null; row.supersededAt ??= null;}
      if (name === "emailOutbox") {row.status ??= "pending"; row.attemptCount ??= 0; row.sentAt ??= null;}
      rows[name].push(row); events.push(name + ".create"); return structuredClone(row);
    },
    async findUnique({where}) {return structuredClone(rows[name].find(row => matches(row, where)) ?? null);},
    async findFirst(args = {}) {return (await this.findMany(args))[0] ?? null;},
    async findMany({where, orderBy, take} = {}) {let found = rows[name].filter(row => matches(row, where)); if (orderBy?.createdAt === "desc") found = found.toSorted((a,b) => b.createdAt - a.createdAt); return structuredClone(found.slice(0, take ?? found.length));},
    async count({where} = {}) {return rows[name].filter(row => matches(row, where)).length;},
    async update({where, data}) {const row = rows[name].find(row => matches(row, where)); if (!row) throw Object.assign(new Error("Synthetic missing row"), {code: "P2025"}); Object.assign(row, data); return structuredClone(row);},
    async updateMany({where, data}) {let count = 0; for (const row of rows[name]) if (matches(row, where)) {Object.assign(row, data); count++;} return {count};},
    async deleteMany({where}) {const found = rows[name].filter(row => matches(row, where)); rows[name] = rows[name].filter(row => !matches(row, where)); if (name === "verification") for (const issuance of rows.emailVerificationIssuance) if (found.some(row => row.id === issuance.verificationId)) issuance.verificationId = null; return {count: found.length};},
    async delete({where}) {const found = rows[name].find(row => matches(row, where)); if (!found) throw Object.assign(new Error("Synthetic missing row"), {code: "P2025"}); await this.deleteMany({where}); return structuredClone(found);},
  };
  const accessState = row => ({id: row.id, emailVerified: row.emailVerified, disabledAt: row.disabledAt, deletionRequestedAt: row.deletionRequestedAt});
  client.$executeRaw = async parts => {
    if (!active || !parts.join("").startsWith("SET LOCAL ")) throw new Error("Only transaction-local settings supported");
    events.push("transaction.settings"); return 0;
  };
  client.$queryRaw = async (parts, ...values) => {
    if (!active && !sessionAccess) throw new Error("Queries must use the supplied transaction");
    const sql = parts.join("?");
    if (sql.includes("current_database")) return [{database: PRODUCT_TARGETS.test.database, role: PRODUCT_TARGETS.test.role, namespace: "product", safe: true}];
    if (sessionAccess && sql.includes('UPDATE "product"."User"')) {
      if (!active) throw new Error("Status writes require a real transaction double");
      const row = rows.user.find(r => r.id === values[0]); if (!row) return [];
      const field = sql.includes('"disabledAt"=COALESCE') ? "disabledAt" : "deletionRequestedAt";
      row[field] ??= new Date(); row.updatedAt = new Date(); events.push("user.access.update"); return [structuredClone(accessState(row))];
    }
    if (sql.includes("FOR UPDATE")) {
      if (!active) throw new Error("User locks require a transaction double");
      const found = rows.user.filter(row => sql.includes('"emailCanonical"') ? row.email === values[0] : row.id === values[0]);
      if (sessionAccess) {events.push("user.lock"); return structuredClone(found.map(accessState));}
      return found.map(row => ({id: row.id}));
    }
    if (sessionAccess && sql.includes('FROM "product"."User"')) return structuredClone(rows.user.filter(row => row.id === values[0]).map(accessState));
    throw new Error("Unsupported fake SQL");
  };
  client.$transaction = async callback => {
    if (active) throw new Error("Nested transaction forbidden in double");
    const prior = structuredClone(rows); active = true; events.push("outer.begin");
    try {const value = await callback(client); events.push("outer.return"); return value;}
    catch (error) {rows = prior; events.push("double.restore"); throw error;}
    finally {active = false;}
  };
  return {client, events, rows: () => rows, inTransaction: () => active};
}
