import { describe, it, expect } from 'vitest';
import {
    BP_STEPS,
    STEP_VOLTS,
    TRITAVE_VOLTS,
    BP_NOTE_NAMES,
    bpNoteToVolts,
    bpNoteToFreq,
} from '../bp-scale.js';

describe('constants', () => {
    it('BP_STEPS is 13', () => expect(BP_STEPS).toBe(13));
    it('TRITAVE_VOLTS is log2(3)', () => expect(TRITAVE_VOLTS).toBeCloseTo(Math.log2(3)));
    it('STEP_VOLTS * 13 equals TRITAVE_VOLTS', () => {
        expect(STEP_VOLTS * 13).toBeCloseTo(TRITAVE_VOLTS);
    });
    it('BP_NOTE_NAMES has 13 entries', () => expect(BP_NOTE_NAMES).toHaveLength(13));
    it('first note is C', () => expect(BP_NOTE_NAMES[0]).toBe('C'));
});

describe('bpNoteToVolts', () => {
    it('note 0, tritave 0 → 0V', () => expect(bpNoteToVolts(0, 0)).toBe(0));
    it('note 13 (one tritave) → TRITAVE_VOLTS', () => {
        expect(bpNoteToVolts(0, 1)).toBeCloseTo(TRITAVE_VOLTS);
    });
    it('note 13 via tritave param equals note 0 tritave 1', () => {
        expect(bpNoteToVolts(13, 0)).toBeCloseTo(bpNoteToVolts(0, 1));
    });
    it('each step increases voltage by STEP_VOLTS', () => {
        const diff = bpNoteToVolts(5) - bpNoteToVolts(4);
        expect(diff).toBeCloseTo(STEP_VOLTS);
    });
    it('two tritaves up = 2 × TRITAVE_VOLTS', () => {
        expect(bpNoteToVolts(0, 2)).toBeCloseTo(2 * TRITAVE_VOLTS);
    });
    it('stays within 0–5V safe range for tritave 0', () => {
        for (let n = 0; n < 13; n++) {
            expect(bpNoteToVolts(n)).toBeGreaterThanOrEqual(0);
            expect(bpNoteToVolts(n)).toBeLessThan(5);
        }
    });
});

describe('bpNoteToFreq', () => {
    const ROOT = 130.81;
    it('note 0 = root frequency', () => {
        expect(bpNoteToFreq(0, 0, ROOT)).toBeCloseTo(ROOT);
    });
    it('one tritave up = root × 3', () => {
        expect(bpNoteToFreq(0, 1, ROOT)).toBeCloseTo(ROOT * 3);
    });
    it('note 13 = root × 3 (same as tritave 1)', () => {
        expect(bpNoteToFreq(13, 0, ROOT)).toBeCloseTo(ROOT * 3);
    });
    it('increases monotonically with note number', () => {
        for (let n = 0; n < 12; n++) {
            expect(bpNoteToFreq(n + 1)).toBeGreaterThan(bpNoteToFreq(n));
        }
    });
});
