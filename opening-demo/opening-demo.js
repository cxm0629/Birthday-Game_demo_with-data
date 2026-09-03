const opening = document.querySelector('#opening');
const start = document.querySelector('#start');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const timers = [];

function later(callback, delay) {
  timers.push(setTimeout(callback, delay));
}

function beginIntro() {
  if (reducedMotion.matches) {
    opening.classList.add('light-visible','light-settled','line-one-visible','line-two-visible','button-visible');
    return;
  }

  later(() => opening.classList.add('light-visible'), 700);
  later(() => opening.classList.add('light-settled'), 1500);
  later(() => opening.classList.add('line-one-visible'), 1650);
  later(() => opening.classList.add('line-two-visible'), 2700);
  later(() => opening.classList.add('button-visible'), 3550);
}

start.addEventListener('click', () => {
  if (opening.classList.contains('leaving')) return;
  timers.splice(0).forEach(clearTimeout);
  start.disabled = true;
  opening.classList.add('leaving');
});

beginIntro();

