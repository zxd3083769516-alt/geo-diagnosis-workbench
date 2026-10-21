import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',js)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):id.startsWith('@/')?load(id.slice(2)+'.ts'):req(id),exports);return exports;}
const provider=process.argv[2];const key=process.env.GEO_LIVE_TEST_KEY;if(!key)throw new Error('No credential supplied');
const {runVisibility}=load('lib/visibility-runner.ts');
let result;
try{result={status:'completed',data:await runVisibility(provider,'厦门有哪些比较靠谱的装修公司？',key,{webSearch:true,stream:true})};}
catch(e){result={status:'failed',error:e.message,data:e.data};}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/'+provider+'-live.json',JSON.stringify({verifiedAt:new Date().toISOString(),inputSource:'站点已有服务端配置；不读取客户资料或问题库',...result},null,2));
console.log(JSON.stringify({provider,status:result.status,error:result.error,searchStatus:result.data?.searchStatus,model:result.data?.model,answerLength:result.data?.answer?.length,sources:result.data?.nativeSources?.length}));
