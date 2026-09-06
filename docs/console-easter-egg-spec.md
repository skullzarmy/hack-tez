# Hidden dev console — easter egg spec

**Status:** Draft — entry mechanism locked, commands TBD
**Vision:** A Quake/Source-style bottom-third console hidden behind a keyboard shortcut and a footer glyph. Finding it is step one of the egg; the commands are step two.

---

## 1. Entry points

Two parallel doors, same destination. Neither gates the other.

### 1.1 Keyboard: `` ` `` / `~`
- For desktop users who go looking. Match both the unshifted and shifted key code, not just `key === '~'`, since layout/shift-state varies (ISO/international keyboards).
- No visible affordance — this is the "for nerds" path.

### 1.2 Footer glyph
- A real, semantic `<button aria-label="Open developer console">` with a `>_` glyph (or icon), sitting in the footer.
- Activates on standard click / Enter / Space. **No long-press requirement on this path** — a visible control that only responds to a hold breaks its own affordance (looks clickable, isn't) and can be a hard accessibility blocker: switch-access and some AT emit only discrete activation events, with no concept of "hold." Gating the only visible entry behind a timing gesture makes it unreachable for those users, not just harder.
- The "difficulty" lives in **visual** discoverability, not interaction difficulty: keep the glyph small/low-contrast/tucked into the footer so it takes a squint to notice. Mechanically it should always just work on a normal tap/click.
- Optional bonus (not required for v1): long-press on this same glyph could skip the boot/flicker animation and snap straight to an active prompt, as an easter-egg-within-the-easter-egg. Never the only way in.

---

## 2. Focus management

This is the part that breaks most fake consoles, so it's spelled out explicitly:

- **On open**: capture `document.activeElement` *before* moving focus into the console. Move focus to the console's input.
- **Trap focus while open**: Tab/Shift+Tab cycle within the console only. Background page content gets `inert` (or `aria-hidden` + tabindex removal) so screen-reader browse mode can't wander into it either.
- **Esc always closes**, guaranteeing an exit from the trap (avoids the WCAG no-keyboard-trap failure mode).
- **On close** (Esc or a `close`/`exit` command): restore focus to the exact captured element. If that element no longer exists, fall back to a sane landmark — never fall back to `document.body`.

## 3. Semantics & screen reader behavior

- Container: `role="dialog"`, `aria-modal="true"`, labelled by a visually-hidden heading (e.g. "Developer console") so it doesn't read to a screen reader user as a real OS/system terminal.
- Output region: `aria-live="polite"`, updated **only on command submit**, never per keystroke — a live region that announces every character typed is unusable noise.
- Respect `prefers-reduced-motion`: swap the slide-up-from-bottom-third animation for an instant show/hide.
- No AT-detection branching. There's no reliable, privacy-safe way to detect "a screen reader is running," and building hidden behavior on that heuristic will misfire. Instead, make the console good on its own terms for AT users — the live-region announcement on submit *is* the equivalent of the visual type-back effect for sighted users, not a separate hidden mode.

## 4. Visual/interaction shape

- Bottom-third, full-width overlay, Counter-Strike/Half-Life style. Prompt with input, scrollback output above it.
- Command history via Up/Down arrow, persisted in `localStorage` across sessions.
- Contrast must meet WCAG 2.2 AA in both light and dark themes (the site already supports both).

## 5. Commands (v1)

Design principle: lean on real Tezos mechanics for the jokes (Michelson, baking, gas, FAILWITH) rather than generic Linux/hacker-terminal tropes — that's the differentiator from the fafolab.xyz console, which already owns that territory. Where the two sites' egg naturally overlaps (`reggie`, `fafo`), nod at the sister site rather than recreating its bit.

| Command | Output |
|---|---|
| `rm -rf /` | `FAILWITH: "nice try"` — real Tezos Michelson opcode is `FAILWITH`, not `rm`. This isn't Linux, it's a smart contract; contracts don't delete, they abort. |
| `sudo` | `sudo: command not found. This isn't Ubuntu. Try 'bake' instead.` |
| `bake` | `Baking block #.......... 🥖 ...you need a delegate and 6,000 ꜩ minimum. Byte-sized dreams stay byte-sized.` |
| `gas` | `Gas fee: 0.0004ꜩ. Basically a rounding error. You're welcome.` |
| `michelson` | Prints a real, correctly-formed, deadpan-unreadable Michelson snippet (e.g. `{ CDR ; NIL operation ; PAIR }`), no explanation. |
| `xtz` / `price` | Flat ASCII sparkline that never moves. `1 XTZ = 1 XTZ`. Tagline: `fuck the price.` |
| `hen` | `hic et nunc (lat.) "here and now." Also: the marketplace that vanished one Tuesday in 2021 and took a slice of Tezos NFT history with it. o7` |
| `teia` | `The fork that kept going after HEN didn't. Community-owned, still no CEO, still here.` |
| `objkt` | `The one that ate the market. No shade, just receipts.` |
| `gm` | Time-of-day aware: `gm frens` normally, `gn frens` late night, `it's 3am and you're in a fake terminal. gm anyway.` at absurd hours. |
| `fafo` | `fuck around and find out. (a more literal version of this lives at fafolab.xyz)` |
| `reggie` | `Reggie doesn't work here. Try fafolab.xyz.` |
| `strongertogether` | `#StrongerTogether — TheTezosCommunity's town hall for the whole Tezos ecosystem. Volunteer-run. No VC, no gatekeepers, no shortcuts. thetezos.com` |

Explicitly dropped: `aubergine`/`eggplant` — already done on fafolab.xyz, would read as a rerun rather than a nod.

Still open:
- Structural basics (`help`, `clear`, `themes`-equivalent) — port the *mechanism* from fafo's command table, not its joke content.
- Whether `gm`/`xtz` get real live data or stay static text.
- Whether a mini-game slot (fafo has `tez-invaders`) belongs in hack.tez's version.
