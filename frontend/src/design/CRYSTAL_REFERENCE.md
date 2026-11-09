# Sapphire crystal material

Reference: `design-references/PRIMARY_REFERENCE.png` (identical to the approved Downloads image).

`GlassStage.tsx` owns the static SVG diamond environment, shared vertices, beveled seams and concentrated caustics. It replaces the previous route-specific curved sculptures. No bitmap generation, animated blur or per-frame geometry is used.

`crystal.css` loads after the legacy page styles and before accessibility preferences. It owns optical fills, glass thickness, contact shadows, edge reflections, shared controls, and screen-only report materials. Existing layouts, answer colors, progress calculations and print layouts retain their original owners.

`tokens.css` and `tokens.ts` share the reference domain colors: green marketing, cyan IT, amber finance, violet people, pink operations. Semantic answer success/warning/danger colors are separate.

On mobile the main sheet has a more opaque fill and no backdrop blur. Reduced motion/transparency and print rules remain supported. Mongolian uses the existing locally bundled IBM Plex Sans Cyrillic fonts.

The design Vite default is port 5180, strict, proxying to the isolated API at 127.0.0.1:4100. It must not default to the shared port 4000.
