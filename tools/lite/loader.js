/* CREASE Lite loader. Runs before the game: shows the loading screen, waits for the host SDK
 * (and, on Playables, the cloud save), then loads the game scripts in order.
 * Host differences live in host-youtube.js / host-crazygames.js (window.CreaseLite.host). */
(function (root) {
  'use strict';
  var doc = root.document;
  var H = root.CreaseLite;
  var host = H.host;
  var S = root.CreaseLiteStorage;
  H.bridge = null;
  H.halted = false;
  H.hostMuted = !!H.hostMuted;
  H.cloudReady = false;

  // ---- elements the Lite build strips are replaced by inert stand-ins ----
  // The game wires up every control by id when it starts. Rather than edit that code, ids that
  // no longer exist resolve to a hidden placeholder, so the wiring is harmless and nothing shows.
  (function () {
    var real = doc.getElementById.bind(doc), stubs = {};
    doc.getElementById = function (id) {
      var el = real(id);
      if (el) return el;
      if (!stubs[id]) {
        var d = doc.createElement('div');
        d.hidden = true;
        d.innerHTML = '<span></span>';
        d.showModal = d.close = function () {};
        stubs[id] = d;
      }
      return stubs[id];
    };
  })();

  // ---- pause support: every animation loop goes through here ----
  // While the host has the game paused (YouTube onPause) nothing may run: the game loop, the boot
  // title, the arena preview and the layout pass all stop here and resume where they left off.
  (function () {
    var raf = root.requestAnimationFrame.bind(root), caf = root.cancelAnimationFrame.bind(root);
    var parked = [], nextId = 1e9;
    root.requestAnimationFrame = function (cb) {
      if (!H.halted) return raf(cb);
      var id = nextId++;
      parked.push([id, cb]);
      return id;
    };
    root.cancelAnimationFrame = function (id) {
      for (var i = 0; i < parked.length; i++) if (parked[i][0] === id) { parked.splice(i, 1); return; }
      caf(id);
    };
    H.flushParked = function () {
      var list = parked;
      parked = [];
      list.forEach(function (p) { raf(p[1]); });
    };
  })();

  H.pause = function () {
    if (H.halted) return;
    if (H.adGuard) H.adGuard();
    var b = H.bridge;
    if (b) { try { b.pauseMatch(); } catch (e) {} try { b.suspendAudio(); } catch (e) {} }
    H.halted = true;
    doc.documentElement.classList.add('lite-halt');
    H.flush(true);
  };
  H.resume = function () {
    if (!H.halted) return;
    H.halted = false;
    doc.documentElement.classList.remove('lite-halt');
    if (H.bridge) { try { H.bridge.resumeAudio(); } catch (e) {} }
    H.flushParked();
  };

  // ---- mute: the host mute and an ad both silence the game; the game's own toggle is separate ----
  var muteSrc = {};
  H.setMuteSource = function (name, on) {
    muteSrc[name] = !!on;
    var any = Object.keys(muteSrc).some(function (k) { return muteSrc[k]; });
    H.hostMuted = any;
    root.__creaseHostMuted = any;
    if (H.bridge) H.bridge.setHostMuted(any);
  };

  // ---- progress saving (cloud hosts only) ----
  var mem = null, dirty = false, timer = 0;
  function onChange() {
    if (!H.cloudReady) return;
    dirty = true;
    if (!timer) timer = setTimeout(function () { H.flush(); }, 3000);
  }
  H.flush = function () {
    clearTimeout(timer);
    timer = 0;
    if (!dirty || !H.cloudReady || !mem) return Promise.resolve();
    dirty = false;
    var blob = S.pack(mem.entries(), root.CreaseProgression && root.CreaseProgression.catalog);
    H.lastSaveLength = blob.length;
    return Promise.resolve().then(function () { return host.save(blob); }).catch(function (e) {
      dirty = true;
      host.warn && host.warn('save failed');
    });
  };
  function installStorage(saved) {
    mem = S.createMemoryStorage(onChange);
    var data = S.unpack(saved, root.CreaseProgression && root.CreaseProgression.catalog);
    Object.keys(data).forEach(function (k) { mem.setItem(k, data[k]); });
    try {
      Object.defineProperty(root, 'localStorage', { configurable: true, get: function () { return mem; } });
    } catch (e) {
      host.warn && host.warn('storage unavailable');
    }
    H.storage = mem;
  }

  // ---- breaks between matches (ads) ----
  var blocker = doc.getElementById('liteBlock');
  H.runAd = function (kind, cont) {
    if (!host.ad) { cont(false); return; }
    var done = false, guard = 0;
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(guard);
      H.adGuard = null;
      if (blocker) blocker.hidden = true;
      cont(ok);
    }
    if (blocker) blocker.hidden = false;
    // Only a request that never starts is abandoned; an ad that is playing is never cut off.
    guard = setTimeout(function () { finish(false); }, 15000);
    H.adGuard = function () { clearTimeout(guard); };
    Promise.resolve().then(function () { return host.ad(kind); }).then(finish, function () { finish(false); });
  };

  // ---- loading screen ----
  H.hideSplash = function () {
    var s = doc.getElementById('liteLoad');
    if (s) s.hidden = true;
  };
  function failed(what) {
    var t = doc.getElementById('liteLoadText');
    if (t) t.textContent = 'Couldn’t load the game. Please reload.';
    var bar = doc.querySelector('#liteLoad .bar');
    if (bar) bar.hidden = true;
    host.error && host.error(what);
  }
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error(src)); };
      doc.body.appendChild(s);
    });
  }

  function start() {
    var ready = host.init();
    // The loading screen is on screen after two frames; that is the host's "first frame".
    root.requestAnimationFrame(function () {
      root.requestAnimationFrame(function () { host.onSplash && host.onSplash(); });
    });
    ready.then(function (res) {
      return load('assets/progression.js').then(function () {
        if (host.cloud) {
          H.cloudReady = !!(res && res.saved !== null && !res.failed);
          installStorage(res && res.saved);
        }
        return load('assets/crease-logo.js');
      });
    }).then(function () { return load('assets/arena-engine.js'); })
      .then(function () { return load('assets/lite/product.js'); })
      .then(function () { return load('assets/game.js'); })
      .catch(function (e) { failed(String(e && e.message || e)); });
  }
  start();
})(window);
