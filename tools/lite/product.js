/* CREASE Lite product layer: everything is free, so there is no pass, checkout, entitlement or
 * paid paddle. Keeps the surface the game calls (paddle look, local records, fire threshold). */
(function (root) {
  'use strict';
  var safe = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var styles = { classic: { name: 'Classic Cyan', premium: false, ring: '#2de2e6', core: '#ffffff', trail: '#2de2e6', desc: '' } };
  var leaderboard = (function () {
    var rows = [];
    try { rows = JSON.parse(safe.get('crease.leaderboard.v1') || '[]') || []; } catch (e) {}
    return rows.filter(function (r) { return r && typeof r.name === 'string'; }).slice(0, 100);
  })();
  root.CreaseProduct = {
    styles: styles,
    isPremium: function () { return false; },
    isFounder: function () { return false; },
    checkout: function () { return ''; },
    canUse: function (id) { return id === 'classic'; },
    paddleStyle: function () { return styles.classic; },
    setPaddleStyle: function (id) { return id === 'classic'; },
    extendRounds: function () { return false; },
    name: function () { return 'Player 1'; },
    setName: function () { return false; },
    record: function (row) {
      if (!row || !row.name) return;
      leaderboard.push(Object.assign({}, row, { at: Date.now() }));
      leaderboard.sort(function (a, b) { return (b.wins - a.wins) || (b.streak - a.streak) || (b.achievements - a.achievements); });
      leaderboard.splice(100);
      safe.set('crease.leaderboard.v1', JSON.stringify(leaderboard));
    },
    scores: function () { return leaderboard.slice(); },
    fireThreshold: 3,
  };
})(window);
