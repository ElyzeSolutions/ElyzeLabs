const AUTH_HEADER_RE = /((?:Proxy-)?Authorization:\s*)([A-Za-z][\w.+-]*\s+)?(\S+)/giu;
const SECRET_HEADER_RE =
  /\b((?:x-api-key|x-goog-api-key|api-key|apikey|x-api-token|x-auth-token|x-access-token)\s*:\s*)(\S+)/giu;
const SENSITIVE_QUERY_RE =
  /([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|client_secret|password|auth|jwt|session|secret|key|code|signature|x-amz-signature)=)[^&#\s]+/giu;
const SENSITIVE_KV_RE =
  /\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|session|sid|csrf|auth|cookie|password|passwd)[A-Za-z0-9_.-]*)\s*=\s*[^;\s\n\r]+/giu;
const COOKIE_HEADER_RE = /\b(cookie|set-cookie)\s*:\s*[^\n\r]+/giu;
const URL_USERINFO_RE = /\b(https?|wss?|ftp):\/\/([^/\s:@]+):([^/\s@]+)@/giu;
const DB_CONNSTR_RE = /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s]+:)([^@\s]+)(@)/giu;
const PRIVATE_KEY_RE = /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/gu;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_=-]{4,}){0,2}\b/gu;
const TELEGRAM_RE = /\b(?:bot)?\d{8,}:[-A-Za-z0-9_]{30,}\b/gu;
const GITHUB_RE = /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{10,}\b/gu;
const GOOGLE_RE = /\bAIza[A-Za-z0-9_-]{30,}\b/gu;
const OPENAI_STYLE_RE = /\bsk-[A-Za-z0-9_-]{10,}\b/gu;
const STRIPE_RE = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/gu;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/giu;
const BASIC_RE = /\bBasic\s+[A-Za-z0-9+/=]{12,}/giu;

export function redactEvidenceText(value, limit = 1200) {
  return String(value ?? '')
    .slice(0, limit)
    .replace(PRIVATE_KEY_RE, '[redacted-private-key]')
    .replace(AUTH_HEADER_RE, (_match, prefix, scheme = '') => `${prefix}${scheme}[redacted]`)
    .replace(SECRET_HEADER_RE, '$1[redacted]')
    .replace(COOKIE_HEADER_RE, '$1: [redacted]')
    .replace(URL_USERINFO_RE, '$1://[redacted]@')
    .replace(DB_CONNSTR_RE, '$1[redacted]$3')
    .replace(SENSITIVE_QUERY_RE, '$1[redacted]')
    .replace(SENSITIVE_KV_RE, '$1=[redacted]')
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(BASIC_RE, 'Basic [redacted]')
    .replace(TELEGRAM_RE, 'bot[redacted]')
    .replace(GITHUB_RE, 'gh[redacted]')
    .replace(GOOGLE_RE, 'AIza[redacted]')
    .replace(OPENAI_STYLE_RE, 'sk-[redacted]')
    .replace(STRIPE_RE, 'stripe[redacted]')
    .replace(JWT_RE, 'jwt[redacted]');
}

export function redactError(error, limit = 1200) {
  const message = error instanceof Error ? error.message : String(error);
  return redactEvidenceText(message, limit);
}
