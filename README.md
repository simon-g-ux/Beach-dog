# Beach Dog 🐕

A playful one-pager that tells you whether to take the dog to Cromer beach.
It blends weather, temperature, wind, tide and an estimated busyness
heuristic into a single **walk score out of 100** with a friendly verdict.

No build step, no backend, no API keys — everything is fetched client-side
from [Open-Meteo](https://open-meteo.com) (free, keyless).

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages

1. Push this repo to GitHub.
2. Repo → **Settings → Pages**.
3. **Source**: `Deploy from a branch` → pick `main` (or whichever branch)
   and `/ (root)`.
4. Save. Your app will be live at `https://<user>.github.io/<repo>/`.

## What each factor means

| Factor | Source | Notes |
| --- | --- | --- |
| Weather | Open-Meteo forecast (current + next-hour rain probability) | WMO weather codes mapped to labels/emoji. |
| Temperature | Open-Meteo forecast | Shows current °C and "feels like". |
| Wind | Open-Meteo forecast | Speed in mph, direction as compass, plus gusts. |
| Tide | Open-Meteo Marine (`sea_level_height_msl`) | Derives rising/falling + next high/low from the hourly series. |
| Busyness | Heuristic | Day-of-week, time-of-day, weather, temperature, rough school-holiday calendar. **Not a real crowd measurement.** |

## Roadmap

- [ ] Animated dog character (idle, walking, zoomies) reacting to the verdict.
- [ ] Better busyness signal (Google Places Popular Times or scraped source).
- [ ] Tide-exposed-sand timeline ("best window: 14:00–17:00").
- [ ] PWA / installable on phone.
- [ ] Configurable location (so the app works for other beaches).
