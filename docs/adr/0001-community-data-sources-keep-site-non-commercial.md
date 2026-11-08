# Community data sources keep the site non-commercial

No official source (FOM/FODM for F1, F2 and F3; Le Mans Endurance Management and Al Kamel for WEC) licenses schedule data for public reuse. Commercial feeds either cost money or don't cover F2, F3 or WEC.

We read schedules from free sources instead:
- **F1:** OpenF1, with Jolpica as fallback. Both are CC BY-NC-SA 4.0.
- **F2 and F3:** the MIT-licensed sportstimes/f1 dataset (`_db/f2`, `_db/f3`), with no fallback. We used to read the official fiaformula2.com and fiaformula3.com Round pages, which show Schedule Changes first, but [their terms](https://www.fiaformula2.com/en/information/terms-and-conditions.6XzLrOyLLmDREjs3oMriKp) forbid extracting and redistributing their data, so we stopped in November 2026. The dataset gives UTC start times but no end times, so Session ends are estimated, and it can lag behind an official change; Schedule Overrides correct it.
- **WEC:** scraped from fiawec.com race pages, or another source if scraping proves unworkable.
- **Formula E, IndyCar and MotoGP:** the MIT-licensed sportstimes/f1 dataset only (`_db/fe`, `_db/indycar`, `_db/motogp`), with no fallback. It gives UTC start times but no end times, so Session ends are estimated from default Session lengths. Its quirks are handled in the parser: IndyCar has no location or coordinates, so Circuits are matched by Round name; MotoGP's `track` text is often wrong, so Circuits are matched by coordinates and a disagreeing `track` is only logged. If it lags or is wrong, Schedule Overrides correct it. F1 Academy (`_db/f1-academy`) joined later on the same terms; its `location` is sometimes a country, so its slug is matched too.
- **WRC:** wrc.com's content API (the JSON its own pages read), which answers ordinary requests; the HTML pages and anything posing as a browser are refused. Each rally's itinerary is editor-written text ("08:53: SS1 Turquía 1"), so each rally becomes Shakedown, one Session per day of stages and the Power Stage, with day dates taken from weekday names and day ends estimated. A rally's Circuit is its service park, kept by hand; a rally with an unknown service park is flagged and skipped.
- **IMSA:** imsa.com refuses automated requests, but IMSA publishes its calendar through ECAL. ECAL gives a feed address only to a subscriber, so the site's own subscription to the WeatherTech SportsCar Championship calendar is kept in `IMSA_CALENDAR_URL`.
- **NASCAR (Cup Series):** NASCAR's public schedule feed (`cf.nascar.com/cacher/<year>/1/race_list_basic.json`, the Cup Series' own list), which nascar.com itself reads. It lists each Session's UTC start but no end. The older year-level file (`cf.nascar.com/cacher/<year>/race_list_basic.json`) has been served empty, so it is not used.
- **GT World Challenge Europe:** gt-world-challenge-europe.com, SRO's own site, which answers ordinary requests. Its calendar page links each event page, whose timetable gives each Session's local and GMT start but no end, so Session ends are estimated. GTWC America, Asia and Australia, the Intercontinental GT Challenge and British GT run on the same platform if they are wanted later.
- **DTM:** the content API dtm.com's own pages read (`api.dtm.com/data`), which answers ordinary requests: the event list, then each event's timetable with UTC starts and ends. The timetable includes the support races; only entries tagged as DTM are kept.
- **Super GT:** supergt.net's Japanese calendar and race pages, which answer ordinary requests. The timetable is in JST with start and end times; a race listed by laps has no end. The English pages leave the timetable empty, so they are not used.

Session Results (the full classification of a finished Session) come from OpenF1 for F1 only, under the same licence and credit. No free source covers results for the other Series, so their finished Sessions link to the official results pages instead of scraping them.

Telemetry (laps, car data and position) also comes from OpenF1, for finished F1 Sessions only: OpenF1's free tier publishes it after a Session ends, and live data would need its paid tier. Everything is cached on our side (a Session's laps for an hour, a lap's car data for days), so viewers never reach OpenF1's 30 requests a minute directly. Share images of a comparison (`/f1/telemetry/<session>/image`) are drawn from the same cached data, carry "Data: OpenF1", and are cached at the CDN; their Geist font is fetched from Google Fonts when an image is first drawn.

