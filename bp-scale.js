export const BP_STEPS = 13;
export const STEP_VOLTS = Math.log2(3) / 13;   // ~0.13195 V per chromatic step
export const TRITAVE_VOLTS = Math.log2(3);      // ~1.585 V

// C D♯ E F F♯ G G♯ H H♯ J J♯ match Bohlen's original heptatonic + chromatic filling
export const BP_NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','H','H♯','J','J♯'];

export function bpNoteToVolts(note, tritave = 0) {
    return (note + tritave * BP_STEPS) * STEP_VOLTS;
}

export function bpNoteToFreq(note, tritave = 0, rootHz = 130.81) {
    return rootHz * Math.pow(3, (note + tritave * BP_STEPS) / BP_STEPS);
}
