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
