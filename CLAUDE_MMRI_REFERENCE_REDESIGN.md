PROJECT:
 /home/kirby/MMRI_STEP10_FINAL_WORKING

REFERENCE IMAGES:
1. /home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/reference_bg.png
2. /home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/reference_blue_buttons.png
3. /home/kirby/MMRI_STEP10_FINAL_WORKING/claude_refs/reference_purple_cards.png

TASK:
Redesign the MMRI frontend visual system using these 3 reference images.

IMPORTANT:
Use the reference images much more literally.
Do not turn this into generic blurry glassmorphism.
Do not make the result foggy or washed out.

============================================================
1. MAIN BACKGROUND
============================================================

Use Image 1 as the main background reference.

Extract the exact background language from it:
- soft blue liquid-glass environment
- smooth acrylic / glass material feeling
- large diagonal / rhombus / diamond panel structure
- subtle seams
- clean highlights
- soft darker shading in corners
- elegant depth
- polished premium look

Follow the shading, pattern, light direction, and surface feel of Image 1.

The background should not be plain.
It should not be noisy.
It should not look like repeated wallpaper.
It should feel like a premium glass/acrylic environment.

============================================================
2. FLOATING GLASS LAYER ABOVE BACKGROUND
============================================================

On top of that background, create a large floating glass surface, inspired by Image 1.

This layer should:
- float above the background
- have soft shadow beneath it
- have transparency
- have clean glass shine
- have rounded corners
- have a premium acrylic / glass surface feel

The main MMRI content should sit on top of this glass layer.

Hierarchy:

BACKGROUND
↓
FLOATING GLASS LAYER
↓
MAIN BUTTONS / RADAR / CONTENT

============================================================
3. 4 GUIDE BUTTONS
============================================================

Use Image 2 as the reference for the 4 guide buttons.

The 4 homepage guide buttons must be:
- rectangular
- horizontally longer
- slightly rounded corners
- blue glass / neon-glass style like Image 2
- visually clean
- premium
- slightly dimensional

Important:
Use the blue style shown in Image 2.

The 4 guide buttons should feel like luminous blue glass buttons.

When a guide is tapped:
- the whole background color changes to that guide/category color
- do not redesign everything else randomly
- only the environment/background color family should change

============================================================
4. RADAR
============================================================

Place the radar on the right side.

The radar should sit inside a thin glass-like panel.

The radar should:
- still clearly look like a radar chart
- be cleaner, cooler, and more modern
- use thin lines
- use subtle animation if appropriate
- feel premium and modern
- be visually lighter and cleaner than the current version

The radar panel should not feel bulky.

============================================================
5. 5 CATEGORY COLORS
============================================================

Create 5 unique category colors.

Each category should have:
- unique color identity
- glassy / gradient styling
- clean modern feeling

Suggested distinct families:
- Marketing = red
- IT = blue
- Finance = gold/orange
- HR = purple
- Operations = green

Make them visually distinct.

============================================================
6. CATEGORY BACKGROUND CHANGE
============================================================

When a category is tapped, and inside diagnosis/report pages too:
- the WHOLE background environment must change to that category color
- preserve the same background structure/pattern/shading logic from Image 1
- only the color family changes

So:
same pattern
same shading
same material logic
same floating glass layer

but different category color.

============================================================
7. PURPLE CARD INSPIRATION
============================================================

Use Image 3 as additional inspiration for category glass cards / surfaces.

From Image 3, take:
- purple premium glow feeling
- floating glass-card mood
- depth
- elegant lighting
- premium modern style

Do not literally copy the hand.
Do not literally copy the poster layout.

Only use it as a visual inspiration for:
- category card mood
- glass-card quality
- lighting richness
- premium floating feel

============================================================
8. DESIGN GOAL
============================================================

Final MMRI should feel:
- modern
- premium
- clean
- glassy
- visually strong
- not blurry
- not washed out
- more like a designed product
- less like a basic dashboard

============================================================
9. PAGES TO APPLY
============================================================

Apply this visual system consistently to:
- homepage
- diagnosis page
- guide section
- report
- selected-category states
- related key UI surfaces

============================================================
10. STRICT RULES
============================================================

Do not change:
- backend logic
- routes
- business logic
- diagnosis logic
- report logic
- auth/payment logic
- question bank logic

Only redesign the visual system.

============================================================
11. IMPLEMENTATION EXPECTATION
============================================================

Inspect the real frontend files and implement the redesign in code.

Use the reference images directly as visual guidance.

After changes:
- run the frontend build
- verify visually
- summarize all changed files
- explain how background, floating glass layer, guide buttons, radar, and category colors were implemented
