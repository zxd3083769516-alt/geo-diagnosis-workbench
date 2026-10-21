import {
  clearCredentialCookie,
  createCredentialCookie,
  decryptCredentials,
  inspectCredentials,
  type ProviderCredentials,
  type ProviderId,
} from '@/lib/provider-credentials';
import { aiProviders, completionBody, completionResponseText, providerError } from '@/lib/ai-providers';
import { runVisibility, VisibilityFailure } from '@/lib/visibility-runner';

const providers = aiProviders;

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in providers;
}

function status(credentials: ProviderCredentials) {
  return Object.fromEntries(Object.keys(providers).map((id) => {
    const key = credentials[id as ProviderId];
    return [id, { configured: Boolean(key), hint: key ? `••••${key.slice(-4)}` : '' }];
  }));
}

export async function GET(request: Request) {
  const state = await inspectCredentials(request);
  return Response.json({ providers: status(state.credentials), credentialState: state.state, message: state.message, ...(state.state === 'unavailable' ? {error:state.message} : {}) }, {status:state.state === 'unavailable' ? 503 : 200, headers:{'Cache-Control':'no-store'}});
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; provider?: unknown; apiKey?: unknown };
    if (!isProvider(body.provider)) return Response.json({ error: '平台信息不正确。' }, { status: 400 });
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    // Explicitly saving a replacement key repairs an unreadable cookie. Other
    // operations must not silently mistake an unreadable vault for an empty one.
    const credentials = body.action === 'save' ? (await inspectCredentials(request)).credentials : await decryptCredentials(request);

    if (body.action === 'test-search') {
      const selectedKey = apiKey || credentials[body.provider];
      if (!selectedKey) return Response.json({error:'当前浏览器未保存此平台密钥。请先保存，再验证联网。'}, {status:401});
      try {
        const result = await runVisibility(body.provider, '厦门有哪些比较靠谱的装修公司？', selectedKey, {webSearch:true,stream:true});
        return Response.json({ok:true, message:`${providers[body.provider].name}联网验证通过：搜索已执行，已收到完整回答。本次验证不计入客户评分。`, verification:result}, {headers:{'Cache-Control':'no-store'}});
      } catch (error) {
        return Response.json({error:error instanceof Error ? error.message.replaceAll(selectedKey,'[已脱敏]') : '联网验证失败', verification:error instanceof VisibilityFailure ? error.data : undefined}, {status:502,headers:{'Cache-Control':'no-store'}});
      }
    }

    if (body.action === 'test') {
      const selectedKey = apiKey || credentials[body.provider];
      if (!selectedKey) return Response.json({ error: '请先填写或保存API Key。' }, { status: 400 });
      const provider = providers[body.provider];
      const result = await fetch(provider.endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(55000),
        headers: { Authorization: `Bearer ${selectedKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(completionBody(body.provider, '请只回答“连接正常”。', 64)),
      });
      if (!result.ok) {
        const payload = await result.json().catch(() => ({}));
        const failure = providerError(payload, result.status);
        return Response.json({ error: `${provider.name}：${failure.message}` }, { status: 400 });
      }
      const payload = await result.json() as { model?: string };
      if (!completionResponseText(payload)) return Response.json({ error: `${provider.name}未返回可用回答，请检查模型配置。` }, { status: 502 });
      return Response.json({ ok: true, message: `${provider.name}模型 ${payload.model || provider.model} 普通连接正常；尚未验证联网，请点击“验证联网”。` });
    }

    if (body.action === 'save') {
      if (!apiKey) return Response.json({ error: '请输入API Key。' }, { status: 400 });
      if (apiKey.length < 16 || apiKey.length > 600) return Response.json({ error: 'API Key长度不正确。' }, { status: 400 });
      credentials[body.provider] = apiKey;
      return Response.json(
        { ok: true, providers: status(credentials), message: `${providers[body.provider].name}密钥已加密保存。` },
        { headers: { 'Set-Cookie': await createCredentialCookie(credentials, request), 'Cache-Control': 'no-store' } },
      );
    }

    if (body.action === 'remove') {
      delete credentials[body.provider];
      const hasCredentials = Object.keys(credentials).length > 0;
      return Response.json(
        { ok: true, providers: status(credentials), message: `${providers[body.provider].name}密钥已移除。` },
        { headers: { 'Set-Cookie': hasCredentials ? await createCredentialCookie(credentials, request) : clearCredentialCookie(request), 'Cache-Control': 'no-store' } },
      );
    }

    return Response.json({ error: '不支持的操作。' }, { status: 400 });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : '安全配置服务暂时不可用。' }, { status: 500 });
  }
}
