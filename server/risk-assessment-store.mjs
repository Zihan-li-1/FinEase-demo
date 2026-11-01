import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRiskRecord, validRiskAssessment } from '../src/skills/wealth/risk-assessment.mjs';

// Fixed demo owner + dataset + deployment credentials; never an IP or model ID.
// Rotation of demo credentials/dataset starts an isolated lifecycle.
export function riskStoreScope(ownerId, datasetId, env) {
  return createHash('sha256').update(JSON.stringify([ownerId, datasetId, env.FINEASE_ACCESS_CODE, env.CONTINUATION_TOKEN_SECRET])).digest('hex');
}

export function createRiskAssessmentStore({ scope, env = process.env, sql, now = Date.now }) {
  const directory = resolve(env.FINEASE_DEMO_DATA_DIR || '.commerce-mock', 'risk-assessments');
  const file = join(directory, `${scope}.json`);
  return {
    async getRiskAssessment() {
      let record;
      if (sql) {
        const [row] = await sql.unsafe('SELECT record FROM banking_demo_risk_assessments WHERE scope = $1', [scope]);
        record = row?.record;
      } else {
        try { record = JSON.parse(await readFile(file, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined; throw error; }
      }
      return record?.scoring_version && validRiskAssessment(record, new Date(now()).toISOString()) ? record : undefined;
    },
    async submitRiskAssessment(answers) {
      const record = createRiskRecord(answers, now());
      if (sql) {
        await sql.unsafe(`INSERT INTO banking_demo_risk_assessments (scope, record) VALUES ($1, $2::jsonb)
          ON CONFLICT (scope) DO UPDATE SET record = EXCLUDED.record`, [scope, sql.json(record)]);
      } else {
        if (env.NETLIFY) throw Object.assign(new Error('测评持久化需要数据库'), { code: 'DATABASE_NOT_CONFIGURED', status: 503 });
        await mkdir(directory, { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
        await rename(temporary, file);
      }
      return record;
    },
  };
}
