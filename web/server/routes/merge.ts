import { FastifyInstance } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createJob, updateProgress, completeJob, failJob } from '../services/job-manager';

const JOBS_DIR = path.join(os.tmpdir(), 'sitetopdf-jobs');

interface MergeGroup {
  groupName: string;
  files: { name: string; data: string }[];  // base64-encoded PDF data
}

interface MergeBody {
  groups: MergeGroup[];
}

export async function mergeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/merge', async (request, reply) => {
    const body = request.body as MergeBody;

    if (!body.groups || !Array.isArray(body.groups) || body.groups.length === 0) {
      // Legacy single-group format: { files: [...] }
      const legacy = body as unknown as { files: { name: string; data: string }[] };
      if (legacy.files && Array.isArray(legacy.files) && legacy.files.length >= 2) {
        body.groups = [{ groupName: 'merged', files: legacy.files }];
      } else {
        return reply.code(400).send({ error: 'At least one merge group with 2+ files is required' });
      }
    }

    // Validate each group has at least 2 files
    for (const group of body.groups) {
      if (!group.files || group.files.length < 2) {
        return reply.code(400).send({ error: `Group "${group.groupName}" must have at least 2 files` });
      }
    }

    const jobId = createJob();

    if (!fs.existsSync(JOBS_DIR)) {
      fs.mkdirSync(JOBS_DIR, { recursive: true });
    }

    // Process in background
    setImmediate(async () => {
      try {
        updateProgress(jobId, `Starting merge: ${body.groups.length} group(s)`);

        if (body.groups.length === 1) {
          // Single group — output a single PDF
          const group = body.groups[0];
          const outputPath = path.join(JOBS_DIR, `${group.groupName}-${jobId.slice(0, 8)}.pdf`);
          await mergeGroup(group, outputPath, jobId);

          const displayFilename = `${sanitizeFilename(group.groupName)}.pdf`;
          completeJob(jobId, outputPath, displayFilename);
        } else {
          // Multiple groups — merge each, then zip
          const archiver = await import('archiver');
          const zipPath = path.join(JOBS_DIR, `merged-groups-${jobId.slice(0, 8)}.zip`);
          const output = fs.createWriteStream(zipPath);
          const archive = archiver.default('zip', { zlib: { level: 6 } });

          await new Promise<void>((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);

            (async () => {
              for (let i = 0; i < body.groups.length; i++) {
                const group = body.groups[i];
                const groupPath = path.join(JOBS_DIR, `group-${i}-${jobId.slice(0, 8)}.pdf`);
                await mergeGroup(group, groupPath, jobId);
                archive.file(groupPath, { name: `${sanitizeFilename(group.groupName)}.pdf` });
              }
              await archive.finalize();
            })().catch(reject);
          });

          // Clean up individual group files
          for (let i = 0; i < body.groups.length; i++) {
            const groupPath = path.join(JOBS_DIR, `group-${i}-${jobId.slice(0, 8)}.pdf`);
            try { fs.unlinkSync(groupPath); } catch { /* ok */ }
          }

          const displayFilename = 'merged-groups.zip';
          completeJob(jobId, zipPath, displayFilename);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failJob(jobId, message);
      }
    });

    return reply.send({ jobId });
  });
}

async function mergeGroup(group: MergeGroup, outputPath: string, jobId: string): Promise<void> {
  updateProgress(jobId, `Merging group "${group.groupName}" (${group.files.length} files)...`);

  const merged = await PDFDocument.create();

  for (const file of group.files) {
    updateProgress(jobId, `  Adding: ${file.name}`);
    const pdfBytes = Buffer.from(file.data, 'base64');
    const source = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const mergedBytes = await merged.save();
  fs.writeFileSync(outputPath, mergedBytes);
  updateProgress(jobId, `  ✅ Group "${group.groupName}" merged (${group.files.length} files → ${(mergedBytes.length / 1024).toFixed(0)} KB)`);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50) || 'merged';
}
