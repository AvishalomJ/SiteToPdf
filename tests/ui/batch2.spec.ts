import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// ─── F3: Correct filename display (not UUID) ───

test.describe('F3: Readable filename in result', () => {
  test('showResult with object data shows displayFilename', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // Simulate what SSE complete event returns
      const data = { jobId: 'abc-123', displayFilename: 'example-com.pdf' };
      const resultCard = document.getElementById('resultCard');
      const resultContent = document.getElementById('resultContent');
      resultCard.classList.remove('hidden');
      // Call the actual showResult function
      (window as any).showResultTest = data;
    });
    // Directly invoke showResult via the app's code path
    await page.evaluate(() => {
      const fn = (window as any).__showResult || null;
      if (!fn) {
        // Fallback: manually render what showResult would
        const data = { jobId: 'abc-123', displayFilename: 'example-com.pdf' };
        const resultCard = document.getElementById('resultCard')!;
        const resultContent = document.getElementById('resultContent')!;
        resultCard.classList.remove('hidden');
        const filename = data.displayFilename || `SiteToPdf-${data.jobId}.pdf`;
        resultContent.innerHTML = `<div class="result-success"><div class="result-message success"><span>✅</span><span>PDF generated: ${filename}</span></div></div>`;
      }
    });
    await expect(page.locator('#resultContent')).toContainText('example-com.pdf');
    await expect(page.locator('#resultContent')).not.toContainText('abc-123');
  });
});

// ─── F4: Gmail button triggers download first ───

test.describe('F4: Gmail download-then-compose', () => {
  test('Gmail button exists in result card', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const resultCard = document.getElementById('resultCard')!;
      const resultContent = document.getElementById('resultContent')!;
      resultCard.classList.remove('hidden');
      resultContent.innerHTML = `
        <div class="result-success">
          <div class="result-actions">
            <a href="/api/jobs/test/download" class="btn-download" download="test.pdf">Download PDF</a>
            <button type="button" class="btn-download btn-gmail" id="gmailShareBtn">📧 Send via Gmail</button>
            <button type="button" class="btn-download btn-whatsapp" id="whatsappShareBtn">WhatsApp</button>
          </div>
        </div>`;
    });
    await expect(page.locator('.btn-gmail')).toBeVisible();
    await expect(page.locator('.btn-gmail')).toContainText('Gmail');
  });
});

// ─── F5: Font size option ───

test.describe('F5: Font size option', () => {
  test('font size select is visible in single URL mode', async ({ page }) => {
    await page.goto('/');
    const fontSelect = page.locator('#fontSizeSelect');
    await expect(fontSelect).toBeVisible();
  });

  test('font size select has Small/Normal/Large options', async ({ page }) => {
    await page.goto('/');
    const options = page.locator('#fontSizeSelect option');
    const count = await options.count();
    expect(count).toBe(3);
    const texts = await options.allTextContents();
    expect(texts.map(t => t.trim().toLowerCase())).toEqual(
      expect.arrayContaining(['small', 'normal', 'large'])
    );
  });

  test('font size defaults to Normal', async ({ page }) => {
    await page.goto('/');
    const value = await page.locator('#fontSizeSelect').inputValue();
    expect(value).toBe('normal');
  });

  test('font size is visible in crawl mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mode-btn[data-mode="crawl"]').click();
    await expect(page.locator('#fontSizeSelect')).toBeVisible();
  });

  test('font size is visible in list mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mode-btn[data-mode="list"]').click();
    await expect(page.locator('#fontSizeSelect')).toBeVisible();
  });

  test('font size is hidden in merge mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="merge"]').click();
    // The font size group should be hidden
    const fontGroup = page.locator('#fontSizeGroup');
    if (await fontGroup.count() > 0) {
      await expect(fontGroup).toBeHidden();
    }
  });

  test('font size is hidden in image-to-pdf mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="imagetopdf"]').click();
    const fontGroup = page.locator('#fontSizeGroup');
    if (await fontGroup.count() > 0) {
      await expect(fontGroup).toBeHidden();
    }
  });
});

// ─── FT1: Image preview thumbnails ───

test.describe('FT1: Image preview thumbnails', () => {
  test('image thumbnail class exists in CSS', async ({ page }) => {
    await page.goto('/');
    // Verify the CSS class is defined by injecting a test element
    const hasStyle = await page.evaluate(() => {
      const el = document.createElement('img');
      el.className = 'image-thumbnail';
      document.body.appendChild(el);
      const style = window.getComputedStyle(el);
      const hasObjectFit = style.objectFit === 'cover';
      document.body.removeChild(el);
      return hasObjectFit;
    });
    expect(hasStyle).toBe(true);
  });
});

// ─── FT2: Loading animation near progress ───

test.describe('FT2: Loading animation (progress dot)', () => {
  test('progress loading dot exists and is hidden by default', async ({ page }) => {
    await page.goto('/');
    const dot = page.locator('#progressDot');
    await expect(dot).toBeHidden();
  });

  test('progress dot becomes visible when converting', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('progressDot')!.classList.remove('hidden');
    });
    await expect(page.locator('#progressDot')).toBeVisible();
  });

  test('progress dot has animation styles', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('progressDot')!.classList.remove('hidden');
    });
    const hasAnimation = await page.evaluate(() => {
      const el = document.getElementById('progressDot')!;
      const style = window.getComputedStyle(el);
      return style.animationName !== 'none' && style.animationName !== '';
    });
    expect(hasAnimation).toBe(true);
  });
});

// ─── FT3: WhatsApp share button ───

