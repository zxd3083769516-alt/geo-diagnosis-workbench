import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function readModule(path, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', source)((id) => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}
const food = readModule('../lib/everyday-food-questions.ts');
const { everydayQuestionBank } = readModule('../lib/everyday-questions.ts', { './everyday-food-questions': food });
const types = ['泛推荐', '场景', '高意向', '品牌', '竞品比较'];
for (const industry of ['餐饮 / 江西菜', '医美', '装修', '酒店民宿', '健身房', '汽车年检站']) {
  const brand = '目标测试门店';
  const bank = everydayQuestionBank({ city: '厦门', industry, brand }, '集美', '瓦罐汤', '对照测试门店');
  for (const counts of [[15, 25, 30, 15, 15], [7, 11, 14, 7, 6]]) {
    const rows = types.flatMap((type, i) => {
      assert.ok(bank[type].length >= counts[i], `${industry}/${type} too few questions`);
      return bank[type].slice(0, counts[i]);
    });
    assert.equal(rows.length, counts.reduce((a, b) => a + b));
    assert.equal(new Set(rows).size, rows.length, `${industry} duplicates`);
    assert.ok(rows.every(q => q.endsWith('？') && !q.includes('undefined')));
    assert.ok(rows.every(q => !/交付稳定性|候选名单|核心竞争力|方案透明度/.test(q)));
  }
  for (const type of types.slice(0, 3)) assert.ok(bank[type].every(q => !q.includes(brand)));
  console.log(`${industry}: 45/100 counts, uniqueness, brand separation, wording passed`);
}
