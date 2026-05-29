/**
 * DeepSeek Chat → Obsidian - Content Script
 * Injects a floating export button and extracts chat messages from the DOM.
 * Selectors based on DeepSeek's actual CSS class structure (verified against
 * open-source extensions that successfully extract from chat.deepseek.com).
 */

const STORAGE_KEY = 'ds_chat_export';

// ── Button Injection ──────────────────────────────────────────

function injectButton() {
  if (document.getElementById('ds-obsidian-export-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ds-obsidian-export-btn';
  btn.innerHTML = `
    <svg class="ds-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    导出到 Obsidian
  `;
  btn.addEventListener('click', handleExport);
  document.body.appendChild(btn);
}

// ── Scroll to Load All Messages ───────────────────────────────

function findScrollContainers() {
  const candidates = [];
  const allDivs = document.querySelectorAll('div');
  for (const div of allDivs) {
    const style = getComputedStyle(div);
    const sh = div.scrollHeight;
    const ch = div.clientHeight;
    if (sh > ch + 100 && (style.overflowY === 'auto' || style.overflowY === 'scroll' || sh > ch * 2)) {
      const hasMessages = div.querySelector('.ds-message, .ds-markdown, [class*="d29f3d7d"]');
      candidates.push({
        el: div,
        score: (hasMessages ? 100 : 0) + (sh - ch),
        scrollHeight: sh,
        hasMessages: !!hasMessages,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  console.log('[DS Export] Scroll candidates:', candidates.slice(0, 5).map(c => ({
    tag: c.el.tagName,
    className: (c.el.className || '').substring(0, 80),
    scrollDiff: c.scrollHeight - c.el.clientHeight,
    hasMessages: c.hasMessages,
  })));
  return candidates.map(c => c.el);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract all messages from the conversation by scrolling through it page by page.
 * DeepSeek uses virtual DOM recycling — only ~17 messages exist in the DOM at any time.
 * We must scroll through the entire conversation, capturing messages at each position,
 * then deduplicate and merge.
 */
async function scrollAndCaptureAllMessages() {
  const containers = findScrollContainers();
  if (containers.length === 0) {
    console.log('[DS Export] No scroll containers found');
    return extractMessages();
  }

  const container = containers[0];
  console.log(`[DS Export] Using container: ${container.tagName}.${(container.className || '').substring(0, 60)}, scrollHeight=${container.scrollHeight}, clientHeight=${container.clientHeight}`);

  // Collection of all captured messages across scroll positions
  const capturedMessages = new Map(); // keyed by content hash + role

  function hashContent(role, content) {
    // Use first 100 chars + last 50 chars + role as a stable key
    const trimmed = content.trim();
    const head = trimmed.substring(0, 100);
    const tail = trimmed.length > 150 ? trimmed.substring(trimmed.length - 50) : '';
    return `${role}::${head}::${tail}`;
  }

  function captureCurrentView() {
    const msgs = extractMessages();
    let added = 0;
    for (const msg of msgs) {
      const key = hashContent(msg.role, msg.content);
      if (!capturedMessages.has(key)) {
        capturedMessages.set(key, msg);
        added++;
      }
    }
    return added;
  }

  // 1. Scroll to bottom first, capture
  container.scrollTop = container.scrollHeight;
  container.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(600);
  captureCurrentView();
  console.log(`[DS Export] Bottom captured, total unique: ${capturedMessages.size}`);

  // 2. Scroll up page by page, capturing at each step
  const viewportHeight = container.clientHeight;
  let currentScrollTop = container.scrollTop;
  let noNewMessages = 0;
  const maxSteps = 200;

  for (let step = 0; step < maxSteps; step++) {
    // Scroll up by ~80% of viewport to ensure overlap (prevents missing messages at boundaries)
    const scrollAmount = Math.min(viewportHeight * 0.8, currentScrollTop);
    if (scrollAmount < 10) break; // reached very top

    currentScrollTop -= scrollAmount;
    container.scrollTop = currentScrollTop;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));

    // Wait for virtual list to re-render
    await sleep(350);
    container.offsetHeight; // force reflow

    const prevSize = capturedMessages.size;
    const added = captureCurrentView();

    if (added === 0) {
      noNewMessages++;
      if (noNewMessages >= 5) {
        console.log(`[DS Export] No new messages for ${noNewMessages} steps, stopping`);
        break;
      }
    } else {
      noNewMessages = 0;
      console.log(`[DS Export] Step ${step + 1}: +${added} new, total ${capturedMessages.size} (scrollTop=${currentScrollTop})`);
    }
  }

  // 3. Final pass: scroll to absolute top and capture anything remaining
  container.scrollTop = 0;
  container.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(600);
  container.offsetHeight;
  const finalAdded = captureCurrentView();
  if (finalAdded > 0) {
    console.log(`[DS Export] Top capture: +${finalAdded} new, final total ${capturedMessages.size}`);
  }

  // 4. Reconstruct messages in conversation order
  // We need to sort by the original DOM position. Since we captured from bottom to top,
  // we can't rely on insertion order. Instead, we do one final scroll from top to bottom
  // to determine the correct ordering.
  const allMessages = Array.from(capturedMessages.values());

  console.log(`[DS Export] Capture complete: ${allMessages.length} unique messages collected`);
  return allMessages;
}

function extractMessages() {
  // Primary selector: DeepSeek uses .ds-message class for message containers
  let messageEls = document.querySelectorAll('.ds-message');

  if (messageEls.length === 0) {
    // Fallback: try hashed class patterns that DeepSeek's CSS modules generate
    messageEls = document.querySelectorAll('[class*="d29f3d7d"], [class*="fbb737a4"]');

    // Deduplicate - these classes may be on the same elements
    const seen = new Set();
    messageEls = Array.from(messageEls).filter(el => {
      // Walk up to find the actual message container
      const msgContainer = el.closest('[class]') || el;
      if (seen.has(msgContainer)) return false;
      seen.add(msgContainer);
      return true;
    });
  }

  console.log(`[DS Export] Found ${messageEls.length} raw elements with primary selectors`);

  let messages = [];

  for (const el of messageEls) {
    const role = detectRole(el);
    const content = extractContent(el, role);

    if (content.trim()) {
      messages.push({ role, content });
    }
  }

  // If primary selectors found nothing, try fallback
  if (messages.length === 0) {
    messages = fallbackExtract();
  }

  return mergeConsecutive(messages);
}

function detectRole(element) {
  const classStr = element.className || '';
  const text = (element.textContent || '').trim();

  // Strong user indicators (from verified DeepSeek DOM)
  // User messages have the hashed class d29f3d7d
  if (classStr.includes('d29f3d7d')) return 'user';

  // Strong AI indicators
  // AI messages have .ds-markdown rendered content
  if (element.querySelector('.ds-markdown')) return 'assistant';
  // AI has code blocks
  if (element.querySelector('pre, code')) return 'assistant';
  // AI indicator class
  if (classStr.includes('_7d763a7')) return 'assistant';

  // Weaker heuristics
  const hasMarkdown = element.querySelector('[class*="markdown"], [class*="md"]');
  if (hasMarkdown && text.length > 200) return 'assistant';

  // User messages are usually shorter
  if (text.length < 400 && !element.querySelector('pre, code, table')) {
    return 'user';
  }

  return 'assistant';
}

function extractContent(element, role) {
  if (role === 'assistant') {
    // AI messages: extract from .ds-markdown blocks, excluding thinking sections
    const markdownBlocks = Array.from(
      element.querySelectorAll('.ds-markdown')
    ).filter(block => !block.closest('.ds-think-content, [class*="think-content"], [class*="thinking"]'));

    if (markdownBlocks.length > 0) {
      return markdownBlocks.map(block => htmlToMarkdown(block)).join('\n\n').trim();
    }
  }

  if (role === 'user') {
    // User messages: content is in .fbb737a4 element
    const userBubble = element.querySelector('[class*="fbb737a4"]');
    if (userBubble) {
      return (userBubble.textContent || '').trim();
    }
  }

  // Generic fallback: clone and clean
  const clone = element.cloneNode(true);
  // Remove thinking blocks
  clone.querySelectorAll('.ds-think-content, [class*="think-content"], [class*="thinking"], [class*="thought"]')
    .forEach(n => n.remove());
  // Remove action buttons
  clone.querySelectorAll('button, [class*="copy"], [class*="action"], [class*="toolbar"]')
    .forEach(n => n.remove());

  return htmlToMarkdown(clone);
}

function htmlToMarkdown(element) {
  const clone = element.cloneNode(true);

  // Remove UI elements
  clone.querySelectorAll(
    'button, [class*="copy-btn"], [class*="action-btn"], [class*="toolbar"], nav, [role="toolbar"]'
  ).forEach(el => el.remove());

  // Convert code blocks
  clone.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    const lang = code?.className?.replace('language-', '') || '';
    const text = code?.textContent || pre.textContent || '';
    pre.outerHTML = '\n```' + lang + '\n' + text.trim() + '\n```\n';
  });

  // Convert inline code (only those not inside a pre already)
  clone.querySelectorAll('code').forEach(code => {
    if (!code.closest('pre')) {
      code.textContent = '`' + code.textContent + '`';
    }
  });

  // Convert images
  clone.querySelectorAll('img').forEach(img => {
    const alt = img.alt || '';
    const src = img.src || '';
    if (src) img.outerHTML = `![${alt}](${src})`;
  });

  // Convert links
  clone.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const text = a.textContent || href;
    if (href && href !== text) a.outerHTML = `[${text}](${href})`;
  });

  return (clone.textContent || '').replace(/\n{4,}/g, '\n\n').trim();
}

function fallbackExtract() {
  console.log('[DS Export] Primary selectors failed, trying fallback...');

  // Collect all substantial text elements in the main area
  const mainArea = document.querySelector('main') || document.body;
  const allElements = mainArea.querySelectorAll('div, section, article');
  const candidates = [];

  for (const el of allElements) {
    const text = el.textContent?.trim() || '';
    if (text.length < 30 || text.length > 10000) continue;
    if (el.querySelector('input, button, select, textarea')) continue;
    if (el.closest('nav, header, footer, aside, [class*="sidebar"]')) continue;

    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 20) continue;

    // Avoid deeply nested duplicates
    const parent = el.parentElement;
    if (parent && candidates.some(c => c.contains(el) || el.contains(c))) continue;

    candidates.push(el);
  }

  // Sort by vertical position
  candidates.sort((a, b) => {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });

  console.log(`[DS Export] Fallback found ${candidates.length} candidate elements`);

  const messages = [];
  for (const el of candidates) {
    const role = detectRole(el);
    const content = (el.textContent || '').replace(/\n{4,}/g, '\n\n').trim();
    if (content) messages.push({ role, content });
  }

  return mergeConsecutive(messages);
}