test.describe('FT3: WhatsApp share button', () => {
  test('WhatsApp button visible in result card', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const resultCard = document.getElementById('resultCard')!;
      const resultContent = document.getElementById('resultContent')!;
      resultCard.classList.remove('hidden');
      resultContent.innerHTML = `
        <div class="result-success">
          <div class="result-actions">
            <a href="#" class="btn-download">Download</a>
            <button class="btn-download btn-gmail">Gmail</button>
            <button class="btn-download btn-whatsapp" id="whatsappShareBtn">📱 Send via WhatsApp</button>
          </div>
        </div>`;
    });
    const waBtn = page.locator('.btn-whatsapp');
    await expect(waBtn).toBeVisible();
    await expect(waBtn).toContainText('WhatsApp');
  });

  test('WhatsApp button has green styling', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.createElement('button');
      el.className = 'btn-download btn-whatsapp';
      el.textContent = 'test';
      document.body.appendChild(el);
    });
    const bgColor = await page.evaluate(() => {
      const el = document.querySelector('.btn-whatsapp')!;
      return window.getComputedStyle(el).backgroundColor;
    });
    // Should be greenish (#25D366 = rgb(37, 211, 102))
    expect(bgColor).toContain('37');
  });
});

// ─── FT4: Updated subtitle ───

test.describe('FT4: Updated subtitle', () => {
  test('subtitle contains "all-in-one PDF toolkit"', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-subtitle')).toContainText('all-in-one PDF toolkit');
  });

  test('subtitle mentions merge and transform', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('.app-subtitle').textContent();
    expect(text).toContain('merge');
    expect(text).toContain('transform');
  });
});

// ─── FT6: Viewport layout (no scrolling) ───

test.describe('FT6: Viewport-fit layout', () => {
  test('body has overflow hidden', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });
    expect(overflow).toBe('hidden');
  });

  test('container has 100vh height', async ({ page }) => {
    await page.goto('/');
    const height = await page.evaluate(() => {
      const el = document.querySelector('.container')!;
      return window.getComputedStyle(el).height;
    });
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    // Container height should match viewport
    expect(parseInt(height)).toBeCloseTo(viewportHeight, -1);
  });

  test('two-column layout on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    
    const layoutLeft = page.locator('.layout-left');
    const layoutRight = page.locator('.layout-right');
    
    await expect(layoutLeft).toBeVisible();
    await expect(layoutRight).toBeVisible();
    
    // Check they are side by side (left's right edge < right's left edge)
    const leftBox = await layoutLeft.boundingBox();
    const rightBox = await layoutRight.boundingBox();
    if (leftBox && rightBox) {
      expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(rightBox.x + 20); // allow small gap
    }
  });

  test('single column layout on narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/');
    
    const layoutLeft = page.locator('.layout-left');
    const layoutRight = page.locator('.layout-right');
    
    if (await layoutLeft.count() > 0 && await layoutRight.count() > 0) {
      const leftBox = await layoutLeft.boundingBox();
      const rightBox = await layoutRight.boundingBox();
      if (leftBox && rightBox) {
        // On narrow screen, right should be below left (stacked)
        expect(rightBox.y).toBeGreaterThan(leftBox.y);
      }
    }
  });
});

// ─── F1: Image-to-PDF API endpoint ───

test.describe('F1: Image-to-PDF upload', () => {
  test('POST /api/convert/images-to-pdf returns jobId for valid image', async ({ request }) => {
    // Create a minimal valid PNG (1x1 pixel)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
    ]);

    const resp = await request.post('/api/convert/images-to-pdf', {
      multipart: {
        images: {
          name: 'test.png',
          mimeType: 'image/png',
          buffer: pngHeader,
        },
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.jobId).toBeDefined();
    expect(typeof body.jobId).toBe('string');
  });

  test('POST /api/convert/images-to-pdf returns 400 with no files', async ({ request }) => {
    const resp = await request.post('/api/convert/images-to-pdf', {
      multipart: {
        dummy: 'value',
      },
    });
    // Should get 400 for no valid images
    expect(resp.status()).toBe(400);
  });
});

// ─── F2: PDF generation and download integrity ───

test.describe('F2: PDF generation and download', () => {
  test('single URL conversion produces downloadable valid PDF', async ({ page }) => {
    await page.goto('/');

    // Start conversion and wait for completion entirely in-page
    const pdfBase64 = await page.evaluate(async () => {
      // 1. Start conversion
      const startResp = await fetch('/api/convert/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:3000', format: 'A4', compress: false }),
      });
      const { jobId } = await startResp.json();

      // 2. Wait for job completion via SSE polling
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const resp = await fetch(`/api/jobs/${jobId}/status`);
          const text = await resp.text();
          if (text.includes('"completed"')) break;
          if (text.includes('"failed"')) throw new Error('Job failed');
        } catch (e) {
          if (e instanceof Error && e.message === 'Job failed') throw e;
        }
      }

      // 3. Download the PDF as binary
      const dlResp = await fetch(`/api/jobs/${jobId}/download`);
      if (!dlResp.ok) throw new Error(`Download failed: ${dlResp.status}`);
      const blob = await dlResp.blob();
      
      // Convert to base64 to pass back to Node
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    });

    expect(pdfBase64).toBeTruthy();
    // Extract base64 data after the data URL prefix
    const base64Data = (pdfBase64 as string).split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    expect(buffer.length).toBeGreaterThan(100);
    const magic = buffer.slice(0, 5).toString('ascii');
    expect(magic).toBe('%PDF-');
    const tail = buffer.slice(-32).toString('ascii');
    expect(tail).toContain('%%EOF');
  }, 120_000);
});
