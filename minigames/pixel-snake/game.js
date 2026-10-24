(() => {
  "use strict";

  const { SnakeGame } = window.PixelSnake;
  const game = new SnakeGame();
  const canvas = document.getElementById("board");
  const context = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const action = document.getElementById("action");
  const pauseButton = document.getElementById("pause");
  const paceButtons = [...document.querySelectorAll("[data-pace]")];
  const storageKey = "gacor.pixel-snake.best.v1";
  const paces = { easy: 180, normal: 130, fast: 90 };
  let pace = "normal";
  let timer = null;
  let best = 0;
  let touchOrigin = null;

  try {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(stored) && stored >= 0) best = stored;
  } catch { /* The game also works when browser storage is disabled. */ }

  function announce(text) {
    document.getElementById("announcement").textContent = text;
  }

  function updateScore() {
    document.getElementById("score").textContent = String(game.score).padStart(3, "0");
    if (game.score > best) {
      best = game.score;
      try { localStorage.setItem(storageKey, String(best)); } catch { /* Optional persistence. */ }
    }
    document.getElementById("best").textContent = String(best).padStart(3, "0");
  }

  function draw() {
    const cell = canvas.width / game.size;
    context.fillStyle = "#ccdaa9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#b6c594";
    context.lineWidth = 0.5;
    context.beginPath();
    for (let i = 1; i < game.size; i += 1) {
      context.moveTo(i * cell, 0);
      context.lineTo(i * cell, canvas.height);
      context.moveTo(0, i * cell);
      context.lineTo(canvas.width, i * cell);
    }
    context.stroke();

    if (game.food) {
      const { x, y } = game.food;
      context.fillStyle = "#cc7548";
      context.fillRect(x * cell + 4, y * cell + 5, cell - 8, cell - 8);
      context.fillStyle = "#a65e3e";
      context.fillRect(x * cell + 4, y * cell + cell - 6, cell - 8, 3);
      context.fillStyle = "#68804b";
      context.fillRect(x * cell + 10, y * cell + 2, 5, 4);
      context.fillStyle = "#edb28a";
      context.fillRect(x * cell + 6, y * cell + 7, 3, 3);
    }

    game.snake.forEach(({ x, y }, index) => {
      context.fillStyle = index === 0 ? "#2c4934" : "#547344";
      context.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      if (index !== 0) {
        context.fillStyle = "#6e8a50";
        context.fillRect(x * cell + 3, y * cell + 3, cell - 6, 2);
      }
    });

    const head = game.snake[0];
    const x = head.x * cell;
    const y = head.y * cell;
    context.fillStyle = "#e1ecc5";
    const eyes = {
      right: [[13, 4], [13, 12]], left: [[4, 4], [4, 12]],
      up: [[4, 4], [12, 4]], down: [[4, 13], [12, 13]],
    }[game.direction];
    eyes.forEach(([dx, dy]) => context.fillRect(x + dx, y + dy, 3, 3));
  }

  function syncUI() {
    const status = game.status;
    const running = status === "running";
    overlay.hidden = running;
    paceButtons.forEach(button => { button.disabled = running || status === "paused"; });
    pauseButton.disabled = status !== "running" && status !== "paused";
    document.getElementById("pause-icon").textContent = status === "paused" ? "▷" : "Ⅱ";
    document.getElementById("pause-label").textContent = status === "paused" ? "继续游戏" : "暂停游戏";
    const states = {
      ready: ["LET'S PLAY", "READY?", "吃掉小果子，留意你的尾巴。", "开始游戏", "或按 Enter 开始"],
      paused: ["TAKE A BREATH", "PAUSED", "休息一下，小蛇等你回来。", "继续游戏", "或按空格继续"],
      over: ["ONE MORE TRY?", "GAME OVER", `${game.reason === "wall" ? "碰到边界啦" : "咬到自己啦"}。这次得了 ${game.score} 分。`, "再来一局", "按 Enter 或 R 再来一局"],
      won: ["ALL PIXELS ARE YOURS", "YOU WIN!", `整个世界都被你吃满了。得分 ${game.score}！`, "再来一局", "按 Enter 或 R 再来一局"],
    };
    if (!running) {
      const [eyebrow, title, message, label, hint] = states[status];
      document.getElementById("overlay-eyebrow").textContent = eyebrow;
      document.getElementById("overlay-title").textContent = title;
      document.getElementById("overlay-message").textContent = message;
      action.replaceChildren(document.createTextNode(`${label} `), Object.assign(document.createElement("span"), { textContent: "↵" }));
      document.getElementById("overlay-hint").textContent = hint;
      if (status === "over" || status === "won") announce(message);
    }
    updateScore();
    draw();
  }

  function schedule() {
    clearTimeout(timer);
    if (game.status !== "running") return;
    const delay = Math.max(60, paces[pace] - Math.floor(game.score / 10) * 2);
    timer = setTimeout(() => {
      const result = game.step();
      if (result.ate) announce(`得分 ${game.score}。`);
      syncUI();
      schedule();
    }, delay);
  }

  function start(restart = false) {
    clearTimeout(timer);
    if (restart || game.status === "over" || game.status === "won") game.reset();
    game.start();
    syncUI();
    schedule();
    canvas.focus({ preventScroll: true });
    announce("游戏开始。使用方向键或 WASD 移动，空格暂停。");
  }

  function togglePause() {
    if (game.status === "running") {
      game.pause();
      clearTimeout(timer);
      syncUI();
      announce("游戏已暂停。");
    } else if (game.status === "paused") start();
  }

  function move(direction) {
    if (game.status === "ready") start();
    game.turn(direction);
  }

  action.addEventListener("click", () => start());
  pauseButton.addEventListener("click", togglePause);
  document.getElementById("restart").addEventListener("click", () => start(true));
  paceButtons.forEach(button => button.addEventListener("click", () => {
    if (game.status === "running" || game.status === "paused") return;
    pace = button.dataset.pace;
    paceButtons.forEach(option => option.setAttribute("aria-pressed", String(option === button)));
    document.getElementById("pace-hint").textContent = {
      easy: "慢慢来，给自己留点转弯的时间。",
      normal: "适合来一局。吃得越多，速度越快。",
      fast: "手速挑战。每一个转弯都要提前想好。",
    }[pace];
  }));

  const keyDirections = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left", w: "up", d: "right", s: "down", a: "left" };
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (keyDirections[key]) {
      event.preventDefault();
      if (!event.repeat) move(keyDirections[key]);
    } else if (key === " ") {
      if (event.target.closest("button, a")) return;
      event.preventDefault();
      if (event.repeat) return;
      if (game.status === "ready") start();
      else togglePause();
    } else if (key === "r") {
      event.preventDefault();
      if (!event.repeat) start(true);
    } else if (key === "Enter" && !event.target.closest("button, a") && game.status !== "running") {
      event.preventDefault();
      if (!event.repeat) start();
    }
  });

  document.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => move(button.dataset.direction));
  });

  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    touchOrigin = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", event => {
    if (!touchOrigin || touchOrigin.id !== event.pointerId) return;
    const dx = event.clientX - touchOrigin.x;
    const dy = event.clientY - touchOrigin.y;
    touchOrigin = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  });
  canvas.addEventListener("pointercancel", () => { touchOrigin = null; });

  function pauseWhenAway() {
    if (game.status === "running") togglePause();
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseWhenAway(); });
  window.addEventListener("blur", pauseWhenAway);
  syncUI();
  action.disabled = false;
  document.getElementById("startup-help").hidden = true;
})();
