import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ES8Controller } from '../es8.js';

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeParam(value = 0) {
    const p = { value };
    p.setValueAtTime = vi.fn((v) => { p.value = v; });
    p.linearRampToValueAtTime = vi.fn();
    p.cancelScheduledValues = vi.fn();
    p.cancelAndHoldAtTime = vi.fn();
    p.setTargetAtTime = vi.fn();
    return p;
}

function makeNode(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
}

function makeMockContext() {
    return {
        currentTime: 0,
        sampleRate: 48000,
        state: 'running',
        destination: {
            channelCount: 2,
            channelCountMode: 'max',
            channelInterpretation: 'speakers',
            maxChannelCount: 8,
        },
        createConstantSource: vi.fn(() => makeNode({
            offset: makeParam(-1),
            start: vi.fn(),
            stop: vi.fn(),
        })),
        createGain: vi.fn(() => makeNode({ gain: makeParam(1) })),
        createAnalyser: vi.fn(() => makeNode({
            fftSize: 256,
            smoothingTimeConstant: 0,
            getFloatTimeDomainData: vi.fn((arr) => arr.fill(0)),
        })),
        createChannelMerger: vi.fn(() => makeNode()),
        createOscillator: vi.fn(() => makeNode({
            type: 'sine',
            frequency: makeParam(440),
            start: vi.fn(),
            stop: vi.fn(),
        })),
        resume: vi.fn(() => Promise.resolve()),
        close: vi.fn(() => Promise.resolve()),
        setSinkId: vi.fn(() => Promise.resolve()),
    };
}

// ── Setup ────────────────────────────────────────────────────────────────────

let ctrl;
let mockCtx;

