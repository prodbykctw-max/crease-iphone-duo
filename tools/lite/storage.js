/* CREASE Lite storage: an in-memory Storage replacement plus the compact save format.
 *
 * YouTube Playables only accepts progress saved through ytgame.game.saveData (no other
 * mechanism), so the Lite build keeps the game's localStorage calls working against memory and
 * flushes a compact blob to the host. The same module runs in Node for the unit tests.
 */
(function (root) {
  'use strict';

  var VERSION = 1;
  var PROGRESS_KEY = 'crease.progress.v1';
  // Written to memory but never saved: local counters only used by the removed analytics.
  var SKIP = { 'crease.metrics.v1': 1 };
  var METRICS = ['matches', 'wins', 'losses', 'goals', 'conceded', 'hits', 'smashes', 'smashGoals', 'bankGoals', 'rails', 'powerups', 'shutouts', 'comebacks'];

  // Storage with the same surface the game uses (getItem/setItem/removeItem/clear/key/length).
  function createMemoryStorage(onChange) {
    var map = Object.create(null);
    var api = {
      getItem: function (k) { k = String(k); return k in map ? map[k] : null; },
      setItem: function (k, v) { k = String(k); v = String(v); if (map[k] === v) return; map[k] = v; if (onChange && !SKIP[k]) onChange(k); },
      removeItem: function (k) { k = String(k); if (!(k in map)) return; delete map[k]; if (onChange && !SKIP[k]) onChange(k); },
      clear: function () { var had = Object.keys(map).length; map = Object.create(null); if (had && onChange) onChange('*'); },
      key: function (i) { var ks = Object.keys(map); return i >= 0 && i < ks.length ? ks[i] : null; },
      get length() { return Object.keys(map).length; },
      entries: function () { return Object.keys(map).map(function (k) { return [k, map[k]]; }); },
    };
    return api;
  }

  // Progress is stored without the achievement ids the counters already imply: a metric
  // achievement is earned exactly when its stage counter reaches the target, so only the
  // counters and the special challenges need saving. (Every id with a timestamp is ~66 KB.)
  function packProgress(raw, catalog) {
    var p;
    try { p = JSON.parse(raw); } catch (e) { return raw; }
    if (!p || typeof p !== 'object') return raw;
    var metricIds = {};
    (catalog || []).forEach(function (a) { if (a.metric) metricIds[a.id] = 1; });
    var special = {};
    Object.keys(p.earned || {}).forEach(function (id) { if (!metricIds[id]) special[id] = p.earned[id]; });
    var stages = (p.stages || []).map(function (s) {
      var o = {};
      METRICS.forEach(function (m) { if (s && s[m]) o[m] = s[m]; });
      return o;
    });
    return { pk: 1, stages: stages, unlocked: p.unlocked || [0], streak: p.streak || 0, previous: p.previous || '', special: special };
  }

  function unpackProgress(packed, catalog) {
    if (!packed || typeof packed !== 'object' || packed.pk !== 1) return packed;
    var earned = {};
    Object.keys(packed.special || {}).forEach(function (id) { earned[id] = packed.special[id]; });
    (catalog || []).forEach(function (a) {
      if (!a.metric) return;
      var s = packed.stages && packed.stages[a.stage];
      if (s && s[a.metric] >= a.target) earned[a.id] = 0;
    });
    var stages = [];
    for (var i = 0; i < 10; i++) {
      var o = {};
      METRICS.forEach(function (m) { o[m] = (packed.stages && packed.stages[i] && packed.stages[i][m]) || 0; });
      stages.push(o);
    }
    return { stages: stages, earned: earned, unlocked: packed.unlocked || [0], streak: packed.streak || 0, previous: packed.previous || '' };
  }

  // Everything the game saved, as one string for ytgame.game.saveData.
  function pack(entries, catalog) {
    var k = {};
    entries.forEach(function (e) {
      if (SKIP[e[0]]) return;
      k[e[0]] = e[0] === PROGRESS_KEY ? packProgress(e[1], catalog) : e[1];
    });
    return JSON.stringify({ v: VERSION, k: k });
  }

  // Inverse of pack. Tolerant by design: unknown keys are kept, anything unreadable is skipped,
  // and an empty or foreign string simply means "no save yet".
  function unpack(text, catalog) {
    var out = {};
    if (!text || typeof text !== 'string') return out;
    var blob;
    try { blob = JSON.parse(text); } catch (e) { return out; }
    if (!blob || typeof blob !== 'object' || !blob.k || typeof blob.k !== 'object') return out;
    Object.keys(blob.k).forEach(function (key) {
      var v = blob.k[key];
      if (key === PROGRESS_KEY && v && typeof v === 'object') v = JSON.stringify(unpackProgress(v, catalog));
      else if (typeof v !== 'string') return;
      out[key] = v;
    });
    return out;
  }

  var api = { VERSION: VERSION, PROGRESS_KEY: PROGRESS_KEY, createMemoryStorage: createMemoryStorage, pack: pack, unpack: unpack, packProgress: packProgress, unpackProgress: unpackProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CreaseLiteStorage = api;
})(typeof window === 'undefined' ? this : window);
