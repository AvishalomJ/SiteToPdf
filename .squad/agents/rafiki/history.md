# Project Context

- **Owner:** AvishalomJ
- **Project:** SiteToPdf — A website crawler that takes a primary URL, traverses all paths under it, and generates a PDF containing all page content (excluding navigation menus and metadata).
- **Stack:** TypeScript + Playwright + Cheerio + Commander (finalized)
- **Created:** 2026-03-31

## Module Assignment

**Rafiki owns:** `src/extractor.ts` (content extraction) and `src/pdf-generator.ts` (PDF rendering)  
**Key dependencies:** `types.ts` (owned by Mufasa) defines ExtractedContent and PdfOptions contracts  
**Extraction strategy:** Cheerio for DOM parsing and nav/menu stripping. Playwright's `page.pdf()` for high-fidelity PDF rendering.  
**Phase 2 expansion:** Will handle multi-page PDF combination and advanced extraction rules.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **2026-03-31:** Tech stack finalized by Mufasa. Cheerio chosen for extraction (fast, lightweight). Playwright's `page.pdf()` for PDF rendering (no separate lib needed).
