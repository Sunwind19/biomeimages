// ---- Storage helpers ----
const STORAGE_KEYS = {
  WORD_SETS: 'sat_word_sets',     // { "YYYY-MM-DD": ["word", ...] }
  CARDS: 'sat_word_cards',        // { "word": { meaning, example, sentiment, sentimentReason } }
  API_KEY: 'sat_api_key'
};

function loadWordSets() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.WORD_SETS) || '{}');
}
function saveWordSets(sets) {
  localStorage.setItem(STORAGE_KEYS.WORD_SETS, JSON.stringify(sets));
}
function loadCards() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.CARDS) || '{}');
}
function saveCards(cards) {
  localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(cards));
}
function loadApiKey() {
  return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
}
function saveApiKey(key) {
  localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

// ---- Tabs ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'tab3') populateQuizDateSelect();
    if (btn.dataset.tab === 'tab4') renderWordSetsView();
  });
});

// ---- API key ----
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyStatus = document.getElementById('apiKeyStatus');

function refreshApiKeyStatus() {
  apiKeyStatus.textContent = loadApiKey() ? '✓ 키 저장됨' : '키가 저장되지 않았습니다';
}
apiKeyInput.value = loadApiKey();
refreshApiKeyStatus();

document.getElementById('saveApiKeyBtn').addEventListener('click', () => {
  saveApiKey(apiKeyInput.value.trim());
  refreshApiKeyStatus();
});

// ---- Tab 1: 단어 입력 ----
const dateInput = document.getElementById('dateInput');
const wordInput = document.getElementById('wordInput');
const currentWordList = document.getElementById('currentWordList');

function todayStr() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
dateInput.value = todayStr();

function renderCurrentWordList() {
  const sets = loadWordSets();
  const date = dateInput.value;
  const words = sets[date] || [];
  currentWordList.innerHTML = '';
  words.forEach((w, idx) => {
    const li = document.createElement('li');
    li.textContent = w;
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      words.splice(idx, 1);
      if (words.length === 0) delete sets[date];
      else sets[date] = words;
      saveWordSets(sets);
      renderCurrentWordList();
    });
    li.appendChild(delBtn);
    currentWordList.appendChild(li);
  });
}
dateInput.addEventListener('change', renderCurrentWordList);

document.getElementById('addWordBtn').addEventListener('click', () => {
  const word = wordInput.value.trim().toLowerCase();
  if (!word) return;
  const date = dateInput.value;
  if (!date) { alert('날짜를 먼저 선택하세요.'); return; }
  const sets = loadWordSets();
  if (!sets[date]) sets[date] = [];
  if (!sets[date].includes(word)) sets[date].push(word);
  saveWordSets(sets);
  wordInput.value = '';
  renderCurrentWordList();
});
wordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addWordBtn').click();
});

renderCurrentWordList();

