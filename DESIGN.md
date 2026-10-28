# Educata design

Source: https://educataghana.com/ and its Elementor stylesheets, fetched 14 October 2026. The values live as CSS variables in `assets/brand.css`, which `index.html`, `admin.html` and `door.html` link.

## Colours
| Token | Hex | Evidence (stylesheet and rule) |
| --- | --- | --- |
| `--orange` | `#EC8223` | Most used brand colour (33 rules). `post-2676.css`: `.elementor-element-7d14d36 .elementor-heading-title{font-family:"Montserrat Alternates";font-weight:800;color:#EC8223}`, countdown digits `.eael-countdown-digits{color:#EC8223}`, divider `--divider-color:#EC8223` |
| `--black` | `#000000` | `post-2676.css`: heading text stroke `-webkit-text-stroke-color:#000`, box shadows `#000000` |
| `--text` | `#2A2A2A` | `post-5348.css` (header): `.elementskit-navbar-nav > li > a:hover{color:#2A2A2A}`; `post-2676.css`: `.eael-countdown-label{color:#2A2A2A}` |
| `--muted` | `#595959` | `post-2676.css`: `.elementor-element-a84b494 .elementor-heading-title{font-family:"Montserrat Alternates";font-weight:700;color:#595959}` |
| `--grey-300` | `#DBDBDB` | `post-2676.css`: `.elementor-element-f1e180d > .elementor-element-populated{border-color:#DBDBDB}` |
| `--page` | `#F2F2F2` | Derived light grey for page backgrounds. Not on the site. |
| `--ok`, `--bad` | `#1F7A4D`, `#B3261E` | Status green and red for checked in, errors, Remove. Not brand colours. |

Not used: the site's Elementor "global" colours (`post-3804.css`: `--e-global-color-primary:#6EC1E4`, `--e-global-color-accent:#61CE70` and so on) are Elementor's untouched defaults, not the brand. `#F47828` (5 uses) and `#FF5E13` (5 uses) are one-off oranges; `#EC8223` is the consistent one.

## Fonts
| Use | Family | Weight | Evidence |
| --- | --- | --- | --- |
| Headings | Montserrat (regular, not Alternates) | 800 | The site uses Montserrat Alternates for headings (55 rules, for example `post-2676.css` `.elementor-element-d16952a .elementor-heading-title{font-family:"Montserrat Alternates";font-weight:800}`), but its stylistic glyphs read oddly in names and group titles, so by decision of 14 October 2026 all headings here use regular Montserrat 800. |
| Body | Montserrat | 500 (variable file covers 400 to 800) | `post-2676.css` `.elementor-element-66aa5d6{font-family:"Montserrat";font-weight:500;line-height:31px}`; site kit `post-3804.css` `.elementor-kit-3804{font-family:"Montserrat"}` |

Montserrat is under the SIL Open Font License 1.1, so self-hosting is allowed. One file in `assets/fonts/` (latin subset, woff2, from Google Fonts, weights 400 to 800): `montserrat-latin-var.woff2` (preloaded), with its licence text `OFL-Montserrat.txt`.

Reference codes (EDU26-XXXXXX) use a plain system monospace stack (`--font-mono`) with letter spacing `--ref-spacing` (.08em) on every page and in the saved ticket image. `font-display:swap`, so text shows at once in a system font.

## Logos
- `assets/educata-logo-light.png` (white, for black backgrounds, scaled from 2560 to 600 wide): https://educataghana.com/wp-content/uploads/2024/04/Educata-Ghana-logo-04-scaled-e1777457868395.png

## Invite page hero
- The official banner artwork `assets/banner-source.jpg` (1000 x 400, navy background, white title "CONTENT CREATORS CONTEST") is the page's h1 in a frame with 16 px corners and a 3 px orange bottom border, at most 1000 px wide.
- `--navy` `#0A2232` is taken from the banner's background (not from educataghana.com). The hero is a gradient from navy to black so the banner edge blends in. White (16.3), light grey `#DBDBDB` (11.8) and orange (6.0) text pass on navy; the `@pair` lines in brand.css declare them.
- Paint order: the h1 has a navy background and the img has width and height attributes, so its space is reserved and navy at once; the image is preloaded and nothing moves when it arrives (the browser tests prove it with a delayed image).
- Proof: the browser tests hide each hero text line, read every real pixel behind it at 390 and 1280 px, and require 4.5 contrast against the text colour (white, or orange for "educataGhana 2026").

## Email banner background
- `assets/hero-bg.svg` (about 3 KB), used only by `functions/assets/banner-source.html` for the email banner: abstract artwork in brand colours only (orange `#EC8223` streaks and arcs, grey `#595959` arcs and dot grid, faint `#DBDBDB` streaks, black base). No text, no animation, no outside references, `aria-hidden`. A black radial shade in the middle keeps the area behind the text dark.

## Rules
- Orange is never text on white or grey (contrast about 2.7). Orange text only on black. Orange buttons have black text (contrast 7.8; white would be 2.7).
- Body text contrast at least 4.5, large text and buttons at least 3. `test/design.test.mjs` checks every `@pair` in `brand.css`; the browser tests measure every visible text on the index, door and admin pages.
- The confirmation email (`functions/compose.js`) uses the same colours as fixed hex values (email clients do not support CSS variables): black band, orange rule, dotted dividers and card accent, grey panels, orange map button with black text. Fonts there are email-safe (Arial or Helvetica bold headings, Arial body, Courier New for the reference), not the web fonts. The banner image (`functions/assets/email-header.jpg`, from `banner-source.html`) carries the real Montserrat lettering, the hero artwork and the logo; the orange date cell and the number circles are orange with black text; the footer is black with white text.
