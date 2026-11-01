// ---- CREASE Lite host bridge ----
// Inserted at the end of the game closure by tools/build-lite.mjs; not part of the full site.
// It reads the game's own state (no changes to the game logic) and reports it to the host
// adapter, and gives the adapter the few controls it needs (pause, host mute).
{
  const H = window.CreaseLite, host = H.host;
  let userMuted = false, hostMuted = !!H.hostMuted, wasRunning = false;
  let sawBoot = false, sawMenu = false, playing = false, wasOver = false, resetStage = false;
  const applyMute = () => { muted = userMuted || hostMuted; if (master) master.gain.value = hostMuted ? 0 : 0.9; };
  applyMute();
  // The game's Sound toggle still works wherever the host allows an in-game toggle; a host mute wins.
  $('bSound').onclick = () => {
    if (hostMuted) return;
    userMuted = !userMuted; applyMute();
    $('bSound').textContent = 'Sound: ' + (userMuted ? 'Off' : 'On');
    unlockAudio(); booted = true; music.start();
  };

  H.bridge = {
    setHostMuted(v) { hostMuted = !!v; applyMute(); },
    pauseMatch() { pause(); },               // no-op unless a match is running
    suspendAudio() { wasRunning = !!(ac && ac.state === 'running'); if (wasRunning) ac.suspend(); },
    resumeAudio() { if (ac && wasRunning) ac.resume(); wasRunning = false; },
    phase: () => ({ mode: game.mode, state: game.state, playing }),
    audio: () => ({ muted, userMuted, hostMuted, gain: master ? master.gain.value : null, ctx: ac ? ac.state : null }),
  };

  // Between matches: a break (ad) before a rematch. Never during play, never on menu buttons.
  if (H.flags.ads) {
    const again = $('bAgain'), orig = again.onclick;
    again.onclick = ev => H.runAd('next', () => orig.call(again, ev));
  }

  // Optional rewarded video: play one locked arena once. Off unless the build is made with --rewarded.
  let trial = -1, trialUsed = false;
  const baseCanPlay = progress.canPlay;
  if (H.flags.rewarded) {
    progress.canPlay = i => baseCanPlay(i) || i === trial;
    const btn = document.createElement('button');
    btn.id = 'bArenaTrial'; btn.className = 'btn p2'; btn.hidden = true;
    btn.textContent = 'WATCH A VIDEO TO PLAY THIS ARENA ONCE';
    $('bArenaUse').after(btn);
    const syncTrial = () => { btn.hidden = !!baseCanPlay(stageIx) || trial === stageIx; };
    const refresh0 = refreshStageLock;
    refreshStageLock = function () { refresh0(); syncTrial(); };
    btn.onclick = () => {
      btn.disabled = true;
      H.runAd('reward', ok => {
        btn.disabled = false;
        if (ok) { trial = stageIx; trialUsed = false; refreshStageLock(); }
        else { btn.textContent = 'NO VIDEO RIGHT NOW. TRY LATER'; setTimeout(() => { btn.textContent = 'WATCH A VIDEO TO PLAY THIS ARENA ONCE'; }, 3000); }
      });
    };
  }

  const tick = () => {
    const st = game.state, md = game.mode;
    if (!sawBoot && !$('boot').classList.contains('hidden')) { sawBoot = true; H.hideSplash(); host.onBootShown && host.onBootShown(); }
    if (!sawMenu && !$('menu').classList.contains('hidden')) { sawMenu = true; H.hideSplash(); host.onMenuReady && host.onMenuReady(); }
    const now = (md === 'solo' || md === 'duo') && (st === 'countdown' || st === 'play' || st === 'goal' || st === 'fold');
    if (now !== playing) { playing = now; if (now && trial >= 0) trialUsed = true; host.onGameplay && host.onGameplay(now); }
    const over = st === 'over';
    if (over && !wasOver) {
      H.flush && H.flush();
      if (trial >= 0 && trialUsed) { trial = -1; trialUsed = false; resetStage = true; }
    }
    wasOver = over;
    if (resetStage && md === 'demo') { resetStage = false; if (!baseCanPlay(stageIx)) setStage(progress.state.unlocked[0] || 0); refreshStageLock(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
