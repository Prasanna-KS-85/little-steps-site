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

  // True while the film with sound is on: the silent loop must stay paused.
  var filmOn = false;

  function play(video) {
    if (filmOn && video.id === 'hero-video') return;
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
    frame.classList.add('film--ready');
    video.addEventListener('playing', function () {
      frame.classList.add('film--started');
    });
    setupVideo(video, playBtn, 'the film');
  }

  // ------------------------------------------------------------ the film with sound
  // Nothing is requested until the button is pressed: the video has no src and preload="none".
  // The file (16:9 from 768 px, 4:5 below) is chosen at click time. The loop pauses while the film
  // plays, and the page returns to the loop when the film ends or "Back to the loop" is pressed.
  function setupFilm() {
    var loop = document.getElementById('hero-video');
    var film = document.getElementById('film-video');
    var watch = document.getElementById('film-watch');
    var toggle = document.getElementById('film-toggle');
    var back = document.getElementById('film-back');
    var group = document.getElementById('film-sound-controls');
    var status = document.getElementById('film-status');
    if (!loop || !film || !watch || !toggle || !back || !group || !status) return;
    var figure = loop.closest('.film');
    var wide = window.matchMedia('(min-width: 768px)');

    function say(text) {
      status.textContent = text;
    }

    function stop(message) {
      var hadFocus = group.contains(document.activeElement);
      filmOn = false;
      film.pause();
      figure.classList.remove('film--sound');
      group.hidden = true;
      watch.hidden = false;
      if (hadFocus) watch.focus();
      if (!reduceMotion.matches && loop.dataset.userPaused !== 'true') play(loop);
      say(message);
    }

    function labelToggle() {
      toggle.textContent = film.paused ? 'Play the film' : 'Pause the film';
    }

    watch.addEventListener('click', function () {
      var file = wide.matches ? 'assets/video/film-16x9.mp4' : 'assets/video/film-4x5.mp4';
      filmOn = true;
      loop.pause();
      if (film.getAttribute('src') !== file) film.setAttribute('src', file);
      film.muted = false;
      film.currentTime = 0;
      watch.hidden = true;
      group.hidden = false;
      labelToggle();
      say('Loading the film with sound.');
      toggle.focus();
      var p = film.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () {
          if (filmOn) stop('The film could not play. Back to the loop.');
        });
      }
    });

    film.addEventListener('playing', function () {
      if (!filmOn) return;
      figure.classList.add('film--sound');
      labelToggle();
      say('Playing the film with sound.');
    });
    film.addEventListener('pause', function () {
      if (!filmOn || film.ended) return;
      labelToggle();
      say('The film is paused.');
    });
    film.addEventListener('play', function () {
      if (filmOn) labelToggle();
    });
    film.addEventListener('ended', function () {
      if (filmOn) stop('The film has ended. Back to the silent loop.');
    });
    film.addEventListener('error', function () {
      if (filmOn) stop('The film could not load. Back to the loop.');
    });

    toggle.addEventListener('click', function () {
      if (film.paused) play(film);
      else film.pause();
    });
    back.addEventListener('click', function () {
      stop('Back to the silent loop.');
    });
    figure.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && filmOn) stop('Back to the silent loop.');
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
  setupFilm();
  setupLoops();
})();
