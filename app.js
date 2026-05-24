import { es8 } from './es8.js';

const STORAGE_KEY = 'es8-channel-config';

const defaultConfig = () => Array.from({ length: 8 }, (_, i) => ({
    label: `CH ${i + 1}`,
    type: 'cv',
    range: [0, 5],
    slewMs: 3,
    gateWidth: 10,
    cvValue: 0,
    gateHeld: false,
}));

function sanitizeChannel(ch, i) {
    const def = defaultConfig()[i];
    return {
        label: typeof ch.label === 'string' ? ch.label : def.label,
        type: ch.type === 'cv' || ch.type === 'gate' ? ch.type : def.type,
        range: Array.isArray(ch.range) && ch.range.length === 2 ? ch.range : def.range,
        slewMs: Number.isFinite(+ch.slewMs) ? +ch.slewMs : def.slewMs,
        gateWidth: Number.isFinite(+ch.gateWidth) ? +ch.gateWidth : def.gateWidth,
        cvValue: Number.isFinite(+ch.cvValue) ? +ch.cvValue : 0,
        gateHeld: typeof ch.gateHeld === 'boolean' ? ch.gateHeld : false,
    };
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length === 8) {
                return parsed.map(sanitizeChannel);
            }
        }
    } catch {}
    return defaultConfig();
}

function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

let config = loadConfig();
let connected = false;

const deviceSelect = document.getElementById('device-select');
const connectBtn = document.getElementById('connect-btn');
const statusDot = document.getElementById('status');
const safeCheck = document.getElementById('safe-mode');
const simCheck = document.getElementById('sim-mode');
const panicBtn = document.getElementById('panic-btn');
const channelsEl = document.getElementById('channels');

function setStatus(state, msg) {
    statusDot.className = `status ${state}`;
    statusDot.title = msg || state;
}

async function loadDevices() {
    try {
        const devices = await es8.getDevices();
        deviceSelect.innerHTML = '<option value="">— default output —</option>';
        let autoSelected = false;
        devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            const isES8 = /es-?8|expert sleepers/i.test(d.label);
            opt.textContent = d.label || `Output ${d.deviceId.slice(0, 8)}`;
            if (isES8 && !autoSelected) {
                opt.selected = true;
                opt.textContent += ' ✓';
                autoSelected = true;
            }
            deviceSelect.appendChild(opt);
        });
    } catch (e) {
        setStatus('error', 'Device enumeration failed: ' + e.message);
    }
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderCV(ch, i) {
    const max = safeCheck.checked ? 5 : 10;
    const v = Math.min(ch.cvValue || 0, max);
    return `
        <div class="cv-row">
            <input type="range" class="cv-slider" data-i="${i}"
                min="0" max="${max}" step="0.01" value="${v}">
            <input type="number" class="cv-num" data-i="${i}"
                min="0" max="${max}" step="0.01" value="${v.toFixed(2)}">
            <span class="cv-unit">V</span>
        </div>`;
}

function renderGate(ch, i) {
    return `
        <div class="gate-row">
            <button class="gate-trig" data-i="${i}">TRIG</button>
            <button class="gate-hold${ch.gateHeld ? ' active' : ''}" data-i="${i}">HOLD</button>
        </div>`;
}

function buildChannels() {
    channelsEl.innerHTML = '';
    config.forEach((ch, i) => {
        const div = document.createElement('div');
        div.className = 'channel-strip';
        div.dataset.i = i;
        div.innerHTML = `
            <div class="ch-top">
                <span class="ch-num">${i + 1}</span>
                <input class="ch-label" type="text" value="${esc(ch.label)}">
                <div class="type-btns">
                    <button class="type-btn${ch.type === 'cv' ? ' active' : ''}" data-type="cv">CV</button>
                    <button class="type-btn${ch.type === 'gate' ? ' active' : ''}" data-type="gate">GATE</button>
                </div>
            </div>
            <div class="ch-body">
                ${ch.type === 'cv' ? renderCV(ch, i) : renderGate(ch, i)}
            </div>
            <div class="ch-meter">
                <div class="meter-bar"><div class="meter-fill" id="mfill-${i}"></div></div>
                <span class="meter-val" id="mval-${i}">0.00V</span>
            </div>`;
        channelsEl.appendChild(div);
    });
    bindEvents();
}

