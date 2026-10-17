// Shared quiz engine.
//
// A quiz page provides a `generateQuestion` function and (optionally) a
// `validateSettings` hook; the engine handles the Settings → Quiz → Result →
// History → Celebration flow, the timer with auto-submit, scoring, and
// persistence via storage.js.
//
// Required DOM contract (see addition.html / multiplication.html for examples):
//   #settings, #quiz, #result, #history          — flow sections
//   #numQuestions, #timerDuration                — settings inputs
//   #startQuiz                                    — start button
//   #questions, #timer, #submit                   — quiz section
//   #historyList                                  — history <ul>
//   #celebration, #confetti                       — overlay + confetti container

import { loadHistory, saveResult, migrateLegacyHistory, loadProfiles, getActiveProfileId, historyProfileId } from './storage.js';
import { celebrate } from './celebration.js';

const MIN_QUESTIONS = 1;
const MIN_TIMER_SECONDS = 10;

// Resolved on every read/write: the active profile can change in another tab.
const historyProfile = () => historyProfileId(loadProfiles(), getActiveProfileId());

function renderHistory(quizId, listEl) {
    const history = loadHistory(quizId, historyProfile());
    listEl.innerHTML = history.map((entry, index) =>
        `<li class="list-group-item">${index + 1}. Score: ${entry.score}/${entry.totalQuestions}, Timer: ${entry.timerDuration}s, Time Left: ${entry.timeLeft}s, Submitted: ${entry.submittedAutomatically ? 'Automatically (Timer Ended)' : 'Manually'}, Date: ${entry.date}</li>`
    ).join('');
}

function renderQuestions(questions, container) {
    container.innerHTML = '';
    questions.forEach((q, index) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('mb-3');
        wrapper.innerHTML =
            `<label for="q${index}" class="form-label">${q.equation}</label>` +
            `<input type="number" inputmode="numeric" pattern="[0-9]*" id="q${index}" class="form-control" data-answer="${q.answer}">`;
        container.appendChild(wrapper);
    });
}

export function startQuiz({ quizId, generateQuestion, validateSettings }) {
    migrateLegacyHistory();

    const required = {
        settingsEl: document.getElementById('settings'),
        quizEl: document.getElementById('quiz'),
        resultEl: document.getElementById('result'),
        numQuestionsInput: document.getElementById('numQuestions'),
        timerDurationInput: document.getElementById('timerDuration'),
        questionsContainer: document.getElementById('questions'),
        timerEl: document.getElementById('timer'),
        startButton: document.getElementById('startQuiz'),
        submitButton: document.getElementById('submit'),
        historyList: document.getElementById('historyList'),
    };
    const missing = Object.entries(required).filter(([, el]) => el === null).map(([name]) => name);
    if (missing.length > 0) {
        console.error(`[quiz] missing required DOM elements: ${missing.join(', ')} — see DOM contract in assets/quiz.js`);
        return;
    }
    const {
        settingsEl, quizEl, resultEl,
        numQuestionsInput, timerDurationInput,
        questionsContainer, timerEl,
        startButton, submitButton, historyList,
    } = required;

    let questions = [];
    let timerInterval = null;
    let timeLeft = 0;
    let timerDuration = 0;
    let totalQuestions = 0;
    let submitted = false;

    function startTimer() {
        timerEl.textContent = `Time Left: ${timeLeft}s`;
        timerInterval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = `Time Left: ${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submit(true);
            }
        }, 1000);
    }

    function start() {
        totalQuestions = parseInt(numQuestionsInput.value, 10);
        timerDuration = parseInt(timerDurationInput.value, 10);
        timeLeft = timerDuration;

        if (
            Number.isNaN(totalQuestions) || totalQuestions < MIN_QUESTIONS ||
            Number.isNaN(timeLeft) || timeLeft < MIN_TIMER_SECONDS
        ) {
            alert('Please enter valid values for the number of questions and timer duration.');
            return;
        }

        if (validateSettings) {
            const err = validateSettings();
            if (err) {
                alert(err);
                return;
            }
        }

        questions = [];
        for (let i = 0; i < totalQuestions; i++) {
            questions.push(generateQuestion({ level: 1 }));
        }

        submitted = false;
        submitButton.disabled = false;
        settingsEl.classList.add('visually-hidden');
        quizEl.classList.remove('visually-hidden');
        resultEl.classList.add('visually-hidden');

        renderQuestions(questions, questionsContainer);
        startTimer();
    }

    function submit(submittedAutomatically) {
        // Guard against double-fire: timer tick and Submit click can race at t=0.
        if (submitted) return;
        submitted = true;
        submitButton.disabled = true;
        clearInterval(timerInterval);

        const inputs = questionsContainer.querySelectorAll('input');
        let score = 0;
        const feedback = [];

        inputs.forEach((input, index) => {
            const correct = parseInt(input.dataset.answer, 10);
            const user = parseInt(input.value, 10);
            if (user === correct) {
                score++;
            } else {
                const userDisplay = Number.isNaN(user) ? 'No answer' : user;
                feedback.push(
                    `<p class="wrong-answer"><span aria-hidden="true">❌</span> <span class="visually-hidden">Wrong:</span> Q${index + 1}: ${questions[index].equation} (Your answer: ${userDisplay}, Correct: ${correct})</p>`
                );
            }
        });

        quizEl.classList.add('visually-hidden');
        resultEl.classList.remove('visually-hidden');
        resultEl.innerHTML =
            `<h2>Your Score: ${score}/${totalQuestions}</h2>` +
            (feedback.length > 0
                ? `<h3 class="mt-3">Incorrect Answers:</h3>${feedback.join('')}`
                : '<p class="text-success mt-3"><span aria-hidden="true">✅</span> Great job! All answers are correct.</p>');

        if (score === totalQuestions) celebrate();

        saveResult(quizId, { score, totalQuestions, timerDuration, timeLeft, submittedAutomatically }, historyProfile());
        renderHistory(quizId, historyList);

        if (submittedAutomatically) {
            alert('Time is up! Your quiz has been submitted automatically.');
        }
    }

    startButton.addEventListener('click', start);
    submitButton.addEventListener('click', () => submit(false));

    renderHistory(quizId, historyList);
}
