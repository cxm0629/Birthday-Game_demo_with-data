const app = document.querySelector('#app');
const STORAGE_KEY = 'birthday-game-prototype-v1';

const state = {
  data: null,
  screen: 'start',
  completed: new Set(),
  viewed: {},
  heard: new Set(),
  activeVoiceChapter: 1,
  playing: null,
  audio: null,
  game: null,
  pageEntering: true,
  renderedScreen: null,
  preloadedImages: [],
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.completed = new Set(saved.completed || []);
    state.viewed = saved.viewed || {};
    state.heard = new Set(saved.heard || []);
  } catch (_) {}
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    completed: [...state.completed], viewed: state.viewed, heard: [...state.heard]
  }));
}

function chapter(id) { return state.data.chapters.find(c => c.id === id); }
function completedPeople() { return [...state.completed].length * 2; }
function voiceUnlocked() { return state.completed.size === state.data.chapters.length; }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
function esc(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function avatar(p) { return `<img class="avatar-img" src="${encodeURI(p.avatar)}" alt="${esc(p.name)}的头像" loading="eager" decoding="sync">`; }

async function preloadImages(data) {
  const urls = [...new Set(data.chapters.flatMap(c => c.people.flatMap(p => [p.avatar, p.riddleImage, p.image].filter(Boolean))))];
  const images = urls.map(url => {
    const img = new Image();
    img.src = encodeURI(url);
    return img;
  });
  state.preloadedImages = images;
  await Promise.all(images.map(img => {
    if (img.decode) return img.decode().catch(() => undefined);
    return new Promise(resolve => { img.onload = img.onerror = resolve; });
  }));
}

function shell(content, {back = null} = {}) {
  return `<div class="shell${state.pageEntering ? ' page-enter' : ''}">
    <header class="topbar">
      ${back ? `<button class="back" data-action="${back}">← 返回</button>` : '<span class="brand">BIRTHDAY PROJECT</span>'}
      <span class="progress">${completedPeople()} / 8 已认出</span>
    </header>${content}</div>`;
}

function syncAttributes(current, next) {
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of [...next.attributes]) {
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  if (current instanceof HTMLInputElement) current.value = next.value;
}

function patchNode(current, next) {
  if (!current || !next || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current?.replaceWith(next.cloneNode(true));
    return;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  syncAttributes(current, next);
  const currentChildren = [...current.childNodes];
  const nextChildren = [...next.childNodes];
  const common = Math.min(currentChildren.length, nextChildren.length);
  for (let i = 0; i < common; i++) patchNode(currentChildren[i], nextChildren[i]);
  for (let i = currentChildren.length - 1; i >= nextChildren.length; i--) currentChildren[i].remove();
  for (let i = common; i < nextChildren.length; i++) current.appendChild(nextChildren[i].cloneNode(true));
}

function updateScreen(markup, replacePage) {
  if (replacePage || !app.firstElementChild) {
    app.innerHTML = markup;
    return;
  }
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  patchNode(app.firstElementChild, template.content.firstElementChild);
}

function render() {
  const screens = { start: renderStart, select: renderSelect, game: renderGame, messages: renderMessages, voices: renderVoices, ending: renderEnding };
  const screenChanged = state.screen !== state.renderedScreen;
  state.pageEntering = screenChanged;
  updateScreen(screens[state.screen](), screenChanged);
  state.renderedScreen = state.screen;
}

function renderStart() {
  return shell(`<section class="hero">
    <p class="eyebrow">A little game for you</p>
    <h1>认出<br><span class="gold">我们</span></h1>
    <p class="lead">四个小章节，八位藏在线索里的朋友。找到他们，也找到为你准备的生日祝福。</p>
    <div class="actions"><button class="primary" data-action="go-select">开始寻找</button></div>
  </section>`);
}

function renderSelect() {
  const labels = ['短句双向配对', '关键词归位', '谐音轻解谜', '代表图翻牌'];
  const cards = state.data.chapters.map((c, i) => {
    const done = state.completed.has(c.id);
    return `<button class="chapter-card ${done ? 'done' : ''}" data-chapter="${c.id}">
      <span class="number">CHAPTER 0${c.id}</span>${done ? '<span class="status">✓ 已完成</span>' : ''}
      <h3>${esc(c.title)}</h3><p>${labels[i]} · 2位朋友</p>
    </button>`;
  }).join('');
  return shell(`<section class="section-head"><p class="eyebrow">Chapter Select</p><h2>从哪里开始？</h2><p>章节可以自由选择，完成状态会保存在这台设备上。</p></section>
    <div class="chapter-grid">${cards}</div>
    <div class="voice-unlock ${voiceUnlocked() ? 'ready' : ''}">
      <strong>${voiceUnlocked() ? '声音祝福已解锁' : '声音祝福尚未解锁'}</strong><br>
      <span>${voiceUnlocked() ? '还有一些话，想亲口告诉你。' : `完成四章后解锁 · ${completedPeople()} / 8`}</span>
      ${voiceUnlocked() ? '<div class="actions"><button class="primary" data-action="go-voices">进入 Voice Chapters</button></div>' : ''}
    </div>
    <div class="reset-zone"><button class="reset-button" data-action="reset-progress">↻ 重置全部章节</button><p>清除本机保存的通关、寄语和播放状态。</p></div>`, {back: 'go-start'});
}

function resetProgress() {
  if (!window.confirm('确定重置全部章节吗？当前通关记录和已读状态都会清除。')) return;
  stopAudio();
  localStorage.removeItem(STORAGE_KEY);
  state.completed = new Set();
  state.viewed = {};
  state.heard = new Set();
  state.activeVoiceChapter = 1;
  state.playing = null;
  state.game = null;
  state.screen = 'start';
  render();
}

function beginChapter(id) {
  const c = chapter(id);
  const game = { chapterId: id, feedback: '', tone: '', matched: new Set() };
  if (id === 1) { game.people = shuffle(c.people); game.sentences = shuffle(c.people); game.selectedPerson = null; game.selectedSentence = null; }
  if (id === 2) { game.keywords = shuffle(c.people.flatMap(p => p.keywords.map(k => ({keyword:k, personId:p.id})))); game.placed = {}; game.selectedKeyword = null; }
  if (id === 3) { game.index = 0; game.hint = false; game.reveal = false; }
  if (id === 4) { game.images = shuffle(c.people); game.cards = shuffle(c.people); game.selectedImage = null; game.revealed = null; game.wrongCounts = {}; game.hintPerson = null; }
  state.game = game; state.screen = 'game'; render();
}

function gameHeader(c, instruction) {
  return `<section class="section-head"><p class="eyebrow">Chapter 0${c.id}</p><h2>${esc(c.title)}</h2><p>${instruction}</p></section>`;
}

function renderGame() {
  const c = chapter(state.game.chapterId);
  let content;
  if (c.id === 1) content = renderChapter1(c);
  if (c.id === 2) content = renderChapter2(c);
  if (c.id === 3) content = renderChapter3(c);
  if (c.id === 4) content = renderChapter4(c);
  return shell(content, {back: 'go-select'});
}

function renderFeedback() {
  return `<p class="toast ${state.game.tone}">${esc(state.game.feedback || '可以慢慢试，没有失败和扣分。')}</p>`;
}

function renderChapter1(c) {
  const g = state.game;
  const people = g.people.map(p => `<button class="person-card ${g.selectedPerson === p.id ? 'selected' : ''} ${g.matched.has(p.id) ? 'matched' : ''}" data-c1-person="${p.id}" ${g.matched.has(p.id) ? 'disabled' : ''}>${avatar(p)}<strong>${esc(p.name)}</strong></button>`).join('');
  const sentences = g.sentences.map(p => `<button class="sentence-card ${g.selectedSentence === p.id ? 'selected' : ''} ${g.matched.has(p.id) ? 'matched' : ''}" data-c1-sentence="${p.id}" ${g.matched.has(p.id) ? 'disabled' : ''}>“${esc(p.sentence)}”</button>`).join('');
  return gameHeader(c, '可以先点人物，也可以先点短句。选择两端后立即判断。') + `<div class="game-grid">${people}</div><p class="subhead">打乱的短句</p><div class="sentence-list">${sentences}</div>${renderFeedback()}`;
}

function tryC1() {
  const g = state.game;
  if (!g.selectedPerson || !g.selectedSentence) return render();
  if (g.selectedPerson === g.selectedSentence) {
    g.matched.add(g.selectedPerson); g.feedback = '找到一位！这句话确实属于 TA。'; g.tone = 'good';
    g.selectedPerson = g.selectedSentence = null;
    if (g.matched.size === 2) return finishChapter(1);
  } else { g.feedback = '再试试，好像不是 TA。'; g.tone = 'bad'; g.selectedPerson = g.selectedSentence = null; }
  render();
}

function renderChapter2(c) {
  const g = state.game;
  const people = c.people.map(p => {
    const placed = g.placed[p.id] || [];
    const slots = [0,1].map(i => `<span class="slot ${placed[i] ? 'filled' : ''}">${esc(placed[i] || '待归位')}</span>`).join('');
    return `<button class="person-card" data-c2-person="${p.id}">${avatar(p)}<strong>${esc(p.name)}</strong><span class="slots">${slots}</span></button>`;
  }).join('');
  const bank = g.keywords.filter(k => !g.matched.has(`${k.personId}:${k.keyword}`)).map(k => {
    const key = `${k.personId}:${k.keyword}`;
    return `<button class="keyword ${g.selectedKeyword === key ? 'selected' : ''}" data-c2-key="${esc(key)}">${esc(k.keyword)}</button>`;
  }).join('');
  return gameHeader(c, '先选择一个词条，再点你认为对应的人物。') + `<div class="game-grid">${people}</div><p class="subhead">待归位词条</p><div class="keyword-bank">${bank}</div>${renderFeedback()}`;
}

function placeKeyword(personId) {
  const g = state.game;
  if (!g.selectedKeyword) { g.feedback = '请先选择一个词条。'; g.tone = ''; return render(); }
  const [owner, ...parts] = g.selectedKeyword.split(':'); const keyword = parts.join(':');
  if (owner === personId) {
    g.matched.add(g.selectedKeyword); (g.placed[personId] ||= []).push(keyword); g.feedback = '归位成功！'; g.tone = 'good'; g.selectedKeyword = null;
    if (g.matched.size === 4) return finishChapter(2);
  } else { g.feedback = '这个词有主人，但不是 TA。'; g.tone = 'bad'; g.selectedKeyword = null; }
  render();
}

function normalizeAnswer(s) { return s.toLowerCase().trim().replace(/\s+/g, ''); }
function renderChapter3(c) {
  const g = state.game, p = c.people[g.index];
  return gameHeader(c, '输入你想到的答案；答错可以继续尝试，也可以使用提示。') + `<div class="riddle">
    <div class="riddle-index">第 ${g.index + 1} / 2 题</div><div class="riddle-text">${p.riddleImage ? `<img class="riddle-image" src="${encodeURI(p.riddleImage)}" alt="第 ${g.index + 1} 题线索图" loading="eager" decoding="sync">` : esc(p.riddle)}</div>
    <input class="answer-input" id="answer" autocomplete="off" placeholder="输入昵称或拼音" aria-label="答案" />
    <div class="actions"><button class="primary" data-action="submit-answer">确认答案</button><button class="secondary" data-action="show-hint">提示</button><button class="secondary" data-action="reveal-answer">偷看答案</button></div>
    ${g.hint ? `<p class="hint-box">提示：${esc(p.hint)}</p>` : ''}
    ${g.reveal ? `<p class="hint-box">答案是：<strong class="gold">${esc(p.name)}</strong>。现在可以直接继续。</p><div class="actions"><button class="primary" data-action="accept-reveal">揭晓 TA</button></div>` : ''}
  </div>${renderFeedback()}`;
}

function submitAnswer() {
  const c = chapter(3), g = state.game, p = c.people[g.index];
  const value = document.querySelector('#answer').value;
  if (p.answers.some(a => normalizeAnswer(a) === normalizeAnswer(value))) {
    g.feedback = `答对了，是${p.name}！`; g.tone = 'good'; return nextRiddle();
  }
  g.feedback = '很接近也没关系，再想想看。'; g.tone = 'bad'; render();
}
function nextRiddle() { const g = state.game; if (g.index === 1) return finishChapter(3); g.index++; g.hint = false; g.reveal = false; render(); }

function renderChapter4(c) {
  const g = state.game;
  const images = g.images.map(p => `<button class="image-card ${g.selectedImage === p.id ? 'selected' : ''} ${g.matched.has(p.id) ? 'matched' : ''}" data-c4-image="${p.id}" ${g.matched.has(p.id) ? 'disabled' : ''}><img src="${encodeURI(p.image)}" alt="${esc(p.name)}的代表图片" loading="eager" decoding="sync"><div class="image-label">选择这张代表图</div></button>`).join('');
  const cards = g.cards.map(p => {
    const revealed = g.revealed === p.id || g.matched.has(p.id);
    return `<button class="covered-card ${revealed ? 'revealed' : ''} ${g.matched.has(p.id) ? 'matched' : ''} ${g.hintPerson === p.id ? 'hint' : ''}" data-c4-person="${p.id}" ${g.matched.has(p.id) ? 'disabled' : ''}>${revealed ? `${avatar(p)}<strong>${esc(p.name)}</strong>` : '<span class="cover">✦</span><span>翻开人物牌</span>'}</button>`;
  }).join('');
  return gameHeader(c, '先选一张代表图片，再翻开人物牌寻找对应的人。') + `<p class="subhead">代表图片</p><div class="game-grid">${images}</div><p class="subhead">盖住的人物牌</p><div class="game-grid">${cards}</div>${renderFeedback()}`;
}

function flipPerson(personId) {
  const g = state.game;
  if (!g.selectedImage) { g.feedback = '请先选择一张代表图片。'; g.tone = ''; return render(); }
  g.revealed = personId; g.hintPerson = null; render();
  setTimeout(() => {
    if (g.selectedImage === personId) {
      g.matched.add(personId); g.feedback = '配对成功！'; g.tone = 'good'; g.selectedImage = null; g.revealed = null;
      if (g.matched.size === 2) return finishChapter(4);
    } else {
      const image = g.selectedImage; g.wrongCounts[image] = (g.wrongCounts[image] || 0) + 1;
      g.feedback = '这张牌不是答案，它会重新盖回。'; g.tone = 'bad'; g.revealed = null;
      if (g.wrongCounts[image] >= 2) { g.hintPerson = image; g.feedback = '给你一点提示：有一张人物牌正在发光。'; }
    }
    render();
  }, 650);
}

function finishChapter(id) {
  state.completed.add(id); saveProgress(); state.screen = 'messages'; state.game = {chapterId:id}; render();
}

function renderMessages() {
  const c = chapter(state.game.chapterId), viewed = new Set(state.viewed[c.id] || []);
  const cards = c.people.map(p => `<article class="message-card"><button data-message="${p.id}">${avatar(p)}<strong>${esc(p.name)}</strong>${viewed.has(p.id) ? '<span class="viewed">✓ 已读</span>' : ''}</button>${viewed.has(p.id) ? `<p class="message-body">${esc(p.message)}</p>` : ''}</article>`).join('');
  return shell(`<section class="section-head"><p class="eyebrow">Chapter 0${c.id} Complete</p><h2>你找到他们了</h2><p>点击头像，看看他们留下的文字。</p></section><div class="message-grid">${cards}</div><div class="actions"><button class="primary" data-action="go-select">返回章节选择 · ${completedPeople()} / 8</button></div>`);
}

function renderVoices() {
  const c = chapter(state.activeVoiceChapter);
  const tabs = state.data.chapters.map(x => `<button class="chip ${x.id === c.id ? 'active' : ''}" data-voice-chapter="${x.id}">Voice 0${x.id}</button>`).join('');
  const cards = c.people.map(p => `<button class="voice-card ${state.playing === p.id ? 'playing' : ''}" data-voice-person="${p.id}">${avatar(p)}<strong>${esc(p.name)}</strong><div class="voice-state">${state.playing === p.id ? '▮▮ 正在播放 · 点击暂停' : state.heard.has(p.id) ? '✓ 已听过 · 再次播放' : '▶ 点击播放'}</div></button>`).join('');
  return shell(`<section class="section-head"><p class="eyebrow">Voice Chapters</p><h2>想亲口告诉你的话</h2><p>点击人物即可播放素材包中的音频；切换人物会停止上一段。</p></section><div class="chapter-tabs">${tabs}</div><div class="voice-grid">${cards}</div><div class="actions"><button class="primary" data-action="go-ending">前往生日结局</button></div>`, {back:'go-select'});
}

function stopAudio() {
  if (state.audio) {
    state.audio.pause();
    state.audio.currentTime = 0;
  }
  state.audio = null;
  state.playing = null;
}

function playVoice(personId) {
  if (state.playing === personId) {
    stopAudio();
    return render();
  }
  stopAudio();
  const person = state.data.chapters.flatMap(c => c.people).find(p => p.id === personId);
  if (!person?.voice) return;
  const audio = new Audio(encodeURI(person.voice));
  state.audio = audio;
  state.playing = personId;
  state.heard.add(personId);
  saveProgress();
  audio.addEventListener('ended', () => { if (state.audio === audio) { state.audio = null; state.playing = null; render(); } });
  audio.addEventListener('error', () => { if (state.audio === audio) { state.audio = null; state.playing = null; window.alert('音频无法播放，请检查文件格式或路径。'); render(); } });
  render();
  audio.play().catch(() => { if (state.audio === audio) { state.audio = null; state.playing = null; window.alert('浏览器阻止了播放，请再次点击播放按钮。'); render(); } });
}

function renderEnding() {
  return shell(`<section class="ending"><div class="constellation">✦ ✧ ✦ ✧<br>✧ ✦ ✧ ✦</div><p class="eyebrow">All chapters complete</p><h1>Happy<br><span class="gold">Birthday</span></h1><p class="lead">愿新的一岁，有喜欢的声音、甜甜的小事，也有一直陪在身边的人。</p><div class="actions"><button class="primary" data-action="go-voices">返回声音页</button><button class="secondary" data-action="go-select">重新浏览章节</button></div></section>`);
}

app.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const a = el.dataset.action;
  if (a === 'go-start') { state.screen = 'start'; render(); }
  if (a === 'go-select') { stopAudio(); state.screen = 'select'; render(); }
  if (a === 'go-voices' && voiceUnlocked()) { state.screen = 'voices'; render(); }
  if (a === 'go-ending') { stopAudio(); state.screen = 'ending'; render(); }
  if (a === 'reset-progress') resetProgress();
  if (el.dataset.chapter) beginChapter(Number(el.dataset.chapter));
  if (el.dataset.c1Person) { state.game.selectedPerson = el.dataset.c1Person; tryC1(); }
  if (el.dataset.c1Sentence) { state.game.selectedSentence = el.dataset.c1Sentence; tryC1(); }
  if (el.dataset.c2Key) { state.game.selectedKeyword = el.dataset.c2Key; state.game.feedback = '已选择词条，请点击人物。'; state.game.tone = ''; render(); }
  if (el.dataset.c2Person) placeKeyword(el.dataset.c2Person);
  if (a === 'submit-answer') submitAnswer();
  if (a === 'show-hint') { state.game.hint = true; render(); }
  if (a === 'reveal-answer') { state.game.reveal = true; render(); }
  if (a === 'accept-reveal') nextRiddle();
  if (el.dataset.c4Image) { state.game.selectedImage = el.dataset.c4Image; state.game.feedback = '图片已选中，现在翻开一张人物牌。'; state.game.tone = ''; render(); }
  if (el.dataset.c4Person) flipPerson(el.dataset.c4Person);
  if (el.dataset.message) { const id = state.game.chapterId; state.viewed[id] ||= []; if (!state.viewed[id].includes(el.dataset.message)) state.viewed[id].push(el.dataset.message); saveProgress(); render(); }
  if (el.dataset.voiceChapter) { stopAudio(); state.activeVoiceChapter = Number(el.dataset.voiceChapter); render(); }
  if (el.dataset.voicePerson) playVoice(el.dataset.voicePerson);
});

app.addEventListener('keydown', e => { if (e.key === 'Enter' && state.screen === 'game' && state.game.chapterId === 3 && document.activeElement.id === 'answer') submitAnswer(); });

async function init() {
  try {
    const response = await fetch('people_data.json');
    if (!response.ok) throw new Error('无法读取人物数据');
    state.data = await response.json();
    if (!Array.isArray(state.data.chapters) || state.data.chapters.length !== 4) throw new Error('人物数据格式不正确');
    await preloadImages(state.data);
    loadProgress(); render();
  } catch (err) {
    app.innerHTML = `<div class="error"><div><h2>试玩版无法启动</h2><p>${esc(err.message)}</p><p>请通过“启动试玩版.bat”打开，不要直接双击 index.html。</p></div></div>`;
  }
}

app.innerHTML = '<div class="loading">正在准备生日线索…</div>';
init();

