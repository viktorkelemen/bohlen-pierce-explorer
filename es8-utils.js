/**
 * ES-8 Voltage Utilities
 * Shared utilities for voltage normalization and conversion
 */

/**
 * Normalize voltage to WebAudio range
 * ES-8 DC-coupled mapping: WebAudio [-1, +1] maps to ES-8 [0V, 10V]
 *
 * Formula derivation:
 *   0V  -> -1.0: (0/10)*2 - 1 = -1.0
 *   5V  ->  0.0: (5/10)*2 - 1 =  0.0  (center of WebAudio range)
 *   10V ->  1.0: (10/10)*2 - 1 = 1.0
 *
 * This is mathematically equivalent to: (voltage / 5.0) - 1.0
 * Both formulas produce the same linear mapping.
 *
 * @param {number} voltage - Voltage in volts (0-10V range)
 * @param {boolean} clamp - Whether to clamp to 0-10V range (default: true)
 * @returns {number} Normalized value in WebAudio range [-1, +1]
 */
export function normalizeVoltage(voltage, clamp = true) {
    const safeVoltage = clamp ? Math.max(0, Math.min(10, voltage)) : voltage;
    return (safeVoltage / 10.0) * 2.0 - 1.0;
}

/**
 * Denormalize WebAudio value to voltage
 * Inverse of normalizeVoltage()
 *
 * @param {number} normalized - Normalized value in WebAudio range [-1, +1]
 * @param {boolean} clamp - Whether to clamp to 0-10V range (default: true)
 * @returns {number} Voltage in volts (0-10V range)
 */
export function denormalizeVoltage(normalized, clamp = true) {
    const voltage = ((normalized + 1.0) / 2.0) * 10.0;
    return clamp ? Math.max(0, Math.min(10, voltage)) : voltage;
}

/**
 * Convert semitones to voltage (1V/oct standard)
 *
 * @param {number} semitones - Number of semitones (12 semitones = 1 octave = 1V)
 * @returns {number} Voltage in volts
 */
export function semitonesToVoltage(semitones) {
    return semitones / 12.0;
}

/**
 * Convert voltage to semitones (1V/oct standard)
 *
 * @param {number} voltage - Voltage in volts
 * @returns {number} Number of semitones
 */
export function voltageToSemitones(voltage) {
    return voltage * 12.0;
}

/**
 * Convert cents to voltage (1V/oct standard)
 *
 * @param {number} cents - Detuning in cents (100 cents = 1 semitone)
 * @returns {number} Voltage in volts
 */
export function centsToVoltage(cents) {
    return cents / 1200.0; // 1200 cents = 1 octave = 1V
}
