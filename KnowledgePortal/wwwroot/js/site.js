let isAdmin = false;
let activeDocCategory = 'All';
let _allLinksData = [];
let _docCache = [];

let currentDeptFilter = null;

let linkEditState = { isEditing: false, origTitle: "", origCat: "" };
let docEditState = { isEditing: false, origName: "", origCat: "" };

/* =========================================
   INITIALIZATION
   ========================================= */
async function loadData() {
    try {
        const authRes = await fetch('/api/admin/check-auth?v=' + Date.now());
        if (authRes.ok) isAdmin = await authRes.json();

        updateAuthUI(); // Updates Login/Logout buttons

        const v = Date.now();
        const [linksRes, docsRes] = await Promise.all([
            fetch(`/data/links.json?v=${v}`),
            fetch(`/data/docs.json?v=${v}`)
        ]);

        if (linksRes.ok && docsRes.ok) {
            _allLinksData = await linksRes.json(); // Store Links globally
            const docs = await docsRes.json();     // Load Docs

            // If we are currently viewing a department, refresh it
            if (currentDeptFilter) {
                openDepartment(currentDeptFilter);
            }

            // Render Documents Section
            renderDocs(docs);
        }
    } catch (e) {
        console.error('Load error:', e);
    }
}

window.addEventListener('load', () => {
    // 🔥 CRITICAL SCROLL FIX: Force the browser to allow vertical scrolling
    document.documentElement.style.overflowY = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.overflowY = 'auto';
    document.body.style.height = 'auto';

    loadData();
    if (typeof setupEnterKeys === 'function') setupEnterKeys();
});

/* =========================================
   NAVIGATION LOGIC (DASHBOARD <-> DETAIL)
   ========================================= */
window.openDepartment = function (deptType) {
    currentDeptFilter = deptType;

    const dashboard = document.getElementById('dashboard-view');
    const detailView = document.getElementById('department-detail-view');
    const content = document.getElementById('dept-content');
    const title = document.getElementById('dept-title');

    // Define Buckets
    const buckets = {
        'prod': { title: "Production & Operations", cats: ['PRODUCTION', 'QUALITY', 'SAFETY', 'LOGISTICS'], icon: 'fa-gears' },
        'hr': { title: "HR & Administration", cats: ['HR', 'FINANCE'], icon: 'fa-users' },
        'digi': { title: "MES & Digitalization", cats: ['MES', 'POWER BI', 'SHAREPOINT', 'CONFLUENCE', 'LOCAL PROJECTS'], icon: 'fa-laptop-code' },
        'it': { title: "IT Support", cats: ['IT SUPPORT', 'IT'], icon: 'fa-headset' }
    };

    const bucket = buckets[deptType];
    if (!bucket) return;

    // Filter Data
    const links = _allLinksData.filter(d => {
        const cat = (d.Category || 'General').toUpperCase();

        // Logic for Digitalization catch-all or strict mapping
        if (deptType === 'digi') {
            const isProd = buckets.prod.cats.some(c => cat.includes(c));
            const isHr = buckets.hr.cats.some(c => cat.includes(c));
            const isIt = buckets.it.cats.some(c => cat.includes(c));

            // If it matches Digi explicit cats
            if (bucket.cats.some(c => cat.includes(c))) return true;

            // If it doesn't match Prod, HR, or IT, default to Digi
            if (!isProd && !isHr && !isIt) return true;

            return false;
        }

        return bucket.cats.some(c => cat.includes(c));
    });

    // Update Header
    if (title) title.innerHTML = `<i class="fa-solid ${bucket.icon}" style="margin-right:10px; color: var(--primary-color);"></i> ${bucket.title}`;

    // Render Grid
    if (content) {
        content.innerHTML = '';
        renderGroupedItems(links, content, false);
    }

    // Switch Views
    if (dashboard) dashboard.classList.add('hidden');
    if (detailView) detailView.classList.remove('hidden');
}

window.closeDepartment = function () {
    currentDeptFilter = null;
    const dashboard = document.getElementById('dashboard-view');
    const detailView = document.getElementById('department-detail-view');
    if (dashboard) dashboard.classList.remove('hidden');
    if (detailView) detailView.classList.add('hidden');
}

