# Existing editor design contract

## 1. Context

The public fork template reuses the existing vanilla HTML/SVG editor. Users bring their own plan and furniture; the empty state explains these steps without household-specific content.

## 2. Tokens

Use the existing `src/style.css` variables: ink, muted, line, primary, and red. Keep the system sans-serif typography, existing control sizing, white panels, muted canvas, and restrained elevation.

## 3. Layout

Keep the header, furniture catalog, canvas, inspector, and dialogs. Add the plan-upload button to the header and a first-use card to the canvas. Each sidebar owns its scrolling; retain the existing responsive editor behavior.

## 4. States

Initial state is an empty project. Plan upload is pending/failed/complete; calibration remains explicitly pending until the user enters a measured length. File errors preserve the current project. Storage errors request JSON backup.

## 5. Primitives

Reuse buttons (default, primary, disabled), form inputs with labels, dialog header/error/actions, neutral info blocks, catalog cards, toast, and the canvas caption. Keyboard focus must remain visible.

## 6. Motion

No new animations. Existing gestures pan the camera and move furniture independently from physical dimensions.

## 7. Accessibility

All upload buttons have readable text; inputs are labeled. The empty-state card uses real buttons, and dialogs support Escape. Do not use a decorative overlay that blocks existing controls.

## 8. Accepted scope

Preserve the established editor style for this functional generalization. No framework migration, redesign, remote storage, login, or new dependencies. Mobile editing limitations of the original tool must be documented.
