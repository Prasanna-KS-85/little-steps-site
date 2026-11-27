# Checks (27 November 2026)

Run against `python3 -m http.server 8765 --bind 127.0.0.1`, using headless Google Chrome driven by
`tools/shoot.mjs` (DevTools protocol, a throwaway profile, cache disabled).

## Screenshots (full page)

- `docs/screens/home-390.png`, `home-768.png`, `home-1440.png`
- `docs/screens/404-390.png`, `404-1440.png`

The checks also covered reduced motion, the 404 page and live mode with Privacy on (screenshots in
the session scratchpad, not committed). For live mode, `config.js` was switched to `download: 'live'`
and `privacy: true` for one run and then restored. That run showed the "Download for Mac" link and the
Privacy section.

## Every URL the page loads

At 390, 768 and 1440 px, after scrolling to the bottom so that every lazy image and video loads, the
union of all requests is below. **Every request goes to the page's own origin: zero third-party
hosts.**

```
/                                       /assets/img/companion-idle-poster.webp
/assets/css/site.css                    /assets/img/hero-poster-16x9.webp
/assets/css/tokens.css                  /assets/img/hero-poster-4x5.webp
/assets/fonts/Fraunces-Latin.woff2      /assets/img/history-after-400.webp
/assets/fonts/Nunito-Latin.woff2        /assets/img/step-journey-560.webp
/assets/icons/favicon-32.png            /assets/img/step-plan-560.webp
/assets/img/app-icon-96.webp            /assets/img/step-tick-560.webp
/assets/img/companion-butterfly-poster.webp   /assets/js/config.js
/assets/img/companion-doze-poster.webp        /assets/js/main.js
/assets/video/companion-butterfly.mp4   /assets/video/hero-16x9.mp4
/assets/video/companion-doze.mp4        /assets/video/hero-4x5.mp4
/assets/video/companion-idle.mp4
```

Chrome also reports three `data:image/svg+xml` entries. These are its built-in media-control icons
(the `controls` attribute is in the HTML for the no-JS case, and the script removes it), not network
requests. The `<meta>` Content-Security-Policy (`default-src 'self'`, `connect-src 'none'`) would block
any other origin anyway. The page sets no cookies and uses no storage or analytics.

With `prefers-reduced-motion: reduce`, **no video is requested at all** (390 and 1440 px). The
posters stay, and each video has a Play button.

## Page weight

File sizes of what is requested (KB, 1 KB = 1024 bytes). "Load" is before any scrolling, in a
900 px tall window; "scrolled" is after scrolling to the bottom.

| Width        | HTML | CSS  | JS  | Fonts | Images | Video  | Total    |
| ------------ | ---- | ---- | --- | ----- | ------ | ------ | -------- |
| 390 load     | 19.7 | 18.7 | 4.7 | 71.0  | 72.6   | 1119.5 | 1306     |
| 390 scrolled | 19.7 | 18.7 | 4.7 | 71.0  | 103.2  | 1183.5 | 1401     |
| 768 load     | 19.7 | 18.7 | 4.7 | 71.0  | 89.5   | 1307.5 | 1511     |
| 768 scrolled | 19.7 | 18.7 | 4.7 | 71.0  | 107.6  | 1371.5 | 1593     |
| 1440 load    | 19.7 | 18.7 | 4.7 | 71.0  | 89.5   | 0      | **204**  |
| 1440 scrolled| 19.7 | 18.7 | 4.7 | 71.0  | 107.6  | 1371.5 | 1593     |

- Each video has `preload="none"` and starts only when at least 35% of it is on screen (and the reader
  has not asked for reduced motion). At 1440 px the film sits just below that line, so the first load is
  204 KB. On phones and tablets the film is already on screen at load, so it starts right away.
- Hero film: `hero-16x9.mp4` 1280x720, 1.28 MB; `hero-4x5.mp4` 720x900, 1.09 MB (H.264, AAC
  96 kbit/s, 39.1 s). Only one of them loads, picked by width.
- Companion clips: idle 15 KB, butterfly 31 KB, doze 18 KB (480x480, no audio).
- The clip posters (about 9 KB each) load at page load, because `poster` is not lazy.
- Not requested by the page itself: `og-image.jpg` (52 KB, for link previews), the 2x image variants
  (used on high-density screens), the 180/192/512 icons.

## Contrast

`python3 tools/contrast.py` checks every text and UI colour pair against the app's tokens. All pass.
The lowest text pair is Text Brown on Pale Sage at 4.82:1; the lowest UI pair is the focus ring on Pale
Sage at 4.95:1.

## Accessibility notes

- Landmarks: skip link, `header`, `nav`, `main`, `footer`; one `h1`, with `h2` per section.
- Alt text on every screenshot describes what it shows. Videos have labels, and the hero film has a
  text description.
- Focus is visible everywhere (Forest Green, 2 px, offset 2 px, as in the app).
- Motion: nothing plays under reduced motion. Every moving video has a Pause button (WCAG 2.2.2), and
  sound is off until the reader turns it on.
