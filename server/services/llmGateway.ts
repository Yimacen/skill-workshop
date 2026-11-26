import { GoogleGenAI, ThinkingLevel, type Schema } from '@google/genai';
import type { ModelOption, ReasoningProfile } from '../../shared/types.ts';

export interface ModelExecutionSpec {
  profile: ReasoningProfile;
  provider: 'gemini' | 'deepseek' | 'openai-compatible';
  label: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
  estimatedPer1kTokensUsd: number;
}

const VALID_PROFILES = new Set<string>([
  'fast',
  'balanced',
  'deep',
  'deepseek-chat',
  'deepseek-reasoner',
  'openai-compatible',
]);

function getOpenAiCompatModelName(): string {
  return (process.env.OPENAI_COMPAT_MODEL || 'gpt-4o-mini').trim();
}

export function getModelCatalog(): ModelOption[] {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const hasOpenAiCompat = Boolean(
    process.env.OPENAI_COMPAT_API_KEY?.trim() &&
      process.env.OPENAI_COMPAT_BASE_URL?.trim()
  );

  return [
    {
      id: 'fast',
      provider: 'gemini',
      label: 'Gemini 4 Hydrogen · Fast (Low Thinking)',
      model: 'gemini-4-hydrogen',
      configured: hasGemini,
      missingEnvHint: hasGemini ? undefined : '请在 Secrets 中配置 GEMINI_API_KEY',
    },
    {
      id: 'balanced',
      provider: 'gemini',
      label: 'Gemini 4 Hydrogen · Balanced (Medium)',
      model: 'gemini-4-hydrogen',
      configured: hasGemini,
      missingEnvHint: hasGemini ? undefined : '请在 Secrets 中配置 GEMINI_API_KEY',
    },
    {
      id: 'deep',
      provider: 'gemini',
      label: 'Gemini 4 Hydrogen · Deep (High Thinking)',
      model: 'gemini-4-hydrogen',
      configured: hasGemini,
      missingEnvHint: hasGemini ? undefined : '请在 Secrets 中配置 GEMINI_API_KEY',
    },
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      label: 'DeepSeek Chat (V3 · 通用对话/代码)',
      model: 'deepseek-chat',
      configured: hasDeepseek,
      missingEnvHint: hasDeepseek ? undefined : '请在 Secrets 中配置 DEEPSEEK_API_KEY',
    },
    {
      id: 'deepseek-reasoner',
      provider: 'deepseek',
      label: 'DeepSeek Reasoner (R1 · 深度推理)',
      model: 'deepseek-reasoner',
      configured: hasDeepseek,
      missingEnvHint: hasDeepseek ? undefined : '请在 Secrets 中配置 DEEPSEEK_API_KEY',
    },
    {
      id: 'openai-compatible',
      provider: 'openai-compatible',
      label: `OpenAI 兼容模型 (${getOpenAiCompatModelName()})`,
      model: getOpenAiCompatModelName(),
      configured: hasOpenAiCompat,
      missingEnvHint: hasOpenAiCompat
        ? undefined
        : '请在 Secrets 中配置 OPENAI_COMPAT_API_KEY 与 OPENAI_COMPAT_BASE_URL',
    },
  ];
}

