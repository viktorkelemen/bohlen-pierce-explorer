import { describe, it, expect } from 'vitest';
import { generateMotive, TRANSITION_MATRIX } from '../bp-markov.js';
import { BP_STEPS } from '../bp-scale.js';

describe('TRANSITION_MATRIX', () => {
    it('has BP_STEPS rows', () => expect(TRANSITION_MATRIX).toHaveLength(BP_STEPS));

    it('each row sums to 1', () => {
        TRANSITION_MATRIX.forEach(row => {
            expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
        });
    });

    it('self-transition probability is 0', () => {
        TRANSITION_MATRIX.forEach((row, i) => expect(row[i]).toBe(0));
    });

    it('consonant intervals (3, 4) outweigh chromatic (1) from any note', () => {
        TRANSITION_MATRIX.forEach((row, from) => {
            const to3 = (from + 3) % BP_STEPS;
            const to4 = (from + 4) % BP_STEPS;
            const to1 = (from + 1) % BP_STEPS;
            expect(row[to3]).toBeGreaterThan(row[to1]);
            expect(row[to4]).toBeGreaterThan(row[to1]);
        });
    });
});

describe('generateMotive', () => {
    it('returns array of the requested length', () => {
        expect(generateMotive(6)).toHaveLength(6);
        expect(generateMotive(1)).toHaveLength(1);
        expect(generateMotive(16)).toHaveLength(16);
    });

    it('all notes are valid BP degrees (0–12)', () => {
        for (let trial = 0; trial < 30; trial++) {
            generateMotive(8).forEach(n => {
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThan(BP_STEPS);
            });
        }
    });

    it('first note matches startNote when provided', () => {
        expect(generateMotive(6, { startNote: 0 })[0]).toBe(0);
        expect(generateMotive(6, { startNote: 9 })[0]).toBe(9);
    });

    it('clamps out-of-range startNote', () => {
        expect(generateMotive(4, { startNote: -1 })[0]).toBe(0);
        expect(generateMotive(4, { startNote: 99 })[0]).toBe(12);
    });

    it('is deterministic with a fixed rng', () => {
        function seededRng(s) {
            let state = s;
            return () => {
                state = (state * 1103515245 + 12345) & 0x7fffffff;
                return state / 0x7fffffff;
            };
        }
        expect(generateMotive(8, { rng: seededRng(42) }))
            .toEqual(generateMotive(8, { rng: seededRng(42) }));
    });
});
