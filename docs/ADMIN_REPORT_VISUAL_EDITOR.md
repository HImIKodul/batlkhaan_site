# Administrator visual report editor

Lets a report reviewer annotate the three customer PDF pages (text note, freehand, highlight, rectangle, arrow) with move / resize / delete / undo / redo, save as a revision, preview with the real renderer, and have the approved annotations appear in the published PDF.

## Model
- Annotations are an **overlay** stored in the append-only review revision: `narrative.visualAnnotations = { version: 1, items: [...] }` (no schema migration; `report_review_revisions.source` stays `MANUAL`).
- Coordinates are **page units** (0..1 of the A4 width and height, origin top-left), never pixels. The browser overlay uses an SVG in A4 points (595.28 × 841.89), so an annotation lands on the same place at any window size, in the preview and in the PDF.
- Validated server-side (`backend/src/report/annotations.ts`): ≤ 120 items, page 1-3, six fixed colours, boxes inside the page, ≥ 0.4 % size, text ≤ 500 characters (long dashes normalised), pen ≤ 400 points, stroke 0.5-6, font 6-24. Anything else is rejected (400), never clamped.
- The approval hash covers the narrative **including** the annotations; publication refuses anything else (existing binding). The PDF source carries `annotations` only when present, so source hashes of existing reports are unchanged.

## Workflow and states
Claim → draw → **Save** (new revision, reason required, 409 on stale `baseRevision`; 3 simultaneous saves → exactly one wins) → Preview → «Батлахад бэлэн» → re-authenticate → Approve → (24 h rule if enabled) → Publish. Saving after approval creates a new revision, withdraws the approval and needs a new approval. A published report cannot be edited or published again, and its stored PDF is byte-identical on every download. Revision 1 and all earlier revisions are immutable (database trigger).

## API (`/api/v1/admin`, administrator session; permissions `reports.read` / `reports.edit`)
`GET /reviews/:id/editor` (state, annotations, history with annotation counts) · `GET /reviews/:id/editor/page/:n?annotated=0|1&revision=` (PNG of one page from the real renderer) · `POST /reviews/:id/editor/preview` (renders UNSAVED annotations, stores nothing) · `PUT /reviews/:id/annotations` `{baseRevision, reason, annotations}` · `GET /reviews/:id/editor/revisions/:n/annotations`. Every save is in the administrator audit trail (`REPORT_ANNOTATED`). Customers (401), billing reviewers (403) and a reviewer who does not own the task (409) are refused.

## Rendering
`pdf_renderer/render_report_pdf.py` draws the overlay after each finished page (custom canvas `showPage`), so it never takes part in the layout: the exactly-three-page contract and the original text are unaffected. Text boxes show only the lines that fit; the Preview is authoritative for text wrapping.

## Verified (QA)
`backend/scripts/qa-report-editor-regression.mjs` (29 checks) and `backend/tests/visual-annotations.test.ts`: the published PDF pages are **pixel-identical** to the approved revision rendered by the editor preview; differences from the clean report exist only inside the annotation windows; the annotation text is in the PDF text layer; score, answers and payload hash are unchanged; a retake starts with no annotations and the first PDF stays byte-identical. Browser run: all five tools, move, resize, undo/redo, delete, identical page-relative geometry at 1440 / 820 / 390 px, save, reopen.

## Limits
- The customer's on-screen report page does not render the overlay (the PDF is the deliverable).
- The editor does not rotate shapes or edit pen points; text colour is fixed.
- Annotation wording is checked only for length/dashes at save; the approval step also runs the forbidden-term check over the whole revision.
