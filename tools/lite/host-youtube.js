/* Host adapter: YouTube Playables.
 * SDK reference:  https://developers.google.com/youtube/gaming/playables/reference/sdk
 * Requirements:   https://developers.google.com/youtube/gaming/playables/certification/requirements
 * Loaded after <script src="https://www.youtube.com/game_api/v1"> and before the game. */
(function (root) {
  'use strict';
  var H = root.CreaseLite;
  var yt = root.ytgame;
  var inEnv = typeof yt !== 'undefined' && !!yt && !!yt.IN_PLAYABLES_ENV;

  function timeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  var host = {
    name: 'youtube',
    inEnv: inEnv,
    // Outside YouTube (a local check of the bundle) the game falls back to the browser's own storage.
    cloud: inEnv,

    init: function () {
      if (!inEnv) return Promise.resolve(null);
      // 5.2 Respect the YouTube audio setting: start in the right state and follow changes.
      H.setMuteSource('host', !safe(function () { return yt.system.isAudioEnabled(); }));
      safe(function () {
        yt.system.onAudioEnabledChange(function (enabled) { H.setMuteSource('host', !enabled); });
      });
      // 6.1 Everything stops on onPause and only restarts on onResume. The Page Visibility API
      // is not used anywhere in this build (6.2).
      safe(function () { yt.system.onPause(function () { H.pause(); }); });
      safe(function () { yt.system.onResume(function () { H.resume(); }); });
      root.addEventListener('error', function () { safe(function () { yt.health.logError(); }); });
      // 4.3 loadData must finish before saveData is ever called. If it fails, nothing is saved
      // this session, so an empty game can never overwrite a real save.
      return timeout(yt.game.loadData(), 5000).then(
        function (text) { return { saved: typeof text === 'string' ? text : '' }; },
        function () { safe(function () { yt.health.logWarning(); }); return { saved: null, failed: true }; }
      );
    },

    // 2.1 firstFrameReady is called while the loading screen is showing.
    onSplash: function () { if (inEnv) safe(function () { yt.game.firstFrameReady(); }); },
    // 2.2 / 2.3 gameReady only once the main menu is up (never over the splash or loading screens).
    onMenuReady: function () { if (inEnv) safe(function () { yt.game.gameReady(); }); },

    // 4.1 / 4.6 progress goes to the cloud save (the whole save is far below the 64 KiB flush limit).
    save: function (blob) { return yt.game.saveData(blob); },

    // Monetization: interstitials only between matches; rewarded only when the build turns it on.
    ad: function (kind) {
      if (!inEnv || !yt.ads) return Promise.resolve(false);
      if (kind === 'next') {
        return yt.ads.requestInterstitialAd().then(function () { return true; }, function () { return false; });
      }
      return yt.ads.requestRewardedAd('arena_trial').then(function (ok) { return ok === true; }, function () { return false; });
    },
    warn: function () { if (inEnv) safe(function () { yt.health.logWarning(); }); },
    error: function () { if (inEnv) safe(function () { yt.health.logError(); }); },
  };
  H.host = host;
})(window);
