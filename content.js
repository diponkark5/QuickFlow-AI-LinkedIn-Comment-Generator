

const TONE_ICONS = {
  'Casual': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'Insight': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'Helpful': '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>',
  'Inspire': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'Humor': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  'Question': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'Supportive': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'Agree & Add': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'Counter': '<polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>',
  'Story': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5H20"/>',
  'Concise': '<line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>',
  'Rewrite': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'
};

const PRIMARY_TONES = ['Casual', 'Insight', 'Helpful', 'Inspire', 'Humor', 'Question'];
const spinnerSVG = '<svg viewBox="0 0 24 24"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>';

function isExtensionAlive() {
  try { return Boolean(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}



async function syncUserStats(username, displayName) {
  try {
    await fetch(CONFIG.WORKER_URL + '/stats', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QuickFlow-Secret": CONFIG.EXTENSION_SECRET
      },
      body: JSON.stringify({
        linkedinUsername: username,
        displayName: displayName || username
      })
    });
  } catch(e) {
    console.warn("[QuickFlow] Background sync warning:", e);
  }
}

async function resolveActiveUserId() {
  const local = await chrome.storage.local.get(['quickflow_uid', 'linkedin_username', 'display_name']);
  let discoveredHandle = local.linkedin_username;
  let discoveredName = local.display_name;

  try {
    const nameEl = document.querySelector('.feed-identity-module__actor-meta a, .feed-identity-module h3, div.t-16.t-black.t-bold');
    if (nameEl && nameEl.innerText.trim()) {
      discoveredName = nameEl.innerText.trim().split('\n')[0];
    }
    
    const anchors = document.querySelectorAll('a[href*="/in/"]');
    for (const a of anchors) {
      const m = a.href.match(/\/in\/([a-zA-Z0-9\-_%]+)/);
      if (m && m[1] && !['feed', 'mynetwork', 'jobs', 'messaging', 'notifications'].includes(m[1])) {
        discoveredHandle = decodeURIComponent(m[1]);
        break;
      }
    }
  } catch(e) {}


  if (discoveredHandle && discoveredHandle !== local.linkedin_username) {
    chrome.storage.local.set({ linkedin_username: discoveredHandle });
    syncUserStats(discoveredHandle, discoveredName);
  }
  if (discoveredName && discoveredName !== local.display_name) {
    chrome.storage.local.set({ display_name: discoveredName });
  }

  if (discoveredHandle) {
    chrome.storage.local.set({ quickflow_uid: discoveredHandle });
    return discoveredHandle;
  }

  if (local.quickflow_uid) return local.quickflow_uid;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getUserId' }, (res) => {
      const finalId = res?.userId || ('anon_' + Math.random().toString(36).substring(2, 10));
      syncUserStats(finalId, "Active User");
      resolve(finalId);
    });
  });

}

resolveActiveUserId();

document.addEventListener('focusin', function(e) {
  if (!isExtensionAlive()) return;
  if (e.target.matches('div[contenteditable="true"][role="textbox"]')) {
    try {
      chrome.storage.local.get(['auto_mode', 'extra_tones'], function(res) {
        if (!isExtensionAlive() || chrome.runtime.lastError) return;
        injectToneBar(e.target, res?.extra_tones || []);
        if (res?.auto_mode && e.target.innerText.trim() === "") {
          generateComment('Insight', null, e.target);
        }
      });
    } catch(err) {}
  }
});

try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (!isExtensionAlive()) return;
      if (changes.extra_tones) {
        document.querySelectorAll('.sc-tone-bar').forEach(bar => {
          const commentBox = bar.parentElement.querySelector('div[contenteditable="true"][role="textbox"]');
          if (commentBox) {
            bar.remove();
            injectToneBar(commentBox, changes.extra_tones.newValue || []);
          }
        });
      }
    });
  }
} catch (e) {}

