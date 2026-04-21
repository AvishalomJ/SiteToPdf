import { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn, execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import {
  createJob,
  updateProgress,
  completeJob,
  failJob,
} from '../services/job-manager';

/* ------------------------------------------------------------------ */
/*  yt-dlp binary discovery                                           */
/* ------------------------------------------------------------------ */

function findYtDlp(): string {
  // 1. Check PATH
  const isWin = process.platform === 'win32';
  const name = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  // 2. Common pip install locations on Windows
  if (isWin) {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'AppData', 'Local', 'Packages',
        'PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0',
        'LocalCache', 'local-packages', 'Python313', 'Scripts', name),
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', name),
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', name),
      path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', name),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 3. Also try python -m yt_dlp as fallback
  return name; // rely on PATH
}

const YT_DLP = findYtDlp();

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'download';
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)$/i.test(
      u.hostname,
    );
  } catch {
    return false;
  }
}

const PROGRESS_RE = /\[download\]\s+([\d.]+)%/;

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * Run yt-dlp with JSON output and return parsed result.
 */
function ytdlpJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--no-download', '--no-playlist', url];
    if (ffmpegPath) args.unshift('--ffmpeg-location', ffmpegPath);

    execFile(YT_DLP, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Interfaces                                                        */
/* ------------------------------------------------------------------ */

interface InfoBody {
  url: string;
}

interface DownloadBody {
  url: string;
  format: 'audio' | 'video';
  quality?: string;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                            */
/* ------------------------------------------------------------------ */

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  /* ---------- POST /api/youtube/info -------------------------------- */
  app.post<{ Body: InfoBody }>('/api/youtube/info', async (request, reply) => {
    const { url } = request.body ?? ({} as InfoBody);
    if (!url || !isYouTubeUrl(url)) {
      return reply
        .status(400)
        .send({ error: 'A valid YouTube URL is required.' });
    }

    try {
      const info = await ytdlpJson(url);

      return reply.send({
        title: info.title ?? info.fulltitle ?? 'Unknown',
        thumbnail: info.thumbnail ?? '',
        duration: formatDuration(Number(info.duration) || 0),
        videoId: info.id ?? '',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, 'youtube info failed');
      return reply
        .status(500)
        .send({ error: `Failed to fetch video info: ${msg}` });
    }
  });

  /* ---------- POST /api/youtube/download ----------------------------- */
  app.post<{ Body: DownloadBody }>(
    '/api/youtube/download',
    async (request, reply) => {
      const { url, format, quality } = request.body ?? ({} as DownloadBody);
      if (!url || !isYouTubeUrl(url)) {
        return reply
          .status(400)
          .send({ error: 'A valid YouTube URL is required.' });
      }
      if (format !== 'audio' && format !== 'video') {
        return reply
          .status(400)
          .send({ error: 'format must be "audio" or "video".' });
      }

      const jobId = createJob();
      void reply.send({ jobId });

      setImmediate(() => {
        void (async () => {
          const jobDir = path.join(os.tmpdir(), 'sitetopdf-yt', jobId);
          try {
            fs.mkdirSync(jobDir, { recursive: true });

            // Fetch title for display filename
            updateProgress(jobId, 'Fetching video metadata…');
            let title = 'download';
            try {
              const meta = await ytdlpJson(url);
              title = sanitizeFilename(String(meta.title ?? 'download'));
              updateProgress(jobId, `Video: ${meta.title}`);
            } catch {
              /* fall back to generic name */
            }

            updateProgress(jobId, `Starting ${format} download…`);

            // Build yt-dlp arguments
            const ext = format === 'audio' ? 'mp3' : 'mp4';
            const outputTemplate = path.join(jobDir, `${jobId}.${ext}`);
            const args: string[] = ['--newline', '--no-playlist'];

            if (ffmpegPath) {
              args.push('--ffmpeg-location', ffmpegPath);
            }

            args.push('-o', outputTemplate);

            if (format === 'audio') {
              args.push('-x', '--audio-format', 'mp3');
              args.push('--audio-quality', quality || '192K');
            } else {
              const res = quality || '1080';
              args.push(
                '-f',
                `bestvideo[height<=${res}]+bestaudio/best[height<=${res}]`,
                '--merge-output-format',
                'mp4',
              );
            }

            args.push(url);

            // Spawn yt-dlp
            const proc = spawn(YT_DLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            proc.stdout.on('data', (chunk: Buffer) => {
              const lines = chunk.toString().split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const match = PROGRESS_RE.exec(trimmed);
                if (match) {
                  updateProgress(jobId, `Downloading: ${match[1]}%`);
                } else if (trimmed.startsWith('[')) {
                  updateProgress(jobId, trimmed);
                }
              }
            });

            let stderrBuf = '';
            proc.stderr.on('data', (chunk: Buffer) => {
              stderrBuf += chunk.toString();
            });

            // Wait for process
            const exitCode = await new Promise<number>((resolve, reject) => {
              proc.on('close', (code) => resolve(code ?? 0));
              proc.on('error', reject);
            });

            if (exitCode !== 0) {
              throw new Error(stderrBuf || `yt-dlp exited with code ${exitCode}`);
            }

            // Find output file
            const files = fs.readdirSync(jobDir).filter((f) => f.startsWith(jobId));
            if (files.length === 0) {
              throw new Error('No output file found after download');
            }
            const outputFile = path.join(jobDir, files[0]);
            const actualExt = path.extname(files[0]).replace(/^\./, '') || ext;
            const displayFilename = `${title}.${actualExt}`;

            completeJob(jobId, outputFile, displayFilename);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            request.log.error({ err }, 'youtube download failed');
            failJob(jobId, msg);
            cleanupDir(jobDir);
          }
        })();
      });
    },
  );
}