// ---- Claude API call ----
async function callClaude(prompt) {
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('먼저 상단에 Claude API 키를 입력하고 저장하세요.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 오류 (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content.map(b => b.text || '').join('');
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
  return JSON.parse(match[0]);
}

// ---- Tab 2: 단어 카드 생성 ----
const cardWordInput = document.getElementById('cardWordInput');
const cardResult = document.getElementById('cardResult');

async function generateCard(word) {
  const prompt = `당신은 SAT(미국 대학입학시험) 어휘 전문가입니다. 영단어 "${word}"에 대해 실제 SAT 시험에 나올 법한 수준으로 정확하게 분석해 주세요.

다음 JSON 형식으로만 응답하세요 (다른 설명 없이 JSON만):
{
  "word": "${word}",
  "meaning_ko": "단어의 한국어 뜻 (간결하고 정확하게)",
  "meaning_en": "영어 정의 (SAT 수준의 사전적 정의)",
  "example_sentence": "이 단어가 자연스럽게 사용된 SAT 수준의 예문 (단어를 그대로 포함)",
  "example_translation_ko": "예문의 한국어 번역",
  "sentiment": "positive 또는 negative 또는 neutral 중 하나 (이 단어가 전반적으로 어떤 어감/맥락에서 주로 쓰이는지)",
  "sentiment_reason": "왜 그런 감정 분류인지에 대한 간결한 한국어 설명"
}`;

  const raw = await callClaude(prompt);
  const card = extractJson(raw);

  if (!['positive', 'negative', 'neutral'].includes(card.sentiment)) {
    card.sentiment = 'neutral';
  }
  return card;
}

function renderCard(card) {
  const sentimentLabel = { positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL' }[card.sentiment];
  cardResult.innerHTML = `
    <div class="word-card">
      <h3>${card.word}</h3>
      <div class="meaning"><strong>뜻:</strong> ${card.meaning_ko} <span style="color:#888;">(${card.meaning_en})</span></div>
      <div class="example"><strong>예문:</strong> ${card.example_sentence}<br><span style="color:#888; font-style:normal;">${card.example_translation_ko}</span></div>
      <div><span class="sentiment-badge sentiment-${card.sentiment}">${sentimentLabel}</span></div>
      <div class="sentiment-reason">${card.sentiment_reason}</div>
    </div>
  `;
}

document.getElementById('generateCardBtn').addEventListener('click', async () => {
  const word = cardWordInput.value.trim().toLowerCase();
  if (!word) return;
  const btn = document.getElementById('generateCardBtn');
  btn.disabled = true;
  cardResult.innerHTML = '<p class="loading">카드를 생성하는 중입니다...</p>';
  try {
    const card = await generateCard(word);
    const cards = loadCards();
    cards[word] = card;
    saveCards(cards);
    renderCard(card);
  } catch (err) {
    cardResult.innerHTML = `<p class="error-msg">${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
});
cardWordInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('generateCardBtn').click();
});

// ---- Tab 3: 퀴즈 ----
const quizDateSelect = document.getElementById('quizDateSelect');
const quizModeSelect = document.getElementById('quizModeSelect');
const quizArea = document.getElementById('quizArea');

function populateQuizDateSelect() {
  const sets = loadWordSets();
  const dates = Object.keys(sets).sort().reverse();
  quizDateSelect.innerHTML = '';
  if (dates.length === 0) {
    quizDateSelect.innerHTML = '<option value="">단어 세트가 없습니다</option>';
    return;
  }
  dates.forEach(date => {
    const opt = document.createElement('option');
    opt.value = date;
    opt.textContent = `${date} (${sets[date].length}개)`;
    quizDateSelect.appendChild(opt);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function ensureCardsForWords(words, statusEl) {
  const cards = loadCards();
  const missing = words.filter(w => !cards[w]);
  for (let i = 0; i < missing.length; i++) {
    const w = missing[i];
    if (statusEl) statusEl.textContent = `퀴즈 준비 중... (${w} 카드 생성 중, ${i + 1}/${missing.length})`;
    const card = await generateCard(w);
    cards[w] = card;
    saveCards(cards);
  }
  return cards;
}

function buildMeaningQuestion(word, allWords, cards) {
  const correct = cards[word].meaning_ko;
  const distractorPool = allWords.filter(w => w !== word).map(w => cards[w].meaning_ko);
  const distractors = shuffle(distractorPool).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return {
    text: `"${word}" 의 뜻으로 알맞은 것은?`,
    options,
    answer: correct
  };
}

function buildSentimentQuestion(word, allWords, cards) {
  const labelMap = { positive: 'Positive (긍정적)', negative: 'Negative (부정적)', neutral: 'Neutral (중립적)' };
  const correctKey = cards[word].sentiment;
  const correct = labelMap[correctKey];
  const options = shuffle(Object.values(labelMap));
  return {
    text: `"${word}" 는 SAT 지문에서 주로 어떤 뉘앙스로 사용됩니까?`,
    options,
    answer: correct
  };
}

function buildClozeQuestion(word, allWords, cards) {
  const card = cards[word];
  const re = new RegExp(`\\b${word}\\b`, 'i');
  let sentence = card.example_sentence;
  if (re.test(sentence)) {
    sentence = sentence.replace(re, '_____');
  } else {
    sentence = sentence + ` (_____ = "${card.meaning_ko}")`;
  }
  const distractorPool = allWords.filter(w => w !== word);
  const distractors = shuffle(distractorPool).slice(0, 3);
  const options = shuffle([word, ...distractors]);
  return {
    text: `다음 문장의 빈칸에 가장 알맞은 단어는?\n"${sentence}"`,
    options,
    answer: word
  };
}

function renderQuiz(questions) {
  quizArea.innerHTML = '';
  let score = 0;
  let answered = 0;

  const scoreEl = document.createElement('div');
  scoreEl.className = 'quiz-score';
  scoreEl.textContent = `점수: 0 / ${questions.length}`;

  questions.forEach((q, idx) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'quiz-question';
    const qText = document.createElement('p');
    qText.className = 'q-text';
    qText.textContent = `${idx + 1}. ${q.text}`;
    qDiv.appendChild(qText);

    const optsDiv = document.createElement('div');
    optsDiv.className = 'quiz-options';
    q.options.forEach(opt => {
      const optBtn = document.createElement('button');
      optBtn.textContent = opt;
      optBtn.addEventListener('click', () => {
        if (optBtn.dataset.locked) return;
        [...optsDiv.children].forEach(b => b.dataset.locked = '1');
        if (opt === q.answer) {
          optBtn.classList.add('correct');
          score++;
        } else {
          optBtn.classList.add('incorrect');
          [...optsDiv.children].forEach(b => {
            if (b.textContent === q.answer) b.classList.add('correct');
          });
        }
        answered++;
        scoreEl.textContent = `점수: ${score} / ${questions.length}` + (answered === questions.length ? ' (완료!)' : '');
      });
      optsDiv.appendChild(optBtn);
    });
    qDiv.appendChild(optsDiv);
    quizArea.appendChild(qDiv);
  });

  quizArea.appendChild(scoreEl);
}

document.getElementById('startQuizBtn').addEventListener('click', async () => {
  const date = quizDateSelect.value;
  if (!date) { alert('단어 세트를 선택하세요.'); return; }
  const sets = loadWordSets();
  const words = sets[date] || [];
  if (words.length < 2) { alert('퀴즈를 만들려면 단어가 최소 2개 이상 필요합니다.'); return; }

  const mode = quizModeSelect.value;
  const btn = document.getElementById('startQuizBtn');
  btn.disabled = true;
  quizArea.innerHTML = '<p class="loading">퀴즈를 준비하는 중...</p>';
  const statusEl = quizArea.querySelector('p');

  try {
    const cards = await ensureCardsForWords(words, statusEl);
    let builder;
    if (mode === 'meaning') builder = buildMeaningQuestion;
    else if (mode === 'sentiment') builder = buildSentimentQuestion;
    else builder = buildClozeQuestion;

    const questions = shuffle(words).map(w => builder(w, words, cards));
    renderQuiz(questions);
  } catch (err) {
    quizArea.innerHTML = `<p class="error-msg">${err.message}</p>`;
  } finally {
    btn.disabled = false;
  }
});

// ---- Tab 4: 단어 세트 보기 ----
function renderWordSetsView() {
  const sets = loadWordSets();
  const cards = loadCards();
  const container = document.getElementById('wordSetsView');
  const dates = Object.keys(sets).sort().reverse();

  if (dates.length === 0) {
    container.innerHTML = '<p class="notice">아직 등록된 단어 세트가 없습니다. 1번 탭에서 단어를 추가해 보세요.</p>';
    return;
  }

  container.innerHTML = dates.map(date => {
    const words = sets[date];
    const wordItems = words.map(w => {
      const c = cards[w];
      const sentiment = c ? `<span class="sentiment-badge sentiment-${c.sentiment}" style="font-size:11px; padding:2px 8px;">${c.sentiment.toUpperCase()}</span>` : '';
      return `<li>${w} ${sentiment}</li>`;
    }).join('');
    return `
      <div class="set-block">
        <h3>${date} <span style="font-weight:normal; color:#888; font-size:14px;">(${words.length}개 단어)</span></h3>
        <ul class="word-list" style="display:block;">${wordItems}</ul>
      </div>
    `;
  }).join('');
}

// Initial population
populateQuizDateSelect();
