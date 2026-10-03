
chrome.storage.local.get(['quickflow_uid', 'linkedin_username', 'display_name', 'user_persona', 'comment_length', 'extra_tones', 'comment_history'], async (res) => {
    
    let history = res.comment_history || [];
    
    // UI Init (Tones & Length)
    if (res.user_persona) document.getElementById('userPersona').value = res.user_persona;
    const currentLength = res.comment_length || 'balanced';
    document.querySelectorAll('#lengthControl .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === currentLength);
    });
    const savedTones = res.extra_tones || ['Supportive', 'Rewrite'];
    document.querySelectorAll('#toneGrid input[type="checkbox"]').forEach(box => {
        box.checked = savedTones.includes(box.value);
    });

    // Determine connected user
    const display = res.display_name || (res.linkedin_username ? `@${res.linkedin_username}` : "Active User");
    document.getElementById('userHandle').innerText = display;

    const effectiveId = res.linkedin_username || res.quickflow_uid;
    if (!effectiveId) {
        document.getElementById('todayCount').innerText = "0";
        document.getElementById('streakDays').innerText = "0d";
        document.getElementById('savedMins').innerText = "0m";
        return;
    }

    try {
        const resp = await fetch(CONFIG.WORKER_URL + '/stats', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "X-QuickFlow-Secret": CONFIG.EXTENSION_SECRET
            },
            body: JSON.stringify({ linkedinUsername: effectiveId })
        });
        
        const data = await resp.json();
        let dbUsed = data.comments_today || 0;
        let isPro = data.is_pro || false;
        let userExists = data.exists !== false; // If API says user exists
        
        const todayStr = new Date().toISOString().slice(0, 10);
        let localTodayCount = history.filter(item => item.timestamp && item.timestamp.startsWith(todayStr)).length;

        // Render Top Cards securely tied to DB limits to prevent UI desync
        document.getElementById('todayCount').innerText = dbUsed;
        document.getElementById('savedMins').innerText = Math.round(dbUsed * 2.5) + 'm';
        
        let streak = 0;
        if (history.length > 0) {
            const uniqueDates = [...new Set(history.map(item => item.timestamp.slice(0, 10)))].sort().reverse();
            let checkDate = new Date();
            for (const d of uniqueDates) {
                const dateObj = new Date(d);
                const diffDays = Math.floor((checkDate - dateObj) / (1000 * 60 * 60 * 24));
                if (diffDays <= 1) { streak++; checkDate = dateObj; } else { break; }
            }
        }
        document.getElementById('streakDays').innerText = streak + 'd';
        
        // Render Free Tier Quota strictly from DB
        if (isPro) {
            document.getElementById('planBadge').innerText = "PRO PLAN";
            document.getElementById('planBadge').classList.add('pro');
            document.getElementById('quotaText').innerText = "Unlimited";
            document.getElementById('progressFill').style.width = "100%";
            document.getElementById('upgradeBtn').style.display = "none";
        } else {
            document.getElementById('quotaText').innerText = `${dbUsed} / 15 Used`;
            const pct = Math.min(100, Math.round((dbUsed / 15) * 100));
            document.getElementById('progressFill').style.width = `${pct}%`;
            if (pct >= 100) {
                document.getElementById('progressFill').style.backgroundColor = "#ef4444";
            }
        }

    } catch(e) {
        console.error("Popup API Error:", e);
    }
});

document.getElementById('userPersona').addEventListener('change', (e) => {
    chrome.storage.local.set({ user_persona: e.target.value });
});

document.querySelectorAll('#lengthControl .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#lengthControl .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chrome.storage.local.set({ comment_length: btn.dataset.val });
    });
});

document.querySelectorAll('#toneGrid input[type="checkbox"]').forEach(box => {
    box.addEventListener('change', () => {
        const selected = [];
        document.querySelectorAll('#toneGrid input[type="checkbox"]:checked').forEach(checkedBox => {
            selected.push(checkedBox.value);
        });
        chrome.storage.local.set({ extra_tones: selected });
    });
});

document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});
