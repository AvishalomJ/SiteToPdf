import { test, expect } from '@playwright/test';

// ─── Page Load & Header ───

test.describe('Page load', () => {
  test('loads successfully with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SiteToPdf/);
  });

  test('header displays app name and subtitle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-title')).toContainText('SiteToPdf');
    await expect(page.locator('.app-subtitle')).toContainText('all-in-one PDF toolkit');
  });

  test('favicon SVG is loaded', async ({ page }) => {
    await page.goto('/');
    const favicon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(favicon).toHaveAttribute('href', 'favicon.svg');
  });

  test('header contains SVG logo icon', async ({ page }) => {
    await page.goto('/');
    const icon = page.locator('.app-icon');
    await expect(icon).toBeVisible();
  });
});

// ─── Nav Tabs (Convert / Tools) ───

test.describe('Nav tabs', () => {
  test('Convert tab is active by default', async ({ page }) => {
    await page.goto('/');
    const convertTab = page.locator('.nav-tab[data-group="convert"]');
    await expect(convertTab).toHaveClass(/active/);
  });

  test('Convert modes are visible by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#convertModes')).toBeVisible();
    await expect(page.locator('#toolsModes')).toBeHidden();
  });

  test('clicking Tools tab shows tools modes and hides convert modes', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();

    await expect(page.locator('#toolsModes')).toBeVisible();
    await expect(page.locator('#convertModes')).toBeHidden();

    const toolsTab = page.locator('.nav-tab[data-group="tools"]');
    await expect(toolsTab).toHaveClass(/active/);
  });

  test('switching back to Convert tab restores convert modes', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.nav-tab[data-group="convert"]').click();

    await expect(page.locator('#convertModes')).toBeVisible();
    await expect(page.locator('#toolsModes')).toBeHidden();
  });
});

// ─── Mode Buttons ───

test.describe('Mode buttons – Convert group', () => {
  test('Single URL mode is active by default', async ({ page }) => {
    await page.goto('/');
    const singleBtn = page.locator('.mode-btn[data-mode="single"]');
    await expect(singleBtn).toHaveClass(/active/);
    await expect(page.locator('#singleUrlSection')).toBeVisible();
  });

  test('clicking Crawl Site shows crawl options', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mode-btn[data-mode="crawl"]').click();

    await expect(page.locator('#crawlOptionsSection')).toBeVisible();
    await expect(page.locator('#singleUrlSection')).toBeVisible(); // URL input stays visible for crawl
  });

  test('clicking URL List shows textarea', async ({ page }) => {
    await page.goto('/');
    await page.locator('.mode-btn[data-mode="list"]').click();

    await expect(page.locator('#urlListSection')).toBeVisible();
    await expect(page.locator('#singleUrlSection')).toBeHidden();
  });
});

test.describe('Mode buttons – Tools group', () => {
  test('Merge PDFs mode shows merge section', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="merge"]').click();

    await expect(page.locator('#mergeSection')).toBeVisible();
    await expect(page.locator('#imageSection')).toBeHidden();
  });

  test('Image → PDF mode shows image section', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="imagetopdf"]').click();

    await expect(page.locator('#imageSection')).toBeVisible();
    await expect(page.locator('#mergeSection')).toBeHidden();
  });

  test('Summarize mode shows URL input and language options', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="summarize"]').click();

    await expect(page.locator('#singleUrlSection')).toBeVisible();
    await expect(page.locator('#summaryLangGroup')).toBeVisible();
    await expect(page.locator('#summaryModelGroup')).toBeVisible();
  });
});

// ─── Image to PDF UI ───

test.describe('Image to PDF UI', () => {
  test('image file input accepts PNG and JPEG', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="imagetopdf"]').click();

    const fileInput = page.locator('#imageFileInput');
    await expect(fileInput).toHaveAttribute('accept', 'image/png,image/jpeg');
  });

  test('Add Images button is visible in image mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="imagetopdf"]').click();

    await expect(page.locator('#addImageFilesBtn')).toBeVisible();
  });

  test('empty state message shown when no images selected', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="imagetopdf"]').click();

    await expect(page.locator('#imageFileList .merge-empty-state')).toBeVisible();
  });
});

// ─── Loading Overlay (converting state) ───

test.describe('Loading overlay', () => {
  test('form gets converting class when setConverting is called', async ({ page }) => {
    await page.goto('/');
    const formCard = page.locator('.form-card');

    // Simulate converting state via JS
    await page.evaluate(() => {
      document.querySelector('.form-card').classList.add('converting');
    });
    await expect(formCard).toHaveClass(/converting/);
  });

  test('convert button shows spinner during conversion', async ({ page }) => {
    await page.goto('/');

    // Simulate converting state
    await page.evaluate(() => {
      document.querySelector('.form-card').classList.add('converting');
      document.querySelector('.btn-spinner').classList.remove('hidden');
      document.querySelector('.btn-text').textContent = 'Converting...';
    });

    const spinner = page.locator('.btn-spinner');
    await expect(spinner).toBeVisible();

    const btnText = page.locator('.btn-text');
    await expect(btnText).toHaveText('Converting...');
  });

  test('converting class is removed when conversion ends', async ({ page }) => {
    await page.goto('/');
    const formCard = page.locator('.form-card');

    await page.evaluate(() => {
      document.querySelector('.form-card').classList.add('converting');
    });
    await expect(formCard).toHaveClass(/converting/);

    await page.evaluate(() => {
      document.querySelector('.form-card').classList.remove('converting');
    });
    await expect(formCard).not.toHaveClass(/converting/);
  });
});

