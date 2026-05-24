# es8-web-core

Reusable web library + UI shell for connecting to the [Expert Sleepers ES-8](https://www.expert-sleepers.co.uk/es8.html) and sending CV/gate from the browser via the Web Audio API.

## What it is

A portable core (`es8/`) that can be imported by any web-based modular tool, plus a minimal React UI shell for device configuration and testing.

## Architecture

### `es8/connection.ts`
Enumerates audio devices, creates an `AudioContext` routed to the ES-8, and exposes connect/disconnect. The ES-8 is DC-coupled — ±1.0 audio samples map to ±10V output.

### `es8/store.ts`
Zustand store persisted to `localStorage`. Holds 8 output + 8 input channel configs:
- Physical channel index
- User label
- Type: `cv` or `gate`
- Voltage range (e.g. `[-5, 5]` or `[0, 10]`)
- Enabled flag

### `es8/worklet.ts` + `es8-processor.js`
`AudioWorkletProcessor` on the audio thread:
- **CV**: outputs a constant DC value — `voltage / 10.0` normalized to audio range
- **Gate**: outputs `+0.5` (5V) or `0.0`, edge-hardened to avoid clicks

### `es8/index.ts` — Public API
```ts
connect()
disconnect()
setCV(channelIndex, volts)
setGate(channelIndex, on: boolean)
getInputLevel(channelIndex): number
useES8Store()
```

### UI Shell
- Device picker — select ES-8 from available audio devices
- Channel strip — label, CV/gate type, voltage range per output
- Test panel — CV sliders and gate toggles to verify signal at each jack
- Input monitor (stretch) — level meters for ES-8 inputs

## Stack

React + Vite + TypeScript + Zustand

## Phase 1 Scope

- [ ] Project scaffold
- [ ] ES-8 connection + device enumeration
- [ ] AudioWorklet with CV and gate output
- [ ] Channel config store with persistence
- [ ] Basic UI: device picker + channel config + test panel
