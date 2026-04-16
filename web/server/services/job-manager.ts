import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  progress: string[];
  outputPath?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, Job>();
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const JOB_TTL_MS =
  (parseInt(process.env.JOB_TTL_MINUTES ?? '60', 10) || 60) * 60 * 1000;

// Cleanup expired jobs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

export function createJob(): string {
  const id = uuidv4();
  jobs.set(id, {
    id,
    status: 'pending',
    progress: [],
    createdAt: Date.now(),
  });
  return id;
}

export function updateProgress(jobId: string, message: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress.push(message);
  emitter.emit(`progress:${jobId}`, message);
}

export function completeJob(jobId: string, outputPath: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'completed';
  job.outputPath = outputPath;
  emitter.emit(`progress:${jobId}`, `✅ Done — ${outputPath}`);
  emitter.emit(`done:${jobId}`);
}

export function failJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  emitter.emit(`progress:${jobId}`, `❌ Error: ${error}`);
  emitter.emit(`done:${jobId}`);
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function onProgress(
  jobId: string,
  listener: (msg: string) => void,
): () => void {
  emitter.on(`progress:${jobId}`, listener);
  return () => {
    emitter.removeListener(`progress:${jobId}`, listener);
  };
}

export function onDone(jobId: string, listener: () => void): () => void {
  emitter.on(`done:${jobId}`, listener);
  return () => {
    emitter.removeListener(`done:${jobId}`, listener);
  };
}

export function deleteJob(jobId: string): void {
  jobs.delete(jobId);
}
