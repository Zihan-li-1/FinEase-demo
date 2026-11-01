import { riskQuestions, RULE_VERSION } from '../src/skills/wealth/risk-assessment.mjs';
import { handleWealth } from '../src/agent/handlers/wealth-handler.mjs';

// This UI-only operation never passes through model output or grants execution.
export async function handleRiskQuestionnaire(input, core) {
  const fail = () => { throw Object.assign(new Error('测评请求无效'), { code: 'INVALID_REQUEST', status: 400, userMessage: '测评请求无效，请重新打开问卷。' }); };
  if (!input || Array.isArray(input) || typeof input !== 'object' ||
      !['start', 'submit', 'matches'].includes(input.operation) ||
      Object.keys(input).some(key => !['operation', 'answers', 'version'].includes(key))) fail();
  const context = await core.repository.getContextInfo();
  const ports = core.wealthPorts;
  if (context.dataSource !== 'synthetic_demo_only' || !ports?.submitRiskAssessment) throw Object.assign(new Error('模拟测评服务未配置'), { code: 'CAPABILITY_UNAVAILABLE', status: 503 });
  const meta = { synthetic_demo_only: true, as_of: context.asOf, context_snapshot_id: context.snapshotId, evidence: [] };
  if (input.operation === 'start') {
    if (input.answers !== undefined || input.version !== undefined) fail();
    return { status: 'wealth_result', action: 'wealth.assess_risk', data: { ...meta, kind: 'questionnaire', questions: riskQuestions, version: RULE_VERSION } };
  }
  if (input.operation === 'matches') {
    if (input.answers !== undefined || input.version !== undefined) fail();
    const result = await handleWealth({ action: 'wealth.recommend', slots: { goal: { kind: 'steady_growth' } } }, core.repository, ports);
    if (!result.ok) throw Object.assign(new Error(result.error.message), { ...result.error, status: 400, userMessage: result.error.message });
    return { status: 'wealth_result', action: result.action, data: result.data };
  }
  if (input.version !== RULE_VERSION) fail();
  const assessment = await ports.submitRiskAssessment(input.answers);
  return { status: 'wealth_result', action: 'wealth.assess_risk', data: { ...meta, kind: 'risk_assessment', assessment } };
}