function injectToneBar(commentBox, extraTones) {
  const container = commentBox.closest('form') || commentBox.parentElement;
  if (container.querySelector('.sc-tone-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'sc-tone-bar';

  PRIMARY_TONES.forEach(tone => {
    bar.appendChild(createToneButton(tone, commentBox, false));
  });

  if (Array.isArray(extraTones)) {
    extraTones.forEach(tone => {
      if (TONE_ICONS[tone] && !PRIMARY_TONES.includes(tone)) {
        bar.appendChild(createToneButton(tone, commentBox, true));
      }
    });
  }

  container.appendChild(bar);
}

function createToneButton(tone, commentBox, isExtra) {
    const btn = document.createElement('button');
    btn.className = 'sc-btn' + (isExtra ? ' sc-extra' : '');
    const originalHTML = `<svg viewBox="0 0 24 24">${TONE_ICONS[tone] || TONE_ICONS['Casual']}</svg> ${tone}`;
    btn.innerHTML = originalHTML;
    
    btn.onclick = (event) => {
        event.preventDefault();
        generateComment(tone, btn, commentBox, originalHTML);
    };
    return btn;
}

function extractLinkedInPostText(commentBox) {
    const threadedComment = commentBox.closest('.comments-comment-item, .comments-reply-item');
    if (threadedComment) {
        const clone = threadedComment.cloneNode(true);
        clone.querySelectorAll('form, button, .comments-comment-box, .sc-tone-bar').forEach(el => el.remove());
        const text = clone.textContent.replace(/\s+/g, ' ').trim();
        if (text.length > 5) return "Replying to this comment: " + text.substring(0, 1500);
    }

    const boxRect = commentBox.getBoundingClientRect();
    const boxCenter = boxRect.left + (boxRect.width / 2);
    let candidates = [];

    const elements = document.querySelectorAll('.update-components-text, .feed-shared-update-v2__description-wrapper, span[dir="ltr"], div[dir="ltr"], p, .visually-hidden, h1, h2');

    elements.forEach(el => {
        if (el.closest('.comments-comment-item, .comments-comments-list, .comments-comment-box, nav, header, aside, .update-components-actor, .feed-shared-actor')) return;
        if (el.children.length > 5 && !el.classList.contains('visually-hidden') && !el.classList.contains('update-components-text')) return;

        const rect = el.getBoundingClientRect();
        const checkRect = el.classList.contains('visually-hidden') ? el.parentElement.getBoundingClientRect() : rect;

        if (checkRect.height > 0 && checkRect.width > 0) {
            if (checkRect.bottom <= boxRect.top + 50 && (boxRect.top - checkRect.bottom) < 1800) {
                const elCenter = checkRect.left + (checkRect.width / 2);
                if (Math.abs(elCenter - boxCenter) < 500) {
                    const txt = el.textContent.trim();
                    if (txt.length > 15 && !txt.match(/^(Like|Comment|Share|Send|Repost|Reply|Follow|Connect|see more|more|\.\.\.more)$/i)) {
                        candidates.push({ text: txt, top: checkRect.top });
                    }
                }
            }
        }
    });

    if (candidates.length === 0) return "LINKEDIN_POST_NOT_FOUND";

    candidates.sort((a, b) => a.top - b.top);

    let finalLines = [];
    candidates.forEach(item => {
        let cleanTxt = item.text.replace(/\s+/g, ' ').replace(/\.{3}\s*(see more|more)/gi, '').trim();
        if (cleanTxt.length < 15) return;

        let isSubset = false;
        for (let i = 0; i < finalLines.length; i++) {
            if (cleanTxt.includes(finalLines[i])) {
                finalLines[i] = cleanTxt;
                isSubset = true;
                break;
            } else if (finalLines[i].includes(cleanTxt)) {
                isSubset = true;
                break;
            }
        }
        if (!isSubset) finalLines.push(cleanTxt);
    });

    const postText = finalLines.join("\n").trim();
    return postText.length >= 10 ? postText.substring(0, 3500) : "LINKEDIN_POST_NOT_FOUND";
}

async function generateComment(tone, btnElement, commentBox, originalHTML) {
    if (!isExtensionAlive()) {
        if (btnElement) {
            btnElement.classList.remove('sc-loading');
            if (originalHTML) btnElement.innerHTML = originalHTML;
        }
        commentBox.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, "Extension was updated. Please refresh this page (F5).");
        return;
    }

    const effectiveUserId = await resolveActiveUserId();
    const currentDraft = commentBox.innerText.trim();

    if (btnElement) {
        btnElement.classList.add('sc-loading');
        btnElement.innerHTML = `${spinnerSVG} Typing...`;
    }

    commentBox.focus();
    const postText = extractLinkedInPostText(commentBox);
    const pref = await chrome.storage.local.get(['user_persona', 'comment_length', 'comment_history', 'display_name']);

    try {
        const response = await fetch(CONFIG.WORKER_URL + '/generate', {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-QuickFlow-Secret": CONFIG.EXTENSION_SECRET },
            body: JSON.stringify({
                linkedinUsername: effectiveUserId,
                displayName: pref?.display_name || effectiveUserId,
                postText: postText,
                tone: tone,
                persona: pref?.user_persona || 'general',
                length: pref?.comment_length || 'balanced'
            })
        });

        // Daily limit reached
        if (response.status === 402) {
            commentBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, "⚡ Free daily limit reached (15/15 comments). Join the QuickFlow Pro waitlist in the extension popup to get unlimited comments soon!");
            if (btnElement) {
                btnElement.classList.remove('sc-loading');
                btnElement.innerHTML = originalHTML;
            }
            return;
        }

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Server error (${response.status})`);
        }

        // Live SSE Streaming
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let isFirstChunk = true;
        let buffer = "";
        let fullGeneratedText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const raw = line.slice(6).trim();
                    if (raw === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(raw);
                        const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (chunk) {
                            const cleanChunk = chunk.replace(/[—–]/g, ', ');
                            fullGeneratedText += cleanChunk;
                            if (isFirstChunk) {
                                document.execCommand('selectAll', false, null);
                                document.execCommand('insertText', false, cleanChunk);
                                isFirstChunk = false;
                            } else {
                                document.execCommand('insertText', false, cleanChunk);
                            }
                            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    } catch(e) {}
                }
            }
        }

        if (fullGeneratedText) {
            const history = pref?.comment_history || [];
            const newEntry = {
                id: Date.now() + Math.random().toString(36).substring(2, 6),
                timestamp: new Date().toISOString(),
                tone: tone,
                persona: pref?.user_persona || 'general',
                length: pref?.comment_length || 'balanced',
                postSnippet: (postText && postText !== "LINKEDIN_POST_NOT_FOUND") ? postText.substring(0, 140) + '...' : '[Visual/Media Post]',
                commentText: fullGeneratedText.trim(),
                wordCount: fullGeneratedText.trim().split(/\s+/).filter(Boolean).length
            };
            history.unshift(newEntry);
            if (history.length > 400) history.pop();
            chrome.storage.local.set({ comment_history: history });
        }

    } catch (err) {
        console.error("QuickFlow Error:", err);
        commentBox.focus();
        document.execCommand('selectAll', false, null);
        let errorMsg = err.message;
        if (errorMsg === "Failed to fetch") {
            errorMsg = "CORS blocked or Cloudflare Worker did not deploy correctly. Did you update the Worker code?";
        }
        document.execCommand('insertText', false, "❌ Backend Error: " + errorMsg);
    } finally {
        if (btnElement) {
            btnElement.classList.remove('sc-loading');
            btnElement.innerHTML = originalHTML;
        }
    }
}
