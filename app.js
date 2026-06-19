/**
 * AgentRouter Chat - Simple Classic Chat
 * Base URL: https://agentrouter.org/v1
 */

const BASE_URL = 'https://agentrouter.org/v1';

// State
let apiKey = '';
let selectedModel = '';
let messages = [];
let isGenerating = false;
let abortController = null;

// Elements
const apiKeyInput = document.getElementById('apiKey');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionPanel = document.getElementById('connectionPanel');
const agentPanel = document.getElementById('agentPanel');
const agentSelect = document.getElementById('agentSelect');
const disconnectBtn = document.getElementById('disconnectBtn');
const chatArea = document.getElementById('chatArea');
const messagesEl = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadSavedKey();
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
}

function loadSavedKey() {
    const saved = localStorage.getItem('agentrouter_apikey');
    if (saved) {
        apiKeyInput.value = saved;
    }
}

function setStatus(text, type) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'connection-status ' + type;
}

// Connect & Fetch Models
async function connect() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        setStatus('Masukkan API Key terlebih dahulu.', 'error');
        apiKeyInput.focus();
        return;
    }

    connectBtn.disabled = true;
    setStatus('Menghubungkan...', 'loading');

    try {
        // Fetch available models from the API
        const response = await fetch(`${BASE_URL}/models`, {
            headers: {
                'Authorization': `Bearer ${key}`
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gagal terhubung (HTTP ${response.status})`);
        }

        const data = await response.json();
        const models = data.data || data.models || data || [];

        if (!Array.isArray(models) || models.length === 0) {
            throw new Error('Tidak ada model/agent yang tersedia untuk API key ini.');
        }

        // Save key
        apiKey = key;
        localStorage.setItem('agentrouter_apikey', key);

        // Populate model selector
        populateModels(models);

        // Show UI
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

    // Group models by owner/provider if possible
    const grouped = {};

    models.forEach(model => {
        const id = model.id || model.name || model;
        const name = model.name || model.id || model;
        const owned = model.owned_by || model.owner || 'other';

        if (!grouped[owned]) grouped[owned] = [];
        grouped[owned].push({ id: typeof id === 'string' ? id : String(id), name: typeof name === 'string' ? name : String(name) });
    });

    const owners = Object.keys(grouped).sort();

    if (owners.length === 1 && owners[0] === 'other') {
        // No grouping needed
        grouped['other'].forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.id;
            agentSelect.appendChild(opt);
        });
    } else {
        owners.forEach(owner => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = capitalize(owner);
            grouped[owner].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.id;
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

// Chat Functions
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isGenerating || !selectedModel) return;

    // Hide empty state
    const empty = document.getElementById('emptyState');
    if (empty) empty.remove();

    // Add user message
    messages.push({ role: 'user', content: text });
    appendBubble('user', text);

    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Generate
    await generate();
}

async function generate() {
    isGenerating = true;
    sendBtn.disabled = true;
    chatInput.disabled = true;

    // Add assistant placeholder
    const bubbleEl = appendBubble('assistant', '');
    const contentEl = bubbleEl.querySelector('.bubble');
    contentEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    abortController = new AbortController();

    try {
        const body = {
            model: selectedModel,
            messages: messages,
            stream: true
        };

        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body),
            signal: abortController.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Error ${response.status}`);
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
                } catch (e) {
                    // skip
                }
            }
        }

        // If no streaming worked, try non-stream
        if (!fullText && response.headers.get('content-type')?.includes('application/json')) {
            const json = await response.json();
            fullText = json.choices?.[0]?.message?.content || '';
            contentEl.innerHTML = renderMarkdown(fullText);
        }

        if (fullText) {
            messages.push({ role: 'assistant', content: fullText });
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            contentEl.innerHTML += '<p><em>(Dihentikan)</em></p>';
        } else {
            contentEl.innerHTML = `<p style="color:#dc2626;">Error: ${escapeHtml(error.message)}</p>`;
            // Remove user message on error
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

// Simple Markdown Renderer
function renderMarkdown(text) {
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // Clean nested ul
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Line breaks
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
