# motorsportsinfo.app

A go-to page for motorsport fans to find out when each session runs and what the weather will be, across F1, F2, F3, WEC, Formula E, IndyCar and MotoGP.

## Language

### Calendar

**Series**:
A championship the site covers: F1, F2, F3, WEC, Formula E (FE), IndyCar or MotoGP (the premier class only).
_Avoid_: Category, championship, sport

**Round**:
One scheduled meeting of a single Series at a Circuit, such as the F1 Bahrain Grand Prix or F2 Round 1. Rounds from different Series at the same Circuit on the same dates are still separate Rounds.
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

_Avoid_: Session kind, session name

**Schedule Override**:
A hand-made correction to a Session's time or status. It takes precedence over what the source says, until it is removed.
_Avoid_: Manual fix, patch

**Circuit**:
The venue where a Round takes place. It has a fixed location and time zone.
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
