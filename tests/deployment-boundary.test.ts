import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface WranglerConfig {
  name: string;
  vars: { APP_MODE: string };
  d1_databases: Array<{
    binding: string;
    database_name: string;
    database_id: string;
  }>;
}

function readConfig(filename: string): WranglerConfig {
  return JSON.parse(readFileSync(resolve(process.cwd(), filename), "utf8")) as WranglerConfig;
}

describe("deployment boundary", () => {
  it("keeps the competition Worker and D1 isolated from production", () => {
    const production = readConfig("wrangler.jsonc");
    const demo = readConfig("wrangler.demo.jsonc");
    const productionDb = production.d1_databases[0];
    const demoDb = demo.d1_databases[0];

    expect(production.vars.APP_MODE).toBe("production");
    expect(demo.vars.APP_MODE).toBe("demo");
    expect(demo.name).toBe("fasting-tracker-webmcp-demo");
    expect(demoDb.binding).toBe("FASTING_DB");
    expect(demoDb.database_name).toBe("fasting-tracker-demo");
    expect(demo.name).not.toBe(production.name);
    expect(demoDb.database_name).not.toBe(productionDb.database_name);
    expect(demoDb.database_id).not.toBe(productionDb.database_id);
    expect(demoDb.database_id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  });
});
