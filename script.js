// ---------- playlist ----------
// songs added via "load music" are inserted before the birthday song.
// type "yt"      -> id is a YouTube video ID
// type "spotify" -> id is a Spotify track ID
// Songs added with "load music" are inserted right before the one marked
// birthday:true. `img` is the queue row artwork (built-ins use the asset files,
// added songs get the same SVG generated with their title).
const songs = [
  { type: "yt",      id: "Wu8NeFXaoOc",            title: "Khúc Hát Mừng Sinh Nhật", img: "assets/queue-song1.svg", birthday: true },
  { type: "spotify", id: "0jSccBRnhNU4KtACMQPvco", title: "Mikrokosmos",             img: "assets/queue-song2.svg" },
  { type: "spotify", id: "5Z2DNRAhs6r4VdINVkRhYY", title: "Shout Out",               img: "assets/queue-song3.svg" },
];

// Set to true to show the Spotify embed in the bottom-left corner
// (needed once to log in to Spotify, otherwise you only get 30s previews).
const SHOW_SPOTIFY_EMBED = false;

let ytPlayer = null;
let ytReady = false;
let spController = null;
let spReady = false;
let currentIdx = 0;
let pendingSpotifyPlay = false;   // user clicked a Spotify song before the embed was ready
let spAdvanced = false;           // guard so "track ended" only fires once per load
let spLoadedId = null;            // Spotify track currently loaded in the embed
let spStarted = false;            // has the loaded Spotify track actually started?
let spIgnoreUntil = 0;            // ignore stale "paused" updates right after loading a track
let isPlaying = false;

// The button shows the CURRENT state: play icon while a song is playing,
// pause icon while stopped. Set to false for the usual "icon = next action" style.
const ICON_SHOWS_STATE = true;

// ---------- hidden YouTube player ----------
const playerHost = document.createElement('div');
playerHost.id = 'yt-player-host';
playerHost.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
document.body.appendChild(playerHost);

const ytApiTag = document.createElement('script');
ytApiTag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(ytApiTag);

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player-host', {
    height: '1',
    width: '1',
    videoId: songs[currentIdx].type === 'yt' ? songs[currentIdx].id : undefined,
    playerVars: { autoplay: 0, controls: 0 },
    events: {
      onReady: () => { ytReady = true; ytPlayer.setVolume(Math.round(volume * 100)); },
      onStateChange: onYtStateChange,
      onError: onPlayerError,
    },
  });
};

// ---------- hidden Spotify player ----------
const spWrap = document.createElement('div');
spWrap.style.cssText = SHOW_SPOTIFY_EMBED
  ? 'position:fixed;left:8px;bottom:8px;width:300px;height:80px;z-index:9998;'
  : 'position:fixed;left:0;bottom:0;width:300px;height:80px;opacity:0;pointer-events:none;z-index:-1;';
const spHost = document.createElement('div');
spWrap.appendChild(spHost);
document.body.appendChild(spWrap);

const spApiTag = document.createElement('script');
spApiTag.src = 'https://open.spotify.com/embed/iframe-api/v1';
spApiTag.async = true;
document.head.appendChild(spApiTag);

window.onSpotifyIframeApiReady = function (IFrameAPI) {
  const firstSp = songs.find(s => s.type === 'spotify');
  if (!firstSp) return;
  IFrameAPI.createController(
    spHost,
    { uri: 'spotify:track:' + firstSp.id, width: 300, height: 80 },
    (controller) => {
      spController = controller;
      spLoadedId = firstSp.id;
      controller.addListener('ready', () => {
        spReady = true;
        if (pendingSpotifyPlay) { pendingSpotifyPlay = false; playSong(currentIdx); }
      });
      controller.addListener('playback_update', onSpotifyUpdate);
    }
  );
};

