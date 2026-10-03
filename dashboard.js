
let allHistory = [];
let backendCountToday = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    document.getElementById('searchInput').addEventListener('input', renderTable);
    document.getElementById('toneFilter').addEventListener('change', renderTable);
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('clearBtn').addEventListener('click', clearHistory);
});

function loadDashboardData() {
    chrome.storage.local.get(['comment_history', 'linkedin_username', 'quickflow_uid'], async (res) => {
        allHistory = res.comment_history || [];
        const effectiveId = res.linkedin_username || res.quickflow_uid;
        
        if (effectiveId) {
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
                backendCountToday = data.comments_today || 0;
                
                const todayStr = new Date().toISOString().slice(0, 10);
                const localTodayCount = allHistory.filter(item => item.timestamp && item.timestamp.startsWith(todayStr)).length;
                
                // --- MASTER RESET ---
                if (data.exists === false || backendCountToday < localTodayCount) {
                    allHistory = [];
                    chrome.storage.local.set({ comment_history: [] });
                }
            } catch(e) {}
        }
        
        renderKPIs();
        renderToneBreakdown();
        renderActivityChart();
        renderTable();
    });
}
function renderKPIs() {
    const total = allHistory.length;
    // Use backend count for TODAY and Time Saved to stay in sync with the DB limit
    document.getElementById('totalCount').innerText = total;
    const totalMins = backendCountToday * 2.5;
    const hours = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);
    document.getElementById('timeSaved').innerText = `${hours}h ${mins}m`;
    const totalWords = allHistory.reduce((acc, cur) => acc + (cur.wordCount || 0), 0);
    document.getElementById('totalWords').innerText = totalWords.toLocaleString();
    const avg = total > 0 ? Math.round(totalWords / total) : 0;
    document.getElementById('avgWords').innerText = `Avg ${avg} words / comment`;
    if (total > 0) {
        const counts = {};
        allHistory.forEach(item => { counts[item.tone] = (counts[item.tone] || 0) + 1; });
        let top = Object.keys(counts)[0];
        for (const k in counts) {
            if (counts[k] > counts[top]) top = k;
        }
        const pct = Math.round((counts[top] / total) * 100);
        document.getElementById('topTone').innerText = top;
        document.getElementById('topTonePct').innerText = `${pct}% of all activity (${counts[top]} times)`;
    } else {
        document.getElementById('topTone').innerText = '—';
        document.getElementById('topTonePct').innerText = '0% of all activity';
    }
}

function renderToneBreakdown() {
    const container = document.getElementById('toneBars');
    if (allHistory.length === 0) {
        container.innerHTML = '<p class="empty-state">No activity logged yet.</p>';
        return;
    }
    const counts = {};
    allHistory.forEach(item => { counts[item.tone] = (counts[item.tone] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    let html = '';
    sorted.forEach(([tone, count]) => {
        const pct = Math.round((count / allHistory.length) * 100);
        html += `<div class="tone-bar-item"><div class="tone-bar-header"><span>${tone}</span><span style="color: var(--text-muted); font-size: 12px;">${count} (${pct}%)</span></div><div class="tone-track"><div class="tone-fill" style="width: ${pct}%"></div></div></div>`;
    });
    container.innerHTML = html;
}

function renderActivityChart() {
    const container = document.getElementById('activityChart');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ dateStr: d.toISOString().slice(0, 10), label: dayNames[d.getDay()], count: 0 });
    }
    allHistory.forEach(item => {
        if (!item.timestamp) return;
        const itemDate = item.timestamp.slice(0, 10);
        const match = days.find(d => d.dateStr === itemDate);
        if (match) match.count++;
    });
    const maxCount = Math.max(...days.map(d => d.count), 5);
    let html = '<div class="chart-bars-wrap">';
    days.forEach(d => {
        const heightPct = Math.max(Math.round((d.count / maxCount) * 100), 5);
        html += `<div class="chart-col"><span class="chart-val-tip">${d.count > 0 ? d.count : ''}</span><div class="chart-bar-rect" style="height: ${heightPct}%"></div><span class="chart-day-label">${d.label}</span></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderTable() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const toneFilter = document.getElementById('toneFilter').value;
    const tbody = document.getElementById('ledgerBody');
    const filtered = allHistory.filter(item => {
        const matchTone = (toneFilter === 'ALL' || item.tone === toneFilter);
        const matchSearch = (!query || (item.commentText && item.commentText.toLowerCase().includes(query)) || (item.postSnippet && item.postSnippet.toLowerCase().includes(query)));
        return matchTone && matchSearch;
    });
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No matching comments found.</td></tr>';
        return;
    }
    let html = '';
    filtered.forEach(item => {
        const time = new Date(item.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const safeSnippet = escapeHTML(item.postSnippet || '—');
        const safeComment = escapeHTML(item.commentText || '');
        html += `<tr><td style="color: var(--text-muted); font-size: 12px;">${time}</td><td><span class="badge">${item.tone}</span></td><td class="snippet">${safeSnippet}</td><td class="comment-cell">${safeComment}</td><td style="text-align: right;"><button class="copy-btn" data-copy="${escapeAttribute(item.commentText)}">Copy</button></td></tr>`;
    });
    tbody.innerHTML = html;
    tbody.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-copy');
            navigator.clipboard.writeText(text).then(() => { showToast('Comment copied to clipboard!'); });
        });
    });
}

function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }
function escapeAttribute(str) { return (str || '').replace(/"/g, '&quot;'); }
function showToast(msg) { const toast = document.getElementById('toast'); toast.innerText = msg; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 2000); }
function exportData() {
    if (allHistory.length === 0) { alert('No data to export.'); return; }
    const blob = new Blob([JSON.stringify(allHistory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `quickflow_ai_history_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
function clearHistory() {
    if (confirm('Are you sure you want to permanently clear your comment generation history?')) {
        chrome.storage.local.set({ comment_history: [] }, () => { allHistory = []; loadDashboardData(); showToast('History cleared.'); });
    }
}
