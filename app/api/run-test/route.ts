import { decryptCredentials, CredentialError } from '@/lib/provider-credentials';
import { aiProviders, isApiProvider } from '@/lib/ai-providers';
import { runVisibility, VisibilityFailure } from '@/lib/visibility-runner';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({error:'测试请求格式不正确。'}, {status:400});
    const allowed = new Set(['provider','question','stream','mode','webSearch','model']);
    if (Object.keys(body).some(key => !allowed.has(key))) return Response.json({error:'真实AI测试拒绝额外上下文字段。'}, {status:400});
    if (!isApiProvider(body.provider) || body.mode !== 'real_visibility') return Response.json({error:'平台或测试模式不正确。'}, {status:400});
    if (typeof body.question !== 'string' || body.question.trim().length < 4 || body.question.length > 500) return Response.json({error:'测试问题长度不正确。'}, {status:400});
    if (body.webSearch !== undefined && typeof body.webSearch !== 'boolean') return Response.json({error:'联网参数必须为布尔值。'}, {status:400});
    if (body.webSearch === false) return Response.json({error:'真实AI可见度测试必须联网，不能关闭搜索工具。'}, {status:400});
    if (body.model !== undefined && body.model !== aiProviders[body.provider].model) return Response.json({error:'记录模型与当前适配模型不同，请显式新建测试，不会自动切换模型。当前支持：'+aiProviders[body.provider].model}, {status:400});
    const provider = body.provider; const question = body.question;
    const credentials = await decryptCredentials(request);
    const key = credentials[body.provider];
    if (!key) return Response.json({error:aiProviders[body.provider].name+'尚未配置API Key。'}, {status:401});
    const options = {webSearch:true,stream:body.stream === true,model:typeof body.model === 'string' ? body.model : undefined};
    if (body.stream === true) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({async start(controller) {
        const send = (value:unknown) => controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
        try { const data = await runVisibility(provider,question,key,options,send); send({type:'done',data}); }
        catch (error) { send({type:'error',error:error instanceof Error?error.message:'平台请求失败。',data:error instanceof VisibilityFailure?error.data:undefined}); }
        finally {controller.close();}
      }}), {headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'}});
    }
    return Response.json(await runVisibility(provider,question,key,options));
  } catch(error) {
    if (typeof CredentialError === 'function' && error instanceof CredentialError) return Response.json({error:error.message,code:error.code}, {status:error.status});
    return Response.json({error:error instanceof VisibilityFailure?error.message:'平台测试暂时失败。',data:error instanceof VisibilityFailure?error.data:undefined}, {status:502});
  }
}