export function resolveProfile(input: unknown): ModelExecutionSpec {
  const profile: ReasoningProfile =
    typeof input === 'string' && VALID_PROFILES.has(input)
      ? (input as ReasoningProfile)
      : 'fast';

  switch (profile) {
    case 'balanced':
      return {
        profile: 'balanced',
        provider: 'gemini',
        label: 'Gemini 4 Hydrogen (Balanced)',
        model: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.MEDIUM,
        estimatedPer1kTokensUsd: 0.0008,
      };
    case 'deep':
      return {
        profile: 'deep',
        provider: 'gemini',
        label: 'Gemini 4 Hydrogen (Deep)',
        model: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.HIGH,
        estimatedPer1kTokensUsd: 0.0015,
      };
    case 'deepseek-chat':
      return {
        profile: 'deepseek-chat',
        provider: 'deepseek',
        label: 'DeepSeek Chat',
        model: 'deepseek-chat',
        estimatedPer1kTokensUsd: 0.0004,
      };
    case 'deepseek-reasoner':
      return {
        profile: 'deepseek-reasoner',
        provider: 'deepseek',
        label: 'DeepSeek Reasoner',
        model: 'deepseek-reasoner',
        estimatedPer1kTokensUsd: 0.0012,
      };
    case 'openai-compatible':
      return {
        profile: 'openai-compatible',
        provider: 'openai-compatible',
        label: `OpenAI Compatible (${getOpenAiCompatModelName()})`,
        model: getOpenAiCompatModelName(),
        estimatedPer1kTokensUsd: 0.0006,
      };
    case 'fast':
    default:
      return {
        profile: 'fast',
        provider: 'gemini',
        label: 'Gemini 4 Hydrogen (Fast)',
        model: 'gemini-4-hydrogen',
        thinkingLevel: ThinkingLevel.LOW,
        estimatedPer1kTokensUsd: 0.0004,
      };
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('服务端未配置 GEMINI_API_KEY，请在 Settings > Secrets 中添加。');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function validateSafeExternalHttpsUrl(rawUrl: string, defaultUrl: string): string {
  const trimmed = (rawUrl || defaultUrl).trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Model endpoint protocol must be http or https.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host.startsWith('169.254.')
  ) {
    throw new Error('Blocked metadata endpoint.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function callOpenAiCompatChat(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  jsonMode: boolean;
  allowResponseFormatJson: boolean;
}): Promise<{ text: string; totalTokens: number }> {
  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction });
  }
  messages.push({ role: 'user', content: params.prompt });

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
  };

  if (params.jsonMode && params.allowResponseFormatJson) {
    body.response_format = { type: 'json_object' };
  }

  const endpoint = `${params.baseUrl}/chat/completions`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const rawBody = await resp.text();
  if (!resp.ok) {
    let errMsg = `模型网关请求失败 (${resp.status})`;
    try {
      const parsedErr = JSON.parse(rawBody);
      errMsg = parsedErr?.error?.message || parsedErr?.message || errMsg;
    } catch {
      if (rawBody) errMsg = rawBody.slice(0, 240);
    }
    throw new Error(errMsg);
  }

  const data = JSON.parse(rawBody);
  const text: string = data?.choices?.[0]?.message?.content ?? '';
  const totalTokens: number =
    data?.usage?.total_tokens ??
    Math.ceil(
      ((params.systemInstruction?.length || 0) +
        params.prompt.length +
        text.length) /
        3.8
    );

  return { text, totalTokens };
}

export async function callLlmText(params: {
  profile?: ReasoningProfile;
  systemInstruction?: string;
  prompt: string;
}): Promise<{
  text: string;
  totalTokens: number;
  latencyMs: number;
  execSpec: ModelExecutionSpec;
}> {
  const execSpec = resolveProfile(params.profile);
  const started = Date.now();

  if (execSpec.provider === 'gemini') {
    const ai = getGeminiClient();
    const resp = await ai.models.generateContent({
      model: execSpec.model,
      contents: params.prompt,
      config: {
        ...(params.systemInstruction
          ? { systemInstruction: params.systemInstruction }
          : {}),
        thinkingConfig: { thinkingLevel: execSpec.thinkingLevel },
      },
    });
    const text = resp.text ?? '';
    const totalTokens =
      resp.usageMetadata?.totalTokenCount ??
      Math.ceil(
        ((params.systemInstruction?.length || 0) +
          params.prompt.length +
          text.length) /
          3.8
      );
    return {
      text,
      totalTokens,
      latencyMs: Date.now() - started,
      execSpec,
    };
  }

  if (execSpec.provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        '服务端未配置 DEEPSEEK_API_KEY，请在 Settings > Secrets 中添加后再选择 DeepSeek 模型。'
      );
    }
    const baseUrl = validateSafeExternalHttpsUrl(
      process.env.DEEPSEEK_BASE_URL || '',
      'https://api.deepseek.com'
    );
    const res = await callOpenAiCompatChat({
      baseUrl,
      apiKey,
      model: execSpec.model,
      systemInstruction: params.systemInstruction,
      prompt: params.prompt,
      jsonMode: false,
      allowResponseFormatJson: false,
    });
    return {
      text: res.text,
      totalTokens: res.totalTokens,
      latencyMs: Date.now() - started,
      execSpec,
    };
  }

  // OpenAI-Compatible generic provider
  const apiKey = process.env.OPENAI_COMPAT_API_KEY?.trim();
  const rawBaseUrl = process.env.OPENAI_COMPAT_BASE_URL?.trim();
  if (!apiKey || !rawBaseUrl) {
    throw new Error(
      '服务端未配置 OPENAI_COMPAT_API_KEY 或 OPENAI_COMPAT_BASE_URL，请在 Settings > Secrets 中添加。'
    );
  }
  const baseUrl = validateSafeExternalHttpsUrl(rawBaseUrl, rawBaseUrl);
  const res = await callOpenAiCompatChat({
    baseUrl,
    apiKey,
    model: execSpec.model,
    systemInstruction: params.systemInstruction,
    prompt: params.prompt,
    jsonMode: false,
    allowResponseFormatJson: false,
  });
  return {
    text: res.text,
    totalTokens: res.totalTokens,
    latencyMs: Date.now() - started,
    execSpec,
  };
}

