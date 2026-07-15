const $ = (selector) => document.querySelector(selector);
const TOTAL_QUESTIONS = 12;
const MONEY = [0, 200, 500, 1000, 3000, 10000, 50000];
const letters = ['A', 'B', 'C', 'D'];

const catalogues = { castles: [], monuments: [] };
let activeMode = 'castles';
let activeDifficulty = 'normal';
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
  const hard = activeDifficulty === 'hard';
  // Normal uses a courtly D-Dorian phrase; hard mode adds a faster, darker ostinato.
  const melody = hard
    ? [293.66, 311.13, 440, 415.30, 349.23, 311.13, 466.16, 220]
    : [293.66, 349.23, 440, 392, 349.23, 293.66, 261.63, 220];
  const note = melody[musicStep % melody.length];
  soundNote(note, hard ? 0.3 : 0.42, hard ? 'sawtooth' : 'triangle', hard ? 0.13 : 0.09, musicBus);
  if (musicStep % 2 === 1) soundNote(note * 2, hard ? 0.14 : 0.2, 'sine', hard ? 0.045 : 0.025, musicBus);
  if (hard) {
    soundNote(musicStep % 2 ? 110 : 82.41, 0.16, 'square', 0.055, musicBus);
    if (musicStep % 4 === 0) soundNote(58.27, 0.8, 'sawtooth', 0.1, musicBus);
  } else if (musicStep % 4 === 0) {
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
  const targetVolume = activeDifficulty === 'hard' ? 0.32 : 0.18;
  musicBus.gain.exponentialRampToValueAtTime(targetVolume, context.currentTime + (activeDifficulty === 'hard' ? 0.35 : 0.8));
  musicBeat();
  const pace = activeDifficulty === 'hard' ? 225 : Math.max(300, 470 - questionIndex * 12);
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

const modeCopy = {
  castles: { plural: 'castelos', prompt: 'Que castelo é este?' },
  monuments: { plural: 'monumentos', prompt: 'Que monumento é este?' }
};

function selectMode(mode) {
  if (!catalogues[mode]) return;
  activeMode = mode;
  catalogue = catalogues[mode];
  document.body.classList.toggle('theme-monuments', mode === 'monuments');
  document.body.classList.toggle('theme-castles', mode === 'castles');
  $('.brand-mark').textContent = mode === 'monuments' ? '◆' : '♜';
  document.querySelectorAll('.mode-card').forEach((button) => {
    const isSelected = button.dataset.mode === mode;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
  const count = catalogue.length;
  $('#catalogueCount').textContent = count
    ? `${count} ${modeCopy[mode].plural} com fotografia neste desafio`
    : `O catálogo de ${modeCopy[mode].plural} não está disponível.`;
  $('#startButton').disabled = count < 16;
}

function selectDifficulty(difficulty) {
  if (!['normal', 'hard'].includes(difficulty)) return;
  activeDifficulty = difficulty;
  document.querySelectorAll('.difficulty-button').forEach((button) => {
    const isSelected = button.dataset.difficulty === difficulty;
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
  const hard = difficulty === 'hard';
  document.body.classList.toggle('difficulty-hard', hard);
  $('#rulesJokers').textContent = hard ? '0' : '7';
  $('#challengeDescription').textContent = hard
    ? 'Reconhece 12 lugares pela fotografia. No modo Difícil tens apenas 10 segundos por pergunta e nenhum Joker.'
    : 'Escolhe um desafio e reconhece 12 lugares pela fotografia. Tens 7 Jokers para quebrar respostas falsas — usa-os com sabedoria.';
}

async function loadCatalogue() {
  try {
    const [castlesResponse, monumentsResponse] = await Promise.all([
      fetch('data/castles.json'), fetch('data/monuments.json')
    ]);
    if (!castlesResponse.ok) throw new Error('Catálogo de castelos indisponível');
    catalogues.castles = await castlesResponse.json();
    catalogues.monuments = monumentsResponse.ok ? await monumentsResponse.json() : [];
    $('#castleModeCount').textContent = `${catalogues.castles.length} com fotografia`;
    $('#monumentModeCount').textContent = catalogues.monuments.length
      ? `${catalogues.monuments.length} com fotografia`
      : 'Indisponível';
    selectMode(activeMode);
  } catch (error) {
    $('#catalogueCount').textContent = 'Não foi possível carregar os catálogos. Abre o jogo através de um servidor local.';
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
  catalogue = catalogues[activeMode];
  buildQuestions(); questionIndex = 0; jokers = activeDifficulty === 'hard' ? 0 : 7; level = 0; correctAnswers = 0;
  $('#startScreen').hidden = true; $('#endScreen').hidden = true; $('#gameScreen').hidden = false;
  const hard = activeDifficulty === 'hard';
  $('#gameScreen').classList.toggle('hard-mode', hard);
  $('#jokerButton').hidden = hard;
  $('#jokerStatus').hidden = hard;
  $('#difficultyBadge').textContent = hard ? 'DIFÍCIL · 10s' : 'NORMAL';
  $('#difficultyBadge').classList.toggle('hard', hard);
  renderQuestion();
  startMusic();
}

function renderQuestion() {
  clearInterval(timer); selected = null; eliminated = new Set(); locked = false;
  const { castle, options } = questions[questionIndex];
  seconds = activeDifficulty === 'hard' ? 10 : questionIndex < 4 ? 30 : questionIndex < 8 ? 40 : 50;
  $('#questionNumber').textContent = `PERGUNTA ${questionIndex + 1} DE ${TOTAL_QUESTIONS}`;
  $('#progressBar').style.width = `${((questionIndex + 1) / TOTAL_QUESTIONS) * 100}%`;
  $('#castleImage').src = castle.image;
  $('#castleImage').alt = `Fotografia para a pergunta ${questionIndex + 1}`;
  $('#imageCredit').href = castle.imageInfoUrl;
  $('#questionPrompt').textContent = modeCopy[activeMode].prompt;
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
    $('#feedback').textContent = `Certo! É ${castle.name}.`;
    playTone(740, 0.18);
  } else {
    const lostJokers = Math.min(3, jokers);
    jokers -= lostJokers;
    level = Math.max(0, level - (3 - lostJokers));
    $('#feedback').textContent = `${timedOut ? 'Tempo esgotado.' : 'Resposta incorreta.'} Era ${castle.name}.`;
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
  $('#endSummary').textContent = activeDifficulty === 'hard'
    ? `Acertaste ${correctAnswers} de ${TOTAL_QUESTIONS} ${modeCopy[activeMode].plural} no modo Difícil.`
    : `Acertaste ${correctAnswers} de ${TOTAL_QUESTIONS} ${modeCopy[activeMode].plural} e terminaste com ${jokers} Joker${jokers === 1 ? '' : 's'}.`;
}

document.querySelectorAll('.mode-card').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));
document.querySelectorAll('.difficulty-button').forEach((button) => button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty)));
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
