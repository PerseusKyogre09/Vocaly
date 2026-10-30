import { isIP } from 'node:net';

export type TemplateVariables = Record<string, unknown>;

/**
 * Validates a target URL against Server-Side Request Forgery (SSRF).
 * Blocks:
 * - Non-HTTP/HTTPS protocols
 * - localhost / 127.0.0.1 / ::1
 * - RFC 1918 private IPv4 subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Link-local / AWS/GCP/Azure metadata (169.254.0.0/16, fe80::/10, etc.)
 * - Carrier-grade NAT (100.64.0.0/10)
 * - Broadcast / 0.0.0.0
 * - Domains ending with .local, .localhost, .internal, etc.
 */
export function validateWebhookUrl(rawUrl: string): { valid: boolean; error?: string; url?: URL } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'Webhook URL is required.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are supported.' };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Strip enclosing brackets for IPv6
  const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // Localhost names
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost === 'metadata.google.internal'
  ) {
    return { valid: false, error: 'Target URL resolves to a protected local or internal hostname.' };
  }

  // Check IP addresses
  const ipVersion = isIP(cleanHost);
  if (ipVersion === 4) {
    if (isPrivateIPv4(cleanHost)) {
      return { valid: false, error: 'Target URL points to a private or link-local IPv4 address.' };
    }
  } else if (ipVersion === 6) {
    if (isPrivateIPv6(cleanHost)) {
      return { valid: false, error: 'Target URL points to a private or link-local IPv6 address.' };
    }
  }

  return { valid: true, url: parsed };
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return true;

  const [a, b] = parts;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // Unspecified ::
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  // Link-local fe80::/10
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  // Unique local fc00::/7
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.replace('::ffff:', '');
    return isPrivateIPv4(v4);
  }
  return false;
}

/**
 * Safely resolves mustache-style templates {{var}} using a strict key lookup.
 * Arbitrary JavaScript is NEVER evaluated.
 */
export function resolveTemplate(template: unknown, variables: TemplateVariables): unknown {
  if (typeof template === 'string') {
    // If entire string is exactly "{{var}}", preserve original type (e.g., number, boolean, array, object)
    const exactMatch = template.match(/^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/);
    if (exactMatch) {
      const key = exactMatch[1];
      const val = getNestedValue(variables, key);
      return val !== undefined ? val : '';
    }

    // Strip any invalid/malicious expressions like {{process.exit()}} or {{1+1}} that are not valid identifiers
    let clean = template.replace(/\{\{\s*[^a-zA-Z0-9_.\s-][^}]*\}\}/g, '');

    // Interpolate valid mustache identifiers
    clean = clean.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
      const val = getNestedValue(variables, key);
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });

    // Remove any remaining unresolved double curly patterns
    return clean.replace(/\{\{[^}]*\}\}/g, '');
  }

  if (Array.isArray(template)) {
    return template.map(item => resolveTemplate(item, variables));
  }

  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template)) {
      result[k] = resolveTemplate(v, variables);
    }
    return result;
  }

  return template;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Redacts known sensitive fields (authorization, password, token, secret, api-key)
 * from headers, bodies, or query parameters.
 */
export function redactSecrets(data: unknown): unknown {
  if (typeof data === 'string') {
    return data.replace(/(bearer\s+)[a-zA-Z0-9_.\-]+/gi, '$1[REDACTED]')
      .replace(/(api[-_]?key|secret|token|password)=[^&\s]+/gi, '$1=[REDACTED]');
  }

  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }

  if (data !== null && typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (/authorization|api[-_]?key|secret|token|password|cookie|auth/i.test(k)) {
        redacted[k] = '[REDACTED]';
      } else {
        redacted[k] = redactSecrets(v);
      }
    }
    return redacted;
  }

  return data;
}

