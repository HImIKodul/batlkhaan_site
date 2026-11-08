# Step 07 / 10 — Settings live preview and dark-mode completion

Scope is restricted to technical settings behavior and theme coverage.

## Settings behavior

- Font size, theme, spacing density, reduced motion and high contrast preview immediately while the user is on Settings.
- Preview changes are not persisted to `localStorage` until **Тохиргоо хадгалах** is pressed.
- Navigating away without saving restores the previously committed settings.
- **Анхны тохиргоо** is a preview of defaults; it also requires Save before becoming persistent.
- The Save button is disabled when there is no unsaved difference.
- Saved settings are applied before React renders to prevent the initial light-theme flash.
- Saved-setting changes from another browser tab are applied through the standard `storage` event.

## Dark-mode coverage

The final Step-07 stylesheet is loaded after all previous release styles and provides screen-theme coverage for:

- shell/navigation/account menu/notifications;
- home, radar and guide windows;
- login;
- diagnosis and status surfaces;
- billing/payment and payment history;
- base questions and diagnostic questionnaire;
- result and priority workspaces;
- profile and technical settings;
- reports and report controls;
- shared menus/dialogs/tooltips/API states;
- QA/state surfaces.

Category accents and scored answer gradients remain intact. QR content remains white for scanner reliability. Print/PDF output is explicitly kept in the light print contract even when the screen uses dark mode.

## Frozen areas

No 365-day-plan content, stage ordering, action wording, completion logic, question bank, scoring, routing, payment business logic, database schema, migrations or capability taxonomy is changed by Step 07.
