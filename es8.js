import { normalizeVoltage, denormalizeVoltage } from './es8-utils.js';

// 1V/oct base frequency: 0V = C3 (130.8 Hz) — keeps sim output in audible range
const BASE_FREQ = 130.813;
const SIM_GAIN = 0.12;

function voltsToFreq(v) {
    return BASE_FREQ * Math.pow(2, Math.max(0, v));
}

export class ES8Controller {
    constructor() {
        this.audioContext = null;
        this.channels = [];
        this.merger = null;
        this.initialized = false;
        this.safeMode = true;
        this.simMode = false;
    }

    async connect(deviceId = null, { simulate = false } = {}) {
        if (this.initialized) await this.disconnect();
        this.simMode = simulate;

        this.audioContext = new AudioContext({
            sampleRate: 48000,
            latencyHint: simulate ? 'interactive' : 'playback',
        });

        if (!simulate) {
            const dest = this.audioContext.destination;
            dest.channelCount = Math.min(8, dest.maxChannelCount || 2);
            dest.channelCountMode = 'explicit';
            dest.channelInterpretation = 'discrete';
            this.merger = this.audioContext.createChannelMerger(8);
            this.merger.connect(dest);
        }

        this.channels = Array.from({ length: 8 }, () => {
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;

            if (simulate) {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.value = voltsToFreq(0);
                gain.gain.value = 0;
                osc.connect(gain);
                gain.connect(analyser);
                analyser.connect(this.audioContext.destination);
                osc.start();
                return { osc, gain, analyser, slewMs: 3, gateWidth: 10, volts: 0 };
            } else {
                const cvSource = this.audioContext.createConstantSource();
                const gain = this.audioContext.createGain();
                cvSource.offset.value = normalizeVoltage(0);
                cvSource.connect(gain);
                gain.connect(analyser);
                return { cvSource, gain, analyser, slewMs: 3, gateWidth: 10, volts: 0 };
            }
        });

        try {
            if (!simulate) {
                this.channels.forEach((ch, i) => {
                    ch.analyser.connect(this.merger, 0, i);
                    ch.cvSource.start();
                });
                if (deviceId && this.audioContext.setSinkId) {
                    await this.audioContext.setSinkId(deviceId);
                }
            }

            await this.audioContext.resume();
            this.initialized = true;
        } catch (err) {
            await this._cleanup();
            throw err;
        }
    }

    async _cleanup() {
        this.channels.forEach(ch => {
            try {
                if (this.simMode) { ch.osc.stop(); ch.osc.disconnect(); }
                else { ch.cvSource.stop(); ch.cvSource.disconnect(); }
                ch.gain.disconnect();
                ch.analyser.disconnect();
            } catch {}
        });
        this.channels = [];
        if (this.merger) { this.merger.disconnect(); this.merger = null; }
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
    }

    async disconnect() {
        if (!this.initialized) return;
        this.initialized = false;
        this.panic();
        await this._cleanup();
    }

    setCV(channel, volts, slewMs = null, atTime = null) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = Math.max(0, this.safeMode ? Math.min(volts, 5) : Math.min(volts, 10));
        ch.volts = v;
        const t = atTime !== null ? atTime : this.audioContext.currentTime;

        if (this.simMode) {
            const slew = (slewMs !== null ? slewMs : ch.slewMs) / 1000;
            const freq = voltsToFreq(v);
            if (slew > 0) {
                ch.osc.frequency.linearRampToValueAtTime(freq, t + slew);
            } else {
                ch.osc.frequency.setValueAtTime(freq, t);
            }
            ch.gain.gain.setTargetAtTime(v > 0 ? SIM_GAIN : 0, t, 0.01);
        } else {
            const normalized = normalizeVoltage(v);
            const slew = (slewMs !== null ? slewMs : ch.slewMs) / 1000;
            if (slew > 0) {
                ch.cvSource.offset.linearRampToValueAtTime(normalized, t + slew);
            } else {
                ch.cvSource.offset.setValueAtTime(normalized, t);
            }
        }
    }

    triggerGate(channel, widthMs = null, volts = 5.0, atTime = null) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = this.safeMode ? Math.min(volts, 5) : Math.min(volts, 10);
        const width = (widthMs !== null ? widthMs : ch.gateWidth) / 1000;
        const t = atTime !== null ? atTime : this.audioContext.currentTime;

        if (this.simMode) {
            ch.gain.gain.cancelScheduledValues(t);
            ch.gain.gain.setValueAtTime(SIM_GAIN, t);
            ch.gain.gain.setTargetAtTime(0, t + width, 0.02);
            ch.volts = v;
        } else {
            const hi = normalizeVoltage(v);
            const lo = normalizeVoltage(0);
            ch.cvSource.offset.cancelScheduledValues(t);
            ch.cvSource.offset.setValueAtTime(hi, t);
            ch.cvSource.offset.setValueAtTime(lo, t + width);
            ch.volts = v;
        }
    }

    setGate(channel, on, volts = 5.0) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = this.safeMode ? Math.min(volts, 5) : Math.min(volts, 10);
        const t = this.audioContext.currentTime;
        ch.volts = on ? v : 0;

        if (this.simMode) {
            ch.gain.gain.cancelScheduledValues(t);
            ch.gain.gain.setTargetAtTime(on ? SIM_GAIN : 0, t, 0.005);
        } else {
            const normalized = normalizeVoltage(on ? v : 0);
            ch.cvSource.offset.cancelScheduledValues(t);
            ch.cvSource.offset.setValueAtTime(normalized, t);
        }
    }

    getVoltage(channel) {
        if (!this.initialized || channel < 0 || channel > 7) return 0;
        return this.channels[channel].volts;
    }

    panic() {
        if (!this.initialized) return;
        const t = this.audioContext.currentTime;
        this.channels.forEach(ch => {
            ch.volts = 0;
            try {
                if (this.simMode) {
                    ch.gain.gain.cancelScheduledValues(t);
                    ch.gain.gain.setTargetAtTime(0, t, 0.005);
                } else {
                    const lo = normalizeVoltage(0);
                    if (typeof ch.cvSource.offset.cancelAndHoldAtTime === 'function') {
                        ch.cvSource.offset.cancelAndHoldAtTime(t);
                    } else {
                        ch.cvSource.offset.cancelScheduledValues(t);
                        ch.cvSource.offset.setValueAtTime(ch.cvSource.offset.value, t);
                    }
                    ch.cvSource.offset.linearRampToValueAtTime(lo, t + 0.01);
                }
            } catch {}
        });
    }

    async getDevices() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audiooutput');
    }

    setSafeMode(enabled) {
        this.safeMode = enabled;
    }
}

export const es8 = new ES8Controller();
