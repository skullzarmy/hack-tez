# Share Studio Plan

## Scope

This is a share tool for the existing profile page.

It is not:

1. A new profile system
2. A persisted share-state product
3. A new routing layer
4. A server-driven card editor

The job is simple:

1. Let the profile owner open a local Share Studio on their existing profile page
2. Compose a high-quality social image from profile data plus editable text
3. Preview it live in-browser
4. Export it as a one-off image
5. Open X share intent using the generated copy and the existing profile URL
6. Fix profile URL unfurls so the profile itself shares correctly

---

## Existing Profile Share Issues

These are real problems with the current profile sharing story and must be fixed.

### 1. Profile links do not get profile-specific rich previews

The app route is already the correct route: [src/App.tsx](src/App.tsx#L305).

The issue is that metadata is static site-wide in [index.html](index.html#L11). If someone shares a profile URL like `/u/joepeterson`, platforms will still unfurl the generic site card, not the profile.

This is separate from the Share Studio itself.

Required outcome:

1. `/u/:subdomain` must stop unfurling as the generic site card
2. The fix must stay minimal and must not turn into a share-state architecture

### 2. Current Share Studio implementation is only a rough stub

The current component in [src/components/ProfileShareStudio.tsx](src/components/ProfileShareStudio.tsx#L1) is directionally right but still incomplete for the stated goal.

Current gaps:

1. Not clearly integrated into the existing profile page flow yet
2. Uses generic default copy instead of seeding from actual profile data
3. Uses simple flat presets instead of homepage-derived art directions
4. No text wrapping, truncation, or layout safety for long content
5. No background pattern system
6. No glitch treatment inspired by the homepage hero
7. `Share to X` text points to `hacktez.com` rather than the actual profile URL
8. Hardcodes `.hack.tez` in canvas text rather than using network config
9. No explicit mobile layout strategy for the studio UI

---

## Product Definition

### What It Is

A local-only image composer embedded in the owner view of the existing profile page.

### What It Does

1. Seeds a share card from existing profile data
2. Lets the user tweak title, subtitle, CTA, format, and visual preset
3. Shows a live preview
4. Exports PNG locally
5. Copies PNG to clipboard where supported
6. Opens X share intent with good default post copy and the real profile URL
7. Ensures the real profile URL has profile-specific social preview metadata/image behavior

### What It Does Not Do

1. No share-state persistence layer
2. No server key generation
3. No blob storage for custom cards
4. No query-param encoded editor state
5. No `/s/` routes for composed card state
6. No separate share profile model

---

## UX Plan

### Placement

Place the Share Studio inside the existing profile page, only for the profile owner, in view mode.

Suggested placement:

1. Under the profile header and above the long-form profile content
2. Hidden behind a compact "Share" or "Create share image" trigger so it does not bloat the page

### Controls

Required controls:

1. Preset selector
2. Format selector
3. Title input
4. Subtitle input
5. CTA input

Secondary controls:

1. Toggle use display name vs domain label
2. Toggle avatar on/off
3. Toggle animated glitch preview layer only if it stays cheap and stable

### Actions

1. Download PNG
2. Copy image to clipboard
3. Share to X

Optional but useful:

1. Reset to profile-derived defaults
2. Randomize preset variation within the selected theme

---

## Visual Direction

The tool should borrow from the homepage brand language, not invent a new visual language.

Source inspiration:

1. Circuit background in [src/components/CircuitBackground.tsx](src/components/CircuitBackground.tsx#L1)
2. Glitch styling in [src/index.css](src/index.css#L245)

### Preset Set

Keep the first version tight. Three strong presets is enough.

1. Circuit Hero: reuses the homepage’s circuit-board energy, stays static for export, and can support a lightweight glitch overlay in preview.

1. Scanline Glitch: uses a clean dark field with scanlines, RGB split accents, and restrained glitch slices.

1. Mono Poster: serves as the brutalist black-and-white fallback with the highest readability and lowest rendering complexity.

Avoid adding a large preset catalog initially. Better to make three feel intentional than ship ten mediocre ones.

---

## Technical Plan

### Core Approach

This should be a browser-rendered canvas tool.

Implementation shape:

1. A single Share Studio React component
2. A small pure rendering module that draws the card into canvas
3. A preset registry that defines colors, patterns, spacing, and typography behavior

### Renderer Responsibilities

The renderer should handle:

1. Canvas sizing by format
2. Background pattern drawing
3. Avatar drawing
4. Text layout
5. Safe text wrapping and truncation
6. Export to PNG

The renderer should not:

1. Depend on CSS variables for font strings inside canvas
2. Depend on DOM screenshots
3. Depend on any server round-trip to render the local share image

### Why Canvas

Canvas is enough for the actual ask:

1. One-off local generation
2. Reliable PNG export
3. Clipboard support
4. Full control over typography and background effects

---

## Data Seeding

The tool should seed from the real profile already on the page.

Suggested defaults:

1. Title: display name or full domain
2. Subtitle: bio if present, else short fallback line
3. CTA: profile URL or short brand CTA
4. Avatar: profile image if present, else Hackatar

This keeps it connected to the profile rather than acting like a separate marketing widget.

---

## X Share Behavior

The X action should not pretend to upload the image automatically.

Correct behavior:

1. Generate the image locally
2. Let the user download or copy it
3. Open X intent with good post text and the real profile URL

Important fix:

The share text should reference the actual profile URL, not just the homepage. The base site URL is already centralized in [src/config/tezos.ts](src/config/tezos.ts#L18).

---

## Required Profile Share Fix

This is required and separate from the Share Studio UI, but it is still part of the same overall deliverable because the profile itself must share correctly.

Required fix:

1. Add a small profile-specific OG image and metadata path for `/u/:subdomain`

Keep that fix narrow:

1. Do not add share-state persistence
2. Do not add user-configurable server-stored cards
3. Do not build a new route family

---

## Build Plan

### Phase 1: Make the Local Tool Real

1. Integrate [src/components/ProfileShareStudio.tsx](src/components/ProfileShareStudio.tsx#L1) into the owner view of the existing profile page
2. Seed inputs from actual profile data
3. Replace generic presets with real brand-driven presets
4. Use real profile URL in X sharing
5. Replace hardcoded TLD text with config-driven domain text

### Phase 2: Improve Rendering Quality

1. Add text wrapping and truncation
2. Add proper background pattern drawing
3. Add avatar rendering options
4. Make preview layout responsive on mobile

### Phase 3: Required Profile Unfurl Fix

1. Implement the smallest possible profile-specific metadata/image solution for `/u/:subdomain`
2. Ensure shared profile URLs no longer use the generic site card from [index.html](index.html#L11)
3. Keep the server-side piece limited to default profile preview behavior, not user-composed share-state

### Phase 4: Add Polish Only If It Earns Its Keep

1. Lightweight glitch overlay or motion accent
2. Better preset variation
3. Copy-image fallback handling and better error states

---

## Acceptance Criteria

1. The tool lives inside the existing profile page and nowhere else
2. It feels like a share-image composer, not a separate profile system
3. It works entirely client-side for composition and export
4. It exports a readable PNG in all supported formats
5. X share uses the real profile URL
6. `/u/:subdomain` no longer unfurls as the generic site-wide card
7. Visuals clearly echo the homepage brand system

---

## Hard Constraints

1. No persisted share-state architecture
2. No extra routes for editor state
3. No blob-backed user card storage
4. No solving imaginary problems before the local tool is excellent
