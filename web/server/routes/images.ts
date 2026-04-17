import { FastifyInstance } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import {
  createJob,
  updateProgress,
  completeJob,
  failJob,
} from '../services/job-manager';
import * as pool from '../services/browser-pool';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const MAX_FILES = 50;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'sitetopdf-jobs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/convert/images-to-pdf — convert multiple images to a single PDF */
  app.post('/api/convert/images-to-pdf', async (request, reply) => {
    const jobId = createJob();
    reply.send({ jobId });

    setImmediate(async () => {
      try {
        await pool.acquire();
        updateProgress(jobId, 'Receiving image uploads...');

        const parts = request.parts();
        const imageBuffers: Buffer[] = [];
        let fileCount = 0;

        for await (const part of parts) {
          if (part.type === 'file') {
            const file = part as MultipartFile;

            // Validate MIME type
            if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
              throw new Error(
                `Invalid file type: ${file.mimetype}. Only PNG and JPEG images are allowed.`,
              );
            }

            // Check file count
            fileCount++;
            if (fileCount > MAX_FILES) {
              throw new Error(`Too many files. Maximum ${MAX_FILES} images allowed.`);
            }

            // Read file to buffer
            const chunks: Buffer[] = [];
            for await (const chunk of file.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            // Check file size
            if (buffer.length > MAX_FILE_SIZE) {
              throw new Error(
                `File too large: ${file.filename}. Maximum size is 20MB per file.`,
              );
            }

            imageBuffers.push(buffer);
            updateProgress(jobId, `Received: ${file.filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
          }
        }

        if (imageBuffers.length === 0) {
          throw new Error('No valid image files uploaded');
        }

        updateProgress(jobId, `Processing ${imageBuffers.length} image(s)...`);

        // Create PDF
        const pdfDoc = await PDFDocument.create();

        for (let i = 0; i < imageBuffers.length; i++) {
          const buffer = imageBuffers[i];
          updateProgress(jobId, `Adding image ${i + 1} of ${imageBuffers.length}...`);

          let image;
          try {
            // Try PNG first
            image = await pdfDoc.embedPng(buffer);
          } catch {
            try {
              // Fall back to JPEG
              image = await pdfDoc.embedJpg(buffer);
            } catch (err) {
              throw new Error(`Failed to embed image ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          // Create page sized to image dimensions
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        }

        // Save PDF
        const outputPath = path.join(getTempDir(), `images-${jobId.slice(0, 8)}.pdf`);
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);

        updateProgress(jobId, `PDF created: ${outputPath}`);
        completeJob(jobId, outputPath, 'images.pdf');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        failJob(jobId, msg);
      } finally {
        pool.release();
      }
    });
  });
}
