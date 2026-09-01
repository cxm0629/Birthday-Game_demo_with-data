const demo = document.querySelector('.demo');
const starsRoot = document.querySelector('#stars');
const replay = document.querySelector('#replay');

const COUNT = 24;
const GATHER_PAUSE = 550;
const TRAVEL_MS = 1375;
const STAGGER_MS = 42;
let timers = [];

function random(seed) {
  const x = Math.sin(seed * 999.91) * 43758.5453;
  return x - Math.floor(x);
}

function starPositions(index) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const margin = Math.min(58, width * .1);
  const scatterX = margin + random(index + 2) * (width - margin * 2) - width / 2;
  const scatterY = height * (.17 + random(index + 31) * .43);
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / COUNT);
  const radius = Math.min(width, height) * (width < 520 ? .29 : .255);
  const targetX = Math.cos(angle) * radius;
  const targetY = Math.sin(angle) * radius;
  return { scatterX, scatterY, targetX, targetY };
}

function buildStars() {
  starsRoot.replaceChildren();
  for (let i = 0; i < COUNT; i++) {
    const {scatterX, scatterY, targetX, targetY} = starPositions(i);
    const star = document.createElement('span');
    star.className = 'star';
    star.style.cssText = `--sx:${scatterX.toFixed(1)}px;--sy:${scatterY.toFixed(1)}px;--tx:${targetX.toFixed(1)}px;--ty:${targetY.toFixed(1)}px;--delay:${i * STAGGER_MS}ms;--travel:${TRAVEL_MS + random(i + 9) * 310}ms;--size:${(7 + random(i + 45) * 10).toFixed(1)}px;--alpha:${(.68 + random(i + 64) * .28).toFixed(2)};--twinkle:${(1.7 + random(i + 88) * 2.4).toFixed(2)}s;--twinkle-delay:${(-random(i + 120) * 3).toFixed(2)}s`;
    star.innerHTML = '<i class="star-light"><b class="sparkle"></b></i>';
    starsRoot.appendChild(star);
  }
}

function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function play() {
  clearTimers();
  demo.classList.remove('gathering', 'gathered');
  buildStars();
  void demo.offsetWidth;
  timers.push(setTimeout(() => demo.classList.add('gathering'), GATHER_PAUSE));
  const finish = GATHER_PAUSE + TRAVEL_MS + STAGGER_MS * (COUNT - 1) + 275;
  timers.push(setTimeout(() => demo.classList.add('gathered'), finish));
}

replay.addEventListener('click', play);
window.addEventListener('resize', () => { clearTimeout(window.__endingResize); window.__endingResize = setTimeout(play, 180); });
play();

