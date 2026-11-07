/* Host adapter: CrazyGames HTML5 SDK v3.
 * Docs: https://docs.crazygames.com/sdk/intro/  https://docs.crazygames.com/sdk/game/
 *       https://docs.crazygames.com/sdk/video-ads/  https://docs.crazygames.com/requirements/intro/
 * Loaded after <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"> and before the game. */
(function (root) {
  'use strict';
  var H = root.CreaseLite;
  var sdk = root.CrazyGames && root.CrazyGames.SDK;
  var on = false;          // true on CrazyGames (and on localhost); the SDK throws on any other domain
  var started = false;
  var stopped = false;

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  var host = {
    name: 'crazygames',
    // Basic Launch: progress stays in the browser's own storage (the Data module is Full Launch).
    cloud: false,

    init: function () {
      if (!sdk) return Promise.resolve(null);
      return Promise.resolve().then(function () { return sdk.init(); }).then(function () {
        on = sdk.environment === 'local' || sdk.environment === 'crazygames';
        if (!on) return null;
        // settings.muteAudio overrides the game's own sound toggle.
        var apply = function () { H.setMuteSource('host', !!safe(function () { return sdk.game.settings.muteAudio; })); };
        apply();
        safe(function () { sdk.game.addSettingsChangeListener(apply); });
        return null;
      }).catch(function () { on = false; return null; });
    },

    // loadingStart fires once, the moment sdk.init() resolves (init() below chains it). loadingStop fires once
    // the boot screen is up (or the menu, if the intro is skipped): the game is ready for input, so it never
    // waits for the "tap to boot". Both go through _ready, so loadingStart always precedes loadingStop, even
    // when the boot screen is shown before init resolves. Nothing here depends on requestAnimationFrame: a
    // frame that is not being painted (background tab, preview iframe) never runs one.
    onBootShown: function () { host.stopLoading(); },
    onMenuReady: function () { host.stopLoading(); },
    startLoading: function () {
      if (started) return;
      started = true;
      if (on) safe(function () { sdk.game.loadingStart(); });
    },
    stopLoading: function () {
      if (stopped) return;
      stopped = true;
      host._ready.then(function () { if (on) safe(function () { sdk.game.loadingStop(); }); });
    },
    // gameplayStart / gameplayStop follow the match: start when play begins or resumes, stop on every break.
    onGameplay: function (active) {
      if (!on) return;
      safe(function () { active ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); });
    },

    // Midgame ads go between matches (rematch). Mute only once an ad is actually playing.
    ad: function (kind) {
      if (!on) return Promise.resolve(false);
      return new Promise(function (resolve) {
        var settled = false;
        function end(ok) { if (settled) return; settled = true; H.setMuteSource('ad', false); resolve(ok); }
        var callbacks = {
          adStarted: function () { if (H.adGuard) H.adGuard(); H.setMuteSource('ad', true); },
          adFinished: function () { end(true); },
          adError: function () { end(false); },
        };
        try { sdk.ad.requestAd(kind === 'next' ? 'midgame' : 'rewarded', callbacks); } catch (e) { end(false); }
      });
    },
    warn: function () {},
    error: function () {},
  };

  // init() runs once; loadingStart follows it directly and stopLoading waits for both.
  var initOnce = host.init;
  host._ready = Promise.resolve();
  host.init = function () {
    host._ready = initOnce().then(function (res) { host.startLoading(); return res; });
    return host._ready;
  };

  H.host = host;
})(window);
