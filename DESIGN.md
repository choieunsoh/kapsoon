# Design

Dark-first, mobile-only (Samsung S24 Ultra). Single typeface, plain zero, tabular-nums for figures.

## Theme source

Seeded from a design at https://getdesign.md/. Tokens are in `src/app/globals.css @theme`.

## Re-theming

1. Pick a dark design at https://getdesign.md/.
2. Map its background / surface / text / muted / accent onto the existing `--color-*` names.
3. If it specifies a font, use it ONLY if its zero is plain (not slashed/dotted); else keep the
   system sans stack. Update the `next/font` import in `src/app/layout.tsx`.
4. Re-run the gates. (The `design-bridge` subagent can translate a getdesign.md DESIGN.md for you.)
