(function (root) {
  "use strict";

  const DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1 }),
    right: Object.freeze({ x: 1, y: 0 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
  });

  class SnakeGame {
    constructor({ size = 24, random = Math.random } = {}) {
      if (!Number.isInteger(size) || size < 8) throw new RangeError("The board must be at least 8 cells wide.");
      this.size = size;
      this.random = random;
      this.reset();
    }

    reset() {
      const center = Math.floor(this.size / 2);
      this.snake = Array.from({ length: 4 }, (_, offset) => ({ x: center - offset, y: center }));
      this.direction = "right";
      this.turns = [];
      this.score = 0;
      this.status = "ready";
      this.reason = null;
      this.food = this.spawnFood();
    }

    start() {
      if (this.status === "ready" || this.status === "paused") this.status = "running";
    }

    pause() {
      if (this.status === "running") this.status = "paused";
    }

    turn(direction) {
      if (this.status !== "running" || !DIRECTIONS[direction] || this.turns.length >= 2) return false;
      const previous = DIRECTIONS[this.turns[this.turns.length - 1] || this.direction];
      const next = DIRECTIONS[direction];
      if ((previous.x === next.x && previous.y === next.y) || (previous.x + next.x === 0 && previous.y + next.y === 0)) return false;
      this.turns.push(direction);
      return true;
    }

    spawnFood() {
      const occupied = new Set(this.snake.map(({ x, y }) => `${x},${y}`));
      const free = [];
      for (let y = 0; y < this.size; y += 1) {
        for (let x = 0; x < this.size; x += 1) {
          if (!occupied.has(`${x},${y}`)) free.push({ x, y });
        }
      }
      if (!free.length) return null;
      return free[Math.min(free.length - 1, Math.max(0, Math.floor(this.random() * free.length)))];
    }

    step() {
      if (this.status !== "running") return { moved: false, ate: false };
      if (this.turns.length) this.direction = this.turns.shift();
      const movement = DIRECTIONS[this.direction];
      const head = { x: this.snake[0].x + movement.x, y: this.snake[0].y + movement.y };
      const ate = this.food !== null && head.x === this.food.x && head.y === this.food.y;
      const body = ate ? this.snake : this.snake.slice(0, -1);
      const hitWall = head.x < 0 || head.y < 0 || head.x >= this.size || head.y >= this.size;
      const hitSelf = body.some(({ x, y }) => head.x === x && head.y === y);
      if (hitWall || hitSelf) {
        this.status = "over";
        this.reason = hitWall ? "wall" : "self";
        return { moved: false, ate: false };
      }
      this.snake.unshift(head);
      if (ate) {
        this.score += 10;
        this.food = this.spawnFood();
        if (!this.food) {
          this.status = "won";
          this.reason = "full";
        }
      } else {
        this.snake.pop();
      }
      return { moved: true, ate };
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { SnakeGame, DIRECTIONS };
  else root.PixelSnake = Object.freeze({ SnakeGame, DIRECTIONS });
})(globalThis);
