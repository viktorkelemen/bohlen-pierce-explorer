import { bpNoteToVolts } from './bp-scale.js';

const LOOKAHEAD = 0.1;  // seconds of audio to schedule ahead
const TICK_MS   = 25;   // scheduler poll interval

export class BPSequencer {
    constructor(es8) {
        this.es8 = es8;
        this.bpm = 120;
        // Default: BP Lambda chord motive (C-E-G-H-E-C), using 0,4,7,9,4,0
        this.steps = [0, 4, 7, 9, 4, 0].map(n => ({ note: n, tritave: 0 }));
        this.pitchCh = 0;       // ES-8 channel index for pitch CV
        this.gateCh  = 1;       // ES-8 channel index for gate
        this.gateWidthMs = 60;
        this.running = false;
        this._head = 0;
        this._nextTime = 0;
        this._timer = null;
        this.onStep = null;     // callback(stepIndex) — fired when step becomes active
    }

    get stepCount() { return this.steps.length; }
    get _stepSec()  { return 60 / this.bpm / 2; }  // eighth-note duration

    start() {
        if (!this.es8.initialized || this.running) return;
        this.running = true;
        this._head = 0;
        this._nextTime = this.es8.audioContext.currentTime + 0.05;
        this._tick();
    }

    stop() {
        this.running = false;
        clearTimeout(this._timer);
    }

    _tick() {
        const ctx     = this.es8.audioContext;
        const horizon = ctx.currentTime + LOOKAHEAD;

        while (this._nextTime < horizon) {
            const idx = this._head % this.stepCount;
            const s   = this.steps[idx];
            const t   = this._nextTime;

            if (s && s.note !== null) {
                const volts = bpNoteToVolts(s.note, s.tritave || 0);
                this.es8.setCV(this.pitchCh, volts, 0, t);
                // In sim mode both pitch and gate share the same oscillator channel
                // so triggerGate cancels the continuous gain from setCV and creates a clean burst
                const gateCh = this.es8.simMode ? this.pitchCh : this.gateCh;
                this.es8.triggerGate(gateCh, this.gateWidthMs, 5, t);
            }

            // Notify UI at the moment the step fires
            const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
            setTimeout(() => {
                if (this.running && this.onStep) this.onStep(idx);
            }, delayMs);

            this._head++;
            this._nextTime += this._stepSec;
        }

        if (this.running) {
            this._timer = setTimeout(() => this._tick(), TICK_MS);
        }
    }
}
