const $ = (selector) => document.querySelector(selector);
const TOTAL_QUESTIONS = 12;
const MONEY = [0, 200, 500, 1000, 3000, 10000, 50000];
const letters = ['A', 'B', 'C', 'D'];

let catalogue = [];
let questions = [];
let questionIndex = 0;
let jokers = 7;
let level = 0;
let selected = null;
let eliminated = new Set();
let timer = null;
let seconds = 30;
let correctAnswers = 0;
let locked = false;
let soundEnabled = false;
let audioContext = null;
let musicBus = null;
let effectsBus = null;
let musicTimer = null;
let musicStep = 0;

function ensureAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext = new AudioContext();
  musicBus = audioContext.createGain();
  effectsBus = audioContext.createGain();
  musicBus.gain.value = 0.18;
  effectsBus.gain.value = 0.5;
  musicBus.connect(audioContext.destination);
  effectsBus.connect(audioContext.destination);
  return audioContext;
}

function soundNote(frequency, duration, type, volume, destination) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function playTone(frequency, duration = 0.12) {
  if (!soundEnabled) return;
  if (!ensureAudio()) return;
  soundNote(frequency, duration, 'sine', 0.09, effectsBus);
  soundNote(frequency * 1.5, duration * 0.8, 'triangle', 0.025, effectsBus);
}

function musicBeat() {
  if (!soundEnabled || !musicBus) return;
  // An original D-Dorian phrase: medieval colour with steadily rising quiz tension.
  const melody = [293.66, 349.23, 440, 392, 349.23, 293.66, 261.63, 220];
  const note = melody[musicStep % melody.length];
  soundNote(note, 0.42, 'triangle', 0.09, musicBus);
  if (musicStep % 2 === 1) soundNote(note * 2, 0.2, 'sine', 0.025, musicBus);
  if (musicStep % 4 === 0) {
    const bass = musicStep % 8 === 0 ? 73.42 : 87.31;
    soundNote(bass, 1.75, 'sawtooth', 0.045, musicBus);
    soundNote(bass * 1.5, 1.3, 'sine', 0.035, musicBus);
  }
  musicStep += 1;
}

function startMusic() {
  if (!soundEnabled || musicTimer) return;
  const context = ensureAudio();
  if (!context) return;
  musicStep = questionIndex * 2;
  musicBus.gain.cancelScheduledValues(context.currentTime);
  musicBus.gain.setValueAtTime(0.001, context.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.8);
  musicBeat();
  const pace = Math.max(300, 470 - questionIndex * 12);
  musicTimer = setInterval(musicBeat, pace);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (audioContext && musicBus) {
    musicBus.gain.cancelScheduledValues(audioContext.currentTime);
    musicBus.gain.setTargetAtTime(0.001, audioContext.currentTime, 0.08);
  }
}

function refreshMusic() {
  if (!soundEnabled) return;
  stopMusic();
  setTimeout(startMusic, 180);
}

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);
const formatMoney = (value) => `${value.toLocaleString('pt-PT')} €`;

async function loadCatalogue() {
  try {
    const response = await fetch('data/castles.json');
    if (!response.ok) throw new Error('Catálogo indisponível');
    catalogue = await response.json();
    $('#catalogueCount').textContent = `${catalogue.length} castelos com fotografia no banco de perguntas`;
    $('#startButton').disabled = catalogue.length < 16;
  } catch (error) {
    $('#catalogueCount').textContent = 'Não foi possível carregar o catálogo. Abre o jogo através de um servidor local.';
    $('#startButton').disabled = true;
  }
}

function buildQuestions() {
  const chosen = shuffle(catalogue).slice(0, TOTAL_QUESTIONS);
  questions = chosen.map((castle) => {
    const distractors = shuffle(catalogue.filter((item) => item.id !== castle.id)).slice(0, 3);
    return { castle, options: shuffle([castle, ...distractors]) };
  });
}

function renderLadder() {
  $('#moneyLadder').innerHTML = MONEY.map((value, index) => `
    <li class="${index === level ? 'active' : index < level ? 'passed' : ''}">
      <span>${index}</span><b>${formatMoney(value)}</b>
    </li>`).join('');
}

function resetGame() {
  buildQuestions(); questionIndex = 0; jokers = 7; level = 0; correctAnswers = 0;
  $('#startScreen').hidden = true; $('#endScreen').hidden = true; $('#gameScreen').hidden = false;
  renderQuestion();
  startMusic();
}

