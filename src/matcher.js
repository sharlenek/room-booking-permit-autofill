/* Scores a form field's label against the labels in the imported sheet data. */
var UFRA_MATCH = (function (S) {

  var CONFIDENT = 0.85;  // fill silently
  var UNCERTAIN = 0.55;  // fill, but highlight for review
  var AMBIGUOUS_GAP = 0.08;

  /* How well one page label matches one candidate phrase, 0..1. */
  function scorePhrase(label, phrase) {
    var ln = S.normalize(label);
    var pn = S.normalize(phrase);
    if (!ln || !pn) return 0;

    var score;
    if (ln === pn) {
      score = 1;
    } else if (containsPhrase(ln, pn)) {
      // Every extra word in the page label makes the match a little looser,
      // but one framing word ("Brief description", "Name of ...") is normal
      // form wording and should still read as a confident match.
      var extra = S.tokens(ln).length - S.tokens(pn).length;
      score = 0.92 - Math.min(0.3, Math.max(0, extra) * 0.05);
    } else {
      score = 0.75 * jaccard(S.tokens(ln), S.tokens(pn));
    }

    // A qualifier on one side but not the other ("advisor email" vs "email")
    // usually means these are different fields, not loose wordings.
    var lq = S.qualifiersIn(ln);
    var pq = S.qualifiersIn(pn);
    if (lq.some(function (q) { return pq.indexOf(q) === -1; })) score *= 0.35;
    if (pq.some(function (q) { return lq.indexOf(q) === -1; })) score *= 0.5;

    return score;
  }

  function containsPhrase(haystack, needle) {
    var esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + esc + '($|\\s)').test(haystack);
  }

  function jaccard(a, b) {
    if (!a.length || !b.length) return 0;
    var setB = {};
    b.forEach(function (t) { setB[t] = true; });
    var inter = 0;
    var seen = {};
    a.forEach(function (t) {
      if (setB[t] && !seen[t]) { inter++; seen[t] = true; }
    });
    var union = new Set(a.concat(b)).size;
    return inter / union;
  }

  /* Best score between a page label and a data field, considering both the
     field's own sheet header and the synonyms of whatever canonical field it
     was mapped to on import. */
  function scoreField(pageLabel, field) {
    var best = scorePhrase(pageLabel, field.label);
    if (field.canon) {
      S.synonymsFor(field.canon).forEach(function (syn) {
        var s = scorePhrase(pageLabel, syn);
        if (s > best) best = s;
      });
    }
    return best;
  }

  /* Map a sheet column header onto a canonical field, or null. */
  function headerToCanon(header) {
    var best = null;
    var bestScore = 0;
    S.canonKeys().forEach(function (canon) {
      S.synonymsFor(canon).forEach(function (syn) {
        var s = scorePhrase(header, syn);
        if (s > bestScore) { bestScore = s; best = canon; }
      });
    });
    return bestScore >= UNCERTAIN ? { canon: best, score: bestScore } : null;
  }

  /* Pick a value for one page field.
     Returns null, or {value, label, score, confidence}. */
  function findValue(pageLabel, fields) {
    if (!pageLabel) return null;

    var scored = fields
      .filter(function (f) { return f.value !== '' && f.value != null; })
      .map(function (f) { return { field: f, score: scoreField(pageLabel, f) }; })
      .sort(function (a, b) { return b.score - a.score; });

    if (!scored.length || scored[0].score < UNCERTAIN) return null;

    var top = scored[0];
    var runnerUp = scored.find(function (s) {
      return s.field.value !== top.field.value;
    });
    var ambiguous = !!runnerUp && (top.score - runnerUp.score) < AMBIGUOUS_GAP;

    return {
      value: top.field.value,
      label: top.field.label,
      score: top.score,
      confidence: (top.score >= CONFIDENT && !ambiguous) ? 'confident' : 'uncertain',
      alternative: ambiguous ? runnerUp.field.label : null
    };
  }

  return {
    CONFIDENT: CONFIDENT,
    UNCERTAIN: UNCERTAIN,
    scorePhrase: scorePhrase,
    scoreField: scoreField,
    headerToCanon: headerToCanon,
    findValue: findValue
  };
})(typeof UFRA_SCHEMA !== 'undefined' ? UFRA_SCHEMA : require('./schema.js'));

if (typeof module !== 'undefined') module.exports = UFRA_MATCH;
