# PaceWise: Code Explanation and Defense Guide

Read Part 1 first. If your group can explain Part 1 and Part 2 in your own words, you can already answer most questions. Parts 3 to 6 are for looking things up.

---

## Part 1. The whole app in 6 sentences

1. **index.html** is the skeleton: the buttons, boxes and forms. Every element JavaScript needs has an `id` (like `#startBtn`).
2. **style.css** is the looks: colours, spacing, layout, hover effects.
3. **script.js** is the brain. All saved information lives in ONE object named `S` (tasks, wins, moods, timer settings, name).
4. Whenever the user does something (click, type, submit), an **event listener** runs a **function**.
5. That function changes `S`, then calls `saveData()` (stores `S` in the browser's localStorage), then `renderAll()` (redraws the screen from `S`).
6. So the screen is never the "truth". `S` is the truth, and the screen is just a picture of `S`.

**The pattern, memorize this:**

```
user does something -> event listener -> function changes S -> saveData() -> renderAll()
```

### Example A: user adds a task
1. User types "Math homework" and presses Add. The form fires a `submit` event.
2. `addTask()` runs. It reads the text box, then calls `validateTask()` (checks empty, too short, duplicate, past date).
3. If there is an error, `msg()` shows the red message and the function stops (`return`).
4. If it is fine, `S.tasks.push({...})` adds the new task to the array.
5. `saveData()` stores it, `renderAll()` redraws, `msg('Task added.')` shows the green message.

### Example B: user ticks the last step of a task
1. Click on the round step button. `listClick()` runs and sees `data-act="step"`.
2. It calls `toggleStep()`, which flips `done`, then `addWin('step', ...)`.
3. `toggleStep()` calls `syncDone()`: if ALL steps are done, the task becomes done and a "Finished task" win is added.
4. `saveData()` and `renderAll()` run. The progress bar, stat tiles, Small Wins and weekly numbers all update because they are all drawn from `S`.

### Example C: the timer
1. Start: `startTimer()` saves the finish time (`endAt = now + seconds left`) and starts `setInterval(tick, 500)`.
2. Every half second `tick()` recalculates `left = endAt - now`. This uses the real clock, so it stays correct even if the tab was in the background.
3. At 0, `endRound()` saves the session, adds a "round" win, and switches to break (long break every 4th round).

---

## Part 2. The 12 most important functions (know these cold)

| Function | What it does in plain words |
|---|---|
| `loadData()` | When the page opens, reads saved data from localStorage into `S`. |
| `saveData()` | Writes `S` into localStorage so it survives refresh. |
| `normalize(d)` | Cleans data from a backup file so bad or fake files cannot break the app. Returns `null` if the file is not a PaceWise backup. |
| `renderAll()` | Calls all the draw functions so every part of the screen matches `S`. |
| `addTask(e)` | Validates and adds a task. |
| `validateTask()` | Returns an error message, or empty text if the task is OK. |
| `listClick(e)` | One listener for ALL buttons inside task lists. It checks `data-act` to know which button was clicked. |
| `toggleStep()` / `syncDone()` | Tick a step; keep the task's done status and wins matched to its steps. |
| `toggleToday()` | Adds a task to Today, but refuses when 3 are already there (the 3-task rule, `MAX_TODAY`). |
| `startTimer()` / `tick()` / `endRound()` | The focus timer: start, update every 0.5 s, finish and switch to break. |
| `weekTotals()` | Adds up the last 7 days (tasks, steps, minutes, sessions) from real data. Used by both the This Week card and the Progress screen. |
| `backupData()` / `restoreData()` | Download `S` as a .json file / read a .json file back through `normalize()`. |

---

## Part 3. Every function, one line each

**Helpers**
- `$('#id')` shortcut for `document.querySelector`. Finds an element.
- `uid()` makes a unique id from the time and a random number.
- `blank()` returns a fresh empty data object.
- `dkey(t)` turns a time into the text `YYYY-MM-DD` (used to group data by day).
- `todayKey()` today's date as that text.
- `lastDays(n)` list of the last n dates, oldest first (a `for` loop).
- `esc(text)` replaces `<`, `>`, `&`, quotes so user text is shown as text, never run as HTML (security).
- `msg(text, type)` shows the pop-up message for 3 seconds. `type 'err'` = red.

**Saving**
- `normalize`, `loadData`, `saveData` (see Part 2). `loadData` and `saveData` use `try/catch` so a storage problem shows a message instead of crashing.

**Drawing the screen**
- `showTab(name)` shows one screen, highlights the sidebar button, scrolls to a card for Focus/Small Wins/Mood.
- `dueState(t)` / `dueLabel(t)` decide "Overdue", "Due soon" or a date.
- `stepCount(t)` returns [steps done, total steps].
- `tagsHtml(t)` builds the subject and due-date chips.
- `meterHtml(t)` builds the progress bar (width = steps done / total x 100%).
- `stepsHtml(t, manage)` builds the list of steps (with Edit/Remove when `manage` is true).
- `renderHeader()` greeting, date and the four stat tiles.
- `renderToday()` the Today's Plan list.
- `renderWins()` / `winHtml(w)` the Small Wins cards.
- `renderMood()` highlights today's mood face and message.
- `renderSubjects()` fills the subject drop-down.
- `renderTasks()` draws the Tasks screen after applying the filter, subject and search.
- `weekTotals()`, `drawBars()`, `renderWeek()`, `renderProgress()` the weekly numbers and charts.
- `renderAll()` runs all of them.

**Tasks and steps**
- `checkNameLive()` shows "Use at least 3 characters" while typing.
- `validateTask()`, `addTask()`, `saveTaskEdit()`, `addStep()`, `saveStepEdit()`.
- `focusField()` puts the cursor in a box after redraw.
- `toggleTask()` / `reopenTask()` mark a whole task done or open it again.
- `toggleStep()` / `removeStep()` / `syncDone()` step logic.

**Today and wins**
- `activeToday()` counts unfinished tasks in Today.
- `toggleToday()` add or remove from Today (3 limit).
- `keepTodayLimit()` if reopening a task would make 4, removes it from Today.
- `addWin()` / `removeWin()` add or delete a Small Win. Un-ticking removes the win so stats stay honest.

**Search, filter, clicks**
- `searchTasks()`, `filterSubject()` store the search or subject, then redraw the list.
- `listClick(e)` all task and Today button clicks. `taskListSubmit(e)` all forms inside the task list.

**Timer**
- `phaseSeconds()` length of the current phase. `todayRounds()` rounds finished today. `clockText()` makes "24:32".
- `updateClock()` redraws the number, circle, labels, button text.
- `startTimer()`, `pauseTimer()`, `startOrPause()` (the one main button), `resetTimer()`, `skipPhase()` (skip without counting a round), `tick()`, `endRound()`.

**Mood**
- `saveMood(e)` saves the clicked face for today. `saveNote(e)` saves the note.

**Settings and data**
- `readMinutes()` checks work/break minutes. `checkSettingsLive()` shows the error while typing.
- `saveSettings()` saves minutes and name. `initForms()` fills the settings boxes.
- `backupData()`, `restoreData()`, `clearData()`.

---

## Part 4. Every event listener (the "events" requirement)

| Element | Event | Function |
|---|---|---|
| Any `data-go` button (sidebar, tab bar, View full progress) | click | `showTab` |
| Add Task (top) | click | open Tasks and focus the name box |
| Add Task to Today | click | open Tasks with a hint message |
| View all (Small Wins) | click | flips `showAllWins`, `renderWins` |
| Task form | submit | `addTask` |
| Task name box | input | `checkNameLive` |
| "Add subject or due date" | click | show/hide the extra fields |
| Search box | input | `searchTasks` |
| Subject drop-down | change | `filterSubject` |
| Filter buttons | click | change `filter`, `renderTasks` |
| Today list, Task list | click | `listClick` |
| Task list forms | submit | `taskListSubmit` |
| Start/Pause button | click | `startOrPause` |
| Skip, Reset | click | `skipPhase`, `resetTimer` |
| Page visibility | visibilitychange | `tick` (corrects the timer when you return to the tab) |
| Mood faces | click | `saveMood` |
| Mood note form | submit | `saveNote` |
| Work/Break minutes | input | `checkSettingsLive` |
| Settings form | submit | `saveSettings` |
| Backup, Choose file, Clear | click | `backupData`, open file picker, `clearData` |
| File picker | change | `restoreData` |

**DOM manipulation** (another requirement) happens in the `render...` functions: they change `.textContent`, `.innerHTML`, `.classList.toggle(...)`, `.hidden`, `.style`.

---

## Part 5. Syntax decoder (the parts that look hard)

**Arrow function** is just a short way to write a function.
```js
const double = n => n * 2;        // same as:
function double(n) { return n * 2; }
```

**Template literal** (backticks) lets you put values inside text.
```js
`Hello ${name}`   // same as 'Hello ' + name
```

**Array helpers** (`filter`, `map`, `find`, `some`, `every`) are shortcuts for `for` loops.
```js
// S.tasks.filter(t => t.done)   means:
const result = [];
for (let i = 0; i < S.tasks.length; i++) {
  if (S.tasks[i].done) result.push(S.tasks[i]);
}
```
- `filter` keeps items that pass a test.
- `map` turns every item into something else (we turn tasks into HTML text).
- `find` returns the first match. `some` = "is there at least one?". `every` = "are all of them?".
- `reduce` adds things up (used only to total minutes).

**Ternary** is a short if/else: `condition ? valueIfTrue : valueIfFalse`.

**`data-` attributes** store small facts on a button, like `data-id="abc"`. JavaScript reads them with `button.dataset.id`.

**`e.target.closest('[data-act]')`** means: "from the thing that was clicked, find the nearest button that has data-act". This is how ONE listener handles many buttons (called event delegation).

**`const [d, n] = stepCount(t)`** takes the two values returned in the array and names them `d` and `n`.

**`Set`** is a list with no duplicates. We use it to remember which tasks are expanded (`openToday`) and to build the subject list.

**localStorage** stores text in the browser. `JSON.stringify(S)` turns the object into text to save; `JSON.parse(text)` turns it back.

**`try / catch`** runs risky code; if it fails, `catch` runs instead of crashing.

**Regex** (`/^\d{4}-\d{2}-\d{2}$/`) is a pattern check. This one checks the text looks like `2026-11-20`. You can say: "a pattern that checks the date format".

---

## Part 6. HTML and CSS you should be able to explain

- Semantic tags: `<aside>` sidebar, `<nav>` menu, `<main>` content, `<section>` screens/cards, `<form>` with `<input>` and `<button type="submit">`.
- Only one screen has class `on` at a time. CSS says `.screen {display:none}` and `.screen.on {display:block}`. `showTab()` just moves the `on` class.
- **CSS variables** (`--ac`, `--bg`...) at the top of style.css: change a colour once and the whole app updates. Dark mode just redefines them inside `@media (prefers-color-scheme: dark)`.
- **Flexbox / Grid:** `display:flex` puts things in a row; `display:grid` makes columns (the dashboard).
- **Responsive:** `@media (min-width: 900px)` rules switch from phone layout (bottom tab bar) to desktop (green sidebar).
- **Hover and transitions:** `:hover` plus `transition: ...` gives the smooth lift on cards and buttons.
- **Timer circle:** an SVG circle. `stroke-dasharray` = total length of the circle line, `stroke-dashoffset` = how much is hidden. JavaScript sets the offset from time left, so the circle shrinks.
- **Progress bar:** an inner `<i>` whose `width` is set to the percentage.

---

## Part 7. Questions the panel might ask (and short honest answers)

1. **Why does everything go through `S`?** One source of truth. Screens are drawn from it, so they can never disagree.
2. **Why call `renderAll()` after every change?** Simple and safe: it redraws everything from `S`, so we cannot forget to update some part.
3. **How does the 3-task limit work?** `toggleToday()` counts unfinished tasks in Today with `activeToday()`. If the count is already `MAX_TODAY` (3), it shows an error and returns. `normalize()` and `keepTodayLimit()` keep the rule true for restored files and reopened tasks.
4. **How is Small Wins "real"?** `addWin()` is called only when a step, a task or a focus round is actually finished. Un-ticking calls `removeWin()`. Nothing is hard-coded.
5. **Where does the weekly progress come from?** `weekTotals()` loops through the last 7 dates and counts wins and sessions saved in `S`.
6. **How do you make sure the timer is accurate?** We store the end time and compare with `Date.now()`, instead of subtracting 1 each tick (which drifts when the tab is in the background).
7. **Why does Skip not count a session?** A skipped focus round was not finished, so counting it would be a fake achievement.
8. **How does localStorage work and what if it is cleared?** It keeps text in the browser. If cleared, `loadData()` finds nothing and starts with `blank()`. That is why Backup exists.
9. **What does `normalize()` protect against?** Wrong, edited or corrupted files. It checks types, trims lengths, and rejects non-PaceWise files, so a bad file cannot crash the app.
10. **Why `esc()`?** If someone types `<script>` as a task name, we show it as text instead of running it. (Cross-site scripting protection.)
11. **How does backup/restore work?** Backup turns `S` into JSON text and downloads it using a temporary link. Restore reads the file with `FileReader`, passes it through `normalize()`, asks for confirmation, then replaces `S`.
12. **What is the difference between `let` and `const`?** `const` cannot be reassigned (like `KEY`), `let` can (like `filter`).
13. **What are the limitations?** The timer stops if the page is closed; data lives only in one browser; no accounts or cloud sync.
14. **What would you improve next?** Browser notifications for the timer, a calendar view, cloud sync.
15. **What did you change in the redesign?** Only the look, plus: progress bars, Skip, name field, "View all" for wins. The data structure and the save/load/backup logic were kept.

---

## Part 8. How to prepare as a group

1. Split the file by section (the numbered comment headers at the top of script.js). Each member explains their section aloud to the group.
2. Everyone must be able to explain the **pattern** in Part 1 and Example A.
3. Practise changing one small thing live (for example `MAX_TODAY = 3` to `2`, or a colour in `:root`) and refreshing, so you can show you understand cause and effect.
4. If you do not know an answer, say what the function does at a high level and point to it in the code. Do not guess.
5. Keep your own AI-use disclosure honest and complete in your documentation, as your rubric requires.
