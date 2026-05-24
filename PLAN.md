# Implementation Plan

## Phase 1: ES-8 Core (current)

Goal: a single working HTML page that can connect to the ES-8 and send CV and gate signals.

### Step 1 — Device connection
- Enumerate audio output devices via `navigator.mediaDevices.enumerateDevices()`
- Let user pick the ES-8 from a dropdown
- Create an `AudioContext` and route it to the selected device via `AudioContext.setSinkId()` (Chrome 110+)

### Step 2 — Audio graph (ConstantSourceNode, not AudioWorklet)
- One `ConstantSourceNode` per channel — outputs a constant DC value, no audio thread custom code needed
- Architecture per channel: `ConstantSourceNode → GainNode → AnalyserNode → ChannelMerger(8) → destination`
- CV: `linearRampToValueAtTime` for slew; `setValueAtTime` for immediate changes
- Gate: schedule `setValueAtTime(HIGH, t)` + `setValueAtTime(LOW, t + width)` for pulses
- Voltage normalization: 0–10V → WebAudio –1…+1 via `(v / 10) * 2 - 1` (from `es8-utils.js`)

### Step 3 — Channel config store
- 8 output channel slots, persisted to `localStorage`
- Each slot: label, type (cv/gate), voltage range, enabled
- Reusable by future projects (Bohlen-Pierce tuner, sequencers, etc.)

### Step 4 — UI
- Device picker + connect button
- 8 channel strips: label, type toggle, CV slider or gate toggle
- Status indicator (connected / disconnected / no ES-8 found)

---

## Phase 2: Bohlen-Pierce layer (next)

- BP scale math (tritave = 3:1, 13 equal steps, ~146.3 cents each)
- Map BP note numbers to 1V/oct CV values
- Keyboard/sequencer UI in BP tuning
- Send tuned CV + gate to ES-8 channels

---

## File structure

```
bohlen-pierce-explorer/
  index.html          — UI shell
  es8-processor.js    — AudioWorklet (audio thread)
  es8.js              — connection + channel store + public API
  styles.css          — minimal styles
  PLAN.md
  README.md
```
