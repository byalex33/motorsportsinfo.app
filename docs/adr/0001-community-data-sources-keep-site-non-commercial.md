# Community data sources keep the site non-commercial

No official source (FOM/FODM for F1, F2 and F3; Le Mans Endurance Management and Al Kamel for WEC) licenses schedule data for public reuse. Commercial feeds either cost money or don't cover F2, F3 or WEC.

We read schedules from free sources instead:
- **F1:** OpenF1, with Jolpica as fallback. Both are CC BY-NC-SA 4.0.
- **F2 and F3:** the official fiaformula2.com and fiaformula3.com Round pages. Their HTML includes each Session's start and end times, GMT offset and state, so an ordinary page request is enough and no paid scraping service is needed. FODM's terms forbid extracting this data; we accept that risk because these pages show Schedule Changes first. The MIT-licensed sportstimes/f1 dataset is the fallback.
- **WEC:** scraped from fiawec.com race pages, or another source if scraping proves unworkable.
- **Formula E, IndyCar and MotoGP:** the MIT-licensed sportstimes/f1 dataset only (`_db/fe`, `_db/indycar`, `_db/motogp`), with no fallback. It gives UTC start times but no end times, so Session ends are estimated from default Session lengths. Its quirks are handled in the parser: IndyCar has no location or coordinates, so Circuits are matched by Round name; MotoGP's `track` text is often wrong, so Circuits are matched by coordinates and a disagreeing `track` is only logged. If it lags or is wrong, Schedule Overrides correct it.

FIA Documents for F1, F2 and F3 come from the championship pages on fia.com/documents. We show each document's title and publish time. Each document opens on our own viewer page (`/<series>/documents/<doc>`), which draws the FIA's PDF with PDF.js. fia.com serves every PDF as a download, so `/documents/<file>.pdf` fetches it and relays it unchanged with an inline disposition for the viewer: cached at the CDN for an hour, marked `noindex`, never stored or altered, and only from the FIA's decision-document folder. If the relay fails it redirects to fia.com. We have not found a licence for reusing the list or relaying the files; as with the F2, F3 and WEC pages, we accept that risk.

Weather comes from Open-Meteo's free tier, which is also non-commercial.

Rain radar comes from RainViewer's free API, credited on the map. Its terms say "personal and educational use"; RainViewer confirmed by email to the owner in October 2026 that this donation-funded, ad-free site may use it.

The site must stay non-commercial: donations only, no ads, no paid tiers. Credit lines for OpenF1/Jolpica ("Data: OpenF1") and Open-Meteo ("Weather data by Open-Meteo.com") must appear on the page, and FIA Documents are credited "Documents: FIA". Scraping the F2, F3 and WEC sites goes against their terms, and we accept that risk knowingly.

## Consequences

- Adding ads or any paid feature means first replacing these sources:
  - Weather: Open-Meteo's paid tier, or MET Norway.
  - F1: a commercial licence from OpenF1 or Jolpica.
- Our hand-written Schedule Overrides correct the sources when they are wrong or slow.
