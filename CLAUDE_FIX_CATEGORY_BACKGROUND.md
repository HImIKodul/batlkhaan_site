PROJECT ROOT:
/home/kirby/MMRI_STEP10_FINAL_WORKING

REFERENCE IMAGE:
/home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/reference_liquid_glass.png

CURRENT BAD MARKETING REPORT:
/home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/current_bad_marketing_report.png

CURRENT ANALYSIS:
/home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/current_analysis.png

CURRENT HOME:
/home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/current_home.png

TASK:
Correct ONLY the category-aware page/background/glass-sheet color behavior. Do not redesign unrelated components.

IMPORTANT:
Open and inspect all four images before editing code.

The current implementation is visually wrong.

The current Marketing report screenshot demonstrates the failure:
- the large central content sheet becomes a broad mauve/purple wash;
- Marketing is red, so purple is already the wrong category identity;
- more importantly, the category color is being applied as a large opaque/semi-opaque fill over the entire glass sheet;
- this destroys the clear/frosted blue acrylic appearance from the reference.

The reference image does NOT work this way.

============================================================
1. DEFINE THE LAYERS CORRECTLY
============================================================

There are three independent layers:

LAYER A — ENVIRONMENT / PAGE BACKGROUND
The geometric diamond/rhombus acrylic environment.

LAYER B — LARGE CONTENT GLASS SHEET
A mostly neutral cool-blue/clear frosted glass layer.

LAYER C — CONTENT
Cards, report content, text, controls.

CATEGORY COLOR MUST PRIMARILY AFFECT LAYER A AND THE EDGES/REFLECTIONS OF LAYER B.

CATEGORY COLOR MUST NOT BECOME THE MAIN FILL COLOR OF LAYER B.

This distinction is the core fix.

============================================================
2. KEEP THE MAIN CONTENT GLASS NEUTRAL
============================================================

The large page-level sheet must remain in the same cool transparent glass family on EVERY category.

Use a neutral cool-blue glass base close to the reference:

base glass:
rgba(169, 198, 224, 0.42)

lighter upper reflection:
rgba(185, 207, 230, 0.24)

glass border:
rgba(238, 246, 255, 0.52)

broad white highlight:
rgba(255, 255, 255, 0.12)

backdrop blur:
24px

saturation:
125%

The sheet may receive only a VERY SMALL category reflection, not a category fill.

Maximum broad category tint inside the sheet:
approximately 4%–8% opacity.

Never let a category tint turn the entire sheet red, purple, orange, green or blue.

The content must remain visually neutral and readable.

============================================================
3. WHERE CATEGORY COLOR SHOULD APPEAR
============================================================

When a category is active, use its color in these places:

A. ENVIRONMENTAL LIGHT
Large soft radial bloom BEHIND the main glass sheet.

B. OUTER GEOMETRIC SEAMS
Some diamond/rhombus seams pick up the category reflection.

C. GLASS SHEET RIM
Thin category-aware rim mixed with the white glass edge.

D. CORNER LIGHT
Subtle category light in the top-right and/or bottom-left environmental depth areas.

E. SMALL SPECULAR REFLECTIONS
Very subtle category-colored reflections on glass.

F. ACTIVE CATEGORY COMPONENTS
Selected category card/indicator can use full-strength color.

Do NOT apply category color as a large full-surface overlay to the content sheet.

============================================================
4. CATEGORY COLOR INTENSITY
============================================================

The environment should clearly indicate the active category, but it should still look like glass.

Use category color as LIGHT.

Think:
"colored light shining through clear blue glass"

NOT:
"paint the glass panel with category color"

Suggested environmental bloom opacity:
0.16–0.28 at the center of the bloom, fading to 0.

Suggested seam/rim color contribution:
20%–45% category color mixed with white/blue glass.

Suggested internal sheet category contribution:
4%–8% maximum.

============================================================
5. MARKETING — RED
============================================================

Marketing must NEVER produce the mauve/purple sheet shown in current_bad_marketing_report.png.

Marketing identity:

deep:
#B70302

main:
#C0272D

highlight:
#EB4C50

Correct behavior:
- neutral blue/clear central glass sheet;
- red light bloom in environment;
- red reflection on selected seams;
- red-tinted thin rim;
- subtle red specular highlights;
- report content itself remains neutral glass.

Wrong behavior:
- pink sheet;
- purple sheet;
- mauve content panel;
- red overlay covering the whole report.

============================================================
6. IT — DARK BLUE
============================================================

deep:
#154575

main:
#36789B

highlight:
#64ACC5

IT may naturally blend most closely with the base blue environment.

Still preserve neutral glass sheet.

Use deeper navy environmental pockets and blue rim/reflection.

============================================================
7. FINANCE — GOLD / ORANGE
============================================================

deep:
#E4962A

main:
#F8A464

highlight:
#FFD36A

Do NOT make the full sheet beige/orange.

Use gold/orange light behind the sheet, rim accents, seam reflections and small highlights.

============================================================
8. HR — PURPLE
============================================================

deep:
#595EC6

main:
#6B5CE3

highlight:
#8683DC

Do NOT make the full content sheet lavender/purple.

Keep clear blue glass and illuminate the surrounding environment purple.

