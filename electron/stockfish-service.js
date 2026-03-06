import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import { parseBestMoveLine, parseInfoLine, summarizeAnalysis } from './stockfish-parser.js';
import { normalizeSpawnError, validateStockfishBinary } from './stockfish-binary.js';

function resolveBinaryPath() {
  const root = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
  const candidate = path.join(root, 'stockfish', `${process.platform}-${process.arch}`, 'stockfish');
  return candidate;
}

export class StockfishService {
  constructor() {
    this.process = null;
    this.ready = false;
    this.initPromise = null;
    this.waiters = [];
    this.currentJob = null;
    this.cancelPromise = null;
    this.cancelResolve = null;
    this.statusListeners = new Set();
    this.phase = 'idle';
    this.error = null;
    this.binaryPath = null;
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    listener({ phase: this.phase, error: this.error });
    return () => this.statusListeners.delete(listener);
  }

  emitStatus(phase = this.phase, error = this.error) {
    this.phase = phase;
    this.error = error;
    this.statusListeners.forEach((listener) => listener({ phase, error }));
  }

  send(command) {
    if (!this.process?.stdin.writable) throw new Error('Stockfish process is not writable.');
    this.process.stdin.write(`${command}\n`);
  }

  resetPending(error) {
    const waiters = this.waiters.splice(0, this.waiters.length);
    waiters.forEach((waiter) => waiter.reject(error));
    this.currentJob?.reject(error);
    this.currentJob = null;
    if (this.cancelResolve) this.cancelResolve();
    this.cancelResolve = null;
    this.cancelPromise = null;
  }

  async ensureReady() {
    if (this.ready && this.process && !this.process.killed) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const binaryPath = validateStockfishBinary(resolveBinaryPath());
      this.binaryPath = binaryPath;
      this.emitStatus('starting', null);
      this.process = spawn(binaryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lineReader = readline.createInterface({ input: this.process.stdout });
      lineReader.on('line', (line) => this.handleLine(line));
      this.process.once('error', (error) => {
        const normalized = normalizeSpawnError(error, binaryPath);
        this.ready = false;
        this.process = null;
        this.initPromise = null;
        this.resetPending(normalized);
        this.emitStatus('error', normalized.message);
      });
      this.process.stderr.on('data', (chunk) => {
        this.error = chunk.toString().trim();
        this.emitStatus('error', this.error);
      });
      this.process.once('exit', (code, signal) => {
        this.ready = false;
        this.process = null;
        this.initPromise = null;
        this.resetPending(new Error(`Stockfish exited unexpectedly (${signal ?? code ?? 'unknown'}).`));
        this.emitStatus('idle', null);
      });

      this.send('uci');
      await this.waitForKeyword('uciok');
      this.send('isready');
      await this.waitForKeyword('readyok');
      this.send('setoption name Threads value 1');
      this.send('setoption name Hash value 32');
      this.ready = true;
      this.emitStatus('ready', null);
    })();

    try {
      await this.initPromise;
    } catch (error) {
      this.emitStatus('error', error.message);
      this.initPromise = null;
      throw error;
    }
  }

  waitForKeyword(keyword) {
    return new Promise((resolve, reject) => {
      this.waiters.push({ keyword, resolve, reject });
    });
  }

  handleLine(line) {
    const trimmed = line.trim();
    const waiterIndex = this.waiters.findIndex((waiter) => waiter.keyword === trimmed);
    if (waiterIndex >= 0) {
      const waiter = this.waiters.splice(waiterIndex, 1)[0];
      waiter.resolve(trimmed);
      return;
    }

    if (trimmed.startsWith('info ')) {
      const info = parseInfoLine(trimmed);
      if (this.currentJob?.type === 'search' || this.currentJob?.type === 'analysis') {
        this.currentJob.infoLines.push(info);
      }
      return;
    }

    if (!trimmed.startsWith('bestmove')) return;

    if (this.cancelResolve) {
      this.cancelResolve();
      this.cancelResolve = null;
      this.cancelPromise = null;
      this.emitStatus('ready', null);
      return;
    }

    const result = parseBestMoveLine(trimmed);
    if (!this.currentJob) return;
    const job = this.currentJob;
    this.currentJob = null;
    this.emitStatus('ready', null);
    job.resolve({
      ...result,
      lines: summarizeAnalysis(job.infoLines, job.multiPv),
    });
  }

  async configureSearch({ skillLevel, multiPv = 1 }) {
    this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, skillLevel ?? 10))}`);
    this.send(`setoption name MultiPV value ${Math.max(1, Math.min(4, multiPv))}`);
    this.send('isready');
    await this.waitForKeyword('readyok');
  }

  async newGame() {
    await this.ensureReady();
    await this.cancel();
    this.send('ucinewgame');
    this.send('isready');
    await this.waitForKeyword('readyok');
  }

  async search({ fen, skillLevel, moveTimeMs, depth, multiPv = 1 }) {
    await this.ensureReady();
    await this.cancel();
    await this.configureSearch({ skillLevel, multiPv });
    this.emitStatus('thinking', null);
    this.send(`position fen ${fen}`);
    return new Promise((resolve, reject) => {
      this.currentJob = { type: multiPv > 1 ? 'analysis' : 'search', infoLines: [], multiPv, resolve, reject };
      if (depth) {
        this.send(`go depth ${depth}`);
        return;
      }
      this.send(`go movetime ${Math.max(100, moveTimeMs ?? 1_000)}`);
    });
  }

  async bestMove(payload) {
    return this.search({ ...payload, multiPv: 1 });
  }

  async analyze(payload) {
    return this.search({ ...payload, multiPv: payload.multiPv ?? 3 });
  }

  async cancel() {
    if (this.cancelPromise) return this.cancelPromise;
    if (!this.process || !this.currentJob) return;
    const job = this.currentJob;
    this.currentJob = null;
    job.reject(new Error('Engine request canceled.'));
    this.cancelPromise = new Promise((resolve) => {
      this.cancelResolve = resolve;
    });
    this.send('stop');
    await this.cancelPromise;
  }

  async destroy() {
    try {
      await this.cancel();
    } catch {
      // ignore cancellation races during shutdown
    }
    if (this.process?.stdin.writable) this.send('quit');
    this.process?.kill();
    this.process = null;
    this.ready = false;
    this.initPromise = null;
    this.emitStatus('idle', null);
  }
}
