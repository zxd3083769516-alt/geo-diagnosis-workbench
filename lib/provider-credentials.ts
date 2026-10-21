export type ProviderId = 'qwen' | 'deepseek' | 'doubao' | 'zhipu' | 'chatgpt' | 'kimi';

export type ProviderCredentials = Partial<Record<ProviderId, string>>;

const COOKIE_NAME = 'geo_provider_credentials';

function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = process.env.GEO_KEYRING_SECRET;
  if (!secret || secret.length < 32) throw new Error('密钥保险箱尚未初始化。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function readCredentialCookie(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const entry = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : '';
}

export class CredentialError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}

export async function inspectCredentials(request: Request): Promise<{ credentials: ProviderCredentials; state: 'ready' | 'missing' | 'unreadable' | 'unavailable'; message: string }> {
  const secret = process.env.GEO_KEYRING_SECRET;
  if (!secret || secret.length < 32) return { credentials: {}, state: 'unavailable', message: '服务器密钥保险箱未初始化，暂时不能读取或保存平台密钥。请联系维护人员。' };
  try {
    const token = readCredentialCookie(request);
    if (!token) return { credentials: {}, state: 'missing', message: '当前浏览器没有保存的平台密钥，可能尚未配置、已过期或被清除。请到“平台与连接”保存密钥后继续测试；历史回答不会丢失。' };
    const [ivValue, dataValue] = token.split('.');
    if (!ivValue || !dataValue) throw new Error('Invalid cookie');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(ivValue) },
      await encryptionKey(),
      base64ToBytes(dataValue),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(v => typeof v !== 'string')) throw new Error('Invalid credentials');
    return { credentials: parsed as ProviderCredentials, state: 'ready', message: '' };
  } catch {
    return { credentials: {}, state: 'unreadable', message: '当前浏览器保存的密钥无法解密。请到“平台与连接”重新保存所需平台密钥。历史测试记录仍保留。' };
  }
}

export async function decryptCredentials(request: Request): Promise<ProviderCredentials> {
  const result = await inspectCredentials(request);
  if (result.state === 'unreadable' || result.state === 'unavailable') throw new CredentialError(result.message, result.state, result.state === 'unavailable' ? 503 : 401);
  return result.credentials;
}

export async function createCredentialCookie(credentials: ProviderCredentials, request: Request) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(credentials)),
  );
  const value = `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
  if (value.length > 3800) throw new Error('密钥总长度超过浏览器安全存储容量，保存未生效。请减少已保存平台数量。');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=2592000`;
}

export function clearCredentialCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

