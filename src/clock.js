import { createClockConfig } from './game-types.js';

export class ChessClock {
  constructor(config = createClockConfig()) {
    this.configure(config);
  }

  configure(config = createClockConfig()) {
    this.config = createClockConfig(config);
    this.whiteMs = this.config.initialMs;
    this.blackMs = this.config.initialMs;
    this.activeColor = null;
    this.running = false;
    this.paused = false;
    this.flaggedColor = null;
    this.lastTickAt = 0;
  }

  hydrate(config, state) {
    this.config = createClockConfig(config);
    this.whiteMs = state.whiteMs;
    this.blackMs = state.blackMs;
    this.activeColor = state.activeColor;
    this.running = state.running;
    this.paused = state.paused;
    this.flaggedColor = state.flaggedColor;
    this.lastTickAt = Date.now();
  }

  isEnabled() {
    return this.config.initialMs > 0;
  }

  now() {
    return Date.now();
  }

  start(color, now = this.now()) {
    if (!this.isEnabled() || this.flaggedColor) return;
    this.activeColor = color;
    this.running = true;
    this.paused = false;
    this.lastTickAt = now;
  }

  switchTurn(nextColor, previousColor, now = this.now()) {
    if (!this.isEnabled() || this.flaggedColor) return;
    this.tick(now);
    if (previousColor) {
      const current = previousColor === 'w' ? this.whiteMs : this.blackMs;
      const updated = current + this.config.incrementMs;
      if (previousColor === 'w') this.whiteMs = updated;
      if (previousColor === 'b') this.blackMs = updated;
    }
    this.activeColor = nextColor;
    this.running = true;
    this.paused = false;
    this.lastTickAt = now;
  }

  pause(now = this.now()) {
    if (!this.isEnabled() || this.paused || !this.running) return;
    this.tick(now);
    this.paused = true;
    this.running = false;
  }

  resume(now = this.now()) {
    if (!this.isEnabled() || !this.activeColor || this.flaggedColor) return;
    this.paused = false;
    this.running = true;
    this.lastTickAt = now;
  }

  stop(now = this.now()) {
    if (!this.isEnabled()) return;
    this.tick(now);
    this.running = false;
    this.paused = false;
    this.activeColor = null;
  }

  tick(now = this.now()) {
    if (!this.isEnabled() || !this.running || !this.activeColor || this.flaggedColor) return null;
    const elapsed = Math.max(0, now - this.lastTickAt);
    if (elapsed === 0) return null;
    if (this.activeColor === 'w') this.whiteMs = Math.max(0, this.whiteMs - elapsed);
    if (this.activeColor === 'b') this.blackMs = Math.max(0, this.blackMs - elapsed);
    this.lastTickAt = now;
    if (this.activeColor === 'w' && this.whiteMs === 0) this.flaggedColor = 'w';
    if (this.activeColor === 'b' && this.blackMs === 0) this.flaggedColor = 'b';
    if (this.flaggedColor) {
      this.running = false;
      this.activeColor = null;
    }
    return this.flaggedColor;
  }

  snapshot() {
    return {
      whiteMs: this.whiteMs,
      blackMs: this.blackMs,
      activeColor: this.activeColor,
      running: this.running,
      paused: this.paused,
      flaggedColor: this.flaggedColor,
    };
  }
}