function onSpotifyUpdate(e) {
  const song = songs[currentIdx];
  if (!song || song.type !== 'spotify' || song.id !== spLoadedId) return;
  const d = e.data;
  if (!d.isPaused) {
    spStarted = true;
    setPlayingUI(true);
    return;
  }
  // Right after loadUri Spotify can briefly report "paused" for the old/new track.
  if (Date.now() < spIgnoreUntil) return;
  setPlayingUI(false);
  // Track finished: paused at (or very near) the end.
  if (spStarted && d.duration > 0 && d.position >= d.duration - 1000 && !spAdvanced) {
    spAdvanced = true;
    goNextOrStop();
  }
}

// ---------- error display ----------
const errToast = document.createElement('div');
errToast.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);max-width:90vw;padding:8px 14px;background:#222;color:#fff;font:14px Arial,sans-serif;border-radius:8px;z-index:9999;display:none;text-align:center;';
document.body.appendChild(errToast);

function showToast(msg) {
  console.warn(msg);
  errToast.textContent = msg;
  errToast.style.display = 'block';
  setTimeout(() => { errToast.style.display = 'none'; }, 6000);
}

function onPlayerError(e) {
  const reasons = {
    2: 'invalid video ID',
    5: 'HTML5 player error',
    100: 'video removed or private',
    101: 'embedding disabled by the owner',
    150: 'embedding disabled by the owner',
    153: 'no referrer sent (open the page from a web server, not file://)',
  };
  showToast('YouTube error ' + e.data + ' on "' + songs[currentIdx].title + '": ' + (reasons[e.data] || 'unknown'));
  setPlayingUI(false);
}

// ---------- YouTube state ----------
function onYtStateChange(e) {
  if (!songs[currentIdx] || songs[currentIdx].type !== 'yt') return;
  if (e.data === YT.PlayerState.PLAYING) {
    setPlayingUI(true);
  } else if (e.data === YT.PlayerState.PAUSED) {
    setPlayingUI(false);
    highlightQueue(currentIdx);
  } else if (e.data === YT.PlayerState.ENDED) {
    setPlayingUI(false);
    highlightQueue(currentIdx);
    goNextOrStop();
  }
}

function setPlayingUI(playing) {
  isPlaying = playing;
  if (playing && !titleActive) { titleActive = true; updateTitle(); }
  document.querySelector('.cd').classList.toggle('spinning', playing);
  const showPlayIcon = ICON_SHOWS_STATE ? playing : !playing;
  document.querySelector('.play-btn').style.display = showPlayIcon ? 'block' : 'none';
  document.querySelector('.pause-btn').style.display = showPlayIcon ? 'none' : 'block';
}

function updateNavButtons() {
  document.querySelector('.previous-btn').classList.toggle('disabled', currentIdx <= 0);
  document.querySelector('.next-btn').classList.toggle('disabled', currentIdx >= songs.length - 1);
}

function goNextOrStop() {
  if (currentIdx < songs.length - 1) playSong(currentIdx + 1);
  else setPlayingUI(false);
}

