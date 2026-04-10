/**
 * AI Summarizer + Translator — uses Ollama (local LLM) to summarize
 * and translate web page content.
 *
 * - If Ollama is not installed, attempts to install via winget (Windows).
 * - If the required model is not pulled, pulls it automatically.
 * - Summarizes content while preserving key information, then translates.
 */

import { execSync, spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { ExtractedContent } from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';
const CHUNK_SIZE = 2000;

// ── Ollama lifecycle helpers ────────────────────────────────────

let _ollamaReady = false;

/** Resolve the full path to the ollama executable. */
function findOllamaBin(): string | null {
  // Try PATH first
  try {
    const out = execSync('where ollama', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    if (out) return out.split(/\r?\n/)[0];
  } catch { /* not on PATH */ }

  // Common Windows install locations
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.PROGRAMFILES ?? '', 'Ollama', 'ollama.exe'),
  ];

  for (const p of candidates) {
    try {
      const fs = require('fs');
      if (fs.existsSync(p)) return p;
    } catch { /* skip */ }
  }
  return null;
}

let _ollamaBin: string | null = null;

function getOllamaBin(): string {
  if (_ollamaBin) return _ollamaBin;
  _ollamaBin = findOllamaBin();
  if (!_ollamaBin) throw new Error('Ollama binary not found');
  return _ollamaBin;
}

async function ensureOllama(): Promise<void> {
  if (_ollamaReady) return;

  if (await isOllamaRunning()) {
    _ollamaReady = true;
  } else {
    let bin = findOllamaBin();

    if (!bin) {
      console.log('🔧 Ollama not found. Installing via winget...');
      try {
        execSync(
          'winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements',
          { stdio: 'inherit' },
        );
        console.log('✅ Ollama installed.');
      } catch {
        throw new Error(
          'Could not install Ollama automatically. Please install from https://ollama.com then retry.',
        );
      }
      _ollamaBin = null; // reset cache
      bin = findOllamaBin();
      if (!bin) {
        throw new Error('Ollama installed but binary not found. Please restart your terminal and try again.');
      }
    }

    console.log('🔧 Starting Ollama service...');
    spawn(bin, ['serve'], { detached: true, stdio: 'ignore' }).unref();
    await waitForOllama(30_000);
    _ollamaReady = true;
  }

  // Ensure model is available
  if (!(await isModelAvailable(DEFAULT_MODEL))) {
    console.log(`📥 Pulling model "${DEFAULT_MODEL}" — first run may take a few minutes...`);
    execSync(`"${getOllamaBin()}" pull ${DEFAULT_MODEL}`, { stdio: 'inherit' });
    console.log(`✅ Model "${DEFAULT_MODEL}" ready.`);
  }
}

function isOllamaInstalled(): boolean {
  try {
    execSync('ollama --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function isOllamaRunning(): Promise<boolean> {
  try {
    await ollamaGet('/api/tags');
    return true;
  } catch {
    return false;
  }
}

async function waitForOllama(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isOllamaRunning()) return;
    await sleep(1000);
  }
  throw new Error(
    'Ollama did not start in time. Please run "ollama serve" manually and retry.',
  );
}

async function isModelAvailable(model: string): Promise<boolean> {
  try {
    const body = await ollamaGet('/api/tags');
    const data = JSON.parse(body);
    return data.models?.some(
      (m: { name: string }) => m.name === model || m.name.startsWith(`${model}:`),
    );
  } catch {
    return false;
  }
}

// ── HTTP helpers (Node built-in — no extra deps) ────────────────

function ollamaGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${OLLAMA_BASE_URL}${path}`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama API timeout'));
    });
  });
}

function ollamaPost(path: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      `${OLLAMA_BASE_URL}${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 180_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama generation timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function ollamaGenerate(prompt: string): Promise<string> {
  const raw = await ollamaPost('/api/generate', {
    model: DEFAULT_MODEL,
    prompt,
    stream: false,
  });
  const data = JSON.parse(raw);
  return data.response ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Language helpers ────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  he: 'Hebrew', ar: 'Arabic', fa: 'Persian', ur: 'Urdu',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese',
  ko: 'Korean', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch',
  pl: 'Polish', sv: 'Swedish', da: 'Danish', fi: 'Finnish',
};

function getLanguageName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] ?? code;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Summarize and translate extracted page content using a local Ollama LLM.
 * Splits content into chunks so the full text gets translated, not just the beginning.
 * Stores the original title in `originalTitle` for reference.
 */
export async function translateContent(
  content: ExtractedContent,
  targetLang: string,
): Promise<ExtractedContent> {
  try {
    await ensureOllama();

    const langName = getLanguageName(targetLang);
    console.log(`  🤖 Summarizing & translating to ${langName}...`);

    // Split text into chunks at paragraph boundaries
    const chunks = splitTextIntoChunks(content.textContent, CHUNK_SIZE);
    console.log(`  📄 Processing ${chunks.length} chunk(s)...`);

    const translatedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`  🔄 Translating chunk ${i + 1}/${chunks.length}...`);
      const chunkPrompt = [
        `You are a professional translator.`,
        `Translate the following text to ${langName}.`,
        `Preserve the meaning, technical details, and structure.`,
        `Output ONLY the translated text in ${langName}, nothing else.\n`,
        `Text:\n${chunks[i]}`,
      ].join('\n');

      const translated = await ollamaGenerate(chunkPrompt);
      if (translated.trim()) {
        translatedChunks.push(translated.trim());
      }
    }

    const fullTranslation = translatedChunks.join('\n\n');

    // Build HTML from the translated text
    const htmlContent = fullTranslation
      .split('\n\n')
      .filter((p) => p.trim())
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    // Translate the title separately
    const titlePrompt = `Translate this title to ${langName}. Output ONLY the translated title, nothing else.\n\nTitle: ${content.title}`;
    const translatedTitle = (await ollamaGenerate(titlePrompt)).trim();

    return {
      title: translatedTitle,
      originalTitle: content.title,
      contentHtml: htmlContent,
      textContent: fullTranslation,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠ AI translation failed — returning original content. Reason: ${message}`);
    return { ...content, originalTitle: content.title };
  }
}

/**
 * Split text into chunks at paragraph boundaries, keeping each chunk
 * under maxSize characters where possible.
 */
function splitTextIntoChunks(text: string, maxSize: number): string[] {
  if (!text || text.length <= maxSize) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
