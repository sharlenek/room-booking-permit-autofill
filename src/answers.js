/* Standing answers for the Yes/No questions EMS asks on every request, read
   from data/answers.csv. Acknowledgements -- statements of terms, with no
   question mark -- are always answered Yes. */
var UFRA_ANSWERS = (function (S) {

  /* data/answers.csv, already split into cells: a header row, then
     "phrase the prompt contains, answer, form" per line. The form is the id
     from forms.js ("ems", "gatorconnect") or blank/"all" for every form. */
  function fromCsvRows(rows) {
    return (rows || []).slice(1).map(function (r) {
      return { phrase: r[0], answer: r[1], form: r[2] };
    });
  }

  /* The rules that apply on one form. */
  function rulesFrom(rows, formId) {
    return (rows || [])
      .map(function (r) {
        var phrase = String(r.phrase || '').trim() === '*' ? '*' : S.normalize(r.phrase);
        return { phrase: phrase, answer: String(r.answer || '').trim(),
                 form: String(r.form || '').trim().toLowerCase() };
      })
      .filter(function (r) {
        return r.phrase && r.answer && (!r.form || r.form === 'all' || r.form === formId);
      });
  }

  function isAcknowledgement(prompt) {
    return String(prompt || '').indexOf('?') === -1;
  }

  /* "Do you expect an attendance of 250 or more?" is answered by the event's
     own headcount when the row has one, whatever the standing answer says. */
  function fromThreshold(prompt, fields) {
    var m = String(prompt).match(/(\d[\d,]*)\s*(?:or more|or greater|\+)/i);
    if (!m || !/attend|people|guests|participants/i.test(prompt)) return null;
    var limit = +m[1].replace(/,/g, '');
    var att = (fields || []).find(function (f) {
      return f.canon === 'attendance' && /\d/.test(f.value);
    });
    if (!att) return null;
    var n = +String(att.value).replace(/[^\d.]/g, '');
    return { value: n >= limit ? 'Yes' : 'No', label: att.label + ' (' + n + ')', confidence: 'confident' };
  }

  function fromRules(prompt, rules) {
    var p = S.normalize(prompt);
    var hit = (rules || []).find(function (r) {
      return r.phrase !== '*' && (' ' + p + ' ').indexOf(' ' + r.phrase + ' ') !== -1;
    });
    return hit ? { value: hit.answer, label: 'answers.csv: ' + hit.phrase, confidence: 'confident' } : null;
  }

  /* Answer for one Yes/No control, given its prompt candidates. Returns null
     or {value, label, confidence}. Order: the event's own numbers, then the
     standing answers, then Yes for an acknowledgement. */
  function answer(prompts, rules, fields) {
    var i, a;
    for (i = 0; i < prompts.length; i++) {
      a = fromThreshold(prompts[i], fields);
      if (a) return a;
    }
    for (i = 0; i < prompts.length; i++) {
      a = fromRules(prompts[i], rules);
      if (a) return a;
    }
    // Any question mark near the control makes it a question; the prompt is
    // not always the first text found. With no prompt text at all there is
    // nothing to acknowledge.
    if (prompts.length && prompts.every(isAcknowledgement)) {
      return { value: 'Yes', label: 'acknowledgement', confidence: 'confident' };
    }
    // "*" answers every other Yes/No question on its form.
    var fallback = (rules || []).find(function (r) { return r.phrase === '*'; });
    return fallback ? { value: fallback.answer, label: 'answers.csv: default', confidence: 'confident' } : null;
  }

  /* A checkbox, by its own label:
       none at all      -> an agreement to tick (checked: the user cannot
                           see what it agrees to from the report)
       a standing answer for that label ("organization members")
       "No" / "None"    -> ticked when the form's default answer is No */
  function checkbox(ownLabel, rules) {
    if (!String(ownLabel || '').trim()) {
      return { value: 'Yes', label: 'agreement checkbox', confidence: 'uncertain' };
    }
    var hit = fromRules(ownLabel, rules);
    if (hit) return hit;
    var fallback = (rules || []).find(function (r) { return r.phrase === '*'; });
    if (fallback && /^(no|none)$/i.test(ownLabel.trim()) && /^no$/i.test(fallback.answer)) {
      return { value: 'Yes', label: 'answers.csv: default', confidence: 'confident' };
    }
    return null;
  }

  return { checkbox: checkbox, fromCsvRows: fromCsvRows, rulesFrom: rulesFrom, answer: answer, isAcknowledgement: isAcknowledgement };
})(typeof UFRA_SCHEMA !== 'undefined' ? UFRA_SCHEMA : require('./schema.js'));

if (typeof module !== 'undefined') module.exports = UFRA_ANSWERS;