============================================================
9. OPERATIONS — GREEN / TEAL
============================================================

deep:
#2CB89E

main:
#50D1C1

highlight:
#7ADACF

Do NOT make the whole page sheet mint/green.

Use green/teal light in background, seams, rim and reflection only.

============================================================
10. OUTER BACKGROUND MUST CHANGE, NOT THE CONTENT CANVAS
============================================================

The user previously said "background changes to category color."

Interpret BACKGROUND correctly:

BACKGROUND means the geometric environment BEHIND the content glass sheet.

It does NOT mean recoloring the content sheet itself.

The correct category transition is:

neutral blue geometric environment
+
category-colored illumination
+
neutral translucent content glass

This preserves the reference look.

============================================================
11. FIX THE CURRENT REPORT PAGE FIRST
============================================================

Use current_bad_marketing_report.png as the regression target.

The current central mauve/purple report sheet must be removed.

Marketing report should become:

- same neutral blue/clear glass material as home/analysis;
- red environmental glow visible around/behind it;
- red rim/reflection;
- no large purple/pink/mauve fill.

Do not change report content/layout.

Do not change strength/weakness colors.

Do not change report data.

This task is only surface/background material.

============================================================
12. DO NOT DAMAGE THE CURRENT GOOD PARTS
============================================================

The current analysis screenshot has category cards that are much closer to the requested swatch concept.

PRESERVE those category cards.

The current homepage guide cards are also much closer than before.

PRESERVE their structure/material unless a tiny color-context adjustment is required.

Do NOT redo:
- category card layout
- icons
- card proportions
- guide layout
- radar
- text
- buttons
- report layout
- navigation layout

This task is specifically the background/category color system.

============================================================
13. REMOVE THE SOURCE OF THE BAD FULL-SHEET TINT
============================================================

Inspect current CSS/React and find the actual rule creating the full-sheet category wash.

Look for:
- background using --category-color
- rgba(var(--category-rgb), high opacity)
- linear-gradient with category color covering entire sheet
- ::before or ::after overlays
- page-specific report backgrounds
- inline style variables
- data-domain/data-category selectors
- color-mix() rules
- inherited --domain-* variables

Do not merely add another neutral layer on top.

REMOVE or REWRITE the bad tint source.

There should be one clear category-environment system.

============================================================
14. USE SEPARATE VARIABLES
============================================================

Do not reuse one variable for both environmental tint and glass-sheet fill.

Create/separate variables conceptually like:

--category-rgb
--category-main
--category-highlight

--environment-category-bloom
--environment-category-seam
--glass-category-rim
--glass-category-reflection

and separately:

--page-glass-bg
--page-glass-highlight
--page-glass-border

The page-glass background must remain neutral.

============================================================
15. TARGET VISUAL COMPOSITION
============================================================

At first glance on a Marketing page I should perceive:

1. blue/clear glass sheet;
2. red environmental illumination around it;
3. red edge/reflection detail;
4. original blue acrylic geometry still visible;
5. readable neutral content.

I should NOT perceive:
"a giant red/pink/purple panel."

Repeat same principle for other categories.

============================================================
16. CATEGORY CHANGE SHOULD FEEL LIKE LIGHTING
============================================================

When switching categories, it should feel like the LIGHT SOURCE changed color.

The physical materials remain the same.

This is essential.

Same glass.
Same geometric wall.
Same sheet.
Different light.

Use transitions only for color/opacity if desired.

No movement.

============================================================
17. HEADER / TOP GLASS
============================================================

Keep the top glass material largely neutral steel/blue.

Category can affect:
- thin bottom rim;
- faint outer glow;
- small reflection.

Do NOT recolor the entire navigation/header to category color.

============================================================
18. VISUAL TEST
============================================================

After implementation, manually verify all five categories.

MARKETING:
neutral blue glass + RED environmental light.

IT:
neutral blue glass + DARK-BLUE environmental light.

FINANCE:
neutral blue glass + GOLD environmental light.

HR:
neutral blue glass + PURPLE environmental light.

OPERATIONS:
neutral blue glass + GREEN/TEAL environmental light.

If any central sheet becomes a broad solid category-colored field, the implementation FAILS.

============================================================
19. BROWSER CHECK
============================================================

If Playwright/browser tooling is available:

- capture Marketing report after fix;
- compare it with current_bad_marketing_report.png;
- capture at least one HR and Finance category page;
- confirm glass material stays neutral while environmental lighting changes.

Do not stop merely because the build passes.

============================================================
20. BUILD
============================================================

Run frontend build.

Run existing UI/CSS checks.

Do NOT touch backend/question-bank/database/report data.

============================================================
21. FINAL RESPONSE
============================================================

Report:

1. exact selector/rule that caused the bad full-sheet tint;
2. files changed;
3. neutral page-glass values;
4. per-category environmental light values;
5. category rim opacity;
6. internal sheet category opacity;
7. build result;
8. visual/browser validation performed.

Explicitly confirm:

"CATEGORY COLOR NOW CHANGES THE ENVIRONMENTAL LIGHTING, NOT THE MAIN CONTENT GLASS FILL."

DO THE ACTUAL FIX NOW.
