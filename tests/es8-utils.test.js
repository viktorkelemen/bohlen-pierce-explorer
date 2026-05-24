import { describe, it, expect } from 'vitest';
import {
    normalizeVoltage,
    denormalizeVoltage,
    semitonesToVoltage,
    voltageToSemitones,
    centsToVoltage,
} from '../es8-utils.js';

describe('normalizeVoltage', () => {
    it('maps 0V to -1', () => expect(normalizeVoltage(0)).toBe(-1));
    it('maps 5V to 0', () => expect(normalizeVoltage(5)).toBe(0));
    it('maps 10V to +1', () => expect(normalizeVoltage(10)).toBe(1));
    it('clamps above 10V by default', () => expect(normalizeVoltage(12)).toBe(1));
    it('clamps below 0V by default', () => expect(normalizeVoltage(-2)).toBe(-1));
    it('does not clamp when clamp=false', () => {
        expect(normalizeVoltage(12, false)).toBeCloseTo(1.4);
    });
    it('is linear midpoint at 2.5V → -0.5', () => {
        expect(normalizeVoltage(2.5)).toBeCloseTo(-0.5);
    });
});

describe('denormalizeVoltage', () => {
    it('maps -1 to 0V', () => expect(denormalizeVoltage(-1)).toBe(0));
    it('maps 0 to 5V', () => expect(denormalizeVoltage(0)).toBe(5));
    it('maps +1 to 10V', () => expect(denormalizeVoltage(1)).toBe(10));
    it('clamps above 10V by default', () => expect(denormalizeVoltage(1.5)).toBe(10));
    it('clamps below 0V by default', () => expect(denormalizeVoltage(-1.5)).toBe(0));
    it('does not clamp when clamp=false', () => {
        expect(denormalizeVoltage(1.5, false)).toBeCloseTo(12.5);
    });
    it('is inverse of normalizeVoltage', () => {
        [0, 1, 2.5, 5, 7.3, 10].forEach(v => {
            expect(denormalizeVoltage(normalizeVoltage(v))).toBeCloseTo(v);
        });
    });
});

describe('semitonesToVoltage', () => {
    it('12 semitones = 1V', () => expect(semitonesToVoltage(12)).toBe(1));
    it('0 semitones = 0V', () => expect(semitonesToVoltage(0)).toBe(0));
    it('24 semitones = 2V', () => expect(semitonesToVoltage(24)).toBe(2));
    it('fractional semitones', () => expect(semitonesToVoltage(7)).toBeCloseTo(7 / 12));
});

describe('voltageToSemitones', () => {
    it('1V = 12 semitones', () => expect(voltageToSemitones(1)).toBe(12));
    it('0V = 0 semitones', () => expect(voltageToSemitones(0)).toBe(0));
    it('is inverse of semitonesToVoltage', () => {
        [0, 7, 12, 19, 24].forEach(s => {
            expect(voltageToSemitones(semitonesToVoltage(s))).toBeCloseTo(s);
        });
    });
});

describe('centsToVoltage', () => {
    it('1200 cents = 1V', () => expect(centsToVoltage(1200)).toBe(1));
    it('0 cents = 0V', () => expect(centsToVoltage(0)).toBe(0));
    it('100 cents = 1/12 V', () => expect(centsToVoltage(100)).toBeCloseTo(1 / 12));
    it('600 cents = 0.5V', () => expect(centsToVoltage(600)).toBeCloseTo(0.5));
});
