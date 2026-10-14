/* Prompts that ask for several details of one person in a single box. */
const MATCH = require('../src/matcher.js');

const fields = [
  ['Faculty Advisor', 'Dr. Reyes'],
  ['Faculty Advisor Email', 'reyes@ufl.edu'],
  ['Faculty Advisor Phone', '352-555-0199'],
  ['Contact Name', 'Sam Lee'],
  ['Contact Email', 'sam@ufl.edu'],
  ['Phone Number', '352-555-0100']
].map(([label, value]) => {
  const hit = MATCH.headerToCanon(label);
  return { label, value, canon: hit ? hit.canon : null };
});

const CASES = [
  ['Faculty advisor, email and phone number', 'Dr. Reyes, reyes@ufl.edu, 352-555-0199'],
  ['Faculty Advisor Name, Email, and Phone Number', 'Dr. Reyes, reyes@ufl.edu, 352-555-0199'],
  ['Faculty Advisor (name, email, phone)', 'Dr. Reyes, reyes@ufl.edu, 352-555-0199'],
  ['Advisor email and phone number', 'reyes@ufl.edu, 352-555-0199'],
  ['Contact name, email and phone', 'Sam Lee, sam@ufl.edu, 352-555-0100'],
  // Single-detail prompts are unchanged.
  ['Faculty Advisor', 'Dr. Reyes'],
  ['Faculty Advisor Email', 'reyes@ufl.edu'],
  ['Contact Email', 'sam@ufl.edu'],
  // Someone else's details: never the advisor's or contact's.
  ['Emergency contact name and phone', null],
  ['2nd Contact Email and Phone', null]
];

let failures = 0;
for (const [prompt, want] of CASES) {
  const m = MATCH.findValue(prompt, fields);
  const got = m ? m.value : null;
  const ok = got === want;
  if (!ok) failures++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + prompt.padEnd(48) + (got || 'BLANK') +
    (ok ? '' : `   (wanted ${want || 'BLANK'})`));
}
console.log(failures ? `\n${failures} failure(s)` : '\nall compound prompts pass');
process.exitCode = failures ? 1 : 0;