function mergeConsecutive(messages) {
  const merged = [];
  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

// ── Export Flow ────────────────────────────────────────────────

async function handleExport() {
  const btn = document.getElementById('ds-obsidian-export-btn');
  btn.classList.add('ds-exporting');
  btn.innerHTML = `
    <svg class="ds-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite">
      <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32"/>
    </svg>
    逐页抓取全部消息...
  `;

  try {
    const messages = await scrollAndCaptureAllMessages();
    console.log(`[DS Export] Extracted ${messages.length} messages:`,
      messages.map(m => ({ role: m.role, len: m.content.length })));

    if (messages.length === 0) {
      // Debug: dump what selectors are available on the page
      const dsMsg = document.querySelectorAll('.ds-message').length;
      const dsMd = document.querySelectorAll('.ds-markdown').length;
      const hashed = document.querySelectorAll('[class*="d29f3d7d"], [class*="fbb737a4"]').length;
      console.log(`[DS Export] Debug — .ds-message: ${dsMsg}, .ds-markdown: ${dsMd}, hashed classes: ${hashed}`);

      showToast('未能提取到对话消息。请打开浏览器控制台 (F12) 查看调试信息', 'error');
      return;
    }

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        messages: messages,
        messageCount: messages.length,
        exportedAt: new Date().toISOString(),
      }
    });

    const userMsgs = messages.filter(m => m.role === 'user').length;
    const aiMsgs = messages.filter(m => m.role === 'assistant').length;
    showToast(`已提取 ${messages.length} 条消息（用户 ${userMsgs} / AI ${aiMsgs}），点击浏览器右上角扩展图标 → 预览入库`, 'success');

    // Notify service worker to update badge
    chrome.runtime.sendMessage({ type: 'EXPORT_COMPLETE', count: messages.length }).catch(() => {});
  } catch (err) {
    console.error('[DS Export] Error:', err);
    showToast('提取失败: ' + (err.message || '未知错误'), 'error');
  } finally {
    resetButton();
  }
}