FIA Documents for F1, F2 and F3 come from the championship pages on fia.com/documents. We show each document's title, number and publish time, and link to the FIA's own PDF on fia.com. The PDFs are never fetched, stored, relayed or altered: `/<series>/documents/<round>-<number>` only redirects to the PDF, so the link a visitor sees never spells out a spoiler (the FIA's file names name the cars involved), and `/documents/<file>.pdf`, from older links, redirects the same way. Until November 2026 we relayed the PDFs to show them in a page of our own; we stopped because we have no licence to redistribute them. For Document Alerts the sync keeps each new document's title, number and link in the database for 30 days. We have no licence for the list itself either: we show only the facts a reader needs to find a document (its title, number and time) and send them to fia.com for the document.

Weather comes from Open-Meteo's free tier, which is also non-commercial.

The rain radar shows on F1 pages only. It plays the next two hours from Rainbow.ai's Tiles API (precipitation nowcast), credited on the map and on the About page. Rainbow needs a key and bills per tile, so tiles go through our own relay (`/api/radar/tiles/…`): it only fetches tiles near a Circuit, at the map's zooms and in the forecast window, caches each one so it is fetched once, and counts fetches per month. Past the monthly cap (`RAINBOW_MONTHLY_TILE_CAP`, default 30,000, Rainbow's free tier) the map falls back to RainViewer's free API, which only has the past two hours since RainViewer dropped its forecast frames in January 2026. RainViewer's terms say "personal and educational use"; RainViewer confirmed by email to the owner in October 2026 that this donation-funded, ad-free site may use it.

The site must stay non-commercial: donations only, no ads, no paid tiers. Credit lines for OpenF1/Jolpica ("Data: OpenF1"), Open-Meteo ("Weather data by Open-Meteo.com"), Rainbow.ai ("Forecast radar: Rainbow.ai") and RainViewer ("Radar: RainViewer") must appear on the page, and FIA Documents are credited "Documents: FIA".

## Basis for each source

Licensed for this use: OpenF1 and Jolpica (CC BY-NC-SA 4.0), sportstimes/f1 (MIT), Open-Meteo's free tier (CC BY 4.0, non-commercial), Rainbow.ai (its free tier, by API key) and RainViewer (permission by email, October 2026).

Not licensed: the WEC, WRC, GT World Challenge Europe and Super GT pages, the IMSA, NASCAR and DTM feeds, and the fia.com document lists. We have no licence or written permission from these sites, and fiawec.com's terms, like the F2 and F3 sites', restrict extracting its data. No licensed source covers these Series. We read them on these terms, and drop a source if its owner asks:
- Only Session dates and times (and, for FIA Documents, titles, numbers and publish times): facts a fan needs, never articles, images, results or documents.
- Only what the site publishes to every visitor, with ordinary requests: no login, no paywall, nothing that poses as a browser to get round a refusal (wrc.com refuses those, so we don't send them).
- Rarely: a schedule is read daily, every 2 hours during a Round, 30 minutes before a Session and 10 minutes after a detected change, with retries backing off after a failure; an FIA document list at most every 5 minutes, and only during a Round. What we read is cached on our side, so more visitors never means more requests.
- Credited and linked: each Series page names its source and links to the official site, and to the official results.
- Never for money: the site stays non-commercial, as above.

This is an operating decision, not a legal opinion. It is the risk we accept for these Series until a licensed source exists.

## Consequences

- Adding ads or any paid feature means first replacing these sources:
  - Weather: Open-Meteo's paid tier, or MET Norway.
  - F1: a commercial licence from OpenF1 or Jolpica.
- Our hand-written Schedule Overrides correct the sources when they are wrong or slow, which matters more for F2 and F3 now that they come from the dataset rather than the official pages.
- The code is MIT-licensed (`LICENSE`); that licence covers the code only, not the data the site shows.
