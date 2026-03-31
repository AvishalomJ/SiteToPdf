# Skill: Playwright PDF Pipeline

## Pattern

Use Playwright for both **URL fetching** and **PDF generation** in a TypeScript CLI tool. Decouple content extraction into a separate Cheerio-based module for lightweight DOM manipulation.

## Architecture

```
fetcher (Playwright) → extractor (Cheerio) → pdf-generator (Playwright page.pdf())
```

## Key Techniques

1. **Shared browser instance** — reuse a single `chromium.launch()` across fetches, close on shutdown
2. **Content extraction without a browser** — Cheerio parses HTML strings in-memory, no browser context needed
3. **Clean HTML → PDF** — use `page.setContent()` to load cleaned HTML into Playwright, then `page.pdf()` for rendering
4. **networkidle wait** — use `waitUntil: 'networkidle'` when fetching to ensure JS-rendered content is loaded

## When to Use

- Web scraping + PDF generation from dynamic (JS-rendered) sites
- Content extraction where you need to strip navigation/chrome
- CLI tools that need high-fidelity PDF output from web pages
