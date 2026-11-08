PROJECT: MMRI / BusinessMMRI frontend polish
WORKING FOLDER: /home/kirby/MMRI_STEP10_FINAL_WORKING

TASK:
Use the liquid-glass reference style for the main background and popup style across the frontend.

IMPORTANT:
- Do only the requested design changes.
- Preserve the current content, text, structure, logic, routes, and functionality.
- Do not redesign unrelated parts.
- Keep the system clean, premium, and coherent.
- Keep the current UI architecture, but change the visual treatment.

REFERENCE STYLE DESCRIPTION:
The reference image has a very specific liquid-glass background and popup style.

1) MAIN BACKGROUND STYLE
Use this as the global main background language:
- Base color: soft desaturated powder blue / misty blue.
- Exact base reference color: #AFC3D8
- Secondary darker blue: #7E98B3
- Deep accent blue-shadow tone: #5F7996
- Bright glass highlight tone: #EAF4FF
- Cyan glow accent: #8FE7FF

Pattern:
- The background is not plain.
- It has a soft geometric tiled / diamond / rhombus pattern.
- The pattern looks like large diagonal glass tiles or padded quilted panels.
- There are subtle seam lines forming diagonal diamonds.
- The seams are softly beveled, not sharp.
- Some seams catch light with white-blue highlights.
- The whole background has a premium frosted-glass / polished acrylic feeling.
- There is gentle vignette depth around edges.
- There are soft reflections and blurred light patches, especially top-left and right side.
- The look should feel elegant, glossy, cool, and slightly futuristic.
- Do NOT make it noisy or busy.
- Do NOT use hard contrast.
- Do NOT use flat solid color only.

2) CATEGORY TINT RULE
Use the same exact background pattern everywhere, but tint the background color according to the active category color.
Meaning:
- same pattern
- same glass mood
- same glow behavior
- same lighting logic
- but the overall background tint changes to match the category color

So:
- Marketing pages -> background tinted to Marketing color
- Information Technology pages -> background tinted to IT color
- Finance pages -> background tinted to Finance color
- Human Resources pages -> background tinted to HR color
- Production & Operations pages -> background tinted to Operations color

IMPORTANT:
- Preserve category identity colors.
- Only tint the background with the category color.
- Do not destroy readability.
- Keep text legible.
- The tint should be elegant and soft, not oversaturated.

3) 4 GUIDE BUTTON / CARD COLOR RULE
The 4 guide cards/buttons should NOT all be different random colors.
On a given screen / section they should all use ONE unified color treatment.
Meaning:
- all 4 guide cards share the same category-tinted glass style
- same glow family
- same background family
- same popup family
- no rainbow mismatch between the 4 cards

4) GUIDE POPUP / MODAL STYLE
Make the popup look like the popup in the reference image:
- large rounded rectangle
- very soft frosted glass panel
- heavy blur behind it
- translucent glass surface
- subtle inner glow
- subtle white border, around 1px, low-opacity
- layered shadow underneath
- polished / premium / iOS-like liquid glass feeling
- rounded corners should be large, around 28px to 36px feeling
- the popup should float above the background
- backdrop should blur behind it instead of becoming flat and ugly
- close button should feel like a frosted rounded-square chip
- top controls should feel glassy, not plain
- avoid old-style sharp boxes
- avoid flat opaque white popup
- no unnecessary motion or aggressive animation

Popup visual targets:
- backdrop-filter blur should feel strong
- popup background should be semi-transparent
- use subtle light reflections
- keep content readable and clean
- maintain current popup content and structure

5) CATEGORY GLOW STYLE
The category color treatment should feel glowy like the reference image:
- soft outer glow
- soft inner light
- polished glass shine
- not neon
- not childish
- not too strong
- each category color should softly illuminate its surface

6) FILES MOST LIKELY TO UPDATE
Please inspect and update the real files as needed, especially:
- frontend/src/pages/landing.css
- frontend/src/pages/results.css
- frontend/src/pages/questionnaire.css
- frontend/src/pages/account.css
- frontend/src/pages/billing.css
- frontend/src/pages/support.css
- frontend/src/pages/priorities.css
- frontend/src/components/shell.css
- frontend/src/components/glass.css
- frontend/src/components/components.css
- frontend/src/components/buttons.css
- frontend/src/design/tokens.css
- frontend/src/design/preferences.css
- frontend/src/styles.css
- frontend/src/components/AppShell.tsx
- frontend/src/pages/Profile.tsx
- frontend/src/pages/Settings.tsx
- any popup/modal component used by the 4 homepage guide cards

7) IMPLEMENTATION REQUIREMENTS
- Create reusable CSS variables/tokens for:
  - base glass background
  - seam/pattern colors
  - highlight colors
  - glow colors
  - category tint overlays
  - popup glass surface
- If needed, implement the background pattern with layered gradients.
- Prefer CSS gradients, blur, opacity, shadows, and overlay layers.
- Do not use a heavy image background if CSS can reproduce it cleanly.
- Make the design responsive.
- Make sure the final design is consistent across relevant pages.
- Keep performance reasonable.

8) STRICT DO-NOT-CHANGE RULES
- do not change routes
- do not change business logic
- do not change texts/content unless required for styling wrappers
- do not change the meaning of guide popup contents
- do not remove current functionality
- do not replace category colors with unrelated colors
- do not make the site darker unless needed for depth
- do not make everything transparent to the point of unreadability

9) OUTPUT REQUIRED
After changes:
- list all files changed
- explain briefly what was changed
- state how the liquid-glass background was implemented
- state how category tinting was implemented
- state how popup glass styling was implemented

If image input is supported in this Claude environment, use this screenshot as style reference:
  /home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/liquid_glass_reference.png

If image input is not supported, use the text description above as the authoritative reference.