// ---------- unified playback ----------
function stopOthers(type) {
  try {
    if (type !== 'yt' && ytReady && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    if (type !== 'spotify' && spReady && spController) spController.pause();
  } catch (err) { /* ignore */ }
}

function playSong(idx) {
  currentIdx = idx;
  const song = songs[idx];
  if (song !== decorSong) { decorSong = song; newDecor(); }   // fresh decor per song
  spAdvanced = false;
  stopOthers(song.type);

  if (song.type === 'yt') {
    if (ytReady && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(song.id);
      setPlayingUI(true);
    }
  } else if (song.type === 'spotify') {
    if (spReady && spController) {
      spLoadedId = song.id;
      spStarted = false;
      spIgnoreUntil = Date.now() + 2500;
      spController.loadUri('spotify:track:' + song.id);
      spController.play();
      setPlayingUI(true);
    } else {
      pendingSpotifyPlay = true;   // will start once the embed reports ready
    }
  }
  highlightQueue(idx);
  updateNavButtons();
}

function resumeCurrent() {
  const song = songs[currentIdx];
  if (!song) return;
  if (song.type === 'yt') {
    if (!ytReady) return;
    ytPlayer.playVideo();
    setPlayingUI(true);
  } else if (song.type === 'spotify') {
    if (!spReady) return;
    if (spLoadedId === song.id && spStarted) {
      spController.resume();       // continue where it stopped
      setPlayingUI(true);
    } else {
      playSong(currentIdx);        // never started / different track: load it
    }
  }
}

function pauseCurrent() {
  const song = songs[currentIdx];
  if (!song) return;
  if (song.type === 'yt') {
    if (!ytReady) return;
    ytPlayer.pauseVideo();
  } else if (song.type === 'spotify') {
    if (!spReady) return;
    spController.pause();
  }
  setPlayingUI(false);
}

function highlightQueue(idx) {
  updateTitle();
  document.querySelectorAll('.queue-row').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    if (i === idx) el.scrollIntoView({ block: 'nearest' });
  });
}

// ---------- big title: follows the current song ----------
// Short title (fits on one line at the big size)  -> one big line only.
// Long title                                      -> two lines (small on top,
//   big below) like the original "go big or / go home".
// Hidden until a song has started playing.
const TITLE_W = 425.71, TITLE_H = 248.61;   // title-placeholder viewBox
const TITLE_BIG = 85.61, TITLE_SMALL = 56.81;
const titleSvg = document.querySelector('.title-placeholder');
const titleL1 = document.getElementById('title-l1');
const titleL2 = document.getElementById('title-l2');
const measureCtx = document.createElement('canvas').getContext('2d');
let titleActive = false;    // has a song started yet?
let titleKey = null;

// width of `t` in the title font at font-size 1
function unitWidth(t) {
  measureCtx.font = '100px Sabrina, cursive';
  return measureCtx.measureText(t).width / 100;
}

function setTitleLine(el, text, x, y, size) {
  el.textContent = text;
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('font-size', size);
}

function layoutTitle(raw) {
  const words = displayTitle(raw).split(' ').filter(Boolean);
  const text = words.join(' ') || 'untitled';
  const cx = TITLE_W / 2;
  const full = unitWidth(text);

  // short (or a single unbreakable word): one line, shrunk only if it can't fit
  if (words.length <= 1 || full * TITLE_BIG <= TITLE_W + 2) {
    const fs = Math.min(TITLE_BIG, TITLE_W / full);
    setTitleLine(titleL1, '', cx, 0, TITLE_SMALL);
    setTitleLine(titleL2, text, cx, TITLE_H / 2 + fs * 0.3, fs);   // centred in the box
    return;
  }

  // long: pick the word split where both lines stay as large as possible
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const fs1 = Math.min(TITLE_SMALL, TITLE_W / unitWidth(a));
    const fs2 = Math.min(TITLE_BIG, TITLE_W / unitWidth(b));
    const score = Math.min(fs1 / TITLE_SMALL, fs2 / TITLE_BIG);
    if (!best || score > best.score) best = { a, b, fs1, fs2, score };
  }
  setTitleLine(titleL1, best.a, cx, 65.84, best.fs1);
  setTitleLine(titleL2, best.b, cx, 185.17, best.fs2);
}

function updateTitle() {
  const song = titleActive ? songs[currentIdx] : null;
  titleSvg.style.display = song ? '' : 'none';   // nothing played yet -> no title
  if (!song) return;
  if (song.title === titleKey) return;
  titleKey = song.title;
  layoutTitle(song.title);
}

// measure again once the Sabrina font has actually loaded
if (document.fonts && document.fonts.load) {
  document.fonts.load('100px Sabrina').then(() => { titleKey = null; updateTitle(); });
}