/* =========================================
   HELPER: CATEGORY ICONS
   ========================================= */
function getCategoryIcon(category) {
    const c = (category || "").toUpperCase();
    if (c === "ALL") return "🗂️";

    if (c.includes("MES")) return "🏭";
    if (c.includes("PROD")) return "⚙️";
    if (c.includes("QUAL")) return "🧪";
    if (c.includes("SAFE") || c.includes("EHS")) return "🦺";
    if (c.includes("LOGIS") || c.includes("WARE")) return "🚚";
    if (c.includes("FINANCE") || c.includes("ACC")) return "💰";
    if (c.includes("HR")) return "👥";
    if (c.includes("IT") || c.includes("SUPPORT")) return "💻";
    if (c.includes("POWER") || c.includes("BI")) return "📊";
    if (c.includes("SHAREPOINT")) return "☁️";
    if (c.includes("CONFLUENCE")) return "📘";
    if (c.includes("LOCAL")) return "💻";

    return "📂";
}

/* =========================================
   RENDER LOGIC
   ========================================= */
function renderDocs(data) {
    const container = document.getElementById('docs-container');
    if (!container) return;
    container.innerHTML = '';
    _docCache = [];
    if (!data) data = [];

    // Safely extract unique categories - NO 'All' manually added here
    const categories = [...new Set(data.map(i => (i.Category || 'General').trim().toUpperCase()))].sort();

    if (activeDocCategory !== 'All' && !categories.includes(activeDocCategory)) {
        activeDocCategory = 'All';
    }

    // Tabs Container
    const tabContainer = document.createElement('div');
    tabContainer.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:15px; padding-bottom:10px; border-bottom: 1px solid var(--border-color);";

    // 1. Create the single 'All' Tab explicitly
    const allBtn = document.createElement('button');
    allBtn.innerHTML = `<span style="margin-right:5px; font-size:1.2em;">🗂️</span>All`;
    allBtn.className = (activeDocCategory === 'All') ? 'btn-tab active' : 'btn-tab';
    allBtn.onclick = () => { activeDocCategory = 'All'; renderDocs(data); };
    tabContainer.appendChild(allBtn);

    // 2. Create the remaining dynamic tabs
    categories.forEach(cat => {
        // Absolute safety check: Skip if data somehow had a category named "All"
        if (cat === 'ALL') return;

        const btn = document.createElement('button');
        const icon = getCategoryIcon(cat);

        // Retrieve nicer casing from the data itself
        const displayCat = data.find(d => (d.Category || 'General').trim().toUpperCase() === cat)?.Category || cat;

        btn.innerHTML = `<span style="margin-right:5px; font-size:1.2em;">${icon}</span>${displayCat}`;
        btn.className = (cat === activeDocCategory) ? 'btn-tab active' : 'btn-tab';
        btn.onclick = () => { activeDocCategory = cat; renderDocs(data); };
        tabContainer.appendChild(btn);
    });

    container.appendChild(tabContainer);

    const filteredData = activeDocCategory === 'All'
        ? data
        : data.filter(d => (d.Category || 'General').trim().toUpperCase() === activeDocCategory);

    const listDiv = document.createElement('div');
    container.appendChild(listDiv);

    // Call generic renderer properly
    renderGroupedItems(filteredData, listDiv, true, _docCache);
}

