# Dark/Light Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled dark/light mode toggle in the dashboard settings page, persisted via localStorage, with system-preference detection as default.

**Architecture:** Convert the hardcoded Obsidian dark palette to CSS custom properties. Define two variable sets (dark default, light alternative). Use `next-themes` for SSR-safe class toggling with flash prevention. The theme toggle lives in the settings page; the sidebar also gets a quick-toggle icon.

**Tech Stack:** next-themes, Tailwind CSS custom properties, CSS variables, React context (via next-themes provider)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Install | `next-themes` (npm) | SSR-safe theme switching, localStorage persistence, `prefers-color-scheme` detection |
| Modify | `app/globals.css` | Define CSS custom properties for dark + light palettes; replace hardcoded hex in utilities |
| Modify | `tailwind.config.js` | Point all color values at `var(--color-*)` CSS variables |
| Modify | `app/layout.tsx` | Wrap app in `ThemeProvider` from next-themes |
| Modify | `components/Layout.tsx` | Replace 3 hardcoded hex values (sidebar gradient, header bg, nav-active shadow) with CSS vars/Tailwind classes |
| Modify | `app/dashboard/settings/page.tsx` | Add "Apariencia" section with 3-option toggle (Oscuro / Claro / Sistema) |
| Unchanged | `app/page.tsx` | Landing page keeps its own bespoke light design (public, not part of dashboard theming) |
| Unchanged | `app/login/page.tsx`, `app/register/page.tsx` | Auth pages keep current design (brief interaction, not worth theme-switching) |

---

## Color Palette Reference

### Dark (Obsidian) — current values

```
--color-primary:           #00C896
--color-primary-dark:      #009B77
--color-primary-light:     #33DBA8
--color-accent:            #00C896
--color-accent-dark:       #009B77
--color-accent-light:      #061915
--color-gold:              #F59E0B
--color-gold-light:        #1C1505
--color-text:              #E2E8F0
--color-muted:             #94A3B8
--color-subtle:            #64748B
--color-background:        #0A0C10
--color-surface:           #0F1117
--color-surface-elevated:  #161B26
--color-border:            #1A1F2C
--color-border-light:      #1F2537
--color-info:              #4A8FE7
--color-info-light:        #071427
--color-danger:            #F85149
--color-danger-light:      #1A0505
--color-warning:           #F97316
--color-warning-light:     #1C0E05
--color-success:           #00C896
--color-success-light:     #061915
```

### Light — new values

```
--color-primary:           #00A87A
--color-primary-dark:      #008C66
--color-primary-light:     #E6F9F3
--color-accent:            #00A87A
--color-accent-dark:       #008C66
--color-accent-light:      #E6F9F3
--color-gold:              #D97706
--color-gold-light:        #FEF3C7
--color-text:              #0F172A
--color-muted:             #64748B
--color-subtle:            #94A3B8
--color-background:        #F8FAFC
--color-surface:           #FFFFFF
--color-surface-elevated:  #F1F5F9
--color-border:            #E2E8F0
--color-border-light:      #CBD5E1
--color-info:              #3B82F6
--color-info-light:        #EFF6FF
--color-danger:            #EF4444
--color-danger-light:      #FEF2F2
--color-warning:           #F97316
--color-warning-light:     #FFF7ED
--color-success:           #00A87A
--color-success-light:     #E6F9F3
```

---

## Task 1: Install next-themes

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm install next-themes
```

- [ ] **Step 2: Verify installation**

```bash
cat node_modules/next-themes/package.json | grep version
```

Expected: version 0.4.x or higher

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install next-themes for dark/light mode support"
```

---

## Task 2: Convert colors to CSS custom properties in globals.css

**Files:**
- Modify: `app/globals.css`

This is the core refactor. Replace the `@layer base` section and add CSS variable definitions for both themes.

- [ ] **Step 1: Add CSS variable definitions at the top of globals.css**

