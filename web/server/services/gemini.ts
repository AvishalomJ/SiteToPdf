/**
 * Gemini API client — extracted from electron/main.js for reuse in the web server.
 * API key is provided per-request (never stored server-side).
 */

import https from 'https';

export const GEMINI_MODELS: Record<string, string> = {
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
};

export function callGeminiApi(
  apiKey: string,
  prompt: string,
  model = 'gemini-2.5-flash',
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    });

    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const msg: string = json.error.message || 'Gemini API error';
            const err: any = new Error(msg);
            err.status = json.error.code;
            err.isQuota =
              msg.toLowerCase().includes('quota') ||
              msg.toLowerCase().includes('rate');
            const retryMatch = msg.match(/retry in ([\d.]+)s/i);
            if (retryMatch) err.retryAfter = Math.ceil(parseFloat(retryMatch[1]));
            reject(err);
            return;
          }
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            reject(new Error('No content returned from Gemini API'));
            return;
          }
          resolve(text);
        } catch {
          reject(new Error('Failed to parse Gemini API response'));
        }
      });
    });

    req.on('error', (e: Error) =>
      reject(new Error(`Network error: ${e.message}`)),
    );
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });
    req.write(body);
    req.end();
  });
}

export async function callGeminiWithRetry(
  apiKey: string,
  prompt: string,
  model: string,
  sendProgress: (msg: string) => void,
  maxRetries = 1,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callGeminiApi(apiKey, prompt, model);
    } catch (error: any) {
      if (error.isQuota && error.retryAfter && attempt < maxRetries) {
        const waitSec = Math.min(error.retryAfter + 1, 30);
        sendProgress(`⏳ Rate limited — retrying in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        sendProgress(`🔄 Retrying request (attempt ${attempt + 2})...`);
        continue;
      }
      if (error.isQuota) {
        throw new Error(
          'QUOTA_EXCEEDED: Your Gemini API quota is exhausted. ' +
            'Either enable billing at ai.google.dev or try a different model.',
        );
      }
      throw error;
    }
  }
  throw new Error('Unexpected: retry loop exited without returning');
}

/** Convert plain/markdown summary text to simple HTML paragraphs. */
export function summaryToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}
