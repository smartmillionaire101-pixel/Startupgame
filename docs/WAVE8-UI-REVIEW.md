# Wave 8 §D: UI review

This review covers every screen, photographed at 390×844 and 1280×800 with a throwaway Playwright script. The script signs up as a guest, goes through onboarding, the city and its HUD, the four tabs, News, the phone home screen and all 17 apps (Bank's Send money too), the sheets (What to do now, People around, Places, the ride chooser), and the scenes for a café, barber, salon, restaurant, gym, the office, the Hub, home, the event hall, a lender and a fund. Each screen was then checked against this list:

- hierarchy
- spacing scale
- type scale
- colour roles and WCAG AA contrast
- touch targets of at least 44 px
- radii and shadows
- motion and reduced motion
- empty, loading and feedback states
- overflow at 390 px
- safe areas

## The kit (what every screen now uses)

**Tokens** (`apps/web/src/styles.css`, `:root`, with dark-mode values):

| Group | Tokens |
| --- | --- |
| Colour roles | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--text`, `--muted`, `--line`, `--line-strong`, `--accent` / `-strong` / `-ink` / `-soft`, `--good`, `--bad`, `--warn` and `--info`, each with a `-soft` tint; `--money` / `--money-soft` for cash readouts; `--inverse`; `--scrim` |
| Spacing | `--sp-1` to `--sp-10`, on a 4 px grid; `--gutter` |
| Type | `--fs-2xs` to `--fs-3xl` (about a 1.2 ratio around 16 px); weights `--fw-*` |
| Radius | `--r-xs`, `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--r-pill` |
| Elevation | `--sh-1` (cards), `--sh-2` (raised), `--sh-3` (sheets and panels) |
| Motion | `--dur-1/2/3`, `--ease-out`, `--ease-spring` |
| Touch | `--tap: 44px` |

**Components** (in `apps/web/src/ui.tsx`):

- `Card`: now takes `sub` and a `bad` tone.
- `Stat` / `StatTile`: an icon, `warn` and `money` tones, and a coloured edge for each tone.
- `Button`: `primary`, `secondary`/`subtle`, `ghost` and `danger`, in sizes `sm` and `lg`. It has a `block` option and a `loading` spinner (`aria-busy`). Every variant sets its own text colour.
- `ListRow`, `Chip`, `EmptyState` and `SectionHeader`.
- `Sheet`: a grab handle, Escape to close, and centred on wide screens.
- `Toasts`: an icon for each tone and a spring entrance.

The same tokens drive `phone.css` (cards, rows, hero, section heads) and `city/scenes.css` (the place tray and What to do now).

## Problems found, and the fix for each

### Across the app

| Problem | Fix |
| --- | --- |
| `.btn-subtle` and `.btn-ghost` took their text colour from the parent. Bank's **Send money** was white on beige, under 1.5:1. Travel's **Book** was grey on beige. | Every variant sets its own ink. Buttons on a coloured hero become glass or white. |
| Reduced-motion selectors `:root[data-reduce-motion]` (phone, tech event) and `:not([data-reduce-motion='false'])` (home) matched even when motion was allowed. The value is `'0'` or `'1'`, so phone and home animations never played. | Changed to `[data-reduce-motion='1']`. |
| Small chips and icon buttons were 30–32 px tall. | Chips are 36 px and icon buttons 36 px, each with an invisible hit area out to 44 px. Buttons, inputs and tabs are 44 px or more. |
| Screen tabs used the accent colour, the same as primary buttons, so there was no hierarchy. The tabs overflowed with no sign that they scroll. | The selected tab is ink on bg. The row fades at its edge and scrolls with the page gutter. |
| Actions at the end of a row (Buy, Pitch, Book, Order, Take shift) were full-size grey blocks that made the rows taller and drowned the content. | Compact 38 px buttons (the hit area is still 44 px), applied to all row patterns. |
| Search inputs (`type=search`, in Chop) were unstyled. | All text inputs share one style, with a focus ring. |
| Empty states were grey sentences. | `.empty` is a dashed, centred box. Whole-screen empties (Messages, News, the inbox) use `EmptyState` with an icon. |
| Loading was the text "Loading Runway…" with nothing else. | The logo, a spinner and the text. There is also a `.skeleton` shimmer class for content still loading. |
| Toasts were a plain bar. | An icon for each tone and a spring entrance. They still sit above the bottom bar. |
| On wide screens the column stayed 560 px, with stat tiles in two rows. | At 900 px and wider the column is 760 px and the stat tiles sit in one row. Sign-in and onboarding keep a 520 px focused column. |

### Sign-in

| Problem | Fix |
| --- | --- |
| A plain title on a blank page, with no sense of a game. | A title card: the night city as a gradient with a skyline of lit windows, the logo and a large headline. The 18+ box and Play now come right after it. |

### Onboarding

| Problem | Fix |
| --- | --- |
| The role cards were text only. | Each has a picture tile (🚀 📈 🏦). The choice cards have a selected ring, press feedback and a 56 px minimum height. |

### HUD (top bar and bottom bar)

| Problem | Fix |
| --- | --- |
| Cash was a beige pill like any other. Hours were small grey text. | Cash is a green money pill with a wallet icon on screens 440 px and wider. It pops when money comes in and dips when it goes out (Web Animations, skipped with reduced motion). The hours have a clock icon. |
| The date pill pushed the city name to "L…" at 390 px. | The date is plain text again. The icons hide below 440 px, so the line still fits at 360 px (`ui.spec`). |
| The bottom-bar tabs showed the current tab only by colour. | The current tab has a soft pill behind its icon and a press scale. The badge has a ring. |

### Today

| Problem | Fix |
| --- | --- |
| Stat tiles had no icons, and "Pre-revenue" wrapped onto two lines. | An icon on each tile. Long values use a smaller size. |
| The What to do now items were flat beige with the same weight as everything else. | White cards. The first suggestion is tinted as the lead action. The arrow is a round button. |
| The inbox was paragraphs, with a "Month 0 ›" line. | List rows: an emoji tile, up to three lines of text, the month, and an unread dot. Read items are muted. **Mark read** is a small ghost button. |

### Me

| Problem | Fix |
| --- | --- |
| "Name · @handle" wrapped in a card title. A loose "New" floated without context. | A profile header: your avatar in a ring, your name, @handle, and pills for role and background. Below it, two tiles for Stars and Network, then Energy. |
| Skills were a long single column. | A two-column grid, half the height. |
| The leaderboards were plain `ol` text. | Ranked rows with numbered badges (gold for first) and right-aligned values. |

### Company and Money

| Problem | Fix |
| --- | --- |
| No dedicated problem: these screens were mostly a matter of the kit. | They pick up the new cards, stats, tabs and compact row buttons. Money's first screen stays under 1.6 viewports (`ui.spec`). |

### Places (scene and tray)

| Problem | Fix |
| --- | --- |
| "In your pocket: ₦…" was small grey print. | A money chip. The flat's comfort uses a neutral chip. |
| All tray cards looked the same. Labels wrapped to three lines next to big emoji. | The first card leads, tinted like a primary action. Icons sit in 34 px tiles. Labels clamp at three lines. Cards have a hover border and a press scale. |
| On desktop the scene was an unframed strip over the map. | It has a sheet shadow and side borders. The tray has a grab line and larger radii. |
| "‹ Back to the room" was a tiny tap target. | 44 px. |

### Phone

| Problem | Fix |
| --- | --- |
| The Bank hero's **Send money** was unreadable. | Now a glass button. |
| Heroes were flat. | A soft corner light and display-font numbers. |
| No dedicated problem in the other apps (rows, cards, empty states). | Rows get tokens, `--sh-1` and hover and press states. Section heads match `.section-h`. Empty states have a round icon tile. |
| Travel showed departure times like `-1:-30` and flight numbers like `HM -447`, because a signed `>>` shift was applied to an unsigned hash. | Fixed with `>>>`. |
| Events showed the event kind as a chip that looked tappable. | It is a label (pill) now. |

### Sheets

| Problem | Fix |
| --- | --- |
| No affordance, and no keyboard close. | A grab handle, Escape closes, a fade-in scrim and a larger top radius. On wide screens the sheet is a centred dialog. |

## Checked and left alone

- The city map and its labels. Another agent owns the map in this wave.
- The art of the home scene, the airport and the flight.
- The HUD overlays on the map. They were already consistent, and the What to do now sheet picks up the kit.

## Screenshots

Before and after sets (390 px in `m/`, 1280 px in `d/`) are in `/home/user/wave8-ui-shots/before` and `/home/user/wave8-ui-shots/after`.
