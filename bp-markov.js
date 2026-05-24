import { BP_STEPS } from './bp-scale.js';

// Transition weights by interval distance.
// Peaks at ±3 (≈9:7) and ±4 (≈7:5) — BP's most consonant dyads.
// ±6 (≈5:3) is the BP "sixth", also preferred.
const INTERVAL_WEIGHTS = [
    0,    // 0 unison — never stay on same note
    0.3,  // 1 chromatic half-step
    0.5,  // 2 whole step
    2.0,  // 3 ≈ 9:7  (BP minor third)
    2.0,  // 4 ≈ 7:5  (BP narrow fourth)
    0.8,  // 5
    1.5,  // 6 ≈ 5:3  (BP narrow sixth)
    0.8,  // 7
    0.5,  // 8
    1.0,  // 9 ≈ 7:3
    0.3,  // 10
    0.3,  // 11
    0.2,  // 12 tritave (same pitch class, far leap)
];

function buildMatrix() {
    return Array.from({ length: BP_STEPS }, (_, from) => {
        const row = new Array(BP_STEPS).fill(0);
        let total = 0;
        for (let to = 0; to < BP_STEPS; to++) {
            if (to === from) continue;
            // Wrap-aware shortest distance between two scale degrees
            const dist = Math.min(Math.abs(to - from), BP_STEPS - Math.abs(to - from));
            row[to] = INTERVAL_WEIGHTS[dist];
            total += row[to];
        }
        return row.map(w => w / total);
    });
}

export const TRANSITION_MATRIX = buildMatrix();

function pickNext(row, rng) {
    let r = rng();
    for (let i = 0; i < row.length; i++) {
        r -= row[i];
        if (r <= 0) return i;
    }
    return row.length - 1;
}

export function generateMotive(length, { startNote = null, rng = Math.random } = {}) {
    const start = startNote !== null
        ? Math.max(0, Math.min(BP_STEPS - 1, startNote))
        : Math.floor(rng() * BP_STEPS);
    const notes = [start];
    for (let i = 1; i < length; i++) {
        notes.push(pickNext(TRANSITION_MATRIX[notes[notes.length - 1]], rng));
    }
    return notes;
}
