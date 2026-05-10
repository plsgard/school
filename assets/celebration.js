// Celebration overlay + confetti shower.
//
// Expects the page to contain:
//   <div id="celebration" class="celebration visually-hidden">…</div>
//   <div class="confetti" id="confetti"></div>
//
// `celebrate({ duration, pieces })` shows the overlay, fires confetti, and
// auto-cleans up. Returns a Promise that resolves when the celebration is
// over — useful for chaining sounds/badges later.

const DEFAULT_DURATION_MS = 5000;
const DEFAULT_PIECES = 100;

function spawnConfetti(container, pieces) {
    container.innerHTML = '';
    for (let i = 0; i < pieces; i++) {
        const piece = document.createElement('div');
        piece.classList.add('confetti-piece');
        const startX = Math.random() * 100;
        const startY = Math.random() * 50;
        const size = 5 + Math.random() * 10;
        const duration = 3 + Math.random() * 3;
        const delay = Math.random() * 2;
        piece.style.left = `${startX}vw`;
        piece.style.top = `${startY}vh`;
        piece.style.width = `${size}px`;
        piece.style.height = `${size}px`;
        piece.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        piece.style.animation = `fall ${duration}s linear ${delay}s infinite`;
        container.appendChild(piece);
    }
}

export function celebrate({ duration = DEFAULT_DURATION_MS, pieces = DEFAULT_PIECES } = {}) {
    const overlay = document.getElementById('celebration');
    const confetti = document.getElementById('confetti');
    if (!overlay || !confetti) return Promise.resolve();

    overlay.classList.remove('visually-hidden');
    spawnConfetti(confetti, pieces);

    return new Promise((resolve) => {
        setTimeout(() => {
            overlay.classList.add('visually-hidden');
            confetti.innerHTML = '';
            resolve();
        }, duration);
    });
}