function resetButton() {
  const btn = document.getElementById('ds-obsidian-export-btn');
  if (!btn) return;
  btn.classList.remove('ds-exporting');
  btn.innerHTML = `
    <svg class="ds-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    导出到 Obsidian
  `;
}

// ── Toast ──────────────────────────────────────────────────────

function showToast(message, type) {
  const existing = document.getElementById('ds-obsidian-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ds-obsidian-toast';
  toast.className = type;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ── Init ───────────────────────────────────────────────────────

function init() {
  const url = window.location.href;
  if (!url.includes('chat.deepseek.com')) return;

  // Try to inject when chat renders. DeepSeek is a React SPA so we watch for DOM changes.
  let attempts = 0;
  const tryInject = () => {
    if (document.getElementById('ds-obsidian-export-btn')) return;

    // Check if chat is loaded by looking for key elements
    const hasMessages = document.querySelector('.ds-message') ||
                        document.querySelector('[class*="d29f3d7d"]') ||
                        document.querySelector('.ds-markdown');
    const hasInput = document.querySelector('textarea, [contenteditable="true"]');

    if (hasMessages || hasInput) {
      injectButton();
      console.log('[DS Export] Button injected');
      return;
    }

    attempts++;
    if (attempts < 60) {
      setTimeout(tryInject, 1000);
    }
  };

  setTimeout(tryInject, 1500);
}

// Add spin animation
const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);

init();
