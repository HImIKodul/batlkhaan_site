# MMRI UI redesign brief — glassmorphism / iPhone-like style

Work from the current running project in this folder.
Do NOT rebuild the system from scratch.
Do NOT change backend logic, database logic, pricing logic, report logic, question-bank logic, QPay logic, or business rules unless strictly needed for UI consistency.
Do ONLY the requested frontend/design changes.

## Main goal
Redesign the MMRI frontend into a clean modern **glassmorphism** style:
- overall mood: premium, blue-toned, soft, elegant
- visual feeling: like iPhone homescreen / Apple-like translucent UI
- use **blurry glass**, translucent cards, soft shadows, subtle glow
- the whole system should feel consistent
- keep it modern and not childish
- all key UI surfaces should visually feel like frosted glass
- use a soft blue overall page atmosphere/background

---

## 1. Homepage — overall style
The homepage should be redesigned into a **blue glass style**.

### Required homepage design changes
- The whole homepage background should feel like an iPhone-like soft blue environment.
- Use layered glassmorphism.
- Reduce text clutter.
- Keep only **one main hero text block**.
- The homepage main text should be improved, based on this meaning:

**Base meaning to preserve:**
"Аль чиглэл хүчтэй, аль нь сул байгааг тодорхойлж, дараагийн 12 сард яг юу хийхээ харуулсан төлөвлөгөөтэй тайлан авна."

### Improve the homepage hero text
Rewrite it into a cleaner, stronger, more premium Mongolian version, while preserving the meaning.
It should sound polished, professional, short, and powerful.

### Important
- Only one main text block on the homepage.
- Do not clutter the homepage with too much text.
- The page should feel visually premium and minimal.

---

## 2. The 4 guide cards on the homepage
Redesign the 4 guide/info cards.

### Visual style
Their shape/style should follow this idea:
- like the first screenshot reference: rounded square / rounded rectangular surface with text at the bottom
- but the material should be more like the second screenshot reference:
  - translucent
  - glass-like
  - see-through
  - glossy
  - slightly reflective
  - bluish premium glass effect

### Structure
- Each guide should be a clean glass card.
- Text should appear at the bottom area of the card.
- Cards should look premium and modern.
- Use large clean custom icons, not basic normal icons.
- The 4 guide cards should be stylistically consistent.

### Interaction
- When tapped/clicked, each guide should open in a **blurry glass popup/modal**.
- The popup should be modern, smooth, elegant.
- The popup background/surface should also be glassmorphism style.
- The popup should match the card and page atmosphere.

---

## 3. Radar section on homepage
For the homepage radar:
- remove the white background behind the icon/text around the radar
- keep only the icon and text
- make it visually cleaner
- it should fit the glassmorphism style

---

## 4. Diagnosis section — 5 categories
In the diagnosis section:
- choose **5 consistent category colors**
- each category color must be clear and distinct
- the colors must stay consistent across the whole product
- apply the category colors carefully while preserving the global blue-glass atmosphere

### Category card style
The 5 category items should visually feel similar to the rounded-surface style from screenshot 1:
- clean rounded shape
- strong visual identity
- glass effect
- premium appearance

### Interaction
- when a category is selected:
  - the whole background should shift toward that category’s color
  - a modern blurry glass popup/panel should appear
  - it should feel immersive and stylish
- this same visual logic should be used for report-related section transitions/effects too

### Category icons
- Create/refine clean high-quality icons for all 5 categories
- Icons should look custom and polished
- Avoid generic default icon sets
- All icons should feel part of one design system

---

## 5. Status effects / status indicators
The status indicators are currently not stylish enough.

### Change request
- redesign the status effects into a more premium modern visual style
- keep them compact and clean
- use glass effect where appropriate
- make them look more deliberate and polished
- the styling should fit the rest of the new system

### Notification count issue
- the notification badge/number is broken right now
- the number is not centered
- fix the badge so the number is properly centered visually and technically

---

## 6. Report effect / popup feeling
For report interactions or report-focused panels:
- make them feel like the selected category color is softly affecting the background
- the content should appear in a blurry glass-style popup/panel
- the popup/panel must feel modern, premium, and visually clear
- keep the content readable; do not sacrifice usability

---

## 7. Everything should feel glass
The following should all feel like part of one coherent glassmorphism design system:
- homepage
- 4 guides
- guide popups
- category cards
- category panels/popups
- report-related panels
- status effects
- notification badge styling
- radar-related surrounding UI

---

## 8. Icons required
Generate or refine consistent, clean icons for:
- the 4 guide cards
- the 5 business categories
- the status effects

Requirements:
- premium look
- unified style
- not default/basic icons
- clean lines / modern surfaces / subtle dimensionality acceptable
- fit the new glass UI

---

## 9. Constraints
- preserve current functionality
- preserve Mongolian labels/content
- preserve popup meanings/content unless visual improvements require layout updates
- do not break login, diagnosis, results, report, billing, profile, priorities
- do not break responsive behavior
- do not change backend unless absolutely necessary
- keep the experience desktop-first but also responsive
- do not introduce random extra redesign ideas outside this request

---

## 10. Deliverables expected from Claude
Claude should:
1. inspect the current frontend structure
2. identify the relevant components/pages/styles
3. implement the redesign
4. keep the visual system consistent
5. explain which files were changed
6. run the frontend build and relevant checks
7. summarize the result clearly

---

## 11. Important guidance
This is not a small patch.
Treat it as a focused frontend visual redesign pass,
but still preserve the current MMRI structure and business functionality.

If there are old styles causing conflicts:
- refactor carefully
- remove or consolidate only when safe
- do not leave broken duplicate style layers

