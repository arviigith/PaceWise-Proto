/* =====================================================
   timer.js
   Focus timer and breaks. Nothing here is saved except finished rounds.
   ===================================================== */

const RING_LENGTH = 565.5;             // length of the timer circle (2 x 3.14 x radius 90)

// Timer state (not saved; the timer only runs while the page is open)
let timerId = null;            // setInterval id (null = not running)
let endTime = 0;               // clock time (ms) when the running timer reaches 0
let phase = 'work';            // 'work' or 'break'
let isLongBreak = false;       // true when the break is the long one
let secondsLeft = 25 * 60;     // seconds left on the timer


// Length of the current phase in seconds
function phaseSeconds() {
  if (phase === 'work') return appData.work * 60;
  if (isLongBreak) return appData.brk * 3 * 60;
  return appData.brk * 60;
}

// The time as text, for example 24:32
function clockText() {
  return twoDigits(Math.floor(secondsLeft / 60)) + ':' + twoDigits(secondsLeft % 60);
}

// Redraw everything about the timer: numbers, circle, labels and the main button
function updateClock() {
  $('#clock').textContent = clockText();
  if (phase === 'work') $('#phase').textContent = 'Focus';
  else if (isLongBreak) $('#phase').textContent = 'Long break';
  else $('#phase').textContent = 'Break';

  // The circle shrinks as time runs out
  const fractionLeft = Math.min(1, secondsLeft / phaseSeconds());
  $('#ringBar').style.strokeDashoffset = RING_LENGTH * (1 - fractionLeft);

  // "Focus Round 2 of 4" while working, and what comes next below the buttons
  const round = todayRounds() % 4 + 1;
  if (phase === 'work') {
    $('#roundPill').textContent = 'Focus Round ' + round + ' of 4';
    let breakText = 'Upcoming break: ' + appData.brk + ' min';
    if (round === 4) breakText = 'Upcoming long break: ' + (appData.brk * 3) + ' min';   // finishing round 4 gives the long break
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-cup"></use></svg>' + breakText;
  } else {
    $('#roundPill').textContent = isLongBreak ? 'Long break' : 'Short break';
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-timer"></use></svg>Next: Focus ' + appData.work + ' min';
  }

  // Button text
  if (timerId) $('#startBtn').textContent = 'Pause';
  else if (secondsLeft < phaseSeconds()) $('#startBtn').textContent = 'Resume';
  else $('#startBtn').textContent = 'Start';

  // Show the time in the browser tab too
  document.title = timerId ? clockText() + ' - PaceWise' : 'PaceWise';
}

function startTimer() {
  if (timerId) return;
  if (secondsLeft <= 0) secondsLeft = phaseSeconds();
  endTime = Date.now() + secondsLeft * 1000;     // use the real clock so the time stays correct
  timerId = setInterval(tick, 500);
  updateClock();
}

function pauseTimer() {
  if (timerId) {
    secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    clearInterval(timerId);
    timerId = null;
  }
  updateClock();
}

// The main button: Start/Resume when stopped, Pause when running
function startOrPause() {
  if (timerId) pauseTimer();
  else startTimer();
}

function resetTimer() {
  pauseTimer();
  phase = 'work';
  isLongBreak = false;
  secondsLeft = appData.work * 60;
  updateClock();
}

// Skip to the next phase. A skipped focus round is NOT saved, so it never counts as a win.
function skipPhase() {
  pauseTimer();
  if (phase === 'work') phase = 'break';
  else phase = 'work';
  isLongBreak = false;
  secondsLeft = phaseSeconds();
  updateClock();
  if (phase === 'break') showMessage('Skipped to a break. This round was not counted.');
  else showMessage('Back to focus time.');
}

// Runs every half second while the timer is on
function tick() {
  secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  if (secondsLeft <= 0) endRound();
  else updateClock();
}

// The current phase reached 0
function endRound() {
  clearInterval(timerId);
  timerId = null;
  if (phase === 'work') {
    appData.sessions.push({ ts: Date.now(), min: appData.work });
    addWin('round', 'Finished a ' + appData.work + '-minute round', '');
    isLongBreak = todayRounds() % 4 === 0;      // every 4th round today = long break
    phase = 'break';
    secondsLeft = phaseSeconds();
    if (isLongBreak) showMessage('Four rounds done! Take a longer break.');
    else showMessage('Round done. Take a short break.');
    saveData();
    renderAll();
  } else {
    phase = 'work';
    isLongBreak = false;
    secondsLeft = phaseSeconds();
    showMessage('Break is over. Ready for the next round?');
  }
  updateClock();
}

// When the person comes back to this tab, fix the clock right away
function handleVisibilityChange() {
  if (!document.hidden && timerId) tick();
}
