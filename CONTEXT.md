# UF Reservation Autofill

A Chrome extension that fills UF room reservation and event permit forms from
data kept in a Google Sheet. This glossary covers the terms that two real EMS
forms have forced us to distinguish.

## Language

### The forms

**Reservation**:
A request to EMS for space, spanning one or more Bookings. Created through a
two-step wizard: step 1 picks rooms and times, step 2 asks for details.
_Avoid_: booking, request, event

**Booking**:
One date, time and room within a Reservation. A weekly meeting series is one
Reservation with many Bookings.
_Avoid_: reservation, slot

**Prompt**:
The human-readable text identifying one control on a form. EMS writes these as
whole instructions or questions ("Indicate how many people you expect to
attend"), not as short field names.
_Avoid_: label, question, field name

**Form**:
Which website the page belongs to, detected from its address: an EMS
room request (ufl.emscloudservice.com) or a GatorConnect event. Standing answers and
form-specific steps are scoped by Form. There is no toggle.
_Avoid_: mode, site, template

**GatorConnect event**:
The event permit, submitted as "Create Event" on gatorconnect.ufl.edu over
several pages the user moves between by hand. Each of its dates is its own
Booking, added with "+ add another date", with its own place.
_Avoid_: permit form, event registration

**Acknowledgement**:
A Prompt that states terms the requester must accept rather than asking
anything about the event. Always answered Yes, often carrying a financial or
policy commitment.
_Avoid_: agreement, terms, checkbox

### The sheet

**Column**:
One named value in the imported sheet. Both permanent organization details and
per-event details are Columns; they differ only in which file they came from.
_Avoid_: field, header, key

**Canonical field**:
The internal name a Column or a Prompt is mapped onto, so that "Anticipated
Attendance" and "Expected Attendance" meet in the middle.
_Avoid_: canonical name, standard field

**Qualifier**:
A word that redirects a Prompt to a different referent than the bare wording
suggests — advisor, emergency, rain, 2nd. The reason "2nd Contact Phone" must
not receive the 1st contact's number.
_Avoid_: modifier, disambiguator

**Finalized Information**:
The hand-written Column recording what was actually booked: dates, times and
rooms, one Booking per line or spread over several. It wins over the
requested date and time for whatever it states; anything it leaves out is
borrowed from the request. "<-" means the same as requested; "holiday" or
"cancelled" drop a Booking. The extension can write it, one Booking per line
("10/06/2026, 6:00pm - 8:00pm, Leigh Hall 0207"), from an EMS reservation
page or an .ics file.
_Avoid_: confirmed info, final booking

**Standing answer**:
A line of data/answers.csv: an answer given whenever a Prompt contains a
phrase, on one Form or all. Acknowledgements need none; they are always Yes.
_Avoid_: default, preset

### Outcomes

Every control on a page ends in exactly one of these.

**Filled**:
Written with a confident match, no marking.

**Review**:
Written, but outlined for the user to check, because the match was loose or
two Columns were nearly tied.

**Blank**:
Left untouched, either because no Column matched or because the control
already had a value.

A value the page itself puts in while a fill runs (EMS defaulting the 1st
Contact, GatorConnect's date of today) is not the user's and may be
replaced. A value present before the fill began never is.