Insert this block **after** the `@tailwind` directives and **before** `@layer base`:

```css
/* ══════════════════════════════════════════════
   THEME: CSS Custom Properties
   Dark = default (Obsidian). Light = alternative.
   next-themes adds class="dark" or class="light" on <html>.
   ══════════════════════════════════════════════ */

:root {
  /* Default: Dark (Obsidian) */
  --color-primary: #00C896;
  --color-primary-dark: #009B77;
  --color-primary-light: #33DBA8;
  --color-accent: #00C896;
  --color-accent-dark: #009B77;
  --color-accent-light: #061915;
  --color-gold: #F59E0B;
  --color-gold-light: #1C1505;
  --color-text: #E2E8F0;
  --color-muted: #94A3B8;
  --color-subtle: #64748B;
  --color-background: #0A0C10;
  --color-surface: #0F1117;
  --color-surface-elevated: #161B26;
  --color-border: #1A1F2C;
  --color-border-light: #1F2537;
  --color-info: #4A8FE7;
  --color-info-light: #071427;
  --color-danger: #F85149;
  --color-danger-light: #1A0505;
  --color-warning: #F97316;
  --color-warning-light: #1C0E05;
  --color-success: #00C896;
  --color-success-light: #061915;

  /* Utility: sidebar, glass, scrollbar */
  --color-sidebar-from: #0D1420;
  --color-sidebar-to: #0A0C10;
  --color-glass-bg: rgba(10, 12, 16, 0.85);
  --color-header-bg: rgba(10, 12, 16, 0.92);
  --color-scrollbar: #1A1F2C;
  --color-scrollbar-hover: #1F2537;
  --color-grid-stroke: #1A1F2C;

  /* Shadows */
  --shadow-card: 0 1px 4px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3);
  --shadow-card-md: 0 4px 16px 0 rgba(0, 0, 0, 0.5), 0 2px 6px -2px rgba(0, 0, 0, 0.3);
  --shadow-card-lg: 0 8px 28px 0 rgba(0, 0, 0, 0.6), 0 4px 10px -4px rgba(0, 0, 0, 0.4);
  --shadow-sidebar: 2px 0 24px 0 rgba(0, 0, 0, 0.5);
}

.light {
  --color-primary: #00A87A;
  --color-primary-dark: #008C66;
  --color-primary-light: #E6F9F3;
  --color-accent: #00A87A;
  --color-accent-dark: #008C66;
  --color-accent-light: #E6F9F3;
  --color-gold: #D97706;
  --color-gold-light: #FEF3C7;
  --color-text: #0F172A;
  --color-muted: #64748B;
  --color-subtle: #94A3B8;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-elevated: #F1F5F9;
  --color-border: #E2E8F0;
  --color-border-light: #CBD5E1;
  --color-info: #3B82F6;
  --color-info-light: #EFF6FF;
  --color-danger: #EF4444;
  --color-danger-light: #FEF2F2;
  --color-warning: #F97316;
  --color-warning-light: #FFF7ED;
  --color-success: #00A87A;
  --color-success-light: #E6F9F3;

  --color-sidebar-from: #F1F5F9;
  --color-sidebar-to: #FFFFFF;
  --color-glass-bg: rgba(255, 255, 255, 0.88);
  --color-header-bg: rgba(255, 255, 255, 0.92);
  --color-scrollbar: #CBD5E1;
  --color-scrollbar-hover: #94A3B8;
  --color-grid-stroke: #E2E8F0;

  --shadow-card: 0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.04);
  --shadow-card-md: 0 4px 12px 0 rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
  --shadow-card-lg: 0 8px 24px 0 rgba(0, 0, 0, 0.1), 0 4px 8px -4px rgba(0, 0, 0, 0.06);
  --shadow-sidebar: 2px 0 16px 0 rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 2: Replace hardcoded hex values in scrollbar styles**

Replace the scrollbar section:

```css
  /* Before */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #1A1F2C transparent;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #1A1F2C;
    border-radius: 2px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #1F2537;
  }

  /* After */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: var(--color-scrollbar) transparent;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background: var(--color-scrollbar);
    border-radius: 2px;
  }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: var(--color-scrollbar-hover);
  }