export async function callLlmJson<T>(params: {
  profile?: ReasoningProfile;
  systemInstruction?: string;
  prompt: string;
  geminiSchema: Schema;
  jsonExampleHint: string;
}): Promise<{
  data: T;
  totalTokens: number;
  latencyMs: number;
  execSpec: ModelExecutionSpec;
}> {
  const execSpec = resolveProfile(params.profile);
  const started = Date.now();

  if (execSpec.provider === 'gemini') {
    const ai = getGeminiClient();
    const resp = await ai.models.generateContent({
      model: execSpec.model,
      contents: params.prompt,
      config: {
        ...(params.systemInstruction
          ? { systemInstruction: params.systemInstruction }
          : {}),
        thinkingConfig: { thinkingLevel: execSpec.thinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: params.geminiSchema,
      },
    });
    const text = (resp.text ?? '{}').trim();
    const totalTokens =
      resp.usageMetadata?.totalTokenCount ?? Math.ceil(text.length / 3.8);
    return {
      data: JSON.parse(text) as T,
      totalTokens,
      latencyMs: Date.now() - started,
      execSpec,
    };
  }

  const jsonPrompt = `${params.prompt}\n\n严格要求：你必须只输出合法的纯 JSON 对象（不要输出额外解释或 Markdown 前后缀），JSON 结构必须严格匹配以下示例：\n${params.jsonExampleHint}`;

  if (execSpec.provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        '服务端未配置 DEEPSEEK_API_KEY，请在 Settings > Secrets 中添加后再选择 DeepSeek 模型。'
      );
    }
    const baseUrl = validateSafeExternalHttpsUrl(
      process.env.DEEPSEEK_BASE_URL || '',
      'https://api.deepseek.com'
    );
    const res = await callOpenAiCompatChat({
      baseUrl,
      apiKey,
      model: execSpec.model,
      systemInstruction: params.systemInstruction,
      prompt: jsonPrompt,
      jsonMode: true,
      allowResponseFormatJson: execSpec.model !== 'deepseek-reasoner',
    });
    const parsed = JSON.parse(extractJsonObject(res.text)) as T;
    return {
      data: parsed,
      totalTokens: res.totalTokens,
      latencyMs: Date.now() - started,
      execSpec,
    };
  }

  const apiKey = process.env.OPENAI_COMPAT_API_KEY?.trim();
  const rawBaseUrl = process.env.OPENAI_COMPAT_BASE_URL?.trim();
  if (!apiKey || !rawBaseUrl) {
    throw new Error(
      '服务端未配置 OPENAI_COMPAT_API_KEY 或 OPENAI_COMPAT_BASE_URL，请在 Settings > Secrets 中添加。'
    );
  }
  const baseUrl = validateSafeExternalHttpsUrl(rawBaseUrl, rawBaseUrl);
  const res = await callOpenAiCompatChat({
    baseUrl,
    apiKey,
    model: execSpec.model,
    systemInstruction: params.systemInstruction,
    prompt: jsonPrompt,
    jsonMode: true,
    allowResponseFormatJson: true,
  });
  const parsed = JSON.parse(extractJsonObject(res.text)) as T;
  return {
    data: parsed,
    totalTokens: res.totalTokens,
    latencyMs: Date.now() - started,
    execSpec,
  };
}

export function estimateCostUsd(
  tokens: number,
  profile: ReasoningProfile
): number {
  const spec = resolveProfile(profile);
  return Number(((tokens / 1000) * spec.estimatedPer1kTokensUsd).toFixed(5));
}