function renderQuestion() {
  clearInterval(timer); selected = null; eliminated = new Set(); locked = false;
  const { castle, options } = questions[questionIndex];
  seconds = questionIndex < 4 ? 30 : questionIndex < 8 ? 40 : 50;
  $('#questionNumber').textContent = `PERGUNTA ${questionIndex + 1} DE ${TOTAL_QUESTIONS}`;
  $('#progressBar').style.width = `${((questionIndex + 1) / TOTAL_QUESTIONS) * 100}%`;
  $('#castleImage').src = castle.image;
  $('#castleImage').alt = `Fotografia para a pergunta ${questionIndex + 1}`;
  $('#imageCredit').href = castle.imageInfoUrl;
  $('#answers').innerHTML = options.map((option, index) => `
    <button class="answer" type="button" data-id="${option.id}">
      <span class="answer-letter">${letters[index]}</span><span class="answer-text">${option.name}</span>
    </button>`).join('');
  document.querySelectorAll('.answer').forEach((button) => button.addEventListener('click', selectAnswer));
  $('#confirmButton').disabled = true;
  $('#confirmButton').textContent = 'Confirmar resposta';
  $('#jokerButton').disabled = jokers === 0;
  $('#feedback').textContent = '';
  updateCounters(); renderLadder(); updateTimer();
  timer = setInterval(() => { seconds -= 1; updateTimer(); if (seconds <= 0) resolveAnswer(true); }, 1000);
  if (questionIndex > 0) refreshMusic();
}

function selectAnswer(event) {
  if (locked || event.currentTarget.classList.contains('eliminated')) return;
  document.querySelectorAll('.answer').forEach((button) => button.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  selected = event.currentTarget.dataset.id;
  $('#confirmButton').disabled = false;
}

function useJoker() {
  if (locked || jokers === 0 || eliminated.size >= 3) return;
  const { castle, options } = questions[questionIndex];
  const candidate = shuffle(options.filter((option) => option.id !== castle.id && !eliminated.has(option.id)))[0];
  if (!candidate) return;
  eliminated.add(candidate.id); jokers -= 1; seconds += 15;
  playTone(520);
  const button = document.querySelector(`.answer[data-id="${CSS.escape(candidate.id)}"]`);
  button.classList.add('eliminated'); button.disabled = true;
  if (selected === candidate.id) { selected = null; $('#confirmButton').disabled = true; }
  updateCounters(); updateTimer();
  $('#jokerButton').disabled = jokers === 0 || eliminated.size >= 3;
}

function resolveAnswer(timedOut = false) {
  if (locked) return;
  locked = true; clearInterval(timer);
  const { castle } = questions[questionIndex];
  const isCorrect = !timedOut && selected === castle.id;
  document.querySelectorAll('.answer').forEach((button) => {
    button.disabled = true;
    if (button.dataset.id === castle.id) button.classList.add('correct');
    else if (button.dataset.id === selected) button.classList.add('wrong');
  });
  if (isCorrect) {
    level = Math.min(MONEY.length - 1, level + 1); correctAnswers += 1;
    $('#feedback').textContent = `Certo! É o ${castle.name}.`;
    playTone(740, 0.18);
  } else {
    const lostJokers = Math.min(3, jokers);
    jokers -= lostJokers;
    level = Math.max(0, level - (3 - lostJokers));
    $('#feedback').textContent = `${timedOut ? 'Tempo esgotado.' : 'Resposta incorreta.'} Era o ${castle.name}.`;
    playTone(170, 0.22);
  }
  updateCounters(); renderLadder();
  $('#jokerButton').disabled = true;
  $('#confirmButton').disabled = false;
  $('#confirmButton').textContent = questionIndex === TOTAL_QUESTIONS - 1 ? 'Ver resultado' : 'Próxima pergunta';
}

function nextStep() {
  if (!locked) return resolveAnswer(false);
  questionIndex += 1;
  if (questionIndex >= TOTAL_QUESTIONS) return endGame();
  renderQuestion();
}

function updateCounters() {
  $('#jokerCount').textContent = jokers; $('#sideJokerCount').textContent = jokers;
}

function updateTimer() {
  $('#timerValue').textContent = Math.max(0, seconds);
  $('.timer').classList.toggle('warning', seconds <= 10);
}

function endGame() {
  clearInterval(timer); stopMusic(); $('#gameScreen').hidden = true; $('#endScreen').hidden = false;
  $('#finalPrize').textContent = formatMoney(MONEY[level]);
  $('#endTitle').textContent = correctAnswers >= 10 ? 'Senhor das muralhas!' : correctAnswers >= 7 ? 'Uma defesa bem sólida!' : 'A aventura continua!';
  $('#endSummary').textContent = `Acertaste ${correctAnswers} de ${TOTAL_QUESTIONS} castelos e terminaste com ${jokers} Joker${jokers === 1 ? '' : 's'}.`;
}

$('#startButton').addEventListener('click', resetGame);
$('#restartButton').addEventListener('click', resetGame);
$('#jokerButton').addEventListener('click', useJoker);
$('#confirmButton').addEventListener('click', nextStep);
$('#soundButton').addEventListener('click', (event) => {
  soundEnabled = !soundEnabled;
  event.currentTarget.classList.toggle('active', soundEnabled);
  event.currentTarget.textContent = soundEnabled ? '♫' : '♪';
  event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
  event.currentTarget.setAttribute('aria-label', soundEnabled ? 'Desativar música' : 'Ativar música');
  if (soundEnabled) {
    playTone(620);
    if (!$('#gameScreen').hidden) startMusic();
  } else {
    stopMusic();
  }
});
loadCatalogue();

