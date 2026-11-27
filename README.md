# Little Steps site

The public landing page for Little Steps, a macOS desktop companion. Plain HTML, CSS and a little
vanilla JS: no framework, no build step, no npm dependencies, and no third-party requests.

## Look at it locally

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/ and stop the server with Ctrl+C when done.

## Switches

`assets/js/config.js` holds everything that changes at launch:

- `download`: `'soon'` (a disabled "Coming soon" button) or `'live'` (links to the latest GitHub
  release, `Little-Steps.dmg`)
- `owner`: the GitHub account in that link

The Privacy section is not in the page. It goes in by hand once the network check has passed: see
`docs/privacy-section.html`.

## Files

| Path                     | What                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `index.html`, `404.html` | The page and the not-found page                                             |
| `assets/css/tokens.css`  | The app's design tokens, copied verbatim                                    |
| `assets/css/site.css`    | The site's styles (token colours only)                                      |
| `assets/fonts/`          | Fraunces and Nunito from the app, with their SIL OFL 1.1 licence texts      |
| `assets/img`, `video`    | Built by `tools/build_assets.py` from the app and launch repos (read-only)  |
| `tools/`                 | Dev-only: asset build, contrast check, screenshot and request audit         |
| `docs/`                  | Open items, checks, screenshots, the unshipped Privacy section             |

## Rebuild the images and videos

```bash
python3 tools/build_assets.py
```

This needs ffmpeg and Pillow. It reads `~/little-steps` and `~/little-steps-launch` and writes only
inside this folder.

## Checks

```bash
python3 tools/contrast.py
```

```bash
node --experimental-websocket tools/shoot.mjs http://127.0.0.1:8765/ docs/screens
```

The second one needs the local server running and Google Chrome installed.
