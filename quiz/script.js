'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const screens = ['welcome', 'exam', 'review', 'results', 'error'];
  let exam = null;
  let answers = [];
  let current = 0;
  let result = null;

  const show = (name) => {
    for (const screen of screens) $(`${screen}-screen`).hidden = screen !== name;
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const countAnswered = () => answers.filter((value) => value !== null).length;
  const optionLabel = (question, index) => index === null ? 'Not answered' : question.options[index];

  async function loadExam() {
    $('start-btn').disabled = true;
    try {
      const response = await fetch('./questions.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`questions.json could not be loaded (HTTP ${response.status}).`);
      const data = await response.json();
      if (!data || !Array.isArray(data.questions) || data.questions.length !== 15) {
        throw new Error('questions.json must contain exactly 15 questions.');
      }
      const ids = new Set();
      data.questions.forEach((q, i) => {
        if (!q || !['string', 'number'].includes(typeof q.id) || ids.has(String(q.id)) ||
            typeof q.question !== 'string' || !q.question.trim() ||
            !Array.isArray(q.options) || q.options.length !== 4 ||
            q.options.some((option) => typeof option !== 'string' || !option.trim()) ||
            !Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 3) {
          throw new Error(`Invalid question at position ${i + 1}. Check id, question, four options and correctAnswer (0–3).`);
        }
        ids.add(String(q.id));
      });
      exam = data;
      answers = Array(data.questions.length).fill(null);
      current = 0;
      result = null;
      $('exam-description').textContent = data.examDescription || 'A 15-question multiple-choice examination.';
      $('welcome-question-count').textContent = String(data.questions.length);
      $('exam-title').textContent = data.examTitle || 'Wisdom Quiz';
      $('start-btn').disabled = false;
      show('welcome');
    } catch (error) {
      $('error-message').textContent = `${error.message} On GitHub Pages, confirm all four files are in the same folder. Opening index.html directly from your computer may block JSON loading.`;
      show('error');
    }
  }

  function updateProgress() {
    const total = exam.questions.length;
    const answered = countAnswered();
    const percent = Math.round(answered / total * 100);
    $('answered-count').textContent = `${answered} / ${total} answered`;
    $('progress-percent').textContent = `${percent}%`;
    $('progress-fill').style.width = `${percent}%`;
    $('progress-bar').setAttribute('aria-valuemax', String(total));
    $('progress-bar').setAttribute('aria-valuenow', String(answered));
    $('question-total').textContent = `${total} TOTAL`;
  }

  function renderNavigation() {
    const grid = $('question-grid');
    grid.replaceChildren();
    exam.questions.forEach((q, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `question-tile${answers[index] !== null ? ' answered' : ''}${index === current ? ' current' : ''}`;
      button.textContent = String(index + 1);
      button.setAttribute('aria-label', `Question ${index + 1}${answers[index] !== null ? ', answered' : ', unanswered'}`);
      if (index === current) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => goToQuestion(index));
      grid.append(button);
    });
  }

  function renderQuestion() {
    const q = exam.questions[current];
    $('question-counter').textContent = `QUESTION ${String(current + 1).padStart(2, '0')} / ${exam.questions.length}`;
    $('question-text').textContent = q.question;
    const options = $('answer-options');
    options.replaceChildren();
    q.options.forEach((value, index) => {
      const label = document.createElement('label');
      label.className = `answer-option${answers[current] === index ? ' selected' : ''}`;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'answer';
      input.value = String(index);
      input.checked = answers[current] === index;
      input.setAttribute('aria-label', `Option ${String.fromCharCode(65 + index)}: ${value}`);
      const letter = document.createElement('span');
      letter.className = 'option-letter';
      letter.textContent = String.fromCharCode(65 + index);
      const text = document.createElement('span');
      text.className = 'option-text';
      text.textContent = value;
      input.addEventListener('change', () => {
        answers[current] = index;
        updateProgress();
        renderNavigation();
        for (const item of options.children) item.classList.toggle('selected', item.querySelector('input').checked);
      });
      label.append(input, letter, text);
      options.append(label);
    });
    $('prev-btn').disabled = current === 0;
    $('next-btn').textContent = current === exam.questions.length - 1 ? 'Review answers →' : 'Next question →';
    updateProgress();
    renderNavigation();
  }

  function goToQuestion(index) {
    current = index;
    show('exam');
    renderQuestion();
  }

  function review() {
    const answered = countAnswered();
    const total = exam.questions.length;
    $('review-answered').textContent = String(answered);
    $('review-unanswered').textContent = String(total - answered);
    $('review-total').textContent = String(total);
    $('review-warning').hidden = answered === total;
    show('review');
  }

  function submit() {
    if (result) return;
    const completedAt = new Date();
    const details = exam.questions.map((q, index) => ({
      id: q.id,
      question: q.question,
      options: [...q.options],
      selectedAnswer: answers[index],
      selectedAnswerText: optionLabel(q, answers[index]),
      correctAnswer: q.correctAnswer,
      correctAnswerText: optionLabel(q, q.correctAnswer),
      isCorrect: answers[index] === q.correctAnswer
    }));
    const correct = details.filter((q) => q.isCorrect).length;
    const total = details.length;
    const percentage = Math.round(correct / total * 100);
    result = {
      examTitle: exam.examTitle || 'Wisdom Quiz',
      completedAt: completedAt.toISOString(),
      score: { correct, incorrect: total - correct, total, percentage },
      answers: details
    };
    $('score-earned').textContent = String(correct);
    $('score-total').textContent = String(total);
    $('score-percent').textContent = `${percentage}%`;
    $('score-message').textContent = `${correct} correct out of ${total} questions.`;
    $('results-summary').textContent = `${correct} correct · ${total - correct} incorrect`;
    const list = $('results-list');
    list.replaceChildren();
    details.forEach((q, index) => {
      const item = document.createElement('article');
      item.className = `result-item ${q.isCorrect ? 'correct' : 'incorrect'}`;
      const status = document.createElement('div');
      status.className = 'result-status';
      status.textContent = q.isCorrect ? '✓ CORRECT' : '✕ INCORRECT';
      const heading = document.createElement('h3');
      heading.textContent = `${index + 1}. ${q.question}`;
      const selected = document.createElement('p');
      const selectedLabel = document.createElement('strong');
      selectedLabel.textContent = 'Your answer: ';
      selected.append(selectedLabel, document.createTextNode(q.selectedAnswerText));
      const correctAnswer = document.createElement('p');
      const correctLabel = document.createElement('strong');
      correctLabel.textContent = 'Correct answer: ';
      correctAnswer.append(correctLabel, document.createTextNode(q.correctAnswerText));
      item.append(status, heading, selected, correctAnswer);
      list.append(item);
    });
    show('results');
  }

  function downloadResults() {
    if (!result) return;
    const now = new Date(result.completedAt);
    const pad = (number) => String(number).padStart(2, '0');
    const filename = `wisdom-quiz-${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}.json`;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('footer-year').textContent = String(new Date().getFullYear());
  $('start-btn').addEventListener('click', () => goToQuestion(0));
  $('prev-btn').addEventListener('click', () => goToQuestion(Math.max(0, current - 1)));
  $('next-btn').addEventListener('click', () => current === exam.questions.length - 1 ? review() : goToQuestion(current + 1));
  $('review-btn').addEventListener('click', review);
  $('back-to-exam-btn').addEventListener('click', () => goToQuestion(current));
  $('submit-btn').addEventListener('click', submit);
  $('download-btn').addEventListener('click', downloadResults);
  $('restart-btn').addEventListener('click', () => { answers = Array(exam.questions.length).fill(null); current = 0; result = null; show('welcome'); });
  $('retry-btn').addEventListener('click', loadExam);
  loadExam();
})();