// GENERIC RENDERER
function renderGroupedItems(data, container, isDoc, cacheArray) {
    if (!data || data.length === 0) {
        if (isDoc) container.innerHTML = '<div style="color:var(--text-muted); padding:10px; font-style:italic;">No items found</div>';
        return;
    }

    const groups = {};
    data.forEach(item => {
        const cat = (item.Category || 'General').trim().toUpperCase();
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });

    const sortedCategories = Object.keys(groups).sort();

    sortedCategories.forEach(category => {
        const icon = getCategoryIcon(category);
        const header = document.createElement('h3');
        header.style.cssText = "color:var(--text-muted); font-size:0.95rem; margin:15px 0 8px 0; border-bottom:1px solid var(--border-color); padding-bottom:4px; text-transform:uppercase; font-weight:700; letter-spacing:0.05em; display:flex; align-items:center;";
        header.innerHTML = `<span style="margin-right:8px; font-size:1.2em;">${icon}</span> ${category}`;
        container.appendChild(header);

        if (isDoc) {
            // DOCUMENT LIST
            const ul = document.createElement('ul');
            ul.className = 'doc-list';
            groups[category].forEach(item => {
                let index = cacheArray ? (cacheArray.indexOf(item) > -1 ? cacheArray.indexOf(item) : cacheArray.push(item) - 1) : -1;
                if (index === -1 && cacheArray) index = cacheArray.push(item) - 1;

                const title = item.Name || "Untitled";
                const url = item.Path || "#";
                const desc = item.Desc || item.Description || "";

                const editFunc = `editDocByIndex(${index})`;
                const delFunc = `deleteDocByIndex(${index})`;

                const adminBtns = isAdmin ?
                    `<div style="display:flex; gap:5px;"><button class="btn-action" onclick="${editFunc}" title="Edit" style="color:var(--primary-color);"><i class="fa-solid fa-pen"></i></button><button class="btn-action btn-delete" onclick="${delFunc}" title="Delete"><i class="fa-solid fa-trash"></i></button></div>` : '';

                let typeLabel = "FILE";
                if (url.toLowerCase().includes("confluence")) typeLabel = "CONFLUENCE";
                else if (url.toLowerCase().includes("sharepoint")) typeLabel = "SHAREPOINT";

                const li = document.createElement('li');
                li.className = 'doc-item';
                li.innerHTML = `
                    <div style="flex:1;">
                        <small style="color:var(--text-muted); font-weight:700; margin-right:8px; font-size:0.75rem; background:var(--input-bg); padding:2px 6px; border-radius:4px;">${typeLabel}</small> 
                        <a href="${url}" target="_blank" style="color:var(--primary-color); font-weight:500;">${title}</a> 
                        <span style="font-size:13px; color:var(--text-muted); margin-left:8px;">${desc ? '- ' + desc : ''}</span>
                    </div>${adminBtns}`;
                ul.appendChild(li);
            });
            container.appendChild(ul);
        } else {
            // LINK GRID
            const grid = document.createElement('div');
            grid.className = 'link-grid';

            groups[category].forEach(item => {
                const index = _allLinksData.indexOf(item);

                const title = item.Title || "Untitled";
                const url = item.Url || "#";
                const desc = item.Desc || item.Description || "";

                const editFunc = `editLinkByIndex(${index})`;
                const delFunc = `deleteLinkByIndex(${index})`;

                const card = document.createElement('a');
                card.className = 'link-card';
                card.href = url;
                card.target = "_blank";
                card.title = desc;

                const adminOverlay = isAdmin ?
                    `<div class="card-admin-overlay">
                        <button class="btn-action" onclick="event.preventDefault(); ${editFunc}" title="Edit"><i class="fa-solid fa-pen" style="font-size:12px;"></i></button>
                        <button class="btn-action btn-delete-card" onclick="event.preventDefault(); ${delFunc}" title="Delete"><i class="fa-solid fa-trash" style="font-size:12px;"></i></button>
                    </div>` : '';

                card.innerHTML = `
                    <div class="link-icon-box" style="font-size: 2rem;">${icon}</div>
                    <div class="link-title">${title}</div>
                    ${adminOverlay}
                `;
                grid.appendChild(card);
            });
            container.appendChild(grid);
        }
    });
}

/* =========================================
   SEARCH
   ========================================= */
