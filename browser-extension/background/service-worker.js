/**
 * Service Worker - DeepSeek Chat → Obsidian
 * MV3 background script. Handles installation and badge updates.
 */

const STORAGE_KEY = 'ds_chat_export';

// ── Install ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepSeek → Obsidian extension installed');
});

// ── Badge Updates ─────────────────────────────────────────────

// Listen for storage changes to update the extension badge
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    const data = changes[STORAGE_KEY].newValue;
    if (data && data.messageCount > 0) {
      chrome.action.setBadgeText({ text: String(data.messageCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});

// Initialize badge on startup
chrome.storage.local.get(STORAGE_KEY, (result) => {
  const data = result[STORAGE_KEY];
  if (data && data.messageCount > 0) {
    chrome.action.setBadgeText({ text: String(data.messageCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }
});

// ── Message Relay ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script can notify service worker about extraction completion
  if (message.type === 'EXPORT_COMPLETE') {
    chrome.action.setBadgeText({ text: String(message.count) });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    sendResponse({ ok: true });
  }
  return true;
});