// ---------- decor: random sparkles around the music-bg, never on the title ----------
// Every song gets its own random layout: decor1-5 in random spots, random
// sizes, and a random amount of them. Positions are picked inside the music-bg
// box and skip a padded box around the big title.
const DECOR_FILES = [1, 2, 3, 4, 5].map((n) => 'assets/decor' + n + '.svg');
const DECOR_MIN = 5, DECOR_MAX = 9;              // how many per song
const DECOR_SIZE_MIN = 0.07, DECOR_SIZE_MAX = 0.20;   // width as a share of music-bg width
const DECOR_SPACING = 0.08;                      // min gap between decors, share of music-bg width
const musicHost = document.querySelector('.music');
const musicBgEl = document.querySelector('.music-bg');
const decorEls = [];
let decorSeed = 0;
let decorSong = null;

// small seeded random generator, so a resize re-lays out the SAME pattern
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// bounding box of an element, even while it is display:none (the title is
// hidden until the first song plays, but its spot still has to stay free)
function measureBox(el) {
  const prev = el.style.display;
  el.style.display = '';
  const r = el.getBoundingClientRect();
  el.style.display = prev;
  return r;
}

function layoutDecor() {
  const bg = musicBgEl.getBoundingClientRect();
  if (!bg.width) return;
  const t = measureBox(titleSvg);
  const rng = makeRng(decorSeed);

  const count = DECOR_MIN + Math.floor(rng() * (DECOR_MAX - DECOR_MIN + 1));
  const inset = bg.width * 0.02;
  const gap = bg.width * 0.03;                   // breathing room around the title
  const spacing = bg.width * DECOR_SPACING;       // min empty space between two decors

  // first pass uses every decor file once (shuffled), the rest are random picks
  const deck = DECOR_FILES.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const placed = [];
  for (let n = 0; n < count; n++) {
    const src = n < deck.length ? deck[n] : DECOR_FILES[Math.floor(rng() * DECOR_FILES.length)];
    const size = Math.max(24, bg.width * (DECOR_SIZE_MIN + rng() * (DECOR_SIZE_MAX - DECOR_SIZE_MIN)));
    const half = size / 2;

    // try a bunch of random spots and keep the one furthest from the others,
    // so the decor spreads out instead of clumping
    let spot = null, bestRoom = -Infinity;
    for (let tries = 0; tries < 40; tries++) {
      const x = bg.left + inset + half + rng() * Math.max(0, bg.width - 2 * (inset + half));
      const y = bg.top + inset + half + rng() * Math.max(0, bg.height - 2 * (inset + half));
      // not on the title (its box grown by half the decor size + a gap)
      if (x > t.left - half - gap && x < t.right + half + gap &&
          y > t.top - half - gap && y < t.bottom + half + gap) continue;
      // free space between this decor's edge and the nearest other decor's edge
      let room = Infinity;
      for (const p of placed) room = Math.min(room, Math.hypot(p.x - x, p.y - y) - (p.size + size) / 2);
      if (room < spacing) continue;                    // too close: hard no
      if (room > bestRoom) { bestRoom = room; spot = { x, y }; }
    }
    if (spot) placed.push({ src, size, x: spot.x, y: spot.y });
  }

  // reuse the <img> elements (no flicker on resize), add / remove as needed
  while (decorEls.length < placed.length) {
    const img = document.createElement('img');
    img.className = 'decor';
    img.alt = '';
    musicHost.appendChild(img);
    decorEls.push(img);
  }
  while (decorEls.length > placed.length) decorEls.pop().remove();
  placed.forEach((p, i) => {
    const img = decorEls[i];
    if (img.getAttribute('src') !== p.src) img.src = p.src;
    img.style.width = p.size + 'px';
    img.style.left = p.x + 'px';
    img.style.top = p.y + 'px';
  });
}

function newDecor() {
  decorSeed = (Math.random() * 4294967296) >>> 0;
  layoutDecor();
}

let decorFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(decorFrame);
  decorFrame = requestAnimationFrame(layoutDecor);
});

