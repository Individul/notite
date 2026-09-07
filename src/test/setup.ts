import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { beforeEach } from "vitest";

// Ruleaza o data per fisier de test. D1-ul local persista intre teste, asa ca
// fiecare test porneste de la o tabela goala (triggerele golesc si indexul FTS).
// TEST_MIGRATIONS exista doar in vitest.config.ts, nu in Cloudflare.Env.
const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: D1Migration[] };
await applyD1Migrations(env.DB, TEST_MIGRATIONS);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM notite");
});
