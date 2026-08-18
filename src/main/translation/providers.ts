/**
 * Pluggable translation providers (spec v2 §7.4).
 *
 * Input: ordered list of { rectangleId, originalText } in manga reading order.
 * Output: ordered list of { rectangleId, translatedText } (failed segments marked).
 *
 * Connectivity / API errors throw so the caller can abort the pipeline with an
 * error dialog while retaining partial OCR results.
 */

import {
  Settings,
  TranslateRequest,
  TranslateResponse,
  TranslateSegment,
  TranslateSegmentResult,
  TranslationProviderId
} from '../../shared/types';

export class TranslationError extends Error {
  constructor(
    message: string,
    readonly code: 'config' | 'network' | 'api' | 'parse' = 'api'
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export interface TranslationProvider {
  readonly id: TranslationProviderId;
  translate(request: TranslateRequest, settings: Settings): Promise<TranslateResponse>;
}

function nonEmpty(segments: TranslateSegment[]): TranslateSegment[] {
  return segments.filter((s) => s.originalText.trim().length > 0);
}

function emptyResults(segments: TranslateSegment[]): TranslateSegmentResult[] {
  return segments.map((s) => ({
    rectangleId: s.rectangleId,
    translatedText: '',
    failed: s.originalText.trim().length === 0 ? false : true,
    error: s.originalText.trim().length === 0 ? undefined : 'empty source'
  }));
}

async function fetchJson(
  url: string,
  init: RequestInit,
  label: string
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new TranslationError(
      `Network error talking to ${label}: ${err instanceof Error ? err.message : String(err)}. Check your internet connection.`,
      'network'
    );
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 400);
    throw new TranslationError(`${label} HTTP ${response.status}: ${detail || response.statusText}`, 'api');
  }
  return body;
}

/** DeepL Free/Pro — batches all texts in one request. */
export const deeplProvider: TranslationProvider = {
  id: 'deepl',
  async translate(request, settings) {
    const key = settings.translationApiKey.trim();
    if (!key) throw new TranslationError('DeepL API key is not set. Add it in Settings.', 'config');

    const segments = request.segments;
    const toTranslate = nonEmpty(segments);
    if (toTranslate.length === 0) return { results: emptyResults(segments) };

    const base =
      settings.translationBaseUrl.trim() ||
      (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
    const url = `${base.replace(/\/$/, '')}/v2/translate`;

    // DeepL requires Authorization: DeepL-Auth-Key (auth_key form field is rejected).
    const headers = {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json'
    };
    const body = JSON.stringify({
      text: toTranslate.map((s) => s.originalText),
      source_lang: 'JA',
      target_lang: 'EN'
    });

    const json = (await fetchJson(
      url,
      {
        method: 'POST',
        headers,
        body
      },
      'DeepL'
    )) as { translations?: Array<{ text: string }> };

    const translations = json.translations ?? [];
    if (translations.length !== toTranslate.length) {
      throw new TranslationError(
        `DeepL returned ${translations.length} translation(s) for ${toTranslate.length} segment(s)`,
        'parse'
      );
    }

    const byId = new Map<string, TranslateSegmentResult>();
    toTranslate.forEach((seg, i) => {
      byId.set(seg.rectangleId, {
        rectangleId: seg.rectangleId,
        translatedText: translations[i]?.text ?? '',
        failed: false
      });
    });
    return {
      results: segments.map(
        (s) =>
          byId.get(s.rectangleId) ?? {
            rectangleId: s.rectangleId,
            translatedText: '',
            failed: false
          }
      )
    };
  }
};

/** Google Cloud Translation v2 — batches all texts in one request. */
export const googleProvider: TranslationProvider = {
  id: 'google',
  async translate(request, settings) {
    const key = settings.translationApiKey.trim();
    if (!key) {
      throw new TranslationError('Google Cloud Translation API key is not set. Add it in Settings.', 'config');
    }

    const segments = request.segments;
    const toTranslate = nonEmpty(segments);
    if (toTranslate.length === 0) return { results: emptyResults(segments) };

    const base = settings.translationBaseUrl.trim() || 'https://translation.googleapis.com';
    const url = `${base.replace(/\/$/, '')}/language/translate/v2?key=${encodeURIComponent(key)}`;

    const json = (await fetchJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: toTranslate.map((s) => s.originalText),
          source: 'ja',
          target: 'en',
          format: 'text'
        })
      },
      'Google Translate'
    )) as { data?: { translations?: Array<{ translatedText: string }> } };

    const translations = json.data?.translations ?? [];
    if (translations.length !== toTranslate.length) {
      throw new TranslationError(
        `Google returned ${translations.length} translation(s) for ${toTranslate.length} segment(s)`,
        'parse'
      );
    }

    const byId = new Map<string, TranslateSegmentResult>();
    toTranslate.forEach((seg, i) => {
      byId.set(seg.rectangleId, {
        rectangleId: seg.rectangleId,
        translatedText: decodeHtmlEntities(translations[i]?.translatedText ?? ''),
        failed: false
      });
    });
    return {
      results: segments.map(
        (s) =>
          byId.get(s.rectangleId) ?? {
            rectangleId: s.rectangleId,
            translatedText: '',
            failed: false
          }
      )
    };
  }
};

