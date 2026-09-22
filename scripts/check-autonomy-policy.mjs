import { evaluateAutonomyPolicy, normalizeDirectorAction } from '../src/autonomy.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const base = { active: true, mode: 'autonomous', min_confidence: 0.85, max_amount_ars: 30000 };
const action = normalizeDirectorAction({ type: 'create_operation_task', title: 'Producir', confidence: 0.92, risk_level: 'low', payload: {} });
assert(action?.type === 'create_operation_task', 'normalization failed');
assert(evaluateAutonomyPolicy(base, action).decision === 'autonomous', 'safe action should be autonomous');
assert(evaluateAutonomyPolicy(base, { ...action, confidence: 0.5 }).decision === 'approval_required', 'low confidence should escalate');
assert(evaluateAutonomyPolicy(base, { ...action, risk_level: 'high' }).decision === 'approval_required', 'high risk should escalate');
assert(evaluateAutonomyPolicy({ ...base, mode: 'blocked' }, action).decision === 'blocked', 'blocked policy should block');
assert(evaluateAutonomyPolicy(base, { ...action, estimated_amount_ars: 50000 }).decision === 'approval_required', 'amount over limit should escalate');
console.log('autonomy policy checks: ok');
