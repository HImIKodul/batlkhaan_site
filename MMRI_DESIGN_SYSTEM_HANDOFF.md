# BusinessMMRI.mn — Canonical UI / Report Handoff

This file is the source of truth for future Claude/ChatGPT UI work. Read it before editing the frontend. Do not reinterpret these rules into a flat dashboard or a dark navy theme.

## Product visual direction

BusinessMMRI.mn is a premium Mongolian business-diagnosis product. The interface should feel like a polished modern iOS/macOS application: soft blue + white, light translucent glass (switched from green by explicit request, 2026-10-29), controlled blur, subtle highlights, soft realistic depth, large clean icons, and restrained motion.

Glass is hierarchical, not decorative noise:
- atmospheric blue/white canvas behind the UI;
- primary surfaces use light translucent glass;
- important controls use stronger glass;
- popovers/modals use stronger blur and a dimmed/blurred backdrop;
- report/document reading surfaces stay near-solid white for readability;
- actual generated PDFs are solid professional documents, never glass.

Never reintroduce the retired navy/purple theme, neon colors, giant glowing gradients, excessive transparency, random rounded card grids, bouncing/floating icons, hover translations, or a new stack of repair CSS files.

## Frozen public homepage copy

> SUPERSEDED 2026-10-30 by the owner's brief: hero = `Бизнесийнхээ бодит дүр зургийг хар.` / `Дараагийн 12 сарынхаа зөв алхмыг тодорхойл.` + lead `Хүчтэй болон сайжруулах шаардлагатай чиглэлээ тодорхойлж, юунд төвлөрөхөө тодорхой төлөвлөгөөтэйгээр хараарай.` The homepage radar was removed and replaced by five `.cat-tile` category tiles. The text below is historical.

Hero:
`Бизнесээ оношлуул. Дараагийн 12 сарын төлөвлөгөөгөө гарга.`

Subtext:
`Аль чиглэл хүчтэй, аль нь сул байгааг тодорхойлж, дараагийн 12 сард яг юу хийхээ харуулсан төлөвлөгөөтэй тайлан авна.`

Guide controls:
1. `BusinessMMRI.mn гэж юу вэ?`
2. `Оношилгоо яаж хийлгэх вэ?`
3. `Оношилгооны үр дүн юу вэ?`
4. `Төлбөр хэрхэн төлөх вэ мөн хэрхэн бүртгүүлэх вэ?`

## Five domains and colors

Only these five business domains are customer-facing:
- Marketing — #FF3D8D
- Information Technology — #00A6FF
- Finance — #FFD000 (readable UI ink #9A7300)
- Human Resources — #7C4DFF
- Production & Operations — #FF6A00

System foundation is blue + white (success/answer-scale greens stay green). Status colors are separate from domain colors.


## Canonical shared-material contract

The active design foundation is intentionally centralized:
- `design/tokens.css` is the CSS rendering authority;
- `design/tokens.ts` mirrors the same green/white values for TypeScript/SVG consumers;
- five-domain TS color consumers use `domainVisualTokens`;
- five-domain CSS color consumers use `--mmri-domain-*`;
- shared buttons/forms/shell controls use `--mmri-glass-control-*`, `--mmri-focus-ring`, and `--mmri-radius-control`;
- Diagnosis and Report status ornaments use the same `--mmri-status-square-size`;
- do not create a second button/input/shell material recipe inside a page stylesheet.

The retired purple/gray token set is forbidden. If a future change introduces `#5B5CE6`, `#4D4FD1`, `#4143B8`, or the old navy palette into active UI source, treat it as a regression.

## Homepage radar (REMOVED 2026-10-30 — historical)

- only completed domains create result geometry;
- never invent fallback/demo values for a real/logged-out user;
- partial results may connect completed points to the center;
- average score has no `/100`;
- hover label is `дундаж оноо`;
- domain icons are large, fixed in position, and never translate/scale on hover;
- tapping a domain icon routes to that domain's diagnosis/payment flow;
- long Mongolian labels must wrap safely on mobile.

## Diagnosis / questionnaire

- five large centered domain cards;
- status is a small notification-style square at top-right;
- progress shows answered/total + percentage;
- answer direction is green → green-yellow → yellow → yellow-red → red for five scored answers, and green → green-yellow → yellow-red → red for four;
- neutral/applicability options remain visually distinct and do not corrupt scoring;
- no important control disappears on ~390px mobile.