beforeEach(() => {
    mockCtx = makeMockContext();
    vi.stubGlobal('AudioContext', vi.fn(() => mockCtx));
    vi.stubGlobal('navigator', {
        mediaDevices: {
            getUserMedia: vi.fn(() => Promise.resolve({
                getTracks: () => [{ stop: vi.fn() }],
            })),
            enumerateDevices: vi.fn(() => Promise.resolve([
                { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
                { kind: 'audiooutput', deviceId: 'es8id', label: 'ES-8 USB Audio' },
            ])),
        },
    });
    ctrl = new ES8Controller();
});

afterEach(async () => {
    if (ctrl.initialized) await ctrl.disconnect();
    vi.unstubAllGlobals();
});

// ── connect (hardware) ────────────────────────────────────────────────────────

describe('connect — hardware mode', () => {
    it('initialises 8 channels', async () => {
        await ctrl.connect();
        expect(ctrl.channels).toHaveLength(8);
        expect(ctrl.initialized).toBe(true);
    });

    it('creates a ConstantSourceNode per channel', async () => {
        await ctrl.connect();
        expect(mockCtx.createConstantSource).toHaveBeenCalledTimes(8);
    });

    it('starts all ConstantSourceNodes', async () => {
        await ctrl.connect();
        ctrl.channels.forEach(ch => expect(ch.cvSource.start).toHaveBeenCalled());
    });

    it('resumes the AudioContext', async () => {
        await ctrl.connect();
        expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('calls setSinkId with provided deviceId', async () => {
        await ctrl.connect('es8id');
        expect(mockCtx.setSinkId).toHaveBeenCalledWith('es8id');
    });

    it('skips setSinkId when no deviceId given', async () => {
        await ctrl.connect(null);
        expect(mockCtx.setSinkId).not.toHaveBeenCalled();
    });

    it('cleans up and throws if setSinkId rejects', async () => {
        mockCtx.setSinkId.mockRejectedValueOnce(new Error('device error'));
        await expect(ctrl.connect('bad-id')).rejects.toThrow('device error');
        expect(ctrl.initialized).toBe(false);
        expect(ctrl.channels).toHaveLength(0);
        expect(mockCtx.close).toHaveBeenCalled();
    });
});

// ── connect (simulate) ────────────────────────────────────────────────────────

describe('connect — simulate mode', () => {
    it('creates OscillatorNodes instead of ConstantSourceNodes', async () => {
        await ctrl.connect(null, { simulate: true });
        expect(mockCtx.createOscillator).toHaveBeenCalledTimes(8);
        expect(mockCtx.createConstantSource).not.toHaveBeenCalled();
    });

    it('does not create a ChannelMerger', async () => {
        await ctrl.connect(null, { simulate: true });
        expect(mockCtx.createChannelMerger).not.toHaveBeenCalled();
    });

    it('sets simMode = true', async () => {
        await ctrl.connect(null, { simulate: true });
        expect(ctrl.simMode).toBe(true);
    });

    it('starts all oscillators', async () => {
        await ctrl.connect(null, { simulate: true });
        ctrl.channels.forEach(ch => expect(ch.osc.start).toHaveBeenCalled());
    });
});

// ── setCV ─────────────────────────────────────────────────────────────────────

describe('setCV — hardware mode', () => {
    beforeEach(async () => { await ctrl.connect(); });

    it('calls setValueAtTime with normalised voltage (no slew)', () => {
        ctrl.setCV(0, 5, 0); // 5V → normalised 0
        expect(ctrl.channels[0].cvSource.offset.setValueAtTime).toHaveBeenCalledWith(0, 0);
    });

    it('calls linearRampToValueAtTime when slew > 0', () => {
        ctrl.setCV(0, 5, 10);
        expect(ctrl.channels[0].cvSource.offset.linearRampToValueAtTime).toHaveBeenCalled();
    });

    it('clamps to 5V in safe mode', () => {
        ctrl.setCV(0, 9, 0); // requests 9V, safe mode on
        const call = ctrl.channels[0].cvSource.offset.setValueAtTime.mock.calls.at(-1);
        expect(call[0]).toBe(0); // normaliseVoltage(5) = 0
    });

    it('allows up to 10V when safe mode off', () => {
        ctrl.setSafeMode(false);
        ctrl.setCV(0, 10, 0);
        const call = ctrl.channels[0].cvSource.offset.setValueAtTime.mock.calls.at(-1);
        expect(call[0]).toBe(1); // normaliseVoltage(10) = 1
    });

    it('caps at 10V when safe mode off and volts > 10', () => {
        ctrl.setSafeMode(false);
        ctrl.setCV(0, 15, 0);
        expect(ctrl.getVoltage(0)).toBe(10);
    });

    it('stores the voltage for getVoltage', () => {
        ctrl.setCV(0, 3, 0);
        expect(ctrl.getVoltage(0)).toBe(3);
    });

    it('ignores out-of-range channels', () => {
        expect(() => ctrl.setCV(8, 5, 0)).not.toThrow();
        expect(() => ctrl.setCV(-1, 5, 0)).not.toThrow();
    });
});

describe('setCV — simulate mode', () => {
    beforeEach(async () => { await ctrl.connect(null, { simulate: true }); });

    it('updates oscillator frequency', () => {
        ctrl.setCV(0, 2, 0);
        expect(ctrl.channels[0].osc.frequency.setValueAtTime).toHaveBeenCalled();
    });

    it('calls setTargetAtTime on gain to unmute', () => {
        ctrl.setCV(0, 2, 0);
        expect(ctrl.channels[0].gain.gain.setTargetAtTime).toHaveBeenCalled();
    });

    it('silences gain when voltage is 0', () => {
        ctrl.setCV(0, 0, 0);
        const call = ctrl.channels[0].gain.gain.setTargetAtTime.mock.calls.at(-1);
        expect(call[0]).toBe(0); // target gain = 0
    });
});

// ── setGate ───────────────────────────────────────────────────────────────────

describe('setGate', () => {
    beforeEach(async () => { await ctrl.connect(); });

    it('sets gate high and records 5V', () => {
        ctrl.setGate(0, true);
        expect(ctrl.getVoltage(0)).toBe(5);
        expect(ctrl.channels[0].cvSource.offset.setValueAtTime).toHaveBeenCalled();
    });

    it('sets gate low and records 0V', () => {
        ctrl.setGate(0, true);
        ctrl.setGate(0, false);
        expect(ctrl.getVoltage(0)).toBe(0);
    });

    it('caps gate voltage at 10V when safe mode off', () => {
        ctrl.setSafeMode(false);
        ctrl.setGate(0, true, 15);
        expect(ctrl.getVoltage(0)).toBe(10);
    });
});

// ── triggerGate ───────────────────────────────────────────────────────────────

describe('triggerGate', () => {
    beforeEach(async () => { await ctrl.connect(); });

    it('schedules hi then lo (2 setValueAtTime calls)', () => {
        ctrl.triggerGate(0, 10);
        expect(ctrl.channels[0].cvSource.offset.setValueAtTime).toHaveBeenCalledTimes(2);
    });

    it('cancels previous scheduled values first', () => {
        ctrl.triggerGate(0, 10);
        expect(ctrl.channels[0].cvSource.offset.cancelScheduledValues).toHaveBeenCalled();
    });

    it('caps gate voltage at 10V when safe mode off', () => {
        ctrl.setSafeMode(false);
        ctrl.triggerGate(0, 10, 15);
        expect(ctrl.getVoltage(0)).toBe(10);
    });
});

// ── panic ─────────────────────────────────────────────────────────────────────

describe('panic', () => {
    beforeEach(async () => { await ctrl.connect(); });

    it('zeroes all channel voltages', () => {
        ctrl.setCV(0, 5, 0);
        ctrl.setCV(3, 3, 0);
        ctrl.panic();
        expect(ctrl.getVoltage(0)).toBe(0);
        expect(ctrl.getVoltage(3)).toBe(0);
    });

    it('calls cancelAndHoldAtTime on each channel', () => {
        ctrl.panic();
        ctrl.channels.forEach(ch => {
            expect(ch.cvSource.offset.cancelAndHoldAtTime).toHaveBeenCalled();
        });
    });

    it('schedules a ramp to 0V on each channel', () => {
        ctrl.panic();
        ctrl.channels.forEach(ch => {
            expect(ch.cvSource.offset.linearRampToValueAtTime).toHaveBeenCalledWith(-1, expect.any(Number));
        });
    });
});

// ── disconnect ────────────────────────────────────────────────────────────────

describe('disconnect', () => {
    it('closes the AudioContext and resets state', async () => {
        await ctrl.connect();
        await ctrl.disconnect();
        expect(mockCtx.close).toHaveBeenCalled();
        expect(ctrl.initialized).toBe(false);
        expect(ctrl.channels).toHaveLength(0);
    });

    it('stops all ConstantSourceNodes', async () => {
        await ctrl.connect();
        const channels = [...ctrl.channels];
        await ctrl.disconnect();
        channels.forEach(ch => expect(ch.cvSource.stop).toHaveBeenCalled());
    });

    it('stops all oscillators in sim mode', async () => {
        await ctrl.connect(null, { simulate: true });
        const channels = [...ctrl.channels];
        await ctrl.disconnect();
        channels.forEach(ch => expect(ch.osc.stop).toHaveBeenCalled());
    });

    it('is a no-op when not initialised', async () => {
        await expect(ctrl.disconnect()).resolves.toBeUndefined();
    });

    it('still closes AudioContext even if one node stop() throws', async () => {
        await ctrl.connect();
        ctrl.channels[2].cvSource.stop.mockImplementationOnce(() => {
            throw new Error('already stopped');
        });
        await ctrl.disconnect();
        expect(mockCtx.close).toHaveBeenCalled();
        expect(ctrl.initialized).toBe(false);
    });
});

// ── getDevices ────────────────────────────────────────────────────────────────

describe('getDevices', () => {
    it('returns only audiooutput devices', async () => {
        const devices = await ctrl.getDevices();
        expect(devices).toHaveLength(2);
        devices.forEach(d => expect(d.kind).toBe('audiooutput'));
    });

    it('auto-detects ES-8 by label', async () => {
        const devices = await ctrl.getDevices();
        const es8 = devices.find(d => /es-?8/i.test(d.label));
        expect(es8).toBeDefined();
        expect(es8.deviceId).toBe('es8id');
    });
});
