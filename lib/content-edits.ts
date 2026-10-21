export type TestResult = {
  key: string;
  questionId: number;
  provider: 'qwen' | 'deepseek' | 'doubao' | 'zhipu';
  platform: string;
  model: string;
  answer: string;
  status: 'pending' | 'running' | 'answered' | 'complete' | 'error';
  mentioned: string;
  position: string;
  accuracy: string;
  advantage: string;
  evidence: string;
  competitor: string;
  note: string;
  error: string;
  testedAt: string;
  originalAnswer?: string;
  editedAt?: string;
  userNote?: string;
  scoreOrigin?: 'auto' | 'manual';
  history?: Array<Omit<TestResult, 'history'> & { question: string; archivedAt: string }>;
};

const emptyScores = { mentioned: '', position: '', accuracy: '', advantage: '', evidence: '', competitor: '', note: '', error: '', scoreOrigin: undefined };

export function isEditedAnswer(row: TestResult) {
  return row.originalAnswer !== undefined && row.answer !== row.originalAnswer;
}

export function resultProvenance(row: TestResult) {
  return [isEditedAnswer(row) ? '人工修改回答' : row.answer ? '模型原始回答' : '待测试', row.scoreOrigin === 'manual' ? '人工调整分数' : ''].filter(Boolean).join('；');
}

export function editAnswer(row: TestResult, answer: string, userNote: string, now: string): TestResult {
  if (row.answer === answer) return { ...row, userNote };
  const originalAnswer = row.originalAnswer ?? row.answer;
  return {
    ...row, ...emptyScores, answer, originalAnswer, userNote,
    editedAt: answer === originalAnswer ? undefined : now,
    status: 'answered',
  };
}

export function invalidateQuestionResults(rows: TestResult[], id: number, previousQuestion: string, now: string): TestResult[] {
  return rows.map(row => {
    if (row.questionId !== id) return row;
    const { history = [], ...snapshot } = row;
    return {
      ...row, ...emptyScores,
      answer: '', originalAnswer: undefined, editedAt: undefined, userNote: '', model: '', testedAt: '', status: 'pending',
      history: row.answer ? [...history, { ...snapshot, question: previousQuestion, archivedAt: now }] : history,
    };
  });
}

export function editScore(row: TestResult, field: 'mentioned' | 'position' | 'accuracy' | 'advantage' | 'evidence' | 'note', value: string): TestResult {
  const next = { ...row, [field]: value, error: '', scoreOrigin: 'manual' as const };
  if (next.mentioned === '否') { next.position = '0'; next.accuracy = '0'; next.advantage = '0'; }
  const complete = ['是', '否'].includes(next.mentioned)
    && [next.position, next.accuracy].every(v => ['0', '1', '2', '3'].includes(v))
    && [next.advantage, next.evidence].every(v => ['0', '1', '2'].includes(v));
  return { ...next, status: complete ? 'complete' : 'answered' };
}
