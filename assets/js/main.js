// Little Steps site: the download state and the videos.
// No network calls, no storage, no cookies.
(function () {
  'use strict';

  var config = window.LITTLE_STEPS_CONFIG || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ------------------------------------------------------------ download buttons
  function setupDownload() {
    if (config.download !== 'live') return; // the HTML already shows the "soon" state
    var url =
      'https://github.com/' +
      encodeURIComponent(config.owner || 'Prasanna-KS-85') +
      '/little-steps-site/releases/latest/download/Little-Steps.dmg';
    document.querySelectorAll('[data-download]').forEach(function (soon) {
      var link = document.createElement('a');
      link.className = 'button button--primary';
      link.href = url;
      link.textContent = 'Download for Mac';
      link.setAttribute('data-download', '');
      soon.replaceWith(link);
    });
  }

  // ------------------------------------------------------------ videos
  // A video starts only when it is on screen and the reader has not asked for reduced motion; it
  // pauses when it scrolls away. With reduced motion nothing plays by itself: the poster stays and
  // the button says "Play". preload="none" in the HTML, so no video bytes load before that.
  function controlButton(video, btn, nameForLabel) {
    function sync() {
      var playing = !video.paused;
      btn.textContent = playing ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + nameForLabel);
    }
    btn.addEventListener('click', function () {
      if (video.paused) {
        video.dataset.userPaused = '';
        play(video);
      } else {
        video.dataset.userPaused = 'true';
        video.pause();
      }
    });
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    sync();
  }

  function play(video) {
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  var observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              var video = entry.target;
              if (entry.isIntersecting) {
                if (!reduceMotion.matches && video.dataset.userPaused !== 'true') play(video);
              } else if (!video.paused) {
                video.pause();
              }
            });
          },
          { threshold: 0.35 },
        )
      : null;

  function setupVideo(video, btn, name) {
    video.removeAttribute('controls');
    video.muted = true;
    controlButton(video, btn, name);
    if (observer) observer.observe(video);
    reduceMotion.addEventListener('change', function () {
      if (reduceMotion.matches) video.pause();
    });
  }

  function setupHero() {
    var video = document.getElementById('hero-video');
    if (!video) return;
    var frame = video.closest('.film');
    var playBtn = document.getElementById('hero-play');
    var soundBtn = document.getElementById('hero-sound');
    frame.classList.add('film--ready');
    video.addEventListener('playing', function () {
      frame.classList.add('film--started');
    });
    setupVideo(video, playBtn, 'the film');

    soundBtn.addEventListener('click', function () {
      var on = video.muted; // turning sound on
      video.muted = !on;
      soundBtn.textContent = on ? 'Turn sound off' : 'Turn sound on';
      if (on && video.paused) {
        video.dataset.userPaused = '';
        play(video);
      }
    });
  }

  function setupLoops() {
    document.querySelectorAll('[data-loop]').forEach(function (fig) {
      var video = fig.querySelector('video');
      var btn = fig.querySelector('button');
      fig.classList.add('loop--ready');
      setupVideo(video, btn, fig.getAttribute('data-loop'));
    });
  }

  setupDownload();
  setupHero();
  setupLoops();
})();