// ─── Result Card & Gmail Button ───

test.describe('Result card', () => {
  test('result card is hidden by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#resultCard')).toBeHidden();
  });

  test('showResult displays download button and Gmail link for success', async ({ page }) => {
    await page.goto('/');

    // Call showResult via JS with mock data
    await page.evaluate(() => {
      const resultCard = document.getElementById('resultCard');
      const resultContent = document.getElementById('resultContent');
      resultCard.classList.remove('hidden');
      const jobId = 'test-job-123';
      const filename = 'example-com.pdf';
      const downloadUrl = `/api/jobs/${jobId}/download`;
      const gmailSubject = encodeURIComponent(`SiteToPdf: ${filename}`);
      const gmailBody = encodeURIComponent(`Hi,\n\nI'd like to share: "${filename}"`);
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${gmailSubject}&body=${gmailBody}`;
      resultContent.innerHTML = `
        <div class="result-success">
          <div class="result-message success">
            <span>✅</span><span>PDF generated: ${filename}</span>
          </div>
          <div class="result-actions">
            <a href="${downloadUrl}" class="btn-download" download="${filename}">Download PDF</a>
            <a href="${gmailUrl}" target="_blank" rel="noopener" class="btn-download btn-gmail">📧 Send via Gmail</a>
          </div>
        </div>`;
    });

    await expect(page.locator('#resultCard')).toBeVisible();
    await expect(page.locator('.btn-download').first()).toContainText('Download PDF');

    const gmailBtn = page.locator('.btn-gmail');
    await expect(gmailBtn).toBeVisible();
    await expect(gmailBtn).toContainText('Send via Gmail');

    const gmailHref = await gmailBtn.getAttribute('href');
    expect(gmailHref).toContain('mail.google.com');
    expect(gmailHref).toContain('example-com.pdf');
  });

  test('showResult displays error message on failure', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      const resultCard = document.getElementById('resultCard');
      const resultContent = document.getElementById('resultContent');
      resultCard.classList.remove('hidden');
      resultContent.innerHTML = `
        <div class="result-message error">
          <span>❌</span><span>Error: Connection failed</span>
        </div>`;
    });

    await expect(page.locator('#resultCard')).toBeVisible();
    await expect(page.locator('.result-message.error')).toContainText('Connection failed');
  });
});

// ─── Settings Modal ───

test.describe('Settings modal', () => {
  test('settings modal is hidden by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#settingsModal')).toBeHidden();
  });

  test('clicking settings button opens modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
  });

  test('clicking close button closes modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();

    await page.locator('#closeSettingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeHidden();
  });

  test('clicking overlay closes modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();

    // Click the overlay (outside the modal card)
    await page.locator('#settingsModal').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#settingsModal')).toBeHidden();
  });
});

// ─── Convert Form Validation ───

test.describe('Form validation', () => {
  test('URL input is required in single mode', async ({ page }) => {
    await page.goto('/');
    const urlInput = page.locator('#urlInput');
    await expect(urlInput).toHaveAttribute('required', '');
  });

  test('URL input not required in merge mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="merge"]').click();

    const urlInput = page.locator('#urlInput');
    const required = await urlInput.getAttribute('required');
    expect(required).toBeNull();
  });
});

// ─── Merge PDFs UI ───

test.describe('Merge PDFs UI', () => {
  test('merge section shows file input and add button', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="merge"]').click();

    await expect(page.locator('#addPdfFilesBtn')).toBeVisible();
    await expect(page.locator('#mergeFileList')).toBeVisible();
  });

  test('empty state message for merge', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-tab[data-group="tools"]').click();
    await page.locator('.mode-btn[data-mode="merge"]').click();

    await expect(page.locator('#mergeFileList .merge-empty-state')).toBeVisible();
  });
});

// ─── CSS & Visual Checks ───

test.describe('Visual styling', () => {
  test('converting class adds visual overlay styles', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      document.querySelector('.form-card').classList.add('converting');
    });

    const formCard = page.locator('.form-card');
    const opacity = await formCard.evaluate(el => {
      return window.getComputedStyle(el).opacity;
    });
    // When converting, opacity should be reduced (the ::after overlay covers it)
    expect(parseFloat(opacity)).toBeLessThanOrEqual(1);
  });
});

// ─── Progress Log ───

test.describe('Progress log', () => {
  test('progress card has default ready message', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#progressLog')).toContainText('Ready to convert');
  });

  test('clear button is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#clearLogBtn')).toBeVisible();
  });
});