/** OpenAI-compatible chat completions — true page-level manga context. */
export const openaiCompatibleProvider: TranslationProvider = {
  id: 'openaiCompatible',
  async translate(request, settings) {
    const key = settings.translationApiKey.trim();
    if (!key) {
      throw new TranslationError('OpenAI-compatible API key is not set. Add it in Settings.', 'config');
    }

    const segments = request.segments;
    const toTranslate = nonEmpty(segments);
    if (toTranslate.length === 0) return { results: emptyResults(segments) };

    const base = (settings.translationBaseUrl.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = settings.translationModel.trim() || 'gpt-4o-mini';
    const numbered = toTranslate
      .map((s, i) => `${i + 1}. ${s.originalText.replace(/\n/g, ' ')}`)
      .join('\n');

    const system =
      'You translate Japanese manga dialogue to natural English. ' +
      'Preserve tone, speaker voice, and honorifics sense. ' +
      'Reply with ONLY a JSON array of strings, one English translation per input line, same order and length. No markdown.';

    const json = (await fetchJson(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content:
                'Translate these manga lines in reading order (right-to-left page context):\n' + numbered
            }
          ]
        })
      },
      'OpenAI-compatible'
    )) as { choices?: Array<{ message?: { content?: string } }> };

    const content = json.choices?.[0]?.message?.content ?? '';
    const parsed = parseJsonStringArray(content);
    if (parsed.length !== toTranslate.length) {
      throw new TranslationError(
        `Model returned ${parsed.length} line(s) for ${toTranslate.length} segment(s)`,
        'parse'
      );
    }

    const byId = new Map<string, TranslateSegmentResult>();
    toTranslate.forEach((seg, i) => {
      byId.set(seg.rectangleId, {
        rectangleId: seg.rectangleId,
        translatedText: parsed[i] ?? '',
        failed: false
      });
    });
    return {
      results: segments.map(
        (s) =>
          byId.get(s.rectangleId) ?? {
            rectangleId: s.rectangleId,
            translatedText: '',
            failed: false
          }
      )
    };
  }
};

/** LibreTranslate — one request per segment (API is typically single-text). */
export const libreTranslateProvider: TranslationProvider = {
  id: 'libreTranslate',
  async translate(request, settings) {
    const segments = request.segments;
    const toTranslate = nonEmpty(segments);
    if (toTranslate.length === 0) return { results: emptyResults(segments) };

    const base = (settings.translationBaseUrl.trim() || 'https://libretranslate.com').replace(/\/$/, '');
    const key = settings.translationApiKey.trim();
    const byId = new Map<string, TranslateSegmentResult>();

    for (const seg of toTranslate) {
      const payload: Record<string, string> = {
        q: seg.originalText,
        source: 'ja',
        target: 'en',
        format: 'text'
      };
      if (key) payload.api_key = key;

      try {
        const json = (await fetchJson(
          `${base}/translate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          },
          'LibreTranslate'
        )) as { translatedText?: string };
        byId.set(seg.rectangleId, {
          rectangleId: seg.rectangleId,
          translatedText: json.translatedText ?? '',
          failed: false
        });
      } catch (err) {
        // Per-segment failure: mark failed and continue (spec 7).
        byId.set(seg.rectangleId, {
          rectangleId: seg.rectangleId,
          translatedText: '',
          failed: true,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return {
      results: segments.map(
        (s) =>
          byId.get(s.rectangleId) ?? {
            rectangleId: s.rectangleId,
            translatedText: '',
            failed: false
          }
      )
    };
  }
};

const PROVIDERS: Record<TranslationProviderId, TranslationProvider> = {
  deepl: deeplProvider,
  google: googleProvider,
  openaiCompatible: openaiCompatibleProvider,
  libreTranslate: libreTranslateProvider
};

export function getProvider(id: TranslationProviderId): TranslationProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new TranslationError(`Unknown translation provider: ${id}`, 'config');
  return provider;
}

export async function translateWithSettings(
  request: TranslateRequest,
  settings: Settings
): Promise<TranslateResponse> {
  return getProvider(settings.translationProvider).translate(request, settings);
}

/** Extract a JSON string array from model output, tolerating ``` fences. */
export function parseJsonStringArray(content: string): string[] {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end < 0) {
    throw new TranslationError('Model response did not contain a JSON array', 'parse');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
    throw new TranslationError('Model JSON was not an array of strings', 'parse');
  }
  return parsed as string[];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
