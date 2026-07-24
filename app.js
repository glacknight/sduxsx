(function () {
  const bank = window.QUESTION_BANK || { questions: [], counts: {}, total: 0 };
  const storageKey = "lightQuizWrongIds";

  const els = {
    bankInfo: document.getElementById("bankInfo"),
    progressText: document.getElementById("progressText"),
    scoreText: document.getElementById("scoreText"),
    typeFilter: document.getElementById("typeFilter"),
    amountInput: document.getElementById("amountInput"),
    startBtn: document.getElementById("startBtn"),
    resetWrongBtn: document.getElementById("resetWrongBtn"),
    typeText: document.getElementById("typeText"),
    sourceText: document.getElementById("sourceText"),
    questionText: document.getElementById("questionText"),
    options: document.getElementById("options"),
    feedback: document.getElementById("feedback"),
    submitBtn: document.getElementById("submitBtn"),
    nextBtn: document.getElementById("nextBtn"),
    rightCount: document.getElementById("rightCount"),
    wrongCount: document.getElementById("wrongCount"),
    wrongBookCount: document.getElementById("wrongBookCount"),
  };

  const state = {
    queue: [],
    index: 0,
    selected: new Set(),
    answered: false,
    right: 0,
    wrong: 0,
    wrongIds: new Set(readWrongIds()),
  };

  const typeNames = {
    single: "单选题",
    multi: "多选题",
    judge: "判断题",
  };

  function readWrongIds() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  }

  function saveWrongIds() {
    localStorage.setItem(storageKey, JSON.stringify([...state.wrongIds]));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sameAnswer(left, right) {
    return [...left].sort().join("") === [...right].sort().join("");
  }

  function currentQuestion() {
    return state.queue[state.index];
  }

  function updateStats() {
    const done = state.right + state.wrong;
    const total = state.queue.length;
    const score = done ? Math.round((state.right / done) * 100) : 0;
    els.progressText.textContent = `${Math.min(done, total)} / ${total}`;
    els.scoreText.textContent = `${score}%`;
    els.rightCount.textContent = state.right;
    els.wrongCount.textContent = state.wrong;
    els.wrongBookCount.textContent = state.wrongIds.size;
  }

  function setFeedback(text, kind) {
    els.feedback.textContent = text;
    els.feedback.className = `feedback ${kind || ""}`.trim();
  }

  function renderQuestion() {
    const question = currentQuestion();
    state.selected.clear();
    state.answered = false;
    els.options.innerHTML = "";
    setFeedback("", "");
    els.submitBtn.disabled = true;
    els.nextBtn.disabled = true;

    if (!question) {
      const hasWrong = state.wrongIds.size > 0;
      els.typeText.textContent = "完成";
      els.sourceText.textContent = "";
      els.questionText.textContent = hasWrong
        ? "本轮完成。可以选择“错题再测”继续巩固。"
        : "本轮完成。错题本为空，状态不错。";
      els.options.innerHTML = "";
      els.submitBtn.disabled = true;
      els.nextBtn.disabled = true;
      updateStats();
      return;
    }

    els.typeText.textContent = `${typeNames[question.type]} · 第 ${state.index + 1} 题`;
    els.sourceText.textContent = question.source || "";
    els.questionText.textContent = question.prompt;

    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.dataset.key = option.key;
      button.innerHTML = `<span class="key"></span><span class="text"></span>`;
      button.querySelector(".key").textContent = option.key;
      button.querySelector(".text").textContent = option.text;
      button.addEventListener("click", () => toggleOption(option.key, button));
      els.options.appendChild(button);
    });

    updateStats();
  }

  function toggleOption(key, button) {
    const question = currentQuestion();
    if (!question || state.answered) {
      return;
    }

    if (question.type === "single" || question.type === "judge") {
      state.selected.clear();
      document.querySelectorAll(".option").forEach((item) => item.classList.remove("selected"));
    }

    if (state.selected.has(key)) {
      state.selected.delete(key);
      button.classList.remove("selected");
    } else {
      state.selected.add(key);
      button.classList.add("selected");
    }

    els.submitBtn.disabled = state.selected.size === 0;
  }

  function submitAnswer() {
    const question = currentQuestion();
    if (!question || state.answered || state.selected.size === 0) {
      return;
    }

    state.answered = true;
    const correct = sameAnswer(state.selected, question.answer);
    const selectedAnswer = [...state.selected].sort().join("");

    document.querySelectorAll(".option").forEach((item) => {
      const key = item.dataset.key;
      item.disabled = true;
      if (question.answer.includes(key)) {
        item.classList.add("correct");
      } else if (state.selected.has(key)) {
        item.classList.add("wrong");
      }
    });

    if (correct) {
      state.right += 1;
      state.wrongIds.delete(question.id);
      setFeedback("回答正确", "ok");
    } else {
      state.wrong += 1;
      state.wrongIds.add(question.id);
      setFeedback(`回答错误。你的答案：${selectedAnswer}；正确答案：${question.answer}`, "bad");
    }

    saveWrongIds();
    els.submitBtn.disabled = true;
    els.nextBtn.disabled = false;
    updateStats();
  }

  function nextQuestion() {
    state.index += 1;
    renderQuestion();
  }

  function startQuiz() {
    const type = els.typeFilter.value;
    const amount = Math.max(1, Number(els.amountInput.value) || 30);
    let pool = bank.questions;

    if (type === "wrong") {
      pool = bank.questions.filter((item) => state.wrongIds.has(item.id));
    } else if (type !== "all") {
      pool = bank.questions.filter((item) => item.type === type);
    }

    state.queue = shuffle(pool).slice(0, Math.min(amount, pool.length));
    state.index = 0;
    state.right = 0;
    state.wrong = 0;

    if (!state.queue.length) {
      els.typeText.textContent = "无题目";
      els.sourceText.textContent = "";
      els.questionText.textContent = type === "wrong" ? "错题本为空。" : "当前筛选条件下没有题目。";
      els.options.innerHTML = "";
      setFeedback("", "");
      els.submitBtn.disabled = true;
      els.nextBtn.disabled = true;
      updateStats();
      return;
    }

    renderQuestion();
  }

  function resetWrongBook() {
    state.wrongIds.clear();
    saveWrongIds();
    updateStats();
    setFeedback("错题本已清空", "ok");
  }

  els.bankInfo.textContent = `已载入 ${bank.total} 题：单选 ${bank.counts.single || 0}，多选 ${bank.counts.multi || 0}，判断 ${bank.counts.judge || 0}`;
  els.amountInput.max = bank.total || 720;
  els.startBtn.addEventListener("click", startQuiz);
  els.submitBtn.addEventListener("click", submitAnswer);
  els.nextBtn.addEventListener("click", nextQuestion);
  els.resetWrongBtn.addEventListener("click", resetWrongBook);
  updateStats();
})();