// ---------- queue rendering (click a row to play that song) ----------
const queueList = document.getElementById('queue-list');

const QUEUE_SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 364.95 55.9"><defs><filter id="luminosity-invert" x="-2.77" y="-2.74" width="370" height="61" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feColorMatrix result="cm" values="-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0"/></filter><mask id="mask" x="-2.77" y="-2.74" width="370" height="61" maskUnits="userSpaceOnUse"><g filter="url(#luminosity-invert)"><image width="370" height="61" transform="translate(-2.77 -2.74)" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAXIAAAA9CAYAAACwXeIEAAAACXBIWXMAAAsSAAALEgHS3X78AAAFH0lEQVR4nO3cbU/aahzH8V/voQU7mEYNDxb3/l/VTDZhs9xIWyhtOY96nYKyLcczscv3kzSi62XwyXf/XG2xJO0FAOgs+9xvAADwOu7xD66urjQajRSGoXzfl+u6cl1XlmWZQ5L5CgB4nf1+b742R1VVKstSu91OWZZpsVjo4eHhxfUHIZ9MJrq7u9PNzY3iONZgMFAQBPJ9X47jyLbtZ0EHAPx3xxGv61p1XasoChVFoTzPtVqtNJvN9OHDB02nU83n84PfYUJ+dXWlu7s7ff78WZPJRJeXl4rjWFEUmcnccRxCDgD/s+NJvKoqE/H1eq35fK7RaKR+vy9Jp0M+Go10c3OjyWSiT58+6fr6WqPRSFEUqdfrEXIA+EPaIa/rWmVZqigKZVmm1WqlJEnU6/UkSXmeaz6fazqdmvUm5GEYKo5jXV5e6vr6Wre3txqPx2Z7xXEcE/KGbXOtFABeo65r87oJeXsiHw6HCoJAVVUpz3P9+PHDbLE0TMh939dgMFAcxxqNRhqPxxqPx4qiSJ7nmf1xAMCf1Uzl/X5fnudpv9+bC57D4dBssTRMyF3XVRAEiqJIURRpMBgoiiIFQUDAAeAN2bZtbjLZ7/fabDYaDocKw1D9fl++7x+e37xwXVe+78v3ffV6PQVBIM/ziDgAnInjOAqCQP1+/6DLjuMcnGdCblmWHMcx9403txsCAM7HdV15nmcGbdd1n7X5IOS2bZuLmscXNgEAb689ZJ9q80HIjw8AwHk1Q/bx0WYfLyDiAPB+tLvcfrq+7eREDgB4P372OVcnr2ZyoRMAzu93PqyQWgNAB7RjfnJrBQDwvjGRA8BfipADQMcRcgDoOEIOAB1HyAHgnfvVsz2EHAA6jpADQMcRcgDoOEIOAB1HyAGg4wg5AHQcIQeAjiPkANBxhBwAOo6QA0DHEXIA6DhCDgAdR8gBoOMIOQB0HCEHgI4j5ADwzu33+5/+OyEHgI4j5ADQcYQcADqOkANAR5zaKyfkANAhL8XcPj6hOamu67d5VwCAX2oH/Djm9u+cBAA4j/aA/VtbK82C9kIAwHn9qs328Yl1XbOtAgDvRLvNp2J+EPIm4s3BVA4A53Xc5qqqng3bJuRVVamqKpVlaQ4mcwA4rybeZVmaiJ+cyOu6VlEUB0dVVW/+pgEA/6qqSrvdznT5pSHbhLwsSxVFoSzLlKapsixTnufEHADOpCxLbTYb5XmuzWaj7Xb74pDtNi92u53SNFWaplqtVrq4uFAQBLIsS71eT67ryrZ5fggA/rS6rk3E0zTVer3W09OT0jRVnufa7XYH55uQZ1mm1WqlJEkUx7F6vZ4sy1JRFArDUL7vy3Ec2bYty7JM1C3Letu/EAD+Mu0HMZs98WaHZLVa6fHxUUmSaLFY6OnpSXmeH6w3IV8sFnp8fNRsNlO/3zcRv7i4UBiGCoLATOVNzCVCDgCv1b6tsLnxZLvdKssyLZdLJUmi6XSq2WymJEm0XC4P1puQT6dTffz4UUEQSJI2m42Wy6UGg4GZyNshb8e8jbADwM8d33XSvk+8CXkzka/XaxPyL1++6P7+Xt++fTtY77a/+fr1q/mfYLFYHEzjnucdbK00x0uIOQA8d+rZnPZE3myt7HY7bbdb5Xmu5XKp79+/6/7+XrPZ7Nl6S9Kz33x7e6s4jhVFkTzPk+u6chznWcAJNgC8XvuzVJqjuW+8KAptNhslSaKHh4cX178YcgBAd3A/IQB0HCEHgI77B/BdunD4yV+AAAAAAElFTkSuQmCC"/></g></mask></defs><g isolation="isolate"><g id="Layer_2" data-name="Layer 2"><g id="Layer_3" data-name="Layer 3"><g id="queue-song1"><g><rect width="364.95" height="55.9" rx="6.34" ry="6.34" fill="#c3b6d3"/><g mask="url(#mask)"><g mix-blend-mode="multiply" opacity=".75"><rect width="364.95" height="55.9" rx="6.34" ry="6.34" fill="#a08cb5"/></g></g></g><g opacity=".7"><path d="M37.28,20.58v11.6c-.67-.6-1.56-.97-2.54-.97-2.1,0-3.82,1.71-3.82,3.82s1.71,3.82,3.82,3.82,3.81-1.71,3.82-3.81h0v-9.32l11.35-2.88v6.26c-.67-.6-1.56-.97-2.54-.97-2.1,0-3.82,1.71-3.82,3.82s1.71,3.82,3.82,3.82,3.82-1.71,3.82-3.82v-14.89l-13.91,3.53Z" data-original="#000000" fill="#fff"/></g></g></g></g></g></svg>`;

// row artwork has no text any more: the title is a live HTML overlay so it can scroll
const QUEUE_BG_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(QUEUE_SVG_TEMPLATE);
function queueImageFor() { return QUEUE_BG_URL; }

// vietnamese / accented letters -> plain english letters (e.g. "khúc hát" -> "khuc hat")
const LETTER_MAP = { 'đ':'d','Đ':'D','ø':'o','Ø':'O','ł':'l','Ł':'L','ß':'ss','æ':'ae','Æ':'AE','œ':'oe','Œ':'OE' };
function plainTitle(s) {
  return String(s || '')
    .replace(/[đĐøØłŁßæÆœŒ]/g, c => LETTER_MAP[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// title text for a queue row / the big title: plain letters, lowercase, full length
function displayTitle(s) { return plainTitle(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

function renderQueue() {
  queueList.innerHTML = '';
  songs.forEach((song, i) => {
    const row = document.createElement('div');
    row.className = 'queue-row';

    const img = document.createElement('img');
    img.className = 'queue-item';
    img.src = queueImageFor();
    img.alt = song.title;
    img.draggable = false;
    img.addEventListener('click', () => playSong(i));

    const x = document.createElement('button');
    x.className = 'queue-remove';
    x.type = 'button';
    x.textContent = '\u00d7';
    x.setAttribute('aria-label', 'remove ' + song.title);
    x.addEventListener('click', (e) => { e.stopPropagation(); removeSong(i); });

    const box = document.createElement('div');
    box.className = 'queue-title';
    const track = document.createElement('span');
    track.className = 'queue-title-track';
    const text = document.createElement('span');
    text.className = 'queue-title-text';
    text.textContent = displayTitle(song.title);
    track.appendChild(text);
    box.appendChild(track);

    row.appendChild(img);
    row.appendChild(box);
    row.appendChild(x);
    queueList.appendChild(row);
  });
  highlightQueue(currentIdx);
  updateQueueMarquees();
}

// Titles that don't fit the row scroll to the left forever (two copies of the
// text side by side, track slides by exactly one copy = seamless loop).
const MARQUEE_SPEED = 40;   // px per second
function updateQueueMarquees() {
  document.querySelectorAll('.queue-title').forEach((box) => {
    const track = box.firstElementChild;
    const text = track.firstElementChild;
    while (track.children.length > 1) track.removeChild(track.lastChild);
    track.classList.remove('scrolling');
    if (text.offsetWidth <= box.clientWidth) return;      // fits: stay still
    track.classList.add('scrolling');                      // adds the gap after the text
    track.appendChild(text.cloneNode(true));
    track.style.setProperty('--dur', (text.offsetWidth / MARQUEE_SPEED) + 's');
  });
}
window.addEventListener('resize', updateQueueMarquees);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateQueueMarquees);

function removeSong(i) {
  const wasCurrent = i === currentIdx;
  const wasPlaying = isPlaying;
  songs.splice(i, 1);

  if (wasCurrent) {
    // the removed song was the current one: stop it, then move on to whatever
    // slid into its place (or the new last song)
    spAdvanced = true;                       // don't let a stale "ended" event skip again
    stopOthers(null);
    setPlayingUI(false);
    currentIdx = Math.min(i, songs.length - 1);
    if (songs.length && wasPlaying) playSong(currentIdx);
  } else if (i < currentIdx) {
    currentIdx--;                            // keep pointing at the same song
  }
  if (currentIdx < 0) currentIdx = 0;
  if (!songs.length) titleActive = false;

  renderQueue();
  updateNavButtons();
}

// ---------- transport controls ----------
// Both icons toggle: whichever is visible, a click flips playing <-> stopped.
function togglePlayback() { isPlaying ? pauseCurrent() : resumeCurrent(); }
document.querySelector('.play-btn').addEventListener('click', togglePlayback);
document.querySelector('.pause-btn').addEventListener('click', togglePlayback);

// ---------- volume: drag the volume-btn slider ----------
// The slider art is regenerated on every change so the white fill follows the
// pointer. Fill width 35.74 of 184.85 is the original "empty" (0 volume) knob.
// Note: the Spotify embed API has no volume control, so this only affects
// YouTube songs (use the device volume for Spotify).
const volumeBtn = document.querySelector('.volume-btn');
const VOL_W = 184.85, VOL_H = 18.88, VOL_KNOB = 35.74;
let volume = 1;   // 0..1

function volumeSvg(v) {
  const fill = VOL_KNOB + v * (VOL_W - VOL_KNOB);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VOL_W} ${VOL_H}">` +
    `<rect width="${VOL_W}" height="${VOL_H}" rx="9.44" ry="9.44" fill="#9f8ead"/>` +
    `<rect width="${fill}" height="${VOL_H}" rx="9.44" ry="9.44" fill="#fff"/></svg>`);
}

function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  volumeBtn.src = volumeSvg(volume);
  try { if (ytReady && ytPlayer.setVolume) ytPlayer.setVolume(Math.round(volume * 100)); }
  catch (err) { /* ignore */ }
}

function volumeFromPointer(e) {
  const r = volumeBtn.getBoundingClientRect();
  const fillFrac = (e.clientX - r.left) / r.width;            // where the knob's edge should be
  const knobFrac = VOL_KNOB / VOL_W;
  setVolume((fillFrac - knobFrac) / (1 - knobFrac));
}

let draggingVolume = false;
volumeBtn.draggable = false;
volumeBtn.addEventListener('pointerdown', (e) => {
  draggingVolume = true;
  volumeBtn.setPointerCapture(e.pointerId);
  volumeFromPointer(e);
  e.preventDefault();
});
volumeBtn.addEventListener('pointermove', (e) => { if (draggingVolume) volumeFromPointer(e); });
const endVolumeDrag = (e) => {
  draggingVolume = false;
  if (volumeBtn.hasPointerCapture(e.pointerId)) volumeBtn.releasePointerCapture(e.pointerId);
};
volumeBtn.addEventListener('pointerup', endVolumeDrag);
volumeBtn.addEventListener('pointercancel', endVolumeDrag);
setVolume(volume);

// ---------- close the tutorial bubble ----------
document.querySelector('.close-tutorial').addEventListener('click', () => {
  document.querySelector('.tutorial').classList.add('hidden');
});
document.querySelector('.next-btn').addEventListener('click', () => {
  if (currentIdx < songs.length - 1) playSong(currentIdx + 1);
});
document.querySelector('.previous-btn').addEventListener('click', () => {
  if (currentIdx > 0) playSong(currentIdx - 1);
});


// ---------- load music: paste a link, press "load music" ----------
const linkInput = document.getElementById('link-input');
let loading = false;

function parseLink(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  let m = s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (m) return { type: 'spotify', id: m[1] };

  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1];
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else if ((m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/))) id = m[1];
    return id && /^[\w-]{11}$/.test(id) ? { type: 'yt', id } : null;
  }
  if (host === 'open.spotify.com') {
    m = u.pathname.match(/\/track\/([A-Za-z0-9]{22})/);
    return m ? { type: 'spotify', id: m[1] } : null;
  }
  return null;
}

