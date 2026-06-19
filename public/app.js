/**
 * RichAi - AgentRouter Chat
 * Base URL: https://agentrouter.org/v1
 * 
 * Menggunakan Cloudflare Worker sebagai proxy untuk bypass
 * browser restriction dari AgentRouter.
 */

const DIRECT_URL = 'https://agentrouter.org/v1';

// Auto-detect if running on Vercel (has /api/proxy available)
const isVercel = window.location.hostname.includes('vercel.app') || 
                 window.location.hostname.includes('.vercel.') ||
                 window.location.hostname !== 'ramax100.github.io';
const DEFAULT_PROXY = isVercel ? '/api/proxy' : '';

// State
let apiKey = '';
let selectedModel = '';
let messages = [];
let isGenerating = false;
let abortController = null;
let proxyUrl = DEFAULT_PROXY;
let useProxy = true;

// Elements
const apiKeyInput = document.getElementById('apiKey');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const agentPanel = document.getElementById('agentPanel');
const agentSelect = document.getElementById('agentSelect');
const disconnectBtn = document.getElementById('disconnectBtn');
const chatArea = document.getElementById('chatArea');
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const proxyToggle = document.getElementById('proxyToggle');
const proxyUrlInput = document.getElementById('proxyUrl');

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadSavedSettings();
    initListeners();
});

function initListeners() {
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    sendBtn.addEventListener('click', sendMessage);

    apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connect();
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    agentSelect.addEventListener('change', () => {
        selectedModel = agentSelect.value;
        if (selectedModel) {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.placeholder = `Chat dengan ${selectedModel}...`;
            chatInput.focus();
        } else {
            chatInput.disabled = true;
            sendBtn.disabled = true;
            chatInput.placeholder = 'Pilih agent terlebih dahulu...';
        }
    });

    proxyToggle.addEventListener('change', () => {
        useProxy = proxyToggle.checked;
        proxyUrlInput.disabled = !useProxy;
        saveSettings();
    });

    proxyUrlInput.addEventListener('change', () => {
        proxyUrl = proxyUrlInput.value.trim();
        saveSettings();
    });
}

function loadSavedSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('richai_settings') || '{}');
        if (saved.apiKey) apiKeyInput.value = saved.apiKey;
        if (saved.proxyUrl) {
            proxyUrl = saved.proxyUrl;
            proxyUrlInput.value = saved.proxyUrl;
        } else {
            // Use default proxy for Vercel
            proxyUrl = DEFAULT_PROXY;
            proxyUrlInput.value = DEFAULT_PROXY;
        }
        if (saved.useProxy !== undefined) {
            useProxy = saved.useProxy;
            proxyToggle.checked = useProxy;
            proxyUrlInput.disabled = !useProxy;
        }
    } catch (e) {}
}

function saveSettings() {
    localStorage.setItem('richai_settings', JSON.stringify({
        apiKey: apiKeyInput.value.trim(),
        proxyUrl: proxyUrlInput.value.trim(),
        useProxy
    }));
}

function setStatus(text, type) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'connection-status ' + type;
}

/**
 * Build the actual fetch URL.
 * If proxy enabled: proxyUrl?endpoint=models
 * If proxy disabled: direct to agentrouter.org/v1/models
 */
function buildUrl(endpoint) {
    if (useProxy && proxyUrl) {
        const separator = proxyUrl.includes('?') ? '&' : '?';
        return `${proxyUrl}${separator}endpoint=${encodeURIComponent(endpoint)}`;
    }
    return `${DIRECT_URL}/${endpoint}`;
}

