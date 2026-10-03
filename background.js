
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getUserId') {
    getOrIdentifyUser().then(uid => sendResponse({ userId: uid }));
    return true;
  }
});

async function getOrIdentifyUser() {
  const stored = await chrome.storage.local.get(['quickflow_uid']);
  if (stored.quickflow_uid) return stored.quickflow_uid;
  try {
    const cookie = await chrome.cookies.get({ url: 'https://www.linkedin.com', name: 'li_at' });
    if (cookie && cookie.value) {
      const hash = 'li_' + await hashString(cookie.value.slice(-30));
      await chrome.storage.local.set({ quickflow_uid: hash });
      return hash;
    }
  } catch(e) {}
  const randomUid = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  await chrome.storage.local.set({ quickflow_uid: randomUid });
  return randomUid;
}

async function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