export type WebhookExecutionOptions = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export type WebhookExecutionResult = {
  success: boolean;
  status?: number;
  responseBodySnippet?: string;
  error?: string;
  durationMs: number;
  requestHeadersRedacted: Record<string, unknown>;
  requestPayloadRedacted: unknown;
  requestUrl: string;
  requestMethod: string;
};

/**
 * Server-side webhook execution engine with SSRF protection, timeout, redirect checks,
 * secret redaction, and response body safety truncation.
 */
export async function executeWebhook(options: WebhookExecutionOptions): Promise<WebhookExecutionResult> {
  const startTime = Date.now();
  const method = options.method || 'POST';
  const timeoutMs = Math.min(Math.max(options.timeoutMs || 8000, 1000), 30000);

  const urlCheck = validateWebhookUrl(options.url);
  if (!urlCheck.valid || !urlCheck.url) {
    return {
      success: false,
      error: urlCheck.error || 'Invalid or blocked destination URL.',
      durationMs: Date.now() - startTime,
      requestHeadersRedacted: redactSecrets(options.headers || {}) as Record<string, unknown>,
      requestPayloadRedacted: redactSecrets(options.body),
      requestUrl: options.url,
      requestMethod: method
    };
  }

  const rawHeaders = { ...(options.headers || {}) };
  // Default content-type for methods with body
  if (['POST', 'PUT', 'PATCH'].includes(method) && !Object.keys(rawHeaders).some(k => k.toLowerCase() === 'content-type')) {
    rawHeaders['Content-Type'] = 'application/json';
  }

  let bodyContent: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method) && options.body !== undefined) {
    bodyContent = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const redactedHeaders = redactSecrets(rawHeaders) as Record<string, unknown>;
  const redactedPayload = redactSecrets(options.body);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Custom redirect loop protection: fetch with redirect: 'manual' to re-validate each hop against SSRF
    let currentUrl = urlCheck.url.toString();
    let currentMethod = method;
    let currentBody = bodyContent;
    let response: Response | null = null;
    let redirectCount = 0;
    const maxRedirects = 3;

    while (redirectCount <= maxRedirects) {
      response = await fetch(currentUrl, {
        method: currentMethod,
        headers: rawHeaders,
        body: currentBody,
        signal: controller.signal,
        redirect: 'manual'
      });

      // Handle redirect status
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new Error('Too many redirects (max 3).');
        }
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect status ${response.status} without Location header.`);
        }
        const resolvedRedirect = new URL(location, currentUrl).toString();
        const redirectCheck = validateWebhookUrl(resolvedRedirect);
        if (!redirectCheck.valid || !redirectCheck.url) {
          throw new Error(`Redirect blocked: ${redirectCheck.error || 'Destination is not allowed.'}`);
        }
        currentUrl = redirectCheck.url.toString();
        // If 303, change method to GET
        if (response.status === 303) {
          currentMethod = 'GET';
          currentBody = undefined;
        }
        continue;
      }

      break;
    }

    if (!response) {
      throw new Error('No response received from target.');
    }

    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch(() => '');
    const snippet = responseText.slice(0, 2000); // Truncate response snippet safely

    const isSuccess = response.status >= 200 && response.status < 300;

    return {
      success: isSuccess,
      status: response.status,
      responseBodySnippet: snippet,
      durationMs,
      requestHeadersRedacted: redactedHeaders,
      requestPayloadRedacted: redactedPayload,
      requestUrl: currentUrl,
      requestMethod: currentMethod,
      error: isSuccess ? undefined : `Target responded with HTTP ${response.status}`
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isAbort = (error as Error)?.name === 'AbortError';
    return {
      success: false,
      error: isAbort ? `Webhook request timed out after ${timeoutMs}ms.` : (error instanceof Error ? error.message : 'Webhook execution failed.'),
      durationMs,
      requestHeadersRedacted: redactedHeaders,
      requestPayloadRedacted: redactedPayload,
      requestUrl: options.url,
      requestMethod: method
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
