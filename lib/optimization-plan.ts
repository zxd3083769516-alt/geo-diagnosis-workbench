export type PlanStatus = '待处理' | '进行中' | '已完成';

export type PlanPriority = {
  id: string;
  level: 'P0' | 'P1' | 'P2';
  issue: string;
  evidence: string;
  action: string;
  successMetric: string;
  status: PlanStatus;
};

export type PlanContentTask = {
  id: string;
  topic: string;
  targetQuestions: string;
  factsNeeded: string;
  format: string;
  channel: string;
  owner: string;
  due: string;
  status: PlanStatus;
};

export type PlanPhase = {
  id: string;
  period: string;
  objective: string;
  tasks: string;
  deliverable: string;
  status: PlanStatus;
};

export type PlanRetestItem = {
  id: string;
  timing: string;
  scope: string;
  metrics: string;
  passCriteria: string;
};

export type OptimizationPlan = {
  summary: string;
  diagnosisBasis: string;
  priorities: PlanPriority[];
  contentTasks: PlanContentTask[];
  phases: PlanPhase[];
  retestPlan: PlanRetestItem[];
  assumptions: string;
  generatedBy: string;
  generatedAt: string;
  lastEditedAt?: string;
  sourceFingerprint: string;
};

type FingerprintQuestion = { id: number; text: string; type: string };
type FingerprintResult = {
  key: string;
  status: string;
  mentioned: string;
  position: string;
  accuracy: string;
  advantage: string;
  evidence: string;
  competitor: string;
  note: string;
  editedAt?: string;
  scoreOrigin?: string;
  answer?: string;
  userNote?: string;
  model?: string;
  testedAt?: string;
};

export function diagnosisFingerprint(
  merchant: Record<string, string>,
  questions: FingerprintQuestion[],
  results: FingerprintResult[],
) {
  const source = JSON.stringify({
    merchant,
    questions: questions.map(({ id, text, type }) => [id, text, type]),
    results: results.map((row) => [
      row.key, row.status, row.mentioned, row.position, row.accuracy, row.advantage,
      row.evidence, row.competitor, row.note, row.editedAt || '', row.scoreOrigin || '', row.answer || '', row.userNote || '', row.model || '', row.testedAt || '',
    ]),
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
