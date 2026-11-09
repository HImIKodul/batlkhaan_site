# Backend Step 12/20 — Official Report/PDF Pipeline

## Scope

This step adds a backend-owned, immutable PDF artifact path without redesigning or changing the current frontend. The official PDF is generated only from an already-published frozen report whose payload, narrative, and binding hashes have passed the existing report integrity checks.

## Authoritative flow

Frozen assessment snapshot → verified report payload → verified AI/fallback narrative → canonical PDF source → deterministic ReportLab renderer → SHA-256 verification → persistent artifact storage → authenticated metadata/download/regeneration API.

The PDF renderer does not calculate scores, select findings, or call AI. It only renders already-authoritative report data.

## New backend pieces

- `backend/src/report/pdf-artifact.ts`
  - Builds the canonical PDF source and hashes it.
  - Binds PDF generation to the report payload/narrative/binding hashes.
- `backend/src/services/report-pdf-artifact-service.ts`
  - Generates, hashes, stores, verifies, retrieves, and regenerates official PDF artifacts.
  - Uses atomic file replacement and path-traversal guards.
  - Rejects byte-nondeterministic regeneration for the same frozen report and generator version.
- `backend/pdf_renderer/render_report_pdf.py`
  - Deterministic server-side A4 PDF rendering with ReportLab.
  - Noto Sans fonts provide Mongolian/Cyrillic support.
  - No HTML or JavaScript execution.
- `ReportArtifact` Prisma model + migration `20261025030000_backend_report_pdf_artifacts`.
- Database verification: `backend/src/verify-backend-report-pdf-artifacts.ts`.

## API

Authenticated report endpoints now include:

- `GET /api/v1/assessments/:assessmentId/report/pdf/metadata`
- `GET /api/v1/assessments/:assessmentId/report/pdf`
- `POST /api/v1/assessments/:assessmentId/report/pdf/regenerate`

Report download remains tenant/role protected. Regeneration requires report-write permission and cannot alter the frozen diagnosis/report source.

## Storage

Default development storage:

`./report-storage`

Production Docker storage:

`/app/report-storage`

The directory must be writable and persistent in production. The existing report-storage backup/restore scripts now prefer `MMRI_REPORT_STORAGE_DIR` while remaining compatible with the older `REPORT_STORAGE_DIR` setting.

## Environment variables

```env
MMRI_REPORT_STORAGE_DIR="./report-storage"
MMRI_PDF_PYTHON_PATH="python3"
MMRI_PDF_RENDERER_SCRIPT="./pdf_renderer/render_report_pdf.py"
MMRI_PDF_RENDER_TIMEOUT_MS=45000
```

No OpenAI secret is required by the PDF renderer.

## Integrity properties

- PDF generation is allowed only from a published frozen report.
- Source hash covers the exact authoritative report data used for rendering.
- Content hash covers the exact generated PDF bytes.
- Stored artifact is re-hashed before serving.
- Missing/corrupt files can be regenerated from the same frozen source.
- Same source + same PDF generator version must regenerate to exactly the same bytes.
- Report artifacts are tenant protected through the assessment/report authorization layer.
- PostgreSQL rejects invalid artifact kind, MIME type, size, or hash lengths.

## Verification completed in Step 12

- Step 12 backend static gate: 17/17 PASS
- Step 12 deterministic PDF regression: 9/9 PASS
- API static gate: PASS, 72 routes
- Persistence runtime: 30/30 PASS
- Traceability runtime: 30/30 PASS
- Security runtime: 38/38 PASS
- Python renderer compile: PASS
- Changed TypeScript no-check emit: PASS
- Manual PDF inspection: A4, 4 pages, Mongolian text preserved, no JavaScript, no visible clipping/glyph failure

## Deferred connected checks

The PostgreSQL migration itself has not been executed against the user's production/connected PostgreSQL database inside this sandbox. It must be applied and verified during the later connected database/deployment step.

The current frontend still uses its existing browser print control. It was intentionally left unchanged. A later frontend pass can switch that control to the official backend PDF download endpoint without changing the report calculation pipeline.
