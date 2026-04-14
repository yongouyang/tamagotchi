// Mock Web Audio API (not available in jsdom)
globalThis.AudioContext = class MockAudioContext {
  createOscillator() {
    return { connect() {}, start() {}, stop() {}, type: 'square', frequency: { value: 0 } };
  }
  createGain() {
    return {
      connect() {},
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    };
  }
  get currentTime() { return 0; }
  get state() { return 'running'; }
  resume() { return Promise.resolve(); }
};
globalThis.webkitAudioContext = globalThis.AudioContext;

import '../game.js';

// Minimal DOM so render functions don't throw on null querySelector results
document.body.innerHTML = `
  <div class="pet pet--egg idle"></div>
  <div id="hunger-hearts">
    <span class="heart">♥</span><span class="heart">♥</span>
    <span class="heart">♥</span><span class="heart">♥</span>
  </div>
  <div id="happy-hearts">
    <span class="heart">♥</span><span class="heart">♥</span>
    <span class="heart">♥</span><span class="heart">♥</span>
  </div>
  <div id="game-clock">10:00</div>
  <div class="poop-area"></div>
  <span class="icon-attention"></span>
  <span class="icon-skull"></span>
  <div id="feed-modal" class="modal-overlay"></div>
  <div id="game-modal" class="modal-overlay"></div>
  <div id="status-modal" class="modal-overlay"></div>
  <div id="stat-stage"></div>
  <div id="stat-age"></div>
  <div id="stat-weight"></div>
  <div id="stat-mistakes"></div>
  <div id="stat-discipline"></div>
  <div id="game-title"></div>
  <div id="game-display"></div>
  <div id="game-score"></div>
  <div id="game-buttons"></div>
  <div id="death-message"></div>
  <div class="screen"></div>
  <button id="btn-sound" class="btn"><span class="btn-icon">🔊</span><span class="btn-label">Sound</span></button>
`;
