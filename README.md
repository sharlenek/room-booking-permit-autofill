# UF Reservation Autofill

A Chrome extension that fills University of Florida room reservation (EMS Cloud) and
event permit forms from data you keep in a Google Sheet, so you stop retyping the same
organization details on every request.

It **never submits a form.** It fills, flags anything uncertain, and leaves the rest to you.

## How it works

1. Export your sheet from Google Sheets as CSV and import it on the extension's options page.
   Each column header is mapped to a canonical field (`eventName`, `attendance`, `advisorEmail`, …)
   using a synonym vocabulary covering the wordings both UF forms use.
2. Open a reservation or permit form, click the extension, pick an event, press **Fill Form**.
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

**Organization details** — permanent info, either two columns or a header row plus one data row:

```csv
Field,Value
Organization Name,Citrus Growers Club
Contact Email,you@ufl.edu
Phone Number,352-555-0142
Faculty Advisor,Dr. Elena Reyes
Faculty Advisor Email,reyes@ufl.edu
```

**Events** — one header row, one row per event:

```csv
Event Name,Date,Start Time,End Time,Expected Attendance,Location,Event Type,Description
Grove Day Social,9/12/2026,3:00 PM,5:00 PM,75,Reitz Union 2365,Social Event,Annual member social
```

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
```

## Layout

| File | Role |
| --- | --- |
| [src/csv.js](src/csv.js) | RFC-4180 CSV parser; detects key/value vs header+row sheets |
| [src/schema.js](src/schema.js) | Canonical fields, synonyms, qualifier words, normalisation |
| [src/matcher.js](src/matcher.js) | Label scoring, header→field mapping, confidence + ambiguity |
| [src/fill.js](src/fill.js) | Content script: label discovery, value coercion, writing, highlighting |
| [popup.js](popup.js) | Event picker, injection, fill report |
| [options.js](options.js) | CSV import and recognised-column preview |
