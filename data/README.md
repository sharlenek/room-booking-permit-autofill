# Your data

Reusable details the extension reads every time it opens. `org.csv` and
`sheet-header.txt` are gitignored, so they stay on this computer and are never
pushed.

| File | What goes in it |
| --- | --- |
| `org.csv` | Organization details used on every form, one `Field,Value` per line. Start from `org.example.csv`. |
| `sheet-header.txt` | Row 1 of your events sheet, copied out of Google Sheets and pasted in. |
| `buildings.csv` | Building abbreviations for the Finalized Information text: the building's name as EMS writes it, then the code (`Turlington Hall,TURL`). A building not listed keeps its full name. Tracked in git. |
| `answers.csv` | Standing answers. Each line is a phrase the question contains, the answer to pick, and the form it applies to: `ems`, `gatorconnect`, or blank for every form. Tracked in git; it holds no private details. |

Yes/No menus are answered in this order:

1. A "250 or more" style attendance question, from the event row's attendance.
2. The first line of `answers.csv` whose phrase appears in the question.
3. **Yes** for an acknowledgement -- any statement without a question mark,
   like "I acknowledge that food and drink are prohibited...".
4. A `*` line: the default for every other Yes/No question on its form.
   `*,No,gatorconnect` answers No on GatorConnect.

A question that matches nothing is left on "Choose one" for you to answer.

Checkboxes are judged by their own label only. A line whose phrase is in the
label with answer `Yes` ticks it (`organization members,Yes,gatorconnect`); a
box labelled just "No" is ticked when the form's `*` default is No; a box with
no label at all is taken as an agreement, ticked, and outlined for you to check.

When a file here has content, it takes the place of the matching box on the
settings page. Edit the file, then reopen the extension popup.
