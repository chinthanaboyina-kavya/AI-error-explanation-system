/* ═══════════════════════════════════════════════════════════════════════════════
   AI ERROR EXPLANATION SYSTEM — script.js
   Handles: API calls, markdown rendering, history, stats modal, feedback, UX
   ═══════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── Globals ──────────────────────────────────────────────────────────────────
let currentHistoryId = null;
let isLoading        = false;
let currentAuthUser  = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const errorInput     = $('error-input');
const charCount      = $('char-count');
const langSelect     = $('language-select');
const modelSelect    = $('model-select');
const btnExplain     = $('btn-explain');
const btnExplainText = $('btn-explain-text');
const btnLoader      = $('btn-loader');
const btnClear       = $('btn-clear');
const btnHistory     = $('btn-history');
const btnRebuild     = $('btn-rebuild');
const btnStats       = $('btn-stats');
const btnCloseHistory= $('btn-close-history');
const btnClearHistory= $('btn-clear-history');
const btnCloseStats  = $('btn-close-stats');
const btnCopy        = $('btn-copy');
const btnNewQuery    = $('btn-new-query');

const resultCard       = $('result-card');
const resultPlaceholder= $('result-placeholder');
const resultLoading    = $('result-loading');
const resultContent    = $('result-content');
const resultBody       = $('result-body');
const resultLangBadge  = $('result-lang-badge');
const resultModelText  = $('result-model-text');
const resultSnippets   = $('result-snippets');
const resultModeBadge  = $('result-mode-badge');
const resultModeText   = $('result-mode-text');
const modeDot          = $('mode-dot');

const historyPanel = $('history-panel');
const historyList  = $('history-list');
const statsModal   = $('stats-modal');
const overlay      = $('overlay');
const toastContainer = $('toast-container');

const ollamaStatusDot  = $('ollama-status-dot');
const ollamaStatusText = $('ollama-status-text');

// Loading step elements
const step1 = $('step-1');
const step2 = $('step-2');
const step3 = $('step-3');

// ─── Quick Example Errors ──────────────────────────────────────────────────────
const EXAMPLES = {
    python: `Traceback (most recent call last):
  File "app.py", line 3, in <module>
    import numpy as np
ModuleNotFoundError: No module named 'numpy'`,

    java: `Exception in thread "main" java.lang.NullPointerException
	at com.example.Main.processUser(Main.java:42)
	at com.example.Main.main(Main.java:15)
Caused by: User object was not initialized before calling getName()`,

    js: `TypeError: Cannot read properties of undefined (reading 'map')
    at App.render (App.jsx:24:19)
    at updateFunctionComponent (react-dom.development.js:17631:13)
    at performUnitOfWork (react-dom.development.js:22056:16)`,

    sql: `sqlite3.IntegrityError: UNIQUE constraint failed: users.email
During handling of the above exception, another exception occurred:
  File "app.py", line 28, in register_user
    cursor.execute("INSERT INTO users (name, email) VALUES (?, ?)", (name, email))`,
};

// ─── Enhanced Markdown Renderer with Code Copy Buttons ─────────────────────────
function renderMarkdown(text) {
    if (!text) return '';

    // Step 1: Extract code blocks before HTML escaping to preserve code formatting
    const codeBlocks = [];
    let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const id = `__CODE_BLOCK_${codeBlocks.length}__`;
        codeBlocks.push({ lang: lang || 'code', code: code.trim() });
        return id;
    });

    // Step 2: Escape basic HTML in prose
    let html = escapeHtml(processed);

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold & Italics
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // GitHub-style alerts & blockquotes
    html = html.replace(/^&gt; \[\!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)(?=\n\n|$)/gm, (_, type, content) => {
        return `<blockquote class="alert alert-${type.toLowerCase()}"><strong>${type}:</strong> ${content.trim()}</blockquote>`;
    });
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');

    // Lists: Process line-by-line for accurate list nesting
    const lines = html.split('\n');
    const resultLines = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const listMatch = line.match(/^[\-\*]\s+(.+)$/);
        const numMatch = line.match(/^\d+\.\s+(.+)$/);

        if (listMatch || numMatch) {
            if (!inList) {
                resultLines.push('<ul>');
                inList = true;
            }
            resultLines.push(`<li>${listMatch ? listMatch[1] : numMatch[1]}</li>`);
        } else {
            if (inList) {
                resultLines.push('</ul>');
                inList = false;
            }
            resultLines.push(line);
        }
    }
    if (inList) resultLines.push('</ul>');
    html = resultLines.join('\n');

    // Paragraphs — double newlines
    html = html.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        if (/^<(h[1-6]|ul|ol|li|blockquote|hr|__CODE)/.test(block)) return block;
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Step 3: Re-insert code blocks with interactive Copy buttons
    codeBlocks.forEach((cb, idx) => {
        const placeholder = `__CODE_BLOCK_${idx}__`;
        const langLabel = escapeHtml(cb.lang);
        const escapedCode = escapeHtml(cb.code);
        const blockHtml = `
            <pre data-lang="${langLabel}">
                <button class="code-copy-btn" onclick="copyCodeBlock(this)" aria-label="Copy code">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy</span>
                </button>
                <code>${escapedCode}</code>
            </pre>
        `;
        html = html.replace(placeholder, blockHtml);
    });

    return html;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Global copy function for pre code blocks
window.copyCodeBlock = function(btn) {
    const pre = btn.closest('pre');
    const code = pre.querySelector('code');
    if (!code) return;

    navigator.clipboard.writeText(code.innerText || code.textContent).then(() => {
        const span = btn.querySelector('span');
        const origText = span.textContent;
        btn.classList.add('copied');
        span.textContent = 'Copied!';
        setTimeout(() => {
            btn.classList.remove('copied');
            span.textContent = origText;
        }, 2000);
    }).catch(() => {
        showToast('Failed to copy code snippet', 'error');
    });
};

// ─── Toast Notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Loading Steps Animator ────────────────────────────────────────────────────
let stepTimers = [];

function startLoadingSteps() {
    [step1, step2, step3].forEach(s => s.classList.remove('active', 'done'));
    step1.classList.add('active');

    stepTimers.push(setTimeout(() => {
        step1.classList.remove('active'); step1.classList.add('done');
        step2.classList.add('active');
    }, 1500));

    stepTimers.push(setTimeout(() => {
        step2.classList.remove('active'); step2.classList.add('done');
        step3.classList.add('active');
    }, 3500));
}

function stopLoadingSteps() {
    stepTimers.forEach(clearTimeout);
    stepTimers = [];
    [step1, step2, step3].forEach(s => {
        s.classList.remove('active');
        s.classList.add('done');
    });
}

// ─── UI State Transitions ──────────────────────────────────────────────────────
function showPlaceholder() {
    resultPlaceholder.removeAttribute('hidden');
    resultLoading.setAttribute('hidden', '');
    resultContent.setAttribute('hidden', '');
}

function showLoading() {
    resultPlaceholder.setAttribute('hidden', '');
    resultLoading.removeAttribute('hidden');
    resultContent.setAttribute('hidden', '');
    startLoadingSteps();
}

function showResult(data) {
    stopLoadingSteps();
    resultPlaceholder.setAttribute('hidden', '');
    resultLoading.setAttribute('hidden', '');
    resultContent.removeAttribute('hidden');

    const lang = (data.language || 'general').toUpperCase();
    resultLangBadge.textContent = lang;
    resultModelText.textContent = data.model_used || 'Local Model';
    const contextCount = Number(data.context_snippets) || 0;
    resultSnippets.textContent = contextCount === 1
        ? '1 relevant context match'
        : `${contextCount} relevant context matches`;

    // Mode badge
    if (data.mode === 'offline_rag') {
        resultModeText.textContent = 'Knowledge Base RAG';
        modeDot.className = 'mode-dot offline';
        resultModeBadge.title = 'Ollama is unavailable; showing indexed knowledge base documents';
    } else {
        resultModeText.textContent = 'Ollama';
        modeDot.className = 'mode-dot';
        resultModeBadge.title = 'Generated with Ollama + RAG context';
    }

    // Render explanation
    resultBody.innerHTML = renderMarkdown(data.explanation || '');
    currentHistoryId = data.history_id;

    // Reset feedback stars
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));

    // Smooth scroll into view
    resultContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Core: Explain Error ───────────────────────────────────────────────────────
async function explainError() {
    const errorText = errorInput.value.trim();
    if (!errorText) {
        showToast('Please paste an error message first!', 'warning');
        errorInput.focus();
        return;
    }

    if (isLoading) return;
    isLoading = true;

    btnExplain.classList.add('loading');
    btnExplain.disabled = true;
    btnExplainText.textContent = 'Analyzing...';

    showLoading();

    try {
        const response = await fetch('/api/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: errorText,
                language: langSelect.value,
                model: modelSelect.value,
                user_email: currentAuthUser?.email || '',
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Server error occurred');
        }

        showResult(data);
        showToast('Explanation ready!', 'success');
    } catch (err) {
        showPlaceholder();
        showToast(`Error: ${err.message}`, 'error', 6000);
        console.error('Explain error:', err);
    } finally {
        isLoading = false;
        btnExplain.classList.remove('loading');
        btnExplain.disabled = false;
        btnExplainText.textContent = 'Explain Error';
    }
}

// ─── Load Available Models ─────────────────────────────────────────────────────
async function loadModels() {
    try {
        const res  = await fetch('/api/models');
        const data = await res.json();
        const { models, default: defaultModel } = data;

        modelSelect.innerHTML = '';
        const list = models && models.length ? models : [defaultModel || 'llama3.2'];
        list.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === defaultModel) opt.selected = true;
            modelSelect.appendChild(opt);
        });
    } catch (e) {
        console.warn('Could not load models from server:', e);
    }
}

// ─── Health Check ──────────────────────────────────────────────────────────────
async function checkHealth() {
    try {
        const res  = await fetch('/api/health');
        const data = await res.json();

        if (data.ollama === 'available') {
            ollamaStatusDot.className  = 'status-dot online';
            ollamaStatusText.textContent = 'Ollama Connected';
        } else {
            ollamaStatusDot.className  = 'status-dot offline';
            ollamaStatusText.textContent = 'Ollama Offline';
        }
    } catch (e) {
        ollamaStatusDot.className  = 'status-dot offline';
        ollamaStatusText.textContent = 'Server Offline';
    }
}

// ─── History Panel ─────────────────────────────────────────────────────────────
async function openHistory() {
    historyPanel.classList.add('open');
    historyPanel.removeAttribute('aria-hidden');
    overlay.classList.add('visible');
    overlay.removeAttribute('aria-hidden');
    await loadHistory();
}

function closeHistory() {
    historyPanel.classList.remove('open');
    historyPanel.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
}

async function loadHistory() {
    historyList.innerHTML = '<div class="panel-loading">Loading history...</div>';
    try {
        const emailParam = currentAuthUser?.email ? `&user_email=${encodeURIComponent(currentAuthUser.email)}` : '';
        const res  = await fetch(`/api/history?limit=25${emailParam}`);
        const data = await res.json();
        const items = data.history || [];

        if (!items.length) {
            historyList.innerHTML = '<div class="panel-loading">No history yet. Explain your first error to see it here!</div>';
            return;
        }

        historyList.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.setAttribute('role', 'listitem');
            div.setAttribute('tabindex', '0');

            div.innerHTML = `
                <div class="history-item-header">
                    <span class="history-lang">${escapeHtml(item.language || 'general')}</span>
                    <button class="history-del-btn" title="Delete entry" aria-label="Delete entry" data-id="${item.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
                <div class="history-error" title="${escapeHtml(item.error_text)}">${escapeHtml(item.error_text.substring(0, 80))}${item.error_text.length > 80 ? '…' : ''}</div>
                <div class="history-time">${formatTime(item.timestamp)}</div>
            `;

            // Click card body to load
            div.addEventListener('click', (e) => {
                if (e.target.closest('.history-del-btn')) return;
                loadHistoryItem(item);
            });

            // Delete item button
            const delBtn = div.querySelector('.history-del-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteHistoryItem(item.id, div);
            });

            historyList.appendChild(div);
        });
    } catch (e) {
        historyList.innerHTML = '<div class="panel-loading">Failed to load query history.</div>';
    }
}

async function deleteHistoryItem(id, element) {
    try {
        const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
        if (res.ok) {
            element.remove();
            showToast('History entry removed', 'info');
            if (historyList.children.length === 0) {
                historyList.innerHTML = '<div class="panel-loading">No history entries left.</div>';
            }
        }
    } catch {
        showToast('Failed to delete history item', 'error');
    }
}

async function clearAllHistory() {
    if (!confirm('Are you sure you want to clear all query history?')) return;
    try {
        const res = await fetch('/api/history', { method: 'DELETE' });
        if (res.ok) {
            historyList.innerHTML = '<div class="panel-loading">History cleared.</div>';
            showToast('All history cleared', 'success');
        }
    } catch {
        showToast('Failed to clear history', 'error');
    }
}

async function loadHistoryItem(item) {
    closeHistory();
    errorInput.value = item.error_text;
    updateCharCount();
    langSelect.value = item.language || 'auto';

    showResult({
        explanation: item.explanation,
        language: item.language,
        model_used: item.model_used || 'cached',
        context_snippets: 1,
        history_id: item.id,
        mode: 'cached',
    });
    showToast('Loaded explanation from history', 'info');
}

function formatTime(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts.replace(' ', 'T') + (ts.includes('+') ? '' : 'Z'));
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
}

// ─── Stats Modal ───────────────────────────────────────────────────────────────
async function openStats() {
    statsModal.classList.add('visible');
    statsModal.removeAttribute('aria-hidden');
    overlay.classList.add('visible');

    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        $('stat-total-queries').textContent = data.database?.total_queries ?? 0;
        $('stat-kb-docs').textContent = data.knowledge_base?.file_count ?? 4;
        $('stat-avg-rating').textContent = data.database?.avg_rating ? `${data.database.avg_rating} / 5` : 'No ratings yet';
        $('stat-active-model').textContent = modelSelect.value || 'gemma3:1b';

        // Render languages
        const langContainer = $('stats-languages');
        const files = data.knowledge_base?.files || [];
        if (files.length) {
            langContainer.innerHTML = files.map(f => {
                const lang = f.replace('_errors.txt', '').toUpperCase();
                return `<div class="lang-tag"><span>📘 ${lang}</span> — <code>${f}</code></div>`;
            }).join('');
        }
    } catch (e) {
        showToast('Could not load system statistics', 'warning');
    }
}

function closeStats() {
    statsModal.classList.remove('visible');
    statsModal.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('visible');
}

// ─── Feedback / Star Rating ────────────────────────────────────────────────────
document.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => highlightStars(+btn.dataset.rating));
    btn.addEventListener('mouseleave', () => resetStarHighlight());
    btn.addEventListener('click', () => submitFeedback(+btn.dataset.rating, btn));
});

function highlightStars(rating) {
    document.querySelectorAll('.star-btn').forEach(b => {
        b.style.color = +b.dataset.rating <= rating ? 'var(--c-amber)' : '';
    });
}
function resetStarHighlight() {
    document.querySelectorAll('.star-btn').forEach(b => {
        if (!b.classList.contains('active')) b.style.color = '';
    });
}

async function submitFeedback(rating, clickedBtn) {
    if (!currentHistoryId) return;

    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    highlightStars(rating);

    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history_id: currentHistoryId, rating }),
        });
        const data = await res.json();
        showToast(data.message || 'Feedback recorded. Thank you!', 'success');
    } catch {
        showToast('Failed to submit feedback', 'error');
    }
}

// ─── Copy to Clipboard ─────────────────────────────────────────────────────────
async function copyExplanation() {
    const text = resultBody.innerText || resultBody.textContent || '';
    try {
        await navigator.clipboard.writeText(text);
        showToast('Full explanation copied to clipboard!', 'success');
    } catch {
        showToast('Copy failed. Please copy manually.', 'error');
    }
}

// ─── Rebuild Index ─────────────────────────────────────────────────────────────
async function rebuildIndex() {
    btnRebuild.disabled = true;
    showToast('Rebuilding vector index from documents...', 'info', 10000);
    try {
        const res  = await fetch('/api/rebuild-index', { method: 'POST' });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('Vector index rebuilt successfully!', 'success');
        } else {
            showToast(`Rebuild failed: ${data.message}`, 'error');
        }
    } catch {
        showToast('Failed to rebuild index. Verify server connection.', 'error');
    } finally {
        btnRebuild.disabled = false;
    }
}

// ─── Char Counter ──────────────────────────────────────────────────────────────
function updateCharCount() {
    const len = errorInput.value.length;
    charCount.textContent = len;
    charCount.style.color = len > 4500 ? 'var(--c-red)' : len > 4000 ? 'var(--c-amber)' : '';
}

// ─── Event Listeners ───────────────────────────────────────────────────────────

btnExplain.addEventListener('click', explainError);

errorInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') explainError();
});

errorInput.addEventListener('input', updateCharCount);

btnClear.addEventListener('click', () => {
    errorInput.value = '';
    updateCharCount();
    showPlaceholder();
    currentHistoryId = null;
    errorInput.focus();
});

// History navigation: open dedicated History page
btnHistory.addEventListener('click', () => {
    window.location.href = '/history/';
});
if (btnCloseHistory) btnCloseHistory.addEventListener('click', closeHistory);
if (btnClearHistory) btnClearHistory.addEventListener('click', clearAllHistory);

btnStats.addEventListener('click', openStats);
if (btnCloseStats) btnCloseStats.addEventListener('click', closeStats);

overlay.addEventListener('click', () => {
    closeHistory();
    closeStats();
});

btnRebuild.addEventListener('click', rebuildIndex);
btnCopy.addEventListener('click', copyExplanation);

btnNewQuery.addEventListener('click', () => {
    errorInput.value = '';
    updateCharCount();
    showPlaceholder();
    currentHistoryId = null;
    errorInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Quick examples
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const key = chip.dataset.example;
        if (EXAMPLES[key]) {
            errorInput.value = EXAMPLES[key];
            updateCharCount();
            langSelect.value = key === 'js' ? 'javascript' : (key in { python:1, java:1, sql:1 } ? key : 'auto');
            errorInput.focus();
            showToast(`Loaded ${chip.textContent} example`, 'info', 2000);
        }
    });
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeHistory();
        closeStats();
    }
});

// ─── Firebase Auth Protection & User Session ──────────────────────────────────
function initAuthProtection() {
    const auth = window.FirebaseAuthService;
    const overlayGuard = $('auth-guard-overlay');
    const userProfile = $('nav-user-profile');
    const userAvatar = $('nav-user-avatar');
    const userEmailText = $('nav-user-email');
    const userTag = $('nav-user-tag');
    const btnLogout = $('btn-logout');

    if (!auth) {
        console.warn('FirebaseAuthService not loaded.');
        return;
    }

    // Listen for auth state
    auth.onAuthStateChanged(user => {
        if (!user) {
            // Not authenticated: redirect directly to /login
            const curPath = window.location.pathname;
            window.location.href = `/login?next=${encodeURIComponent(curPath)}`;
            return;
        }

        // User is authenticated!
        currentAuthUser = user;

        // Dismiss Auth Guard overlay with smooth transition
        if (overlayGuard) {
            overlayGuard.classList.add('fade-out');
            setTimeout(() => { overlayGuard.style.display = 'none'; }, 400);
        }

        // Render Navbar user profile
        if (userProfile) {
            userProfile.style.display = 'inline-flex';
            const nameOrEmail = user.displayName || user.email || 'Developer';
            userEmailText.textContent = nameOrEmail;
            userEmailText.title = user.email || '';
            const initial = (nameOrEmail[0] || 'D').toUpperCase();
            userAvatar.textContent = initial;

            if (userTag) {
                userTag.textContent = user.isDemo ? 'Demo Mode' : 'Firebase';
                userTag.className = user.isDemo ? 'user-source-tag tag-demo' : 'user-source-tag tag-live';
            }
        }
    });

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (confirm('Sign out of your account?')) {
                try {
                    await auth.signOut();
                    showToast('Signed out. See you next time!', 'info');
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 400);
                } catch (err) {
                    showToast(`Logout error: ${err.message}`, 'error');
                }
            }
        });
    }
}

// ─── Initialization ────────────────────────────────────────────────────────────
(async function init() {
    // 1. Guard page with Firebase auth state
    initAuthProtection();

    // 2. Health check & model list
    await checkHealth();
    setInterval(checkHealth, 25000);

    await loadModels();

    // 3. Preload error if arriving from History page
    try {
        const preloaded = sessionStorage.getItem('ai_workbench_preload_error');
        if (preloaded) {
            errorInput.value = preloaded;
            updateCharCount();
            const preLang = sessionStorage.getItem('ai_workbench_preload_lang');
            if (preLang) langSelect.value = preLang;
            sessionStorage.removeItem('ai_workbench_preload_error');
            sessionStorage.removeItem('ai_workbench_preload_lang');
            showToast('Loaded error from history archive!', 'info', 2500);
            errorInput.focus();
        }
    } catch {}

    showToast('AI Error Explanation System ready!', 'success', 2500);
})();
