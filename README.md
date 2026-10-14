# UF Reservation Autofill

A Chrome extension that fills University of Florida room reservation (EMS Cloud) and
GatorConnect event permit forms from data you keep in a Google Sheet, so you stop retyping the same
organization details on every request.

It **never submits a form.** It fills, flags anything uncertain, and leaves the rest to you.

## How it works

1. Once, on the extension's options page: paste your organization details, and paste the
   **header row** of your events sheet (click row 1's number in Google Sheets, copy). Each
   column is mapped to a canonical field (`eventName`, `attendance`, `advisorEmail`, …) using
   a synonym vocabulary covering the wordings both UF forms use. Tracking columns
   (*submitted*, *approved*, *notes*, *price*, *paid?*, *priority*) and a bare *Name* start
   switched off so they never reach a form; tick or untick any column there.
2. Each time: copy the event's row in Google Sheets, open the reservation or permit form,
   click the extension, paste the row, press **Fill Form**. The pasted row is remembered, so
   it is still there on the next page of the EMS wizard. Paste several rows to pick between
   them, or paste the header row together with the event row if you skipped step 1.
3. The content script reads every visible, enabled, empty control on the page, works out its
   label, and scores that label against your imported columns.

Each field lands in one of four buckets:

| Outcome | When | What you see |
| --- | --- | --- |
| Filled | Confident match (score ≥ 0.85) | Value written in |
| Review | Loose or ambiguous match | Value written in, orange outline, hover for the source column |
| Already set | Field was not empty | Left untouched |
| Left blank | No match above 0.55 | Untouched |

### Why it doesn't guess

Labels like *Faculty Advisor Email*, *Emergency Contact Email* and *Alternate Location* look
close to *Contact Email* and *Location* under plain text similarity. The matcher carries a list
of qualifier words (`advisor`, `emergency`, `alternate`, `rain`, `setup`, `confirm`, …); when a
page label carries one the matched column doesn't, the score is cut hard. Those fields come out
blank rather than confidently wrong — which is the failure mode that matters on a form you sign.

## Sheet format

**Organization details** — permanent info. Keep it in `data/org.csv` (gitignored; copy
`data/org.example.csv`), or paste it on the settings page. Either two columns or a header row plus one data row:

```csv
Field,Value
Organization Name,Citrus Growers Club
Contact Email,you@ufl.edu
Phone Number,352-555-0142
Faculty Advisor,Dr. Elena Reyes
Faculty Advisor Email,reyes@ufl.edu
```

**Events** — your events sheet as-is. A header row, one row per event:

```
Event name	Estimated attendance	Reservation date and time (e.g. 09/16/2024, 6:00pm - 8:00pm)	Room preference	Preferred room setup
Grove Day Social	75	09/12/2026, 3:00pm - 5:00pm	Reitz Union 2365	Banquet
```

A cell like `09/12/2026, 3:00pm - 5:00pm` is split into a date, a start time and an end time.

**GatorConnect event permits.** The extension recognises gatorconnect.ufl.edu by itself.
Dates come from *Finalized Information* — one Booking per line, each with its own room —
falling back to the requested date and time for anything it leaves out. It clicks
"+ add another date" and "In-Person" as needed, types the Description into the rich-text
editor, and leaves Theme, Categories, Perks, Show To and the co-host search to you. The
form spans several pages; click Fill Form on each.

**Writing Finalized Information.** On an EMS reservation page, open *Finalized Information*
in the popup and press **Read bookings from this page**; or convert the .ics file from
*Add to My Calendar* on the settings page. Either gives one line per booking —
`10/06/2026, 6:00pm - 8:00pm, Leigh Hall 0207` — to paste into the sheet.
If a separate *Reservation Date* column disagrees with it, date fields are filled but outlined
for review.

Column names are flexible — *Anticipated Attendance*, *Date of Event*, *E-mail Address* all
resolve. Unrecognised columns still work if a form label matches the column name directly.

Dates accept `9/12/2026`, `2026-09-12` or `September 12, 2026`; times accept `3:00 PM`, `3pm`
or `15:00`. Values are reformatted per input type — `date` inputs get ISO, `time` inputs get
24-hour, `number` inputs get digits, `select` menus get their closest matching option.

## Install

```
git clone <this repo>
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick this folder.

Permissions are `storage`, `activeTab` and `scripting` — the extension only touches a page when
you click Fill Form, and imported data stays in local storage on your machine.

## Tests

```
npm i --no-save jsdom
node test/run.js     # end-to-end fill against a mock EMS-style form
node test/edge.js    # labels that must not be confidently autofilled
node test/paste.js   # a row copied from the events sheet
node test/compound.js # "advisor, email and phone" in one box
node test/answers.js  # Registrar Yes/No menus answered from data/answers.csv
node test/bookings.js # Bookings read from real Finalized Information cells
node test/gatorconnect.js # GatorConnect Create Event, several dates
node test/finalize.js # Finalized Information from an EMS page and an .ics file
```

## Layout

| File | Role |
| --- | --- |
| [src/csv.js](src/csv.js) | RFC-4180 parser for CSV and copied (tab-separated) cells; detects key/value vs header+row sheets |
| [src/row.js](src/row.js) | Pasted row → fields: header matching, tracking columns, date/time range splitting |
| [src/bookings.js](src/bookings.js) | Free-text cell → Bookings (date, times, room), guessing years and am/pm |
| [src/finalize.js](src/finalize.js) | Finalized Information written from an EMS reservation page or an .ics file |
| [src/forms.js](src/forms.js) | Form detection; GatorConnect's extra dates, In-Person button, Description editor |
| [src/answers.js](src/answers.js) | Standing Yes/No answers: attendance thresholds, data/answers.csv, acknowledgements |
| [src/schema.js](src/schema.js) | Canonical fields, synonyms, qualifier words, normalisation |
| [src/matcher.js](src/matcher.js) | Label scoring, header→field mapping, confidence + ambiguity |
| [src/fill.js](src/fill.js) | Content script: label discovery, value coercion, writing, highlighting |
| [popup.js](popup.js) | Row paste box, injection, fill report |
| [options.js](options.js) | Org details, header row, per-column on/off |