function bindEvents() {
    channelsEl.querySelectorAll('.ch-label').forEach(el => {
        el.addEventListener('change', () => {
            const i = +el.closest('.channel-strip').dataset.i;
            config[i].label = el.value;
            saveConfig();
        });
    });

    channelsEl.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = +btn.closest('.channel-strip').dataset.i;
            const type = btn.dataset.type;
            if (config[i].type === type) return;
            config[i].type = type;
            config[i].gateHeld = false;
            if (connected) {
                if (type === 'cv') es8.setCV(i, config[i].cvValue || 0, 0);
                else es8.setGate(i, false);
            }
            saveConfig();
            buildChannels();
        });
    });

    channelsEl.querySelectorAll('.cv-slider').forEach(el => {
        el.addEventListener('input', () => {
            const i = +el.dataset.i;
            const v = parseFloat(el.value);
            config[i].cvValue = v;
            const num = channelsEl.querySelector(`.cv-num[data-i="${i}"]`);
            if (num) num.value = v.toFixed(2);
            if (connected) es8.setCV(i, v, 0);
        });
    });

    channelsEl.querySelectorAll('.cv-num').forEach(el => {
        el.addEventListener('change', () => {
            const i = +el.dataset.i;
            const max = safeCheck.checked ? 5 : 10;
            const v = Math.max(0, Math.min(max, parseFloat(el.value) || 0));
            config[i].cvValue = v;
            el.value = v.toFixed(2);
            const slider = channelsEl.querySelector(`.cv-slider[data-i="${i}"]`);
            if (slider) { slider.max = max; slider.value = v; }
            if (connected) es8.setCV(i, v, 0);
        });
    });

    channelsEl.querySelectorAll('.gate-trig').forEach(el => {
        el.addEventListener('click', () => {
            const i = +el.dataset.i;
            if (connected) es8.triggerGate(i, config[i].gateWidth);
        });
    });

    channelsEl.querySelectorAll('.gate-hold').forEach(el => {
        el.addEventListener('click', () => {
            const i = +el.dataset.i;
            config[i].gateHeld = !config[i].gateHeld;
            el.classList.toggle('active', config[i].gateHeld);
            if (connected) es8.setGate(i, config[i].gateHeld);
            saveConfig();
        });
    });
}

connectBtn.addEventListener('click', async () => {
    if (connected) {
        await es8.disconnect();
        connected = false;
        setStatus('off', 'Disconnected');
        connectBtn.textContent = 'Connect';
        return;
    }
    connectBtn.disabled = true;
    connectBtn.textContent = '…';
    setStatus('connecting', 'Connecting…');
    try {
        const simulate = simCheck.checked;
        await es8.connect(simulate ? null : (deviceSelect.value || null), { simulate });
        connected = true;
        setStatus(simulate ? 'sim' : 'on', simulate ? 'Simulation' : 'Connected');
        connectBtn.textContent = 'Disconnect';
        config.forEach((ch, i) => {
            if (ch.type === 'cv') es8.setCV(i, ch.cvValue || 0, 0);
            else if (ch.gateHeld) es8.setGate(i, true);
        });
    } catch (e) {
        setStatus('error', 'Error: ' + e.message);
        connectBtn.textContent = 'Connect';
    } finally {
        connectBtn.disabled = false;
    }
});

safeCheck.addEventListener('change', () => {
    es8.setSafeMode(safeCheck.checked);
    buildChannels();
});

panicBtn.addEventListener('click', () => {
    if (connected) es8.panic();
    config.forEach(ch => { ch.cvValue = 0; ch.gateHeld = false; });
    saveConfig();
    buildChannels();
});

function tick() {
    config.forEach((ch, i) => {
        const fill = document.getElementById(`mfill-${i}`);
        const val = document.getElementById(`mval-${i}`);
        if (!fill || !val) return;
        const v = connected ? Math.max(0, es8.getVoltage(i)) : 0;
        fill.style.width = Math.min(100, (v / 10) * 100) + '%';
        val.textContent = v.toFixed(2) + 'V';
    });
    requestAnimationFrame(tick);
}

buildChannels();
loadDevices();
requestAnimationFrame(tick);
