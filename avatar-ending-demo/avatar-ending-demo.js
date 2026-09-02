const demo = document.querySelector('#demo');
const root = document.querySelector('#participants');
const replay = document.querySelector('#replay');
const loading = document.querySelector('#loading');
const countLabel = document.querySelector('#countLabel');
const chibi = document.querySelector('#chibi');

const AVATAR_START_MS = 420;
const TRAVEL_MS = 1850;
const STAGGER_MS = 95;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let participants = [];
let nodes = [];
let timers = [];
let runToken = 0;
let phase = 'loading';

function numericId(value) {
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function initials(person) {
  const text = String(person.name || person.id || '?').trim();
  return /^[\x00-\x7F]+$/.test(text) ? text.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase() : text.slice(0,1);
}

function seeded(index, salt = 0) {
  const x = Math.sin((index + 1) * 917.13 + salt * 37.17) * 43758.5453;
  return x - Math.floor(x);
}

function heartSamples(count = 900) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count * Math.PI * 2;
    points.push({x:16*Math.sin(t)**3,y:-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))});
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
    points[i].distance = total;
  }
  points[0].distance = 0;
  return {points,total};
}

function evenHeartPoints(count) {
  const {points,total} = heartSamples();
  return Array.from({length:count},(_,i) => {
    const wanted = i / count * total;
    let low=0,high=points.length-1;
    while(low<high){const mid=(low+high)>>1;if(points[mid].distance<wanted)low=mid+1;else high=mid;}
    return points[low];
  });
}

function layout() {
  const width = innerWidth, height = innerHeight;
  const count = Math.max(nodes.length,1);
  const baseSize = width < 520 ? 32 : 40;
  const heartWidth = Math.min(width * .92, height * .82, 760);
  const heartHeight = Math.min(height * .74, width * .94, 690);
  const normalizedPerimeter = 102;
  const scale = Math.min(heartWidth/32,heartHeight/29);
  const availableSpacing = normalizedPerimeter*scale/count;
  const avatarSize = Math.max(20,Math.min(baseSize,availableSpacing*.76));
  const points = evenHeartPoints(count);
  const chibiSize = chibi.getBoundingClientRect().width;
  const protectedX = chibiSize / 2 + avatarSize / 2 + Math.max(16, width * .018);
  const protectedY = chibiSize / 2 + avatarSize / 2 + Math.max(18, height * .018);

  // Keep the initial state calm and legible: participants wait in ID order
  // in centered rows near the bottom, instead of being randomly scattered.
  const gap = Math.max(12, avatarSize * .72);
  const maxPerRow = Math.max(1, Math.floor((width - 40 + gap) / (avatarSize + gap)));
  const rowCount = Math.ceil(count / maxPerRow);
  const bottomY = height - Math.max(92, avatarSize * 3.2);

  nodes.forEach((node,index) => {
    const p = points[index];
    const row = Math.floor(index / maxPerRow);
    const rowStart = row * maxPerRow;
    const itemsInRow = Math.min(maxPerRow, count - rowStart);
    const positionInRow = index - rowStart;
    const rowWidth = itemsInRow * avatarSize + (itemsInRow - 1) * gap;
    const absoluteX = (width - rowWidth) / 2 + avatarSize / 2 + positionInRow * (avatarSize + gap);
    const absoluteY = bottomY - (rowCount - 1 - row) * (avatarSize + gap);
    const sx = absoluteX - width / 2;
    const sy = absoluteY - height * .44;
    let tx = p.x*scale;
    let ty = p.y*scale;
    // The chibi is a protected central zone. If a sampled heart point enters
    // it, push that point outward while preserving its direction and shape.
    const protectedDistance = (tx/protectedX)**2 + (ty/protectedY)**2;
    if (protectedDistance < 1) {
      const outward = 1 / Math.sqrt(Math.max(protectedDistance,.01));
      tx *= outward;
      ty *= outward;
    }
    node.style.setProperty('--avatar-size',`${avatarSize.toFixed(1)}px`);
    node.style.setProperty('--sx',`${sx.toFixed(1)}px`);
    node.style.setProperty('--sy',`${sy.toFixed(1)}px`);
    node.dataset.sx=sx;node.dataset.sy=sy;node.dataset.tx=tx;node.dataset.ty=ty;
  });
}

