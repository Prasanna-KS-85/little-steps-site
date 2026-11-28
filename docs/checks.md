# Checks (27 November 2026, re-run after the poster, Privacy and owner fixes)

Run against `python3 -m http.server 8765 --bind 127.0.0.1`, using headless Google Chrome driven by
`tools/shoot.mjs` (DevTools protocol, a throwaway profile, cache disabled).

## Screenshots (full page)

- `docs/screens/home-390.png`, `home-768.png`, `home-1440.png`
- `docs/screens/404-390.png`, `404-1440.png`
- Hero only, as a visitor sees it 3 s after load (`--hero`): `hero-390.png` (the film playing),
  `hero-1440.png` (the poster; the film starts once you scroll it into view), and
  `hero-reduced-390.png`, `hero-reduced-1440.png` (reduced motion: the poster, nothing plays)

The hero posters are frame 66 of the film, after all three words of "Small steps count." have landed
(frame 60) and before the wave (70). The half-drawn "Small" in the first screenshots was the video's
own frame 0, because the screenshot script used to rewind the videos; it no longer does.

Live mode was checked in the first run (`download: 'live'` for one run, then restored), which showed
the "Download for Mac" link. The Privacy section is no longer in any shipped file: the served
`index.html` contains no "tracking" text (`docs/privacy-section.html` holds it).

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
- Hero film: `hero-16x9.mp4` 1920x1080, 1.41 MB; `hero-4x5.mp4` 1080x1350, 1.48 MB (H.264, no audio,
  32.3 s, 970 frames). Only one of them loads, picked by width. The Video column in the table above
  is from before this swap and was not re-measured; see "Final hero film" below.
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

## Wording and Privacy pass (28 November 2026)

- Served with `python3 -m http.server 8765 --bind 127.0.0.1`, headless Chrome via `tools/shoot.mjs`.
- Requests at 390, 768 and 1440 px: every request to `127.0.0.1:8765` (the page's own origin), none
  external (the only non-http entries are inline `data:` icons from the video controls).
- `python3 tools/contrast.py`: all pairs pass.
- "tracking" appears once in `index.html`, in the Privacy heading. The footer has no such text.
- Section crops: `home-install-{390,1440}.png`, `home-privacy-{390,1440}.png`, `home-footer-{390,1440}.png`
  (`--sections=install,privacy,footer`).
- Not checked: the Open Graph tags were not fetched from the live site, and the Feedback link was not
  clicked (no external requests).

## Privacy moved into the FAQ (28 November 2026)

- The standalone Privacy section, its styles (`.privacy-card`, `.section--follow`) and its comment are
  gone from the page. No `#privacy` link existed. The statement is now the second FAQ entry.
- Requests at 390, 768 and 1440 px (local server, headless Chrome): all to the page's own origin.
- `python3 tools/contrast.py`: all pairs pass.
- "tracking" appears once in `index.html`, inside that FAQ answer. Not found in CSS, JS or `404.html`.
- Screenshots: `docs/screens/home-faq-{390,1440}.png` (`--sections=faq`). The earlier
  `home-privacy-*.png` crops were removed because that section no longer exists.

## Final hero film, v4 loops (28 November 2026)

The hero is now the final render from `little-steps-launch/renders/site-v4/` (copied, not re-encoded;
that folder was only read). `tools/build_assets.py` copies the same files and builds the posters and
`og-image.jpg` from `poster-*.png`.

- Weights (limit 1.5 MB = 1,500,000 bytes, checked after copying): `hero-16x9.mp4` 1,409,732 bytes
  (1.41 MB), `hero-4x5.mp4` 1,477,810 bytes (1.48 MB). Both pass. Both are byte-identical to the source.
- `ffprobe`: H.264, 970 frames, 30 fps, 32.33 s, no audio stream (16:9 is 1920x1080, 4:5 is 1080x1350).
  In Chrome `webkitAudioDecodedByteCount` is 0.
- Posters: `hero-poster-16x9.webp` (1280x720, 72 KB), `hero-poster-4x5.webp` (720x900, 53 KB), from the
  v4 poster frame (frame 100: "64 to do. Your list grows. Your day shrinks. Start small."). The
  site uses WebP, so the supplied `.jpg`/`.png` posters are not copied into it. `og-image.jpg` is
  rebuilt from the 16:9 poster (1200x630, 123 KB).
- Removed: the old v2 hero loops and posters (replaced in place, same file names), the "Turn sound
  on" button (the loops have no audio), and the `controls` attribute (the script removed it anyway;
  the video is invisible without JavaScript). The Play/Pause button stays (WCAG 2.2.2).
- Text: caption "32 seconds" (was 39), the hidden film description and the poster alt text now match
  the new film.
- `node --experimental-websocket tools/film-check.mjs http://127.0.0.1:8765/ docs/screens`, headless
  Chrome, a local server that supports HTTP Range requests (Python's `http.server` does not, and
  then seeking in a video fails), at 1440, 768 and 390 px:
  - Requests (on load and after scrolling to the film): all to `127.0.0.1:8765`, zero third-party.
    The 390 px load makes 18 requests, 768 px 17, 1440 px 19; the video is one of them. The only
    non-http entries are inline `data:` icons from the companion clips' controls.
  - Console: no errors, no failed requests, no exceptions at any width.
  - Attributes at run time: muted, loop, playsinline, `controls` false, plays by itself once the film
    is on screen, the right file per width (16:9 at 768 and 1440, 4:5 at 390).
  - Reduced motion: no hero video requested, the video stays paused at 0 s, the poster is shown.
  - JavaScript off: the poster loads (right shape per width) and the video is at opacity 0.
  - Loop: playing from 0.3 s before the end, the clip wraps from 32.29 s to the start by itself, keeps
    playing, and never fires `ended`. The last frame is the "Little Steps / Free for Mac." lockup and
    frame 0 is the "6 to do" card, so the restart is a hard cut, not a crossfade (seen in frames 940,
    969 and 0 pulled with `ffmpeg`).
  - Screenshots, film frame only: `docs/screens/film-{1440,768,390}-poster.png` (reduced motion,
    nothing playing), `-mid.png` (playing, paused at 16 s), `-nojs.png` (JavaScript off).
- Not run: Safari or Firefox, a real phone, the full-page screenshots and page-weight table above, and the
  live host (Range requests were checked only against the local test server).
- **The film now shows "No account. No tracking." on screen** (about 28 s into the loop, 4:5 and 16:9).
  `docs/site-open-items.md` says the privacy claim waits for a longer check and the FAQ answer is
  deliberately narrower. Decide before this ships; see the PR.
