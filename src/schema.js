/* Canonical fields and the label wordings they appear under, on both
   EMS Cloud reservation forms and the UF event permit form. */
var UFRA_SCHEMA = (function () {

  var FIELDS = {
    orgName:        ['organization name', 'organization', 'student organization', 'group name', 'department or organization', 'requesting organization', 'sponsoring organization', 'org name', 'club name'],
    orgAcronym:     ['organization acronym', 'acronym', 'abbreviation', 'short name'],
    orgEmail:       ['organization email', 'group email', 'org email'],
    orgPhone:       ['organization phone', 'group phone', 'org phone'],
    orgWebsite:     ['organization website', 'website', 'web address', 'url'],
    orgAddress:     ['organization address', 'mailing address', 'street address', 'address'],
    department:     ['department', 'college', 'unit', 'academic department'],

    contactName:    ['contact name', 'requester name', 'your name', 'full name', 'name of requester', 'primary contact', 'event contact', 'requested by', 'submitted by'],
    contactEmail:   ['contact email', 'requester email', 'your email', 'email address', 'email', 'e-mail'],
    contactPhone:   ['contact phone', 'requester phone', 'your phone', 'phone number', 'phone', 'telephone', 'cell', 'mobile'],
    contactTitle:   ['contact title', 'position', 'role', 'title in organization'],
    ufid:           ['ufid', 'uf id', 'student id', 'gatorlink id number', 'university id'],
    gatorlink:      ['gatorlink', 'gatorlink username', 'username'],

    advisorName:    ['advisor name', 'faculty advisor', 'advisor', 'faculty advisor name', 'supervisor name', 'sponsor name'],
    advisorEmail:   ['advisor email', 'faculty advisor email', 'supervisor email', 'sponsor email'],
    advisorPhone:   ['advisor phone', 'faculty advisor phone', 'supervisor phone'],

    eventName:      ['event name', 'event title', 'title of event', 'name of event', 'reservation name', 'meeting name', 'booking name', 'program name'],
    eventType:      ['event type', 'type of event', 'reservation type', 'meeting type', 'booking type', 'category'],
    eventDate:      ['event date', 'date of event', 'date', 'start date', 'reservation date', 'day of event'],
    eventEndDate:   ['end date', 'last date', 'through date'],
    startTime:      ['start time', 'event start time', 'begin time', 'starting time', 'time start'],
    endTime:        ['end time', 'event end time', 'finish time', 'ending time', 'time end', 'until'],
    setupTime:      ['setup time', 'set up time', 'setup start', 'access time', 'early access'],
    teardownTime:   ['teardown time', 'tear down time', 'breakdown time', 'cleanup time'],

    attendance:     ['attendance', 'expected attendance', 'number of attendees', 'anticipated attendance', 'estimated attendance', 'headcount', 'number of people', 'group size', 'no of attendees', 'attendees'],
    location:       ['location', 'event location', 'requested location', 'venue', 'space', 'facility', 'site'],
    building:       ['building', 'facility name', 'building name'],
    room:           ['room', 'room number', 'space requested', 'room requested'],
    rainLocation:   ['rain location', 'rain site', 'alternate location', 'backup location', 'inclement weather location'],

    description:    ['description', 'event description', 'description of event', 'details', 'event details', 'brief description', 'purpose', 'purpose of event', 'nature of event', 'summary'],
    audience:       ['audience', 'intended audience', 'who is invited', 'open to', 'target audience'],
    setupNotes:     ['setup notes', 'setup requirements', 'room setup', 'setup', 'layout', 'configuration'],
    equipment:      ['equipment', 'equipment needed', 'av needs', 'audio visual', 'technology needs', 'resources'],
    specialNeeds:   ['special requests', 'special needs', 'accommodations', 'additional notes', 'notes', 'comments', 'other information'],

    food:           ['food', 'food service', 'will food be served', 'catering', 'refreshments'],
    alcohol:        ['alcohol', 'will alcohol be served', 'alcoholic beverages'],
    admissionFee:   ['admission fee', 'ticket price', 'cost to attend', 'will you charge admission', 'fee charged'],
    fundingSource:  ['funding source', 'account number', 'chartfield', 'budget code', 'billing account', 'payment method'],
    amplifiedSound: ['amplified sound', 'sound amplification', 'speakers', 'will amplified sound be used'],
    security:       ['security', 'security needed', 'ufpd', 'police'],
    coSponsors:     ['co-sponsors', 'cosponsor', 'partnering organizations', 'collaborating organizations']
  };

  /* Words that make a label refer to a *different* person or slot than the
     bare synonym does. If a label carries one of these and the synonym that
     matched does not, the match is almost certainly wrong. */
  var QUALIFIERS = [
    'advisor', 'adviser', 'faculty', 'supervisor', 'sponsor', 'emergency',
    'alternate', 'alternative', 'secondary', 'second', 'backup', 'rain',
    'billing', 'guest', 'speaker', 'vendor', 'parent', 'spouse', 'setup',
    'teardown', 'cleanup', 'end', 'confirm', 'verify', 'repeat'
  ];

  var STOPWORDS = ['the', 'a', 'an', 'of', 'for', 'your', 'please', 'enter',
    'select', 'choose', 'required', 'optional', 'is', 'are', 'be', 'will',
    'this', 'and', 'or', 'to', 'in', 'on', 'at', 'if', 'any'];

  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/\(.*?\)/g, ' ')       // parenthetical hints
      .replace(/[^a-z0-9'\s]/g, ' ')  // punctuation, hyphens and required markers
      .replace(/\s+/g, ' ')
      .replace(/\be mail\b/g, 'email')
      .trim();
  }

  function tokens(s) {
    return normalize(s).split(' ').filter(function (t) {
      return t && STOPWORDS.indexOf(t) === -1;
    });
  }

  function qualifiersIn(s) {
    var t = tokens(s);
    return QUALIFIERS.filter(function (q) { return t.indexOf(q) !== -1; });
  }

  return {
    FIELDS: FIELDS,
    QUALIFIERS: QUALIFIERS,
    normalize: normalize,
    tokens: tokens,
    qualifiersIn: qualifiersIn,
    synonymsFor: function (canon) { return FIELDS[canon] || []; },
    canonKeys: function () { return Object.keys(FIELDS); }
  };
})();

if (typeof module !== 'undefined') module.exports = UFRA_SCHEMA;