function createNodes() {
  const fragment = document.createDocumentFragment();
  nodes = participants.map((person,index) => {
    const node = document.createElement('div');
    node.className = 'avatar-star';
    node.setAttribute('aria-label',`${person.id} ${person.name}`);
    // Avatar paths in people_data.json are relative to the site root. This demo
    // lives one directory deeper, so resolve them from the JSON's directory.
    const avatarUrl = new URL(`../${person.avatar}`, location.href).href;
    node.innerHTML = `<i class="trail"></i><span class="orb"><img class="avatar" src="${avatarUrl}" alt=""><span class="fallback">${initials(person)}</span></span>`;
    const img = node.querySelector('img');
    img.addEventListener('error',()=>node.classList.add('image-error'),{once:true});
    img.decoding='async';img.loading='eager';
    node.style.setProperty('--breathe',`${(2.5+seeded(index,8)*1.8).toFixed(2)}s`);
    node.style.setProperty('--breathe-delay',`${(-seeded(index,9)*2).toFixed(2)}s`);
    fragment.appendChild(node);
    return node;
  });
  root.replaceChildren(fragment);
  layout();
}

function clearRun() {
  runToken++;
  timers.forEach(clearTimeout);timers=[];
  nodes.forEach(node => {node.getAnimations().forEach(a=>a.cancel());node.classList.remove('moving','arrived');});
  demo.classList.remove('chibi-visible','gathered','heart-pulse');
}

function transform(x,y){return `translate(${x}px,${y}px)`;}

function play() {
  clearRun();
  layout();
  const token = runToken;
  phase='moving';
  if(reducedMotion.matches){
    nodes.forEach(node=>node.style.transform=transform(node.dataset.tx,node.dataset.ty));
    phase='gathered';demo.classList.add('chibi-visible','gathered');return;
  }
  const travelDurations = nodes.map((_,index)=>TRAVEL_MS+seeded(index,12)*260);
  const revealDuration = Math.max(...travelDurations.map((duration,index)=>index*STAGGER_MS+duration));
  chibi.style.setProperty('--chibi-reveal',`${revealDuration.toFixed(0)}ms`);
  timers.push(setTimeout(()=>{if(token===runToken)demo.classList.add('chibi-visible');},AVATAR_START_MS));
  nodes.forEach((node,index) => {
    const sx=Number(node.dataset.sx),sy=Number(node.dataset.sy),tx=Number(node.dataset.tx),ty=Number(node.dataset.ty);
    node.style.transform=transform(sx,sy);
    const dx=tx-sx,dy=ty-sy,length=Math.max(Math.hypot(dx,dy),1);
    const bend=(index%2?1:-1)*Math.min(42,length*.08);
    const cx=sx+dx*.52-dy/length*bend,cy=sy+dy*.52+dx/length*bend;
    timers.push(setTimeout(()=>{
      if(token!==runToken)return;
      node.classList.add('moving');
      const animation=node.animate([{transform:transform(sx,sy)},{transform:transform(cx,cy),offset:.52},{transform:transform(tx,ty)}],{duration:travelDurations[index],easing:'cubic-bezier(.3,.03,.18,1)',fill:'forwards'});
      animation.finished.then(()=>{if(token===runToken){node.style.transform=transform(tx,ty);node.classList.remove('moving');node.classList.add('arrived');}}).catch(()=>{});
    },AVATAR_START_MS+index*STAGGER_MS));
  });
  const finish=AVATAR_START_MS+revealDuration+120;
  timers.push(setTimeout(()=>{if(token!==runToken)return;phase='gathered';demo.classList.add('heart-pulse','gathered');timers.push(setTimeout(()=>{if(token===runToken)demo.classList.remove('heart-pulse');},1200));},finish));
}

replay.addEventListener('click',play);
let resizeTimer;
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{layout();if(phase==='gathered'){nodes.forEach(n=>n.style.transform=transform(n.dataset.tx,n.dataset.ty));}else play();},180);});

async function init(){
  try{
    const response=await fetch('../people_data.json');
    if(!response.ok)throw new Error('无法读取参与者数据');
    const data=await response.json();
    participants=data.chapters.flatMap(chapter=>chapter.people).map(({id,name,avatar})=>({id,name,avatar})).sort((a,b)=>numericId(a.id)-numericId(b.id)||String(a.id).localeCompare(String(b.id)));
    if(!participants.length)throw new Error('没有可用的参与者');
    createNodes();
    countLabel.textContent=`${participants.length} participant lights · avatar preview`;
    loading.classList.add('hidden');replay.disabled=false;
    play();
  }catch(error){loading.textContent=`预览无法启动：${error.message}`;countLabel.textContent='Data unavailable';}
}
init();

