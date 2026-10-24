"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SnakeGame } = require("./engine.js");

test("a new game waits to start, moves one cell, and preserves its length", () => {
  const game = new SnakeGame({ random: () => 0 });
  const initial = structuredClone(game.snake);
  assert.equal(game.status, "ready");
  game.step();
  assert.deepEqual(game.snake, initial);
  game.start();
  assert.deepEqual(game.step(), { moved: true, ate: false });
  assert.deepEqual(game.snake[0], { x: initial[0].x + 1, y: initial[0].y });
  assert.equal(game.snake.length, 4);
});

test("eating grows the snake, scores ten points, and spawns food outside its body", () => {
  const game = new SnakeGame({ random: () => 0.5 });
  game.food = { x: game.snake[0].x + 1, y: game.snake[0].y };
  game.start();
  assert.equal(game.step().ate, true);
  assert.equal(game.score, 10);
  assert.equal(game.snake.length, 5);
  assert.ok(!game.snake.some(cell => cell.x === game.food.x && cell.y === game.food.y));
});

test("reversal is rejected and rapid turns are consumed one per tick", () => {
  const game = new SnakeGame({ random: () => 0 });
  game.start();
  assert.equal(game.turn("left"), false);
  assert.equal(game.turn("up"), true);
  assert.equal(game.turn("down"), false);
  assert.equal(game.turn("left"), true);
  assert.equal(game.turn("down"), false);
  game.step();
  assert.equal(game.direction, "up");
  game.step();
  assert.equal(game.direction, "left");
  assert.equal(game.status, "running");
});

test("pause freezes both movement and input, and resume preserves the board", () => {
  const game = new SnakeGame();
  game.start();
  game.pause();
  const frozen = structuredClone(game.snake);
  assert.equal(game.turn("up"), false);
  assert.equal(game.step().moved, false);
  assert.deepEqual(game.snake, frozen);
  game.start();
  assert.equal(game.step().moved, true);
});

test("hitting the wall ends the game and reset clears score and turns", () => {
  const game = new SnakeGame({ size: 8, random: () => 0 });
  game.start();
  for (let i = 0; i < 4; i += 1) game.step();
  assert.equal(game.status, "over");
  assert.equal(game.reason, "wall");
  assert.equal(game.step().moved, false);
  game.reset();
  assert.equal(game.status, "ready");
  assert.equal(game.score, 0);
  assert.deepEqual(game.turns, []);
  assert.equal(game.snake.length, 4);
});

test("hitting the body ends the game", () => {
  const game = new SnakeGame({ size: 8 });
  game.snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 2 }];
  game.direction = "left";
  game.food = { x: 7, y: 7 };
  game.start();
  game.step();
  assert.equal(game.status, "over");
  assert.equal(game.reason, "self");
});

test("moving into the departing tail is legal", () => {
  const game = new SnakeGame({ size: 8 });
  game.snake = [{ x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }];
  game.direction = "left";
  game.food = { x: 7, y: 7 };
  game.start();
  game.step();
  assert.equal(game.status, "running");
  assert.deepEqual(game.snake[0], { x: 2, y: 3 });
});

test("filling the board wins without looping forever while spawning food", () => {
  const game = new SnakeGame({ size: 8 });
  game.snake = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (x !== 0 || y !== 0) game.snake.push({ x, y });
    }
  }
  game.direction = "left";
  game.food = { x: 0, y: 0 };
  game.start();
  assert.equal(game.step().ate, true);
  assert.equal(game.status, "won");
  assert.equal(game.snake.length, 64);
  assert.equal(game.food, null);
});
