// Demo scoring v1: seven answers worth 0–3 points each (total 0–21).
// 0–7 => R1, 8–14 => R2, 15–21 => R3. Capacity, loss tolerance,
// and liquidity each cap the result at R1 for answer 0, R2 for answer 1.
// Not understanding principal loss (knowledge=0) also caps the result at R1.
export const RULE_VERSION = 'demo-risk-v1';
export const ASSESSMENT_SCOPE = 'investment';
export const riskQuestions = Object.freeze([
  { id: 'horizon', title: '这笔资金计划投资多久？', options: ['不足 3 个月', '3–12 个月', '1–3 年', '3 年以上'] },
  { id: 'objective', title: '你的主要投资目标是？', options: ['尽量减少本金波动', '接受小幅波动以争取收益', '接受一定亏损以争取增长', '接受较大亏损以争取较高增长'] },
  { id: 'experience', title: '你有多少投资经验？', options: ['没有经验', '仅接触存款或低风险产品', '有基金或债券投资经验', '有多年股票等波动产品经验'] },
  { id: 'knowledge', title: '你对投资风险的了解程度？', options: ['不理解本金可能亏损', '知道收益不保证，本金可能亏损', '了解风险、收益与分散投资', '能理解波动、流动性和产品说明'] },
  { id: 'liquidity', title: '这笔钱的流动性需求是？', options: ['近期生活必需，随时要用', '一年内可能需要较大部分', '有独立应急金，短期不需要', '有充足应急金，可长期投资'] },
  { id: 'capacity', title: '投资亏损对日常财务的影响？', options: ['会影响基本生活或偿债', '会明显影响支出计划', '可用稳定收入逐步弥补', '有充足资产承担较大亏损'] },
  { id: 'loss', title: '你能接受的阶段性本金亏损是？', options: ['无法接受亏损', '约 5% 以内', '约 5%–15%', '超过 15% 仍可承担'] },
]);

export function scoreRiskAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
      Object.keys(answers).length !== riskQuestions.length ||
      riskQuestions.some(q => !Object.hasOwn(answers, q.id) || !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] > 3)) {
    throw Object.assign(new Error('请由本人完整回答所有题目。'), { code: 'INVALID_REQUEST', status: 400, userMessage: '请由本人完整回答所有题目。' });
  }
  const score = riskQuestions.reduce((sum, q) => sum + answers[q.id], 0);
  const initial = score <= 7 ? 1 : score <= 14 ? 2 : 3;
  const cap = Math.min(answers.knowledge === 0 ? 1 : 3, ...['capacity', 'loss', 'liquidity'].map(id => Math.min(3, answers[id] + 1)));
  const rank = Math.min(initial, cap);
  return { score, risk_level: `R${rank}`, reasons: [
    `总分 ${score}/21；0–7 分为 R1，8–14 分为 R2，15–21 分为 R3。`,
    `财务承受、亏损容忍、流动性及本金亏损认知约束后的风险上限为 R${cap}。`,
  ], matched_risk_levels: ['R1', 'R2', 'R3'].slice(0, rank) };
}

export function createRiskRecord(answers, now = Date.now()) {
  return { ...scoreRiskAnswers(answers), answers: { ...answers }, assessment_id: `risk_${crypto.randomUUID()}`,
    assessment_scope: ASSESSMENT_SCOPE, completed_at: new Date(now).toISOString(),
    expires_at: new Date(now + 365 * 86400000).toISOString(), source: 'trusted_ui',
    scoring_version: RULE_VERSION, synthetic_demo_only: true };
}

export function validRiskAssessment(record, asOf, scope = ASSESSMENT_SCOPE) {
  if (!['investment', 'investment_suitability', 'portfolio'].includes(scope) || !record || record.source !== 'trusted_ui' ||
      !['investment', 'investment_suitability', 'portfolio'].includes(record.assessment_scope) ||
      !/^risk_[\w-]+$/.test(record.assessment_id || '') || !['R1', 'R2', 'R3'].includes(record.risk_level) ||
      !Number.isFinite(Date.parse(asOf)) || !Number.isFinite(Date.parse(record.completed_at)) ||
      Date.parse(record.completed_at) > Date.parse(asOf) || !Number.isFinite(Date.parse(record.expires_at)) ||
      Date.parse(record.expires_at) <= Date.parse(asOf)) return false;
  // Legacy fixture records remain supported only at injected trusted ports.
  if (record.scoring_version === undefined) return record.synthetic_demo_only === undefined;
  try {
    const computed = scoreRiskAnswers(record.answers);
    return record.synthetic_demo_only === true && record.assessment_scope === ASSESSMENT_SCOPE && record.scoring_version === RULE_VERSION &&
      computed.risk_level === record.risk_level && computed.score === record.score &&
      Date.parse(record.expires_at) === Date.parse(record.completed_at) + 365 * 86400000;
  } catch { return false; }
}
