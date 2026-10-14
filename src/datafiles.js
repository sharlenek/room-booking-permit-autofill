/* Reads the gitignored files in data/. A file with content takes the place of
   the matching box on the settings page; a missing or empty one is ignored. */
var UFRA_DATAFILES = (function () {
  async function read(name) {
    try {
      var res = await fetch(chrome.runtime.getURL('data/' + name), { cache: 'no-store' });
      return res.ok ? (await res.text()).trim() : '';
    } catch (e) {
      return '';
    }
  }

  async function load() {
    var texts = await Promise.all([read('org.csv'), read('sheet-header.txt')]);
    return { orgText: texts[0], headerText: texts[1] };
  }

  return { load: load };
})();
