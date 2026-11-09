# MMRI R17.21.3 — Radar, status, report, plan, notification and responsive correction

This release is a complete source package. It keeps the R17.21/R17.21.2 methodology and build fixes, and changes only the requested interaction/layout surfaces.

## Homepage radar
- The center is now only a transparent circle; there is no white center plate.
- The average score appears only on hover/focus of the center circle.
- The five domain names around the radar are replaced by the same canonical domain icons used elsewhere in the product.
- Clicking/tapping a domain icon opens that domain's payment/diagnosis route.
- Completed result points remain report links; their score appears only on hover/focus.
- Radar rings, axes, polygon and domain points use stronger contrast so the chart remains readable on different displays.
- Radar tooltips use the MMRI white/green visual language instead of black backgrounds.

## Diagnosis demo and status system
- The demo intentionally shows multiple states at once: locked/unpaid, ready, in progress and report available.
- Status indicators use one global shape and one green/white system palette, independent of category color.
- Status indicators contain only a lock/unlock/check icon or progress percentage.
- Hover/focus explains the state in plain Mongolian; tap/focus works on touch/keyboard devices.
- A completed diagnosis opens its report instead of incorrectly behaving like an unpaid card.

## Report interaction and layout
- PDF and domain controls are larger and more visible.
- Category switching no longer uses dramatic width keyframes; it uses restrained global transitions.
- Report dates are presented as a left-to-right timeline, oldest on the left and newest on the right.
- Five purpose scores use fixed label/score columns so values never run into the text.
- Critical-action score movement is kept secondary to the instruction text and cannot cover it.
- The 12-month score target block is compact and non-overlapping.
- Hover definitions use white surfaces, green borders and dark text.

## 365-day implementation plan
The plan is designed around standard implementation-plan principles: clear dates, concrete actions, accountable ownership, observable completion and measurable progress. The screen avoids robotic field labels and instead reads as natural Mongolian business prose.

Each phase shows:
1. the actual calendar range calculated from the report date;
2. one human-readable stage objective;
3. two concrete actions in sequence;
4. who coordinates the work, written naturally inside the sentence rather than as a form field;
5. what should exist/be in use when the action is complete;
6. the measurement that will show progress.

The completion control is a small check icon. Its explanatory text is shown on hover/focus rather than occupying permanent plan space. Completion is persisted in localStorage per domain/report date.

## Notifications
- Authenticated users now have a notification bell in the global header.
- Payment confirmations and completed-report events are surfaced there.
- The panel refreshes every 30 seconds while the app is open.
- Demo mode contains representative "payment confirmed" and "report ready" notifications.

## Responsive/browser consistency
- A final release CSS authority is loaded after all older style layers.
- Radar icon coordinates are percentage-based within a fixed SVG aspect ratio, not monitor-specific pixel offsets.
- Report, plan, status, tooltips and notifications recompose at 1100 / 760 / 480 px breakpoints.
- Typography is allowed to wrap by words; component geometry does not depend on one browser's exact font width.
- Touch, keyboard focus and hover states are provided for interactive hover information.

## PDF
- Print metadata remains on every page: organization, domain, diagnosis date, report generation date and page number.
- Print spacing/margins and plan cards were tightened so content does not overlap.
- Screen-only hover content is rendered as ordinary visible copy where it is required in the PDF.

## Methodology scope
No diagnostic scoring formula, frozen question-bank content, Prisma schema or payment price was changed in this release.
The existing five-domain source-bank status remains unchanged from R17.21.2; this release does not pretend that the four non-Marketing banks are production-wired when they are not.