```

- [ ] **Step 3: Replace hardcoded hex values in utility classes**

```css
  /* Before */
  .bg-grid {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 40V0h1M40 40V0' stroke='%231A1F2C' stroke-width='.5'/%3E%3C/svg%3E");
  }
  .bg-dots {
    background-image: radial-gradient(circle, #1A1F2C 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .glass {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: rgba(10, 12, 16, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* After */
  .bg-grid {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 40V0h1M40 40V0' stroke='%231A1F2C' stroke-width='.5'/%3E%3C/svg%3E");
  }
  .light .bg-grid {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 40V0h1M40 40V0' stroke='%23E2E8F0' stroke-width='.5'/%3E%3C/svg%3E");
  }
  .bg-dots {
    background-image: radial-gradient(circle, var(--color-border) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .glass {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: var(--color-glass-bg);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .light .glass {
    border: 1px solid var(--color-border);
  }
```

- [ ] **Step 4: Replace hardcoded hex in select option styles**

```css
  /* Before */
  select.input-field option {
    background-color: #EEF1F7;
    color: #0D1B2A;
  }

  /* After */
  select.input-field option {
    background-color: var(--color-surface-elevated);
    color: var(--color-text);
  }
```

- [ ] **Step 5: Update box-shadow values in KPI card ::before pseudo-elements**

These use hardcoded hex for the `box-shadow` glow. Since these are accent glows on the card top edge, they work in both themes — **leave as-is**. The colors (#4A8FE7, #00C896, #F59E0B, #F85149) are semantic status colors that don't change between themes.

- [ ] **Step 6: Verify the file compiles**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run build 2>&1 | head -30
```

Expected: No CSS compilation errors.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat: add CSS custom properties for dark/light theme palettes"
```

---

## Task 3: Update tailwind.config.js to use CSS variables

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Replace all color values with CSS variable references**

Replace the entire `colors` block in `theme.extend`:

```javascript
colors: {
  primary: 'var(--color-primary)',
  primaryDark: 'var(--color-primary-dark)',
  primaryLight: 'var(--color-primary-light)',

  accent: 'var(--color-accent)',
  accentDark: 'var(--color-accent-dark)',
  accentLight: 'var(--color-accent-light)',

  gold: 'var(--color-gold)',
  goldLight: 'var(--color-gold-light)',

  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  subtle: 'var(--color-subtle)',
  background: 'var(--color-background)',
  surface: 'var(--color-surface)',
  'surface-elevated': 'var(--color-surface-elevated)',
  border: 'var(--color-border)',
  borderLight: 'var(--color-border-light)',

  info: 'var(--color-info)',
  infoLight: 'var(--color-info-light)',

  danger: 'var(--color-danger)',
  dangerLight: 'var(--color-danger-light)',
  warning: 'var(--color-warning)',
  warningLight: 'var(--color-warning-light)',
  success: 'var(--color-success)',
  successLight: 'var(--color-success-light)',
},
```

- [ ] **Step 2: Replace hardcoded shadow colors with CSS variables**

```javascript
boxShadow: {
  card: 'var(--shadow-card)',
  'card-md': 'var(--shadow-card-md)',
  'card-lg': 'var(--shadow-card-lg)',
  sidebar: 'var(--shadow-sidebar)',
  'nav-active': 'inset 3px 0 0 var(--color-primary)',
},
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run build 2>&1 | head -30
```

Expected: No errors. All existing Tailwind classes (`bg-background`, `text-text`, `border-border`, etc.) continue to work — they now resolve through CSS variables instead of static hex.

**IMPORTANT NOTE:** Tailwind's opacity modifiers (e.g., `bg-primary/10`, `text-muted/50`) do NOT work with plain `var(--color)` format. They require the color to be defined in a special way OR we accept that opacity utilities like `bg-primary/10` will stop working.

**Workaround:** For the opacity modifiers to work, colors must use the `rgb()` format without the `rgb()` wrapper. However, this is a significant change. The simpler approach: keep using opacity modifiers in Tailwind by defining colors as HEX in a way that Tailwind can decompose. Since we're using plain CSS variables, Tailwind 3.x will treat them as opaque — `bg-primary/10` will not apply 10% opacity, it will just use the full color.

**Decision:** To maintain opacity modifier support, use the `<alpha-value>` pattern:

In `globals.css`, define colors as RGB channels only:
```css
:root {
  --color-primary: 0 200 150;  /* #00C896 as RGB channels */
  /* ... */
}
```

In `tailwind.config.js`, use the function form:
```javascript
primary: 'rgb(var(--color-primary) / <alpha-value>)',
```

This preserves `bg-primary/10` → `rgba(0, 200, 150, 0.1)`.

**REVISED Step 1 — globals.css variables need RGB channel format:**

All color definitions in the `:root` and `.light` blocks from Task 2 must be converted from hex to RGB channels. Example:

```css
:root {
  --color-primary: 0 200 150;       /* #00C896 */
  --color-primary-dark: 0 155 119;   /* #009B77 */
  --color-primary-light: 51 219 168; /* #33DBA8 */
  --color-accent: 0 200 150;        /* #00C896 */
  --color-accent-dark: 0 155 119;    /* #009B77 */
  --color-accent-light: 6 25 21;     /* #061915 */
  --color-gold: 245 158 11;          /* #F59E0B */
  --color-gold-light: 28 21 5;       /* #1C1505 */
  --color-text: 226 232 240;         /* #E2E8F0 */
  --color-muted: 148 163 184;        /* #94A3B8 */
  --color-subtle: 100 116 139;       /* #64748B */
  --color-background: 10 12 16;      /* #0A0C10 */
  --color-surface: 15 17 23;         /* #0F1117 */
  --color-surface-elevated: 22 27 38;/* #161B26 */
  --color-border: 26 31 44;          /* #1A1F2C */
  --color-border-light: 31 37 55;    /* #1F2537 */
  --color-info: 74 143 231;          /* #4A8FE7 */
  --color-info-light: 7 20 39;       /* #071427 */
  --color-danger: 248 81 73;         /* #F85149 */
  --color-danger-light: 26 5 5;      /* #1A0505 */
  --color-warning: 249 115 22;       /* #F97316 */
  --color-warning-light: 28 14 5;    /* #1C0E05 */
  --color-success: 0 200 150;        /* #00C896 */
  --color-success-light: 6 25 21;    /* #061915 */

  /* Utility colors stay as full values (not used with Tailwind opacity modifiers) */
  --color-sidebar-from: #0D1420;
  --color-sidebar-to: #0A0C10;
  --color-glass-bg: rgba(10, 12, 16, 0.85);
  --color-header-bg: rgba(10, 12, 16, 0.92);
  --color-scrollbar: #1A1F2C;
  --color-scrollbar-hover: #1F2537;

  --shadow-card: 0 1px 4px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.3);
  --shadow-card-md: 0 4px 16px 0 rgba(0,0,0,0.5), 0 2px 6px -2px rgba(0,0,0,0.3);
  --shadow-card-lg: 0 8px 28px 0 rgba(0,0,0,0.6), 0 4px 10px -4px rgba(0,0,0,0.4);
  --shadow-sidebar: 2px 0 24px 0 rgba(0,0,0,0.5);
}

.light {
  --color-primary: 0 168 122;        /* #00A87A */
  --color-primary-dark: 0 140 102;    /* #008C66 */
  --color-primary-light: 230 249 243; /* #E6F9F3 */
  --color-accent: 0 168 122;         /* #00A87A */
  --color-accent-dark: 0 140 102;     /* #008C66 */
  --color-accent-light: 230 249 243;  /* #E6F9F3 */
  --color-gold: 217 119 6;           /* #D97706 */
  --color-gold-light: 254 243 199;    /* #FEF3C7 */
  --color-text: 15 23 42;            /* #0F172A */
  --color-muted: 100 116 139;        /* #64748B */
  --color-subtle: 148 163 184;       /* #94A3B8 */
  --color-background: 248 250 252;   /* #F8FAFC */
  --color-surface: 255 255 255;      /* #FFFFFF */
  --color-surface-elevated: 241 245 249; /* #F1F5F9 */
  --color-border: 226 232 240;       /* #E2E8F0 */
  --color-border-light: 203 213 225; /* #CBD5E1 */
  --color-info: 59 130 246;          /* #3B82F6 */
  --color-info-light: 239 246 255;   /* #EFF6FF */
  --color-danger: 239 68 68;         /* #EF4444 */
  --color-danger-light: 254 242 242; /* #FEF2F2 */
  --color-warning: 249 115 22;       /* #F97316 */
  --color-warning-light: 255 247 237;/* #FFF7ED */
  --color-success: 0 168 122;        /* #00A87A */
  --color-success-light: 230 249 243;/* #E6F9F3 */

  --color-sidebar-from: #F1F5F9;
  --color-sidebar-to: #FFFFFF;
  --color-glass-bg: rgba(255, 255, 255, 0.88);
  --color-header-bg: rgba(255, 255, 255, 0.92);
  --color-scrollbar: #CBD5E1;
  --color-scrollbar-hover: #94A3B8;

  --shadow-card: 0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04);
  --shadow-card-md: 0 4px 12px 0 rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04);
  --shadow-card-lg: 0 8px 24px 0 rgba(0,0,0,0.1), 0 4px 8px -4px rgba(0,0,0,0.06);
  --shadow-sidebar: 2px 0 16px 0 rgba(0,0,0,0.06);
}
```

**REVISED tailwind.config.js colors:**

```javascript
colors: {
  primary: 'rgb(var(--color-primary) / <alpha-value>)',
  primaryDark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
  primaryLight: 'rgb(var(--color-primary-light) / <alpha-value>)',
  accent: 'rgb(var(--color-accent) / <alpha-value>)',
  accentDark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
  accentLight: 'rgb(var(--color-accent-light) / <alpha-value>)',
  gold: 'rgb(var(--color-gold) / <alpha-value>)',
  goldLight: 'rgb(var(--color-gold-light) / <alpha-value>)',
  text: 'rgb(var(--color-text) / <alpha-value>)',
  muted: 'rgb(var(--color-muted) / <alpha-value>)',
  subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
  background: 'rgb(var(--color-background) / <alpha-value>)',
  surface: 'rgb(var(--color-surface) / <alpha-value>)',
  'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
  border: 'rgb(var(--color-border) / <alpha-value>)',
  borderLight: 'rgb(var(--color-border-light) / <alpha-value>)',
  info: 'rgb(var(--color-info) / <alpha-value>)',
  infoLight: 'rgb(var(--color-info-light) / <alpha-value>)',
  danger: 'rgb(var(--color-danger) / <alpha-value>)',
  dangerLight: 'rgb(var(--color-danger-light) / <alpha-value>)',
  warning: 'rgb(var(--color-warning) / <alpha-value>)',
  warningLight: 'rgb(var(--color-warning-light) / <alpha-value>)',
  success: 'rgb(var(--color-success) / <alpha-value>)',
  successLight: 'rgb(var(--color-success-light) / <alpha-value>)',
},
```

- [ ] **Step 4: Verify build passes with RGB channel format**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run build 2>&1 | head -30
```

Expected: PASS — all `bg-primary/10`, `text-muted/50`, etc. opacity modifiers still work.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: wire Tailwind colors to CSS custom properties with opacity support"
```

---

## Task 4: Set up ThemeProvider in layout.tsx

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add ThemeProvider wrapper**

```tsx
// Add import at top
import { ThemeProvider } from 'next-themes';

// In the return, wrap AuthProvider with ThemeProvider:
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${outfit.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-background text-text">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          themes={['dark', 'light']}
          disableTransitionOnChange={false}
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Key settings:
- `attribute="class"` — adds `class="dark"` or `class="light"` to `<html>`
- `defaultTheme="dark"` — preserves current behavior for existing users
- `suppressHydrationWarning` on `<html>` — required by next-themes to avoid React hydration mismatch warning
- `disableTransitionOnChange={false}` — allow smooth color transitions

- [ ] **Step 2: Verify the app loads with dark theme by default**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run dev
```

Open http://localhost:3000/dashboard — should look identical to before. Inspect `<html>` element — should have `class="dark ..."`.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add ThemeProvider with dark default for dark/light mode"
```

---

## Task 5: Replace hardcoded colors in Layout.tsx

**Files:**
- Modify: `components/Layout.tsx`

- [ ] **Step 1: Replace sidebar gradient**

```tsx
// Before (line ~106):
style={{ background: 'linear-gradient(180deg, #0D1420 0%, #0A0C10 35%)' }}

// After:
style={{ background: 'linear-gradient(180deg, var(--color-sidebar-from) 0%, var(--color-sidebar-to) 35%)' }}
```

- [ ] **Step 2: Replace header background**

```tsx
// Before (line ~237):
style={{ background: 'rgba(10, 12, 16, 0.92)' }}

// After:
style={{ background: 'var(--color-header-bg)' }}
```

- [ ] **Step 3: Replace nav-active shadow**

```tsx
// Before (line ~167):
'shadow-[inset_3px_0_0_#00C896]'

// After — use Tailwind's shadow-nav-active which is already defined with var(--color-primary):
'shadow-nav-active'
```

- [ ] **Step 4: Verify sidebar renders correctly**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run dev
```

Navigate to dashboard. Sidebar gradient, header, and active nav indicator should look identical.

- [ ] **Step 5: Commit**

```bash
git add components/Layout.tsx
git commit -m "feat: replace hardcoded hex colors in Layout with CSS variables"
```

---

## Task 6: Add theme toggle to settings page

**Files:**
- Modify: `app/dashboard/settings/page.tsx`

- [ ] **Step 1: Add imports and hook at top of component**

```tsx
// Add import at top of file
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';

// Inside the component function, add:
const { theme, setTheme } = useTheme();
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
```

The `mounted` state prevents hydration mismatch — `useTheme()` returns undefined on the server.

- [ ] **Step 2: Add "Apariencia" section after the profile section**

Insert this JSX block after the profile card and before the password section:

```tsx
{/* Apariencia */}
<div className="card">
  <h2 className="mb-4 text-lg font-semibold text-text" style={{ fontFamily: 'var(--font-outfit)' }}>
    Apariencia
  </h2>
  <p className="mb-4 text-sm text-muted">
    Elige el tema visual de la aplicación
  </p>
  {mounted ? (
    <div className="grid grid-cols-3 gap-3">
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
          theme === 'dark'
            ? 'border-primary bg-primary/8 text-primary'
            : 'border-border bg-surface text-muted hover:border-primary/30 hover:text-text'
        }`}
      >
        <Moon className="h-5 w-5" />
        <span className="text-sm font-medium">Oscuro</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
          theme === 'light'
            ? 'border-primary bg-primary/8 text-primary'
            : 'border-border bg-surface text-muted hover:border-primary/30 hover:text-text'
        }`}
      >
        <Sun className="h-5 w-5" />
        <span className="text-sm font-medium">Claro</span>
      </button>
      <button
        type="button"
        onClick={() => setTheme('system')}
        className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
          theme === 'system'
            ? 'border-primary bg-primary/8 text-primary'
            : 'border-border bg-surface text-muted hover:border-primary/30 hover:text-text'
        }`}
      >
        <Monitor className="h-5 w-5" />
        <span className="text-sm font-medium">Sistema</span>
      </button>
    </div>
  ) : (
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify the toggle works**

```bash
cd /Users/crismiddleton/Documents/tordo/frontend && npm run dev
```

1. Navigate to `/dashboard/settings`
2. Click "Claro" — entire dashboard should switch to light palette
3. Click "Oscuro" — should switch back to dark
4. Click "Sistema" — should follow OS preference
5. Refresh page — selected theme should persist

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/settings/page.tsx
git commit -m "feat: add theme toggle (dark/light/system) to settings page"
```

---

## Task 7: Add smooth theme transition

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add color transition to body**

In the `@layer base` section, update the `body` rule:

```css
body {
  @apply bg-background text-text antialiased;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  transition: background-color 0.3s ease, color 0.3s ease;
}
```

- [ ] **Step 2: Add transition to cards, inputs, and sidebar**

Add a single global transition rule in `@layer base`:

```css
.card, .card-sm, .card-hover, .card-accent, .kpi-card,
.input-field, .btn-primary, .btn-secondary, .btn-ghost, .btn-accent,
.badge, .badge-primary, .badge-accent, .badge-warning, .badge-danger, .badge-pro,
.nav-item, .nav-item-active {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
```

- [ ] **Step 3: Verify transitions are smooth**

Toggle between dark and light in settings — colors should animate smoothly without flashing.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat: add smooth color transitions for theme switching"
```

---

## Task 8: Final QA pass — visual audit of all dashboard pages

This is a manual verification task. No code changes expected unless issues are found.

- [ ] **Step 1: Check each page in light mode**

Navigate to each of these routes and verify no broken colors, invisible text, or unreadable elements:

| Page | URL | Watch for |
|------|-----|-----------|
| Dashboard | `/dashboard` | KPI cards, charts, collection badges |
| Licitaciones | `/dashboard/tenders` | Card accent lines, estado badges, monto text |
| Ordenes | `/dashboard/orders` | Same card format as licitaciones |
| Postulaciones | `/dashboard/postulaciones` | Status chips, progress bars |
| Documentos | `/dashboard/documentos` | Upload zone, file cards, estado hábil badge |
| BI | `/dashboard/bi` | Charts (Recharts), data cards |
| Alertas | `/dashboard/alerts` | Alert severity rows, preference toggles |
| Settings | `/dashboard/settings` | Theme toggle active state, form inputs |
| Billing | `/dashboard/billing` | Plan cards, CTA buttons |

- [ ] **Step 2: Check dark mode still works**

Switch back to dark — everything should look exactly as it did before this feature.

- [ ] **Step 3: Check system preference**

Set theme to "Sistema", then toggle OS dark/light mode — app should follow.

- [ ] **Step 4: Fix any issues found**

Common issues to watch for:
- Text that disappears (same color as background)
- Borders that become invisible
- Shadows that are too dark/light
- Charts or SVGs with hardcoded colors

- [ ] **Step 5: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: visual polish for light/dark theme across all dashboard pages"
```

---

## Scope Exclusions

- **Landing page (`app/page.tsx`)**: Keeps its bespoke light marketing design. It is not part of the dashboard theme system. No changes needed.
- **Auth pages (`login`, `register`)**: Brief interaction pages. Keep current dark aesthetic. Not worth theme-switching complexity.
- **Recharts**: Chart colors may need manual attention if they use hardcoded hex. This is noted in Task 8 QA but not pre-solved — fix only if broken.
- **Onboarding page**: Same as auth pages — keep current design.
