// scroll-locked-video-hero — vanilla port.
// Every constant preserved from the original React component.
// No dependencies.

(function () {
  'use strict';

  // ─── Tuned constants (do not casually change) ──────────────────
  var LERP_FACTOR = 0.18;         // the "feel" — 0.15 = sluggish, 0.25 = twitchy
  var SCRUB_DISTANCE = 3200;      // px of scroll input for full video
  var TITLE_FADE_END = 0.35;      // title fully gone at 35% progress
  var TAGLINE_REVEAL_START = 0.82; // tagline begins at 82% progress
  var VIDEO_SCALE_MAX = 0.06;     // video scales to 1.06 at 100%
  var TITLE_OFFSET = -24;         // px
  var TAGLINE_OFFSET = 20;        // px
  var TITLE_BLUR_MAX = 10;        // px
  var TAGLINE_BLUR_MAX = 8;       // px

  var section = document.getElementById('hero');
  var video = document.getElementById('heroVideo');
  var titleWrap = document.getElementById('heroTitle');
  var taglineWrap = document.getElementById('heroTagline');
  var hint = document.getElementById('heroHint');
  var progressBar = document.getElementById('heroProgress');

  if (!section || !video) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var duration = 0;
  var rafId = 0;
  var targetProgress = 0;
  var currentProgress = 0;
  var hasStartedScrolling = false;
  var isSeeking = false;
  var pendingTime = null;
  var locked = false;
  var lockedScrollY = 0;
  var touchStartY = 0;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  // ─── Video loading ─────────────────────────────────────────────
  function onLoadedData() {
    duration = video.duration || 0;
    video.classList.add('is-ready');
    if (reducedMotion) {
      video.currentTime = duration * 0.92;
    }
  }
  video.addEventListener('loadeddata', onLoadedData);

  // iOS Safari won't buffer without a play() call. Silent play → pause.
  function kickstartLoad() {
    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { video.pause(); }).catch(function () {});
    } else {
      video.pause();
    }
  }
  kickstartLoad();

  // ─── Seek management (debounce while previous seek pending) ────
  video.addEventListener('seeked', function () {
    isSeeking = false;
    if (pendingTime !== null) {
      var t = pendingTime;
      pendingTime = null;
      isSeeking = true;
      video.currentTime = t;
    }
  });

  function seekTo(t) {
    if (isSeeking) { pendingTime = t; return; }
    isSeeking = true;
    video.currentTime = t;
  }

  // ─── Body lock (page cannot move while hero is active) ─────────
  function engageLock() {
    if (locked) return;
    locked = true;
    lockedScrollY = window.scrollY;
    var b = document.body.style;
    b.position = 'fixed';
    b.top = '-' + lockedScrollY + 'px';
    b.left = '0';
    b.right = '0';
    b.width = '100%';
    b.height = '100%';
    b.overscrollBehavior = 'none';
  }

  function releaseLock() {
    if (!locked) return;
    locked = false;
    var y = lockedScrollY;
    var b = document.body.style;
    b.position = '';
    b.top = '';
    b.left = '';
    b.right = '';
    b.width = '';
    b.height = '';
    b.overscrollBehavior = '';
    window.scrollTo(0, y);
  }

  engageLock();

  // ─── Input capture ─────────────────────────────────────────────
  function addDelta(deltaY) {
    targetProgress = clamp(targetProgress + deltaY / SCRUB_DISTANCE, 0, 1);
    if (targetProgress > 0.001) hasStartedScrolling = true;
  }

  function onWheel(e) {
    addDelta(e.deltaY);
    e.preventDefault();
  }

  function onTouchStart(e) {
    touchStartY = (e.touches[0] && e.touches[0].clientY) || 0;
  }

  function onTouchMove(e) {
    var y = (e.touches[0] && e.touches[0].clientY) || touchStartY;
    var deltaY = touchStartY - y;
    touchStartY = y;
    addDelta(deltaY);
    e.preventDefault();
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  // iOS sometimes loses the race against native scroll — bind on the
  // element too, with capture.
  section.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  section.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });

  // ─── RAF loop ──────────────────────────────────────────────────
  function frame() {
    // Damped lerp — the "cinematic" feel.
    currentProgress += (targetProgress - currentProgress) * LERP_FACTOR;

    if (duration > 0) {
      seekTo(currentProgress * duration);
    }

    // Video subtle scale
    video.style.transform = 'scale(' + (1 + currentProgress * VIDEO_SCALE_MAX) + ')';

    // Title: blur out, move up, scale down as progress rises
    if (titleWrap) {
      var tTitle = 1 - clamp(currentProgress / TITLE_FADE_END, 0, 1);
      titleWrap.style.opacity = String(tTitle);
      titleWrap.style.transform =
        'translateY(' + ((1 - tTitle) * TITLE_OFFSET) + 'px) scale(' + (0.96 + tTitle * 0.04) + ')';
      titleWrap.style.filter = 'blur(' + ((1 - tTitle) * TITLE_BLUR_MAX) + 'px)';
    }

    // Hint: fades once user scrolls
    if (hint) {
      hint.style.opacity = hasStartedScrolling ? '0' : '1';
    }

    // Tagline: the payoff reveal
    if (taglineWrap) {
      var tTag = clamp((currentProgress - TAGLINE_REVEAL_START) / (1 - TAGLINE_REVEAL_START), 0, 1);
      taglineWrap.style.opacity = String(tTag);
      taglineWrap.style.transform =
        'translateY(' + ((1 - tTag) * TAGLINE_OFFSET) + 'px) scale(' + (0.97 + tTag * 0.03) + ')';
      taglineWrap.style.filter = 'blur(' + ((1 - tTag) * TAGLINE_BLUR_MAX) + 'px)';
    }

    // Progress bar
    if (progressBar) {
      progressBar.style.transform = 'scaleX(' + currentProgress + ')';
    }

    rafId = requestAnimationFrame(frame);
  }

  if (!reducedMotion) {
    rafId = requestAnimationFrame(frame);
  }

  // ─── Cleanup (matters if the hero is ever unmounted) ───────────
  window.addEventListener('beforeunload', function () {
    cancelAnimationFrame(rafId);
    releaseLock();
  });
})();