// Connect & Fetch Models
async function connect() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        setStatus('Masukkan API Key terlebih dahulu.', 'error');
        apiKeyInput.focus();
        return;
    }

    if (useProxy && !proxyUrl) {
        setStatus('Masukkan Proxy URL. Jika deploy di Vercel, gunakan /api/proxy', 'error');
        proxyUrlInput.focus();
        return;
    }

    connectBtn.disabled = true;
    setStatus('Menghubungkan...', 'loading');

    try {
        const url = buildUrl('models');
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg;
            try {
                const errJson = JSON.parse(errText);
                errMsg = errJson.error?.message || errText;
            } catch {
                errMsg = errText.substring(0, 200);
            }
            throw new Error(errMsg || `Gagal terhubung (HTTP ${response.status})`);
        }

        const data = await response.json();
        const models = data.data || data.models || data || [];

        if (!Array.isArray(models) || models.length === 0) {
            throw new Error('Tidak ada model/agent yang tersedia.');
        }

        // Save
        apiKey = key;
        saveSettings();

        // Populate
        populateModels(models);

        setStatus(`Terhubung! ${models.length} model tersedia.`, 'success');
        agentPanel.classList.remove('hidden');
        chatArea.classList.remove('hidden');

    } catch (error) {
        setStatus(`Error: ${error.message}`, 'error');
    } finally {
        connectBtn.disabled = false;
    }
}

function populateModels(models) {
    agentSelect.innerHTML = '<option value="">-- Pilih Model --</option>';

    const grouped = {};
    models.forEach(model => {
        const id = model.id || model.name || String(model);
        const owned = model.owned_by || model.owner || 'other';
        if (!grouped[owned]) grouped[owned] = [];
        grouped[owned].push(id);
    });

    const owners = Object.keys(grouped).sort();

    if (owners.length === 1 && owners[0] === 'other') {
        grouped['other'].forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            agentSelect.appendChild(opt);
        });
    } else {
        owners.forEach(owner => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = capitalize(owner);
            grouped[owner].forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id;
                optgroup.appendChild(opt);
            });
            agentSelect.appendChild(optgroup);
        });
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function disconnect() {
    apiKey = '';
    selectedModel = '';
    messages = [];

    agentPanel.classList.add('hidden');
    chatArea.classList.add('hidden');
    agentSelect.innerHTML = '<option value="">-- Pilih Model --</option>';
    messagesEl.innerHTML = '<div class="empty-state" id="emptyState"><p>Pilih agent dan mulai percakapan...</p></div>';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.value = '';

    setStatus('Terputus.', '');
}

// Chat
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating || !selectedModel) return;

    const empty = document.getElementById('emptyState');
    if (empty) empty.remove();

    messages.push({ role: 'user', content: text });
    appendBubble('user', text);

    chatInput.value = '';
    chatInput.style.height = 'auto';

    await generate();
}

async function generate() {
    isGenerating = true;
    sendBtn.disabled = true;
    chatInput.disabled = true;

    const bubbleEl = appendBubble('assistant', '');
    const contentEl = bubbleEl.querySelector('.bubble');
    contentEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    abortController = new AbortController();

    try {
        const url = buildUrl('chat/completions');
        const body = {
            model: selectedModel,
            messages: messages,
            stream: true
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body),
            signal: abortController.signal
        });

        if (!response.ok) {
            const errText = await response.text();
            let errMsg;
            try {
                const errJson = JSON.parse(errText);
                errMsg = errJson.error?.message || errText;
            } catch {
                errMsg = errText.substring(0, 200);
            }
            throw new Error(errMsg || `Error ${response.status}`);
        }

        // Stream reading
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        contentEl.innerHTML = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        contentEl.innerHTML = renderMarkdown(fullText);
                        scrollToBottom();
                    }
                } catch (e) {}
            }
        }

        if (fullText) {
            messages.push({ role: 'assistant', content: fullText });
        } else {
            contentEl.innerHTML = '<p style="color:#999;"><em>Tidak ada respons.</em></p>';
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            contentEl.innerHTML += '<p><em>(Dihentikan)</em></p>';
        } else {
            contentEl.innerHTML = `<p style="color:#dc2626;">Error: ${escapeHtml(error.message)}</p>`;
            messages.pop();
        }
    } finally {
        isGenerating = false;
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
        abortController = null;
    }
}

function appendBubble(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    const senderLabel = role === 'user' ? 'Anda' : selectedModel || 'AI';
    div.innerHTML = `
        <div class="sender">${escapeHtml(senderLabel)}</div>
        <div class="bubble">${text ? renderMarkdown(text) : ''}</div>
    `;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

function renderMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = `<p>${html}</p>`;
    return html;
}

function escapeHtml(text) {
    const el = document.createElement('div');
    el.textContent = text;
    return el.innerHTML;
}