window.search = function () {
    const q = document.getElementById('search').value.toLowerCase();

    if (!q) {
        if (currentDeptFilter) openDepartment(currentDeptFilter);
        else closeDepartment();
        return;
    }

    const dashboard = document.getElementById('dashboard-view');
    const detailView = document.getElementById('department-detail-view');
    const content = document.getElementById('dept-content');
    const title = document.getElementById('dept-title');

    if (dashboard) dashboard.classList.add('hidden');
    if (detailView) detailView.classList.remove('hidden');
    if (title) title.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search Results`;

    const filtered = _allLinksData.filter(l => (l.Title || "").toLowerCase().includes(q) || (l.Category || "").toLowerCase().includes(q) || (l.Desc || "").toLowerCase().includes(q));

    if (content) {
        content.innerHTML = '';
        renderGroupedItems(filtered, content, false, []);
    }
};

/* =========================================
   EDIT/DELETE FUNCTIONS
   ========================================= */
window.editLinkByIndex = function (index) {
    const item = _allLinksData[index];
    if (!item) return;
    document.getElementById('ltitle').value = item.Title;
    document.getElementById('lurl').value = item.Url;
    document.getElementById('lcategory').value = item.Category || "General";
    document.getElementById('ldescription').value = item.Desc || item.Description || "";
    linkEditState = { isEditing: true, origTitle: item.Title, origCat: item.Category || "General" };

    const btn = document.getElementById('btnAddLink');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Update Link';
        btn.classList.replace('btn-primary', 'btn-secondary');
    }

    const addSec = document.getElementById('addSection');
    if (addSec) {
        addSec.classList.remove('hidden');
        addSec.scrollIntoView();
    }
}

window.editDocByIndex = function (index) {
    const item = _docCache[index];
    if (!item) return;
    document.getElementById('dname').value = item.Name;
    document.getElementById('dpath').value = item.Path;
    document.getElementById('dcategory').value = item.Category || "General";
    document.getElementById('ddescription').value = item.Desc || item.Description || "";
    docEditState = { isEditing: true, origName: item.Name, origCat: item.Category || "General" };

    const btn = document.getElementById('btnAddDoc');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Update Doc';
        btn.classList.replace('btn-primary', 'btn-secondary');
    }

    const addSec = document.getElementById('addSection');
    if (addSec) {
        addSec.classList.remove('hidden');
        addSec.scrollIntoView();
    }
}

window.deleteLinkByIndex = async function (index) {
    const item = _allLinksData[index];
    if (!item) return;
    if (!confirm(`Delete link "${item.Title}"?`)) return;
    await sendRequest('/api/admin/link/delete', { Title: item.Title, Category: item.Category, Url: "ignore" }, "Deleted.");
}

window.deleteDocByIndex = async function (index) {
    const item = _docCache[index];
    if (!item) return;
    if (!confirm(`Delete document "${item.Name}"?`)) return;
    await sendRequest('/api/admin/doc/delete', { Name: item.Name, Category: item.Category, Path: "ignore" }, "Deleted.");
}

/* =========================================
   SUBMIT ACTIONS
   ========================================= */
window.submitLink = async function () {
    const cat = document.getElementById('lcategory').value;
    const title = document.getElementById('ltitle').value.trim();
    const url = document.getElementById('lurl').value.trim();
    const desc = document.getElementById('ldescription').value.trim();
    if (!title || !url) { alert("Title and URL are required"); return; }
    if (!cat) { alert("Please select a Category"); return; }

    if (linkEditState.isEditing) {
        const payload = { OriginalTitle: linkEditState.origTitle, OriginalCategory: linkEditState.origCat, NewItem: { Title: title, Url: url, Category: cat, Desc: desc } };
        const success = await sendRequest('/api/admin/link/update', payload, "Link updated!");
        if (success) resetLinkState();
    } else {
        const success = await sendRequest('/api/admin/link/add', { Title: title, Url: url, Category: cat, Desc: desc }, "Link added!");
        if (success) resetLinkState();
    }
};

window.submitDoc = async function () {
    const cat = document.getElementById('dcategory').value;
    const name = document.getElementById('dname').value.trim();
    const path = document.getElementById('dpath').value.trim();
    const desc = document.getElementById('ddescription').value.trim();
    if (!name || !path) { alert("Name and Path are required"); return; }
    if (!cat) { alert("Please select a Category"); return; }

    if (docEditState.isEditing) {
        const payload = { OriginalName: docEditState.origName, OriginalCategory: docEditState.origCat, NewItem: { Name: name, Path: path, Category: cat, Desc: desc } };
        const success = await sendRequest('/api/admin/doc/update', payload, "Document updated!");
        if (success) resetDocState();
    } else {
        const success = await sendRequest('/api/admin/doc/add', { Name: name, Path: path, Category: cat, Desc: desc }, "Document added!");
        if (success) resetDocState();
    }
};

function resetLinkState() {
    linkEditState = { isEditing: false, origTitle: "", origCat: "" };
    if (document.getElementById('ltitle')) document.getElementById('ltitle').value = '';
    if (document.getElementById('lurl')) document.getElementById('lurl').value = '';
    if (document.getElementById('ldescription')) document.getElementById('ldescription').value = '';
    const btn = document.getElementById('btnAddLink');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Add Link';
        btn.classList.replace('btn-secondary', 'btn-primary');
    }
}

function resetDocState() {
    docEditState = { isEditing: false, origName: "", origCat: "" };
    if (document.getElementById('dname')) document.getElementById('dname').value = '';
    if (document.getElementById('dpath')) document.getElementById('dpath').value = '';
    if (document.getElementById('ddescription')) document.getElementById('ddescription').value = '';
    const btn = document.getElementById('btnAddDoc');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Add Doc';
        btn.classList.replace('btn-secondary', 'btn-primary');
    }
}

window.addNewUser = async function () {
    const uInput = document.getElementById('newUsername');
    const pInput = document.getElementById('newPassword');
    if (!uInput?.value.trim() || !pInput?.value.trim()) { alert("Required"); return; }
    const success = await sendRequest('/api/admin/user/add', { Username: uInput.value.trim(), Password: pInput.value.trim() }, "User added!");
    if (success) {
        uInput.value = '';
        pInput.value = '';
        const addSec = document.getElementById('addUserSection');
        if (addSec) addSec.classList.add('hidden');
    }
};

/* =========================================
   UTILS & API
   ========================================= */
function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const addToggleBtn = document.getElementById('addToggleBtn');
    const userToggleBtn = document.getElementById('userToggleBtn');
    const addSection = document.getElementById('addSection');
    const addUserSection = document.getElementById('addUserSection');

    if (isAdmin) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (addToggleBtn) addToggleBtn.classList.remove('hidden');
        if (userToggleBtn) userToggleBtn.classList.remove('hidden');
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (addToggleBtn) addToggleBtn.classList.add('hidden');
        if (userToggleBtn) userToggleBtn.classList.add('hidden');
        if (addSection) addSection.classList.add('hidden');
        if (addUserSection) addUserSection.classList.add('hidden');
    }
}

window.toggleAddSection = function () {
    const el = document.getElementById('addSection');
    if (el) el.classList.toggle('hidden');
};
window.toggleUserSection = function () {
    const el = document.getElementById('addUserSection');
    if (el) el.classList.toggle('hidden');
};

function setupEnterKeys() {
    const listen = (id, act) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("keypress", e => {
                if (e.key === "Enter") {
                    e.preventDefault(); act();
                }
            });
        }
    };
    listen("lcategory", window.submitLink);
    listen("ltitle", window.submitLink);
    listen("lurl", window.submitLink);
    listen("ldescription", window.submitLink);
    listen("dcategory", window.submitDoc);
    listen("dname", window.submitDoc);
    listen("dpath", window.submitDoc);
    listen("ddescription", window.submitDoc);
    listen("newUsername", window.addNewUser);
    listen("newPassword", window.addNewUser);
}

async function sendRequest(url, payload, successMsg) {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 401) { alert('⛔ Unauthorized'); return false; }
        if (res.status === 409) { alert('❌ Exists in this category'); return true; }
        if (res.status === 404) { alert('❌ Not found'); return false; }
        if (res.status === 400) {
            const errorData = await res.json();
            let msg = "Validation Error:";
            if (errorData.errors) {
                for (let key in errorData.errors) {
                    msg += `\n- ${errorData.errors[key]}`;
                }
            }
            alert(msg);
            return false;
        }
        if (res.ok) {
            alert(successMsg);
            loadData();
            return true;
        }
        else {
            alert("Error: " + await res.text());
            return false;
        }
    } catch (err) {
        alert("Connection failed.");
        return false;
    }
}