## Results / Report

Results, API result payload, screen Report and generated PDF must agree on:
- overall score;
- five strength capability names;
- five weakness capability names;
- ordering;
- source capability identity.

Fallback relative-rank findings may only use real calculated capability scores. They must never fabricate a capability or alter scoring. Customer copy may mark such findings as preliminary, but must not expose internal terms such as `RELATIVE_RANK`, coverage or confidence.

Screen report:
- no `/100`;
- 5 strengths, 5 weaknesses, 5 critical priorities;
- 12-month / 365-day plan;
- roadmap cards are tap-to-complete; no checkbox; completed card gets full green outline;
- report paper remains solid/near-solid white;
- report controls may use glass;
- PDF download button is stationary.

## PDF contract

Backend renderer: ReportLab / `MMRI-PDF-1.5-BUSINESS-REPORT` (or a deliberate later version after matching regressions are updated).

Expected output:
1. Page 1 — score, conclusion, 5 strengths, 5 weaknesses, warnings when applicable.
2. Page 2 — five critical priorities.
3. Page 3 — 12-month / 365-day implementation plan.

Requirements:
- A4;
- Mongolian Noto Sans fonts;
- domain accent color;
- strengths green / weaknesses red;
- no clipping, overlap, accidental blank pages or duplicate sections;
- deterministic repeated generation from identical input;
- Results → Report → PDF data consistency;
- PDF button has idle/loading/success/failure states and duplicate-click protection.

## Preferences / accessibility

Settings are functional, not decorative:
- font size changes the shared type scale;
- reduced motion suppresses transitions/animations;
- high contrast strengthens text, edges and focus indication;
- spacing density changes shared spacing/control tokens;
- dark mode uses a forest-green low-light canvas, never the retired navy/purple theme; document/report paper remains light.

Keyboard/focus requirements:
- all interactive controls reachable by keyboard;
- dialogs trap focus and restore it to the trigger;
- Escape closes overlays;
- visible focus ring;
- semantic `button` controls use `type="button"` unless submitting a form intentionally.

## CSS architecture

Active CSS ownership:
- `design/tokens.css` — canonical tokens;
- `design/preferences.css` — the only intentional preference override layer;
- shared component CSS under `components/`;
- page-owned CSS under `pages/`.

Rules:
- do not add another `repair-*.css`, `fix-*.css`, or late override layer;
- modify/delete obsolete rules instead;
- do not restore removed `.bak` source copies;
- `styles.css` is legacy compatibility only and should shrink over time, not grow;
- keep page-specific work out of `styles.css` whenever practical.

## Safe future workflow

1. Read `CLAUDE_PROGRESS.md` and this file.
2. Inspect only files relevant to the requested page/bug.
3. Make one coherent batch.
4. Run targeted static/runtime checks + `npm run build`.
5. Run `./VERIFY_UI_POLISH.sh`.
6. Visually inspect desktop and ~390px mobile for the touched page.
7. Update `CLAUDE_PROGRESS.md`.
8. Commit a checkpoint.
9. Do not re-audit or rewrite already accepted business logic.

## Still requires live-machine verification

The source snapshot used for the ChatGPT polish work intentionally excludes `node_modules` and the live PostgreSQL runtime. After applying the cumulative patch on the main laptop, run the real frontend build and browser checks. Then continue the remaining product polish in Claude from that verified state.

## Responsive and accessibility contract (Step 08/10)

- Keyboard users must be able to reach and leave every modal/control; modal focus is trapped and restored.
- The shell keeps a skip link and route-heading focus management.
- Interactive shell controls target at least 44px; coarse-pointer/mobile controls target 48px where geometry allows.
- Device safe areas must be respected by fixed overlays and bottom navigation.
- Five-domain/report selectors may scroll horizontally on narrow screens; never squeeze into unreadable controls or hide domains.
- `prefers-reduced-motion` is honored independently of the in-app preference.
- `forced-colors`/high-contrast environments receive explicit border, canvas and focus fallbacks.
- Do not hard-code Marketing/domain counts in aria labels; accessibility text must derive from the same live data as visible text.
