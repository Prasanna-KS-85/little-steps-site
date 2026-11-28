# Open items

Things the page does not claim because they are not verified yet, plus decisions that need the owner.
Each one names what would close it.

## Waiting on a check

1. **Privacy section is in the page, with a modest check behind it.** It says only that Little Steps
   makes no network connections of its own, and that I read through the code and watched the app's
   connections for several minutes on macOS 27. Do not widen it (no "never", no audit claims) without a
   longer check. How to take it off or put it back: `docs/privacy-section.html`.
2. **The hero film is cut at 39.1 s, not the full 45.3 s.** From about frame 1176 the v2 film shows the
   same privacy line, and its lockup shows a literal `[site]` placeholder. The loop stops at frame
   1174, the end of the yawn (`HERO_END_FRAME` in `tools/build_assets.py`). To use the full film, the
   network check has to pass and `[site]` has to be replaced in a new render in the launch repo.
3. **The film is a draft render** (`little-steps-launch/renders/drafts/v2/`). When the final render
   exists, point `tools/build_assets.py` at it and run it again. That rebuilds the hero, the three
   companion clips, the posters and the Open Graph image.

## Needs the owner

4. **"Is it free?"** The page says "Yes. Little Steps is a free download." Nothing in the app or its
   docs gives a price; the answer follows from the download being a plain GitHub release link. Please
   confirm, or change the answer in `index.html`.
5. **Release asset name.** Live mode links to
   `https://github.com/Prasanna-KS-85/little-steps-site/releases/latest/download/Little-Steps.dmg`. The
   build makes `Little Steps-1.0.0-arm64.dmg`, so the release asset has to be uploaded (or renamed) as
   `Little-Steps.dmg`, or that link will 404.
6. **Host and site address.** `og:image` is a relative URL (`og-image.jpg`), and most link previews
   need an absolute one, so set it once the domain is known. `404.html` uses root paths (`/assets/…`):
   these work on Vercel or a custom domain, but not on a GitHub Pages project path
   (`prasanna-ks-85.github.io/little-steps-site/`).
7. **Headers at the host.** The page sets a strict Content-Security-Policy in a `<meta>` tag (self
   only). `frame-ancestors` and other headers can only be set by the host; add them when deploying.
8. **No-JS download state.** The download state is applied by `assets/js/main.js`. Without JavaScript
   the buttons stay "Coming soon", even in live mode. If that matters, also change the two
   `data-download` buttons in `index.html` by hand when going live.

## Not verified, so worded carefully or left out

9. **Open Anyway steps on macOS 13 and 14.** The steps (click Done, grey button; Privacy & Security >
   Open Anyway; the "Open "Little Steps"?" dialog > Open Anyway, middle button; administrator name and
   password or Touch ID) are the order observed on macOS 27. The dialog wording and order on Ventura
   and Sonoma were not checked and may differ.
10. **Updating.** The page says "macOS may ask you to allow the new copy once." It is not tested
    whether a replaced, newly downloaded copy brings the Gatekeeper prompt back. That a replaced app
    keeps the data is verified: the data is in `userData`, outside the app bundle.
11. **The preferences file** `~/Library/Preferences/io.github.prasanna-ks-85.littlesteps.plist` comes
    from `docs/INSTALL.md` and exists on this Mac. The app's code does not create it by name (Electron
    and macOS write it under the bundle ID), so this is documented and observed, not traced in code.
12. **Download size** "about 119 MB" is the current local build (`out/make/…/Little
    Steps-1.0.0-arm64.dmg`, 119,033,777 bytes). Update it if the release file differs.
13. **The screenshots show a seeded demo session** (the launch repo's capture plan, a fixed date of
    Friday 27 November, made-up history). They are real captures of the packaged app, and the alt
    texts describe what is shown.
14. **The companion clips are not screen recordings.** They are cut from the launch film, which
    replays the app's behaviour data with the app's timing. The page says so under the clips.
15. **The "Windows (later)" answer** comes from the app repo's platform scope (CLAUDE.md, D-030: a
    deferred Windows track, nothing published before testing on real Windows). No date is given.