// lowercase, no artist, no "(official video)" style noise
function cleanTitle(raw, type) {
  let t = String(raw || '');
  t = t.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ');
  if (type === 'yt') {
    if (t.includes('|')) t = t.split('|')[0];                    // "Song | Artist"
    const parts = t.split(/\s[-–—]\s/);                          // "Artist - Song"
    if (parts.length > 1) t = parts.slice(1).join(' - ');
    t = t.replace(/\s+(official\s+)?(music\s+video|lyric\s+video|video|mv|audio|lyrics)\s*$/i, '');
  }
  return displayTitle(t);
}

async function fetchTitle(song) {
  const url = song.type === 'yt'
    ? 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + song.id)
    : 'https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + song.id);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.json()).title;
  } finally {
    clearTimeout(timer);
  }
}

function addSongBeforeBirthday(song) {
  let at = songs.findIndex(s => s.birthday);
  if (at < 0) at = songs.length;
  songs.splice(at, 0, song);
  if (at <= currentIdx) currentIdx++;     // keep pointing at the same song
  renderQueue();
  updateNavButtons();
}

async function loadMusic() {
  if (loading) return;
  const parsed = parseLink(linkInput.value);
  if (!parsed) {
    showToast('paste a spotify track or youtube video link first');
    return;
  }
  if (songs.some(s => s.type === parsed.type && s.id === parsed.id)) {
    showToast('that song is already in the queue');
    return;
  }
  loading = true;
  try {
    let title = '';
    try { title = cleanTitle(await fetchTitle(parsed), parsed.type); }
    catch (err) { showToast("added, but couldn't read the song title"); }
    if (!title) title = 'untitled';
    addSongBeforeBirthday({ ...parsed, title, img: queueImageFor(title) });
    linkInput.value = '';
  } finally {
    loading = false;
  }
}

document.querySelector('.load-music').addEventListener('click', loadMusic);
linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadMusic(); });

// initial UI state: nothing playing yet
updateTitle();
newDecor();
setPlayingUI(false);
renderQueue();
updateNavButtons();

// ---------- open the player: click the app icon ----------
// The player is display:none until then, so anything measured from the layout
// (decor spots, scrolling queue titles) is redone once it becomes visible.
const appIcon = document.querySelector('.app');
const playerEl = document.querySelector('.music-player');
if (appIcon && playerEl) {
  appIcon.addEventListener('click', () => {
    playerEl.classList.add('open');
    layoutDecor();
    updateQueueMarquees();
  });
}