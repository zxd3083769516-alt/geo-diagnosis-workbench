import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync('lib/content-edits.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('exports', source)(api);
const { editAnswer, editScore, invalidateQuestionResults, isEditedAnswer, resultProvenance } = api;
const original = { key: '1:zhipu', questionId: 1, provider: 'zhipu', platform: '智谱 GLM', model: 'glm-4.5-air', answer: '模型首次回答', status: 'complete', mentioned: '是', position: '3', accuracy: '2', advantage: '2', evidence: '1', competitor: '其他商家', note: '原评分', error: '', testedAt: 't0' };
const changed = editAnswer(original, '人工调整一', '自己的备注', 't1');
assert.equal(changed.status, 'answered');
assert.equal(changed.originalAnswer, original.answer);
for (const key of ['mentioned', 'position', 'accuracy', 'advantage', 'evidence', 'competitor', 'note', 'error']) assert.equal(changed[key], '');
assert.equal(changed.testedAt, 't0');
assert.ok(isEditedAnswer(changed));
assert.ok(resultProvenance(changed).includes('人工修改'));
const twice = editAnswer(changed, '人工调整二', '自己的备注', 't2');
assert.equal(twice.originalAnswer, original.answer);
assert.equal(editAnswer({ ...twice, status: 'complete' }, twice.answer, '只改备注', 't3').status, 'complete');
const restored = editAnswer(twice, original.answer, '', 't4');
assert.ok(!isEditedAnswer(restored));
assert.equal(restored.status, 'answered');
const otherPlatform = { ...original, key: '1:qwen', provider: 'qwen' };
const unrelated = { ...original, key: '2:zhipu', questionId: 2 };
const rows = invalidateQuestionResults([twice, otherPlatform, unrelated], 1, '旧问题', 't5');
for (const row of rows.slice(0, 2)) {
  assert.equal(row.status, 'pending'); assert.equal(row.answer, ''); assert.equal(row.originalAnswer, undefined);
  assert.equal(row.history.length, 1); assert.equal(row.history[0].question, '旧问题');
}
assert.strictEqual(rows[2], unrelated);
assert.equal(rows[0].history[0].originalAnswer, original.answer);
const secondQuestionEdit = invalidateQuestionResults(rows, 1, '还没有测试的问题', 't6');
assert.equal(secondQuestionEdit[0].history.length, 1);
const persisted = JSON.parse(JSON.stringify(rows));
assert.equal(persisted[0].history[0].answer, '人工调整二');
assert.equal(original.answer, '模型首次回答');
assert.equal(original.status, 'complete');
assert.equal(editScore(changed, 'mentioned', '是').status, 'answered');
const absent = editScore(original, 'mentioned', '否');
assert.equal(absent.position, '0'); assert.equal(absent.accuracy, '0'); assert.equal(absent.advantage, '0');
assert.equal(absent.status, 'complete'); assert.equal(absent.scoreOrigin, 'manual');
console.log('PASS: old-session migration, edit/rescore, immutable original, restore, per-question/all-platform invalidation, history persistence, no-op notes and partial manual scores');


// The new module export and full history are exercised by check-geo-system.mjs.
await import('./check-geo-system.mjs');
