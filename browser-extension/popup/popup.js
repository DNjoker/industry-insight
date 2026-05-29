/**
 * Popup logic - DeepSeek Chat → Obsidian
 */

const STORAGE_KEY = 'ds_chat_export';
const API_BASE = 'http://127.0.0.1:19877';

// ── DOM Elements ───────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────

let chatData = null;
let backendOnline = false;

// ── Init ──────────────────────────────────────────────────────

function init() {
  const emptyState = $('empty-state');
  const previewState = $('preview-state');
  const successState = $('success-state');
  const loadingOverlay = $('loading-overlay');
  const loadingText = $('loading-text');
  const statusDot = $('status-dot');
  const backendWarning = $('backend-warning');
  const msgCount = $('msg-count');
  const msgTime = $('msg-time');
  const previewMessages = $('preview-messages');
  const titleInput = $('title-input');
  const tagsInput = $('tags-input');
  const abstractInput = $('abstract-input');
  const generateBtn = $('generate-btn');
  const refineBtn = $('refine-btn');
  const refinedInput = $('refined-input');
  const saveBtn = $('save-btn');
  const resetBtn = $('reset-btn');
  const retryHealthBtn = $('retry-health-btn');
  const openDeepseekBtn = $('open-deepseek-btn');
  const filePathEl = $('file-path');

  // ── Helpers ──────────────────────────────────────────────

  function showState(state) {
    emptyState.style.display = state === 'empty' ? '' : 'none';
    previewState.style.display = state === 'preview' ? '' : 'none';
    successState.style.display = state === 'success' ? '' : 'none';
  }

  function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.style.display = '';
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  function updateSaveButton() {
    saveBtn.disabled = !backendOnline || !chatData;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Backend Health Check ─────────────────────────────────

  async function checkBackendHealth() {
    statusDot.className = 'status-dot checking';
    try {
      const resp = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        backendOnline = true;
        statusDot.className = 'status-dot online';
        statusDot.title = '后端已连接';
        backendWarning.style.display = 'none';
        updateSaveButton();
      } else {
        throw new Error('Not OK');
      }
    } catch {
      backendOnline = false;
      statusDot.className = 'status-dot offline';
      statusDot.title = '后端未连接 — 请启动桌面工具';
      if (chatData) {
        backendWarning.style.display = 'flex';
      }
      saveBtn.disabled = true;
    }
  }

  // ── Load from Storage ────────────────────────────────────

  async function loadStoredData() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      chatData = result[STORAGE_KEY];
    } catch (e) {
      console.error('[DS Popup] Storage read error:', e);
      chatData = null;
    }

    if (!chatData || !chatData.messages || chatData.messages.length === 0) {
      showState('empty');
      return;
    }

    showState('preview');
    renderPreview();
    updateSaveButton();
  }

  function renderPreview() {
    if (!chatData) return;

    msgCount.textContent = `${chatData.messageCount} 条消息`;
    const time = chatData.exportedAt
      ? new Date(chatData.exportedAt).toLocaleString('zh-CN')
      : '';
    msgTime.textContent = time;

    previewMessages.innerHTML = '';
    const previewMsgs = chatData.messages.slice(0, 3);
    for (const msg of previewMsgs) {
      const div = document.createElement('div');
      div.className = 'preview-msg';
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';
      const roleLabel = msg.role === 'user' ? '用户' : 'AI';
      const text =
        msg.content.substring(0, 150) +
        (msg.content.length > 150 ? '...' : '');
      div.innerHTML =
        `<span class="preview-role ${roleClass}">${roleLabel}</span>` +
        `<span class="preview-text">${escapeHtml(text)}</span>`;
      previewMessages.appendChild(div);
    }

    if (chatData.messages.length > 3) {
      const more = document.createElement('div');
      more.className = 'preview-msg';
      more.style.cssText = 'color:#94a3b8;font-size:11px';
      more.textContent = `... 还有 ${chatData.messages.length - 3} 条消息`;
      previewMessages.appendChild(more);
    }
  }

  // ── Generate AI Preview ──────────────────────────────────

  async function generatePreview() {
    if (!backendOnline) {
      backendWarning.style.display = 'flex';
      return;
    }
    if (!chatData || !chatData.messages.length) return;

    showLoading('AI 分析中...');
    generateBtn.disabled = true;

    try {
      const resp = await fetch(`${API_BASE}/api/chat/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatData.messages }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();

      titleInput.value = data.suggested_title || '';
      tagsInput.value = (data.suggested_tags || []).join(', ');
      abstractInput.value = data.abstract || '';

      if (data.suggested_title === '未命名对话') {
        titleInput.placeholder = '请手动输入标题';
      }

      updateSaveButton();
    } catch (err) {
      console.error('[DS Popup] Preview error:', err);
      backendWarning.style.display = 'flex';
      backendWarning.querySelector('span').textContent =
        'AI 分析失败，请检查后端是否运行';
    } finally {
      hideLoading();
      generateBtn.disabled = false;
    }
  }

  // ── Generate AI Refine ────────────────────────────────────

  async function generateRefine() {
    if (!backendOnline) {
      backendWarning.style.display = 'flex';
      return;
    }
    if (!chatData || !chatData.messages.length) return;

    const title = titleInput.value.trim() || '未命名对话';
    showLoading('AI 提炼中...');
    refineBtn.disabled = true;

    try {
      const resp = await fetch(`${API_BASE}/api/chat/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatData.messages, title }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      if (data.refined_content) {
        refinedInput.value = data.refined_content;
      } else if (data.error) {
        backendWarning.style.display = 'flex';
        backendWarning.querySelector('span').textContent =
          'AI 提炼失败: ' + data.error;
      }
    } catch (err) {
      console.error('[DS Popup] Refine error:', err);
      backendWarning.style.display = 'flex';
      backendWarning.querySelector('span').textContent =
        'AI 提炼失败，请检查后端是否运行';
    } finally {
      hideLoading();
      refineBtn.disabled = false;
    }
  }

  // ── Save to Obsidian ─────────────────────────────────────

  async function saveToObsidian() {
    if (!backendOnline || !chatData) return;

    const title = titleInput.value.trim() || '未命名对话';
    const tagsStr = tagsInput.value.trim();
    const tags = tagsStr
      ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : [];
    const abstract = abstractInput.value.trim();
    const refinedContent = refinedInput.value.trim();

    showLoading('保存中...');

    try {
      const resp = await fetch(`${API_BASE}/api/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatData.messages,
          title,
          tags,
          abstract,
          refined_content: refinedContent,
        }),
      });

      const data = await resp.json();

      if (data.success) {
        filePathEl.textContent = data.absolute_dir || data.path;
        showState('success');
        await chrome.storage.local.remove(STORAGE_KEY);
        chatData = null;
      } else {
        alert('保存失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      console.error('[DS Popup] Save error:', err);
      alert('保存请求失败，请确认后端正在运行');
    } finally {
      hideLoading();
    }
  }

  // ── Reset ────────────────────────────────────────────────

  async function resetAll() {
    await chrome.storage.local.remove(STORAGE_KEY);
    chatData = null;
    titleInput.value = '';
    tagsInput.value = '';
    abstractInput.value = '';
    refinedInput.value = '';
    showState('empty');
  }

  // ── Bind Events ──────────────────────────────────────────

  generateBtn.addEventListener('click', generatePreview);
  refineBtn.addEventListener('click', generateRefine);
  saveBtn.addEventListener('click', saveToObsidian);
  resetBtn.addEventListener('click', resetAll);
  if (retryHealthBtn) {
    retryHealthBtn.addEventListener('click', checkBackendHealth);
  }
  if (openDeepseekBtn) {
    openDeepseekBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://chat.deepseek.com' });
    });
  }

  // ── Start ────────────────────────────────────────────────

  checkBackendHealth();
  loadStoredData();
}

// DOM already ready when script runs (script at end of body)
init();
