# Design: TORDO Logo & Varien Font Integration

**Date:** 2026-04-01  
**Status:** Approved  

---

## Overview

Replace the existing PNG logo and Outfit-based brand text with:
1. A new high-quality SVG logo (`tordo_logo_svg_hq_mod_paulo.svg`) rendered as an inline React component
2. The Varien display font applied to all literal "TORDO" brand-name occurrences
3. The SVG set as the site favicon
4. A CSS-based hover animation patch (placeholder until real wing animation SVGs are provided)

---

## Section 1 — File Organization

Copy assets to their permanent locations within the frontend:

| Source | Destination |
|---|---|
| `tordo_logo_svg_hq_mod_paulo.svg` (project root) | `frontend/public/images/tordo-logo.svg` |
| `varien-.../WOFF/Varien.woff2` | `frontend/public/fonts/varien/Varien.woff2` |
| `varien-.../WOFF/Varien Outline.woff2` | `frontend/public/fonts/varien/Varien-Outline.woff2` |

Only WOFF2 is copied — it covers all modern browsers at optimal compression. OTF/TTF/WOFF files are not needed at runtime and stay in the source folder.

---

## Section 2 — Font Setup

### `@font-face` in `frontend/app/globals.css`

Add two font-face declarations at the top of the file (distinct family names to avoid browser collision):

```css
@font-face {
  font-family: 'Varien';
  src: url('/fonts/varien/Varien.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'VarienOutline';
  src: url('/fonts/varien/Varien-Outline.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### CSS variable

Add to the `:root` block in `globals.css`:

```css
--font-varien: 'Varien', system-ui, sans-serif;
--font-varien-outline: 'VarienOutline', system-ui, sans-serif;
```

### Tailwind config (`frontend/tailwind.config.js`)

Add `brand` to the `fontFamily` extension:

```js
fontFamily: {
  sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
  display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
  brand: ['var(--font-varien)', 'system-ui', 'sans-serif'],  // NEW
},
```

Varien applies **only** to literal "TORDO" brand text via the `font-brand` Tailwind class. Outfit remains the display/heading font for all other UI text.

---

## Section 3 — `TordoLogo` React Component

**File:** `frontend/components/TordoLogo.tsx`

### Interface

```tsx
interface TordoLogoProps {
  size?: number;        // rendered height in px, default 40
  className?: string;
}
```

### Behavior

- Renders the bird SVG inline (copied verbatim from `tordo-logo.svg`)
- Wrapped in a `group` div to enable Tailwind group-hover utilities
- **Hover patch:** two SVG arc paths rendered behind the bird that animate outward on hover, giving a wings-spreading suggestion. Implemented with a CSS `@keyframes` animation (`tordo-spread`) defined in `globals.css`. The arcs use the brand teal (`#3bb`) and are positioned symmetrically left/right of the bird body.
- When the real animation SVG is provided, this component is replaced entirely — no refactor of callers needed since the `size`/`className` API stays stable.

### Hover animation spec (`@keyframes tordo-spread`)

```css
@keyframes tordo-spread {
  from { transform: scaleX(0.2) translateY(4px); opacity: 0; }
  to   { transform: scaleX(1)   translateY(0px); opacity: 0.85; }
}
```

Applied with `animation: tordo-spread 0.25s ease-out forwards` on `.tordo-wing` elements inside the component, triggered via CSS `:hover` on the wrapper.

---

## Section 4 — Logo Replacement

Replace all `<Image src="TORDO_logo*.png">` usages with `<TordoLogo size={N}>`:

| File | Context | Size |
|---|---|---|
| `components/Layout.tsx:~134` | Sidebar nav | 36px |
| `app/page.tsx` (hero) | Landing page hero | 72px |
| `app/page.tsx` (footer) | Landing page footer | 28px |
| `app/login/page.tsx` | Auth panel header | 48px |
| `app/register/page.tsx` | Auth panel header | 48px |

The existing two-PNG hover wrapper (closed wings / open wings) in `Layout.tsx` is removed entirely and replaced by the single `<TordoLogo>` component with its built-in hover animation.

---

## Section 5 — Varien Brand Text

Apply `font-brand` class to every literal "TORDO" string rendered as UI text:

| File | Line(s) | Current class | New addition |
|---|---|---|---|
| `components/Layout.tsx` | ~134 | `font-display text-lg font-bold tracking-tight text-primary` | add `font-brand` |
| `app/login/page.tsx` | ~83 | `font-display text-2xl font-bold text-white tracking-tight` | add `font-brand` |
| `app/login/page.tsx` | ~129 | `font-display text-xl font-bold text-primary` | add `font-brand` |
| `app/register/page.tsx` | similar to login | same pattern | add `font-brand` |
| `app/page.tsx` | ~384 | `text-sm font-bold text-[#0F2942]` | add `font-brand` |

`font-display` can be removed from these elements since `font-brand` (Varien) supersedes it for brand text.

---

## Section 6 — Favicon

Update `app/layout.tsx` metadata `icons` block:

```ts
icons: {
  icon: [
    { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
    { url: '/images/tordo-logo.svg', type: 'image/svg+xml' },
  ],
  shortcut: '/favicon.ico',
},
```

Replace the existing `/icon.svg` reference with `/images/tordo-logo.svg`. The old `public/icon.svg` file can be deleted.

---

## Section 7 — Landing Page Size Harmony

The SVG viewBox is `612×792` (portrait ratio ~0.77). At 72px rendered height the bird is approximately 55px wide.

The Varien "TORDO" logotype (if displayed as a wordmark alongside the logo in the hero) is sized at `text-5xl` (~48px line-height) so the cap-height of the Varien letters aligns with the visual center of the bird. This produces a balanced lockup: logo left, wordmark right, vertically centered.

For contexts where the logo appears alone (sidebar, auth panels), no wordmark size adjustment is needed — the bird stands alone at its given size.

---

## Out of Scope

- Real wing-swap animation (deferred, user will provide updated SVG)
- Varien applied to non-brand headings or body text
- Removal of Outfit font (still used for general display text)
- Changes to landing page copy, layout structure, or color scheme
