# motorsportsinfo.app

A go-to page for motorsport fans to find out when each session runs and what the weather will be, across F1, F2, F3, WEC, Formula E, IndyCar and MotoGP, plus F1 Academy, WRC, IMSA and NASCAR.

## Language

### Calendar

**Series**:
A championship the site covers: F1, F2, F3, WEC, Formula E (FE), IndyCar, MotoGP (the premier class only), F1 Academy, WRC, IMSA (the WeatherTech SportsCar Championship only) or NASCAR (the Cup Series only). The header links F1, WEC, IndyCar, MotoGP and NASCAR; the Other Series (F2, F3, FE, F1 Academy, WRC and IMSA) sit in its Other menu.
_Avoid_: Category, championship, sport

**Round**:
One scheduled meeting of a single Series at a Circuit, such as the F1 Bahrain Grand Prix, F2 Round 1 or a WRC rally. Rounds from different Series at the same Circuit on the same dates are still separate Rounds. NASCAR's exhibition races (the Clash, the All-Star Race) are Rounds but are not numbered; the Daytona Duels are qualifying Sessions of the Daytona 500.
_Avoid_: Event, weekend, race, Grand Prix (as a generic term)

**Featured Round**:
The one Round a Series page shows. It is the Round in progress, or else the next upcoming one. A Round stays featured until 2 hours after its final Session ends.
_Avoid_: Current round, next race, upcoming event

**Session**:
A single on-track running period within a Round, with a start and end time, such as FP1, Qualifying, Hyperpole or Race.
_Avoid_: Event, race (unless it is the Race session)

**Session Type**:
The category a Session belongs to within its Series, used for choosing which Sessions to be reminded about. The types are:
- F1: Practice, Sprint Qualifying, Sprint, Qualifying, Race
- F2 and F3: Practice, Qualifying, Sprint Race, Feature Race
- WEC: Practice, Qualifying, Hyperpole, Race
- Formula E: Practice, Qualifying, Race. Each race of a double-header is its own Round.
- IndyCar: Practice (including Final Practice and Warm-up), Qualifying, Race
- MotoGP: Practice (Free Practice 1 and 2, Practice, Warm Up), Qualifying (Q1, Q2), Sprint, Race
- F1 Academy: Practice, Qualifying, Race (Race 1, Race 2…)
- WRC: Shakedown, Stages (one Session per day of special stages, "Day 1 (SS1–SS6)", ending an estimated 75 minutes after its last stage starts), Power Stage
- IMSA: Practice (including Warm-up), Qualifying, Race
- NASCAR: Practice, Qualifying (including the Daytona Duels), Race

_Avoid_: Session kind, session name

**Session Result**:
The finishing order of a finished Session. It is a spoiler, so it never shows in the Session list: a finished Session's RESULTS chip opens a modal that warns first and shows the full classification on request (F1 only, from OpenF1). For other Series, or before OpenF1 has published it, the modal links to the Series' official results page instead.
_Avoid_: Classification, standings, podium (as the general term)

**Telemetry**:
A driver's car data (speed, throttle, brake, gear) and position through a lap, from OpenF1, for a finished F1 Session only. The site compares two drivers' fastest laps, lined up by distance around the Circuit, along with their sector times and lap times. One channel shows at a time (speed, throttle, brake or gear). Drivers are drawn in their team colours unless the viewer picks others, and a comparison can be shared as an image watermarked motorsportsinfo.app. Like the Session Result it is a spoiler, and revealing one reveals the other.
_Avoid_: Data, stats, timing (as the general term)

**Schedule Override**:
A hand-made correction to a Session's time or status. It takes precedence over what the source says, until it is removed.
_Avoid_: Manual fix, patch

**Circuit**:
The venue where a Round takes place. It has a fixed location and time zone. A WRC rally runs on public roads, so its Circuit is its service park.
_Avoid_: Track, venue

**FIA Document**:
An official document the FIA publishes for a Round on fia.com, such as a stewards' decision, a classification, a starting grid or the Race Director's notes. Only F1, F2 and F3 have them. Each is a PDF with a running number within the Round ("Doc 33").
_Avoid_: Bulletin, decision (as the generic term), report

### Time

**Viewer Time**:
A Session's time shown in the time zone the viewer chose, or in their device's time zone if they haven't chosen one.
_Avoid_: Local time

**Track Time**:
A Session's time shown in the Circuit's time zone.
_Avoid_: Local time, circuit time

### Alerts

**Session Reminder**:
A notification sent shortly before a Session the viewer follows begins.
_Avoid_: Alert, notification (as the specific term)

**Schedule Change**:
A Session's start time moves or the Session is cancelled after it was first published.
_Avoid_: Update, delay

**Document Alert**:
A notification sent when the FIA publishes a new FIA Document for a Round of a Series the viewer chose: stewards' documents only, or all of them. Several at once arrive as one summary.
_Avoid_: Document notification, document reminder
