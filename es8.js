import { normalizeVoltage, denormalizeVoltage } from './es8-utils.js';

export class ES8Controller {
    constructor() {
        this.audioContext = null;
        this.channels = [];
        this.merger = null;
        this.initialized = false;
        this.safeMode = true;
    }

    async connect(deviceId = null) {
        if (this.initialized) await this.disconnect();

        this.audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });

        const dest = this.audioContext.destination;
        dest.channelCount = Math.min(8, dest.maxChannelCount || 2);
        dest.channelCountMode = 'explicit';
        dest.channelInterpretation = 'discrete';

        this.merger = this.audioContext.createChannelMerger(8);
        this.merger.connect(dest);

        this.channels = Array.from({ length: 8 }, () => {
            const cvSource = this.audioContext.createConstantSource();
            const gain = this.audioContext.createGain();
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            cvSource.offset.value = normalizeVoltage(0);
            cvSource.connect(gain);
            gain.connect(analyser);
            return { cvSource, gain, analyser, slewMs: 3, gateWidth: 10 };
        });

        this.channels.forEach((ch, i) => {
            ch.analyser.connect(this.merger, 0, i);
            ch.cvSource.start();
        });

        if (deviceId && this.audioContext.setSinkId) {
            await this.audioContext.setSinkId(deviceId);
        }

        await this.audioContext.resume();
        this.initialized = true;
    }

    async disconnect() {
        if (!this.initialized) return;
        this.panic();
        this.channels.forEach(ch => {
            ch.cvSource.stop();
            ch.cvSource.disconnect();
            ch.gain.disconnect();
            ch.analyser.disconnect();
        });
        this.merger.disconnect();
        await this.audioContext.close();
        this.channels = [];
        this.merger = null;
        this.audioContext = null;
        this.initialized = false;
    }

    setCV(channel, volts, slewMs = null) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = Math.max(0, this.safeMode ? Math.min(volts, 5) : Math.min(volts, 10));
        const normalized = normalizeVoltage(v);
        const slew = (slewMs !== null ? slewMs : ch.slewMs) / 1000;
        const t = this.audioContext.currentTime;
        if (slew > 0) {
            ch.cvSource.offset.linearRampToValueAtTime(normalized, t + slew);
        } else {
            ch.cvSource.offset.setValueAtTime(normalized, t);
        }
    }

    triggerGate(channel, widthMs = null, volts = 5.0) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = this.safeMode ? Math.min(volts, 5) : volts;
        const hi = normalizeVoltage(v);
        const lo = normalizeVoltage(0);
        const width = (widthMs !== null ? widthMs : ch.gateWidth) / 1000;
        const t = this.audioContext.currentTime;
        ch.cvSource.offset.cancelScheduledValues(t);
        ch.cvSource.offset.setValueAtTime(hi, t);
        ch.cvSource.offset.setValueAtTime(lo, t + width);
    }

    setGate(channel, on, volts = 5.0) {
        if (!this.initialized || channel < 0 || channel > 7) return;
        const ch = this.channels[channel];
        const v = this.safeMode ? Math.min(volts, 5) : volts;
        const normalized = normalizeVoltage(on ? v : 0);
        const t = this.audioContext.currentTime;
        ch.cvSource.offset.cancelScheduledValues(t);
        ch.cvSource.offset.setValueAtTime(normalized, t);
    }

    getVoltage(channel) {
        if (!this.initialized || channel < 0 || channel > 7) return 0;
        const ch = this.channels[channel];
        const data = new Float32Array(ch.analyser.fftSize);
        ch.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return denormalizeVoltage(sum / data.length, false);
    }

    panic() {
        if (!this.initialized) return;
        const t = this.audioContext.currentTime;
        const lo = normalizeVoltage(0);
        this.channels.forEach(ch => {
            try {
                if (typeof ch.cvSource.offset.cancelAndHoldAtTime === 'function') {
                    ch.cvSource.offset.cancelAndHoldAtTime(t);
                } else {
                    ch.cvSource.offset.cancelScheduledValues(t);
                    ch.cvSource.offset.setValueAtTime(ch.cvSource.offset.value, t);
                }
                ch.cvSource.offset.linearRampToValueAtTime(lo, t + 0.01);
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
