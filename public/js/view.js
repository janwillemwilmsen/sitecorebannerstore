document.addEventListener('DOMContentLoaded', () => {
    // Escape user/XML-derived values before inserting into innerHTML to prevent stored XSS.
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    // State
    const state = {
        search: '',
        language: 'all',
        baseFolders: new Set(),
        subFolder: '',
        campaignMode: 'off',      // 'off' | 'include' | 'exclude'
        campaignIds: null,        // Set of normalized CampaignIDs from the uploaded CSV, or null
        mediaPrefix: 'https://www.essent.nl/-/media/',
        data: [],
        viewMode: 'data',
        brandStyle: 'essent'
    };

    // DOM Elements
    const DOM = {
        grid: document.getElementById('bannerGrid'),
        count: document.getElementById('resultCount'),
        empty: document.getElementById('emptyState'),
        search: document.getElementById('searchInput'),
        languages: document.getElementById('languageFilters'),
        baseFolders: document.getElementById('baseFolderFilters'),
        subFolder: document.getElementById('subFolderSelect'),
        reset: document.getElementById('resetFilters'),
        mediaHost: document.getElementById('mediaHostInput'),
        campaignListSection: document.getElementById('campaignListSection'),
        campaignListInfo: document.getElementById('campaignListInfo'),
        campaignListSelect: document.getElementById('campaignListSelect'),
        loading: document.getElementById('loadingState'),
        locatorGrid: null,
        emulatorGrid: document.getElementById('emulatorGrid'),
        creatorGrid: document.getElementById('creatorGrid'),
        creatorSearchInput: document.getElementById('creatorSearchInput'),
        creatorSearchBtn: document.getElementById('creatorSearchBtn'),
        creatorWorkflow: document.getElementById('creatorWorkflow'),
        creatorTopPreview: document.getElementById('creatorTopPreview'),
        geminiApiKey: document.getElementById('geminiApiKey'),
        aiFormatSelect: document.getElementById('aiFormatSelect'),
        aiImagePrompt: document.getElementById('aiImagePrompt'),
        aiCopyPrompt: document.getElementById('aiCopyPrompt'),
        generateVariantsBtn: document.getElementById('generateVariantsBtn'),
        aiSpinnerOverlay: document.getElementById('aiSpinnerOverlay'),
        aiLoadingStatus: document.getElementById('aiLoadingStatus'),
        aiVariantsSection: document.getElementById('aiVariantsSection'),
        aiVariantsGrid: document.getElementById('aiVariantsGrid'),
        creatorCanvasContainer: document.getElementById('creatorCanvasContainer'),
        creatorCanvas: document.getElementById('creatorCanvas'),
        zoomInBtn: document.getElementById('zoomInBtn'),
        zoomOutBtn: document.getElementById('zoomOutBtn'),
        zoomResetBtn: document.getElementById('zoomResetBtn'),
        zoomLevelIndicator: document.getElementById('zoomLevelIndicator'),
        modeDataBtn: document.getElementById('modeDataBtn'),
        modeEmulatorBtn: document.getElementById('modeEmulatorBtn'),
        modeCreatorBtn: document.getElementById('modeCreatorBtn'),
        brandToggleContainer: document.getElementById('brandToggleContainer'),
        brandEssentBtn: document.getElementById('brandEssentBtn'),
        brandEdBtn: document.getElementById('brandEdBtn')
    };

    // Initialize App
    function init() {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey && DOM.geminiApiKey) DOM.geminiApiKey.value = savedKey;
        if (DOM.geminiApiKey) DOM.geminiApiKey.addEventListener('change', (e) => localStorage.setItem('gemini_api_key', e.target.value.trim()));
        const urlParams = new URLSearchParams(window.location.search);
        const archiveId = urlParams.get('id');

        if (!archiveId) {
            alert('No archive ID provided in URL');
            window.location.href = '/';
            return;
        }

        DOM.loading.classList.remove('hidden');

        // The campaign filter list is optional; failing to load it must not
        // block the banner data, so its errors resolve to null.
        const bannersReq = fetch(`/api/banners/${archiveId}`)
            .then(res => {
                if (res.status === 401) { window.location.href = '/login'; return null; }
                if (!res.ok) throw new Error('Failed to load data');
                return res.json();
            });
        const campaignReq = fetch('/api/campaign-filter')
            .then(res => (res.ok ? res.json() : null))
            .catch(() => null);

        Promise.all([bannersReq, campaignReq])
            .then(([data, campaignFilter]) => {
                if (!data) return;
                state.data = data;
                setupCampaignList(campaignFilter);
                DOM.loading.classList.add('hidden');
                setupFilters();
            })
            .catch(err => {
                console.error(err);
                alert('Could not load banners data.');
                DOM.loading.classList.add('hidden');
            });
    }

    // CampaignIds in the CMS data contain stray whitespace (e.g. "144664 _1"),
    // so both the CSV values and banner values are compared with all
    // whitespace stripped, case-insensitively.
    function normalizeCampaignId(id) {
        return String(id || '').replace(/\s+/g, '').toLowerCase();
    }

    function setupCampaignList(filter) {
        if (!filter || !Array.isArray(filter.ids) || filter.ids.length === 0) return;
        state.campaignIds = new Set(filter.ids.map(normalizeCampaignId));

        const matchCount = state.data.filter(b => b.CampaignId && state.campaignIds.has(normalizeCampaignId(b.CampaignId))).length;
        DOM.campaignListInfo.textContent = `${filter.originalName} — ${filter.ids.length} IDs, matching ${matchCount} banners in this archive.`;
        DOM.campaignListSection.classList.remove('hidden');

        DOM.campaignListSelect.addEventListener('change', (e) => {
            state.campaignMode = e.target.value;
            render();
        });
    }

    function setupFilters() {
        const languages = [...new Set(state.data.map(b => b.Language))].filter(Boolean);
        const baseFolders = [...new Set(state.data.map(b => b.BaseFolder))].filter(Boolean).sort();

        renderLanguageFilters(languages);
        renderBaseFolderFilters(baseFolders);
        updateSubFolderFilters();

        DOM.search.addEventListener('input', (e) => { state.search = e.target.value.toLowerCase(); render(); });
        DOM.subFolder.addEventListener('change', (e) => { state.subFolder = e.target.value; render(); });
        DOM.mediaHost.addEventListener('input', (e) => { state.mediaPrefix = e.target.value; render(); });
        DOM.reset.addEventListener('click', resetFilters);

        DOM.modeDataBtn.addEventListener('click', () => { state.viewMode = 'data'; updateModeStyles(); render(); });
        DOM.modeEmulatorBtn.addEventListener('click', () => { state.viewMode = 'emulator'; updateModeStyles(); render(); });
        DOM.modeCreatorBtn.addEventListener('click', () => { state.viewMode = 'creator'; updateModeStyles(); render(); });
        DOM.brandEssentBtn.addEventListener('click', () => { state.brandStyle = 'essent'; updateModeStyles(); render(); });
        DOM.brandEdBtn.addEventListener('click', () => { state.brandStyle = 'energiedirect'; updateModeStyles(); render(); });

        DOM.creatorSearchBtn.addEventListener('click', () => {
            if (state.viewMode === 'creator') renderCreator();
        });
        
        DOM.creatorSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && state.viewMode === 'creator') renderCreator();
        });

        if (DOM.generateVariantsBtn) {
            DOM.generateVariantsBtn.addEventListener('click', generateVariantsLogic);
        }

        setupCreatorZoom();

        updateModeStyles();
        render();
    }

    function formatDate(dtStr) {
        if (!dtStr) return 'Unknown';
        const match = dtStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        return dtStr;
    }

    window.toggleBaseFolder = function (folder) {
        if (state.baseFolders.has(folder)) state.baseFolders.delete(folder);
        else state.baseFolders.add(folder);
        state.subFolder = '';
        updateSubFolderFilters();
        render();
    }

    function resetFilters() {
        state.search = '';
        state.language = 'all';
        state.baseFolders.clear();
        state.subFolder = '';
        state.campaignMode = 'off';

        DOM.campaignListSelect.value = 'off';
        DOM.search.value = '';
        document.querySelectorAll('input[name="lang"]').forEach(el => el.checked = (el.value === 'all'));
        document.querySelectorAll('input[type="checkbox"][data-type="base"]').forEach(el => el.checked = false);

        updateSubFolderFilters();
        render();
    }

    function renderLanguageFilters(langs) {
        let html = `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="all" checked class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">All</span></label>`;
        langs.forEach(l => {
            html += `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="${esc(l)}" class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">${esc(l)}</span></label>`;
        });
        DOM.languages.innerHTML = html;
        DOM.languages.addEventListener('change', (e) => {
            if (e.target.name === 'lang') { state.language = e.target.value; render(); }
        });
    }

    function renderBaseFolderFilters(folders) {
        let html = '';
        folders.forEach(f => {
            html += `
            <label class="flex items-center gap-2 cursor-pointer mb-1 hover:bg-slate-50 p-1 rounded transition-colors text-sm">
                <input type="checkbox" data-type="base" value="${esc(f)}" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                <span class="truncate" title="${esc(f)}">${esc(f)}</span>
            </label>`;
        });
        DOM.baseFolders.innerHTML = html;
        DOM.baseFolders.addEventListener('change', (e) => {
            if (e.target.dataset.type === 'base') window.toggleBaseFolder(e.target.value);
        });
    }

    function updateSubFolderFilters() {
        let filtered = state.data;
        if (state.baseFolders.size > 0) {
            filtered = state.data.filter(b => state.baseFolders.has(b.BaseFolder));
        }
        const subs = [...new Set(filtered.map(b => b.SubFolder))].filter(Boolean).sort();

        let html = `<option value="">All Subfolders</option>`;
        subs.forEach(s => {
            const selected = s === state.subFolder ? 'selected' : '';
            html += `<option value="${esc(s)}" ${selected}>${esc(s)}</option>`;
        });
        DOM.subFolder.innerHTML = html;
    }

    function render() {
        let results = state.data.filter(b => {
            if (state.search) {
                const term = state.search;
                if (!b.Name.toLowerCase().includes(term) &&
                    !((b.Title || '').toLowerCase().includes(term)) &&
                    !((b.CampaignId || '').toLowerCase().includes(term))) return false;
            }
            if (state.language !== 'all' && b.Language !== state.language) return false;
            if (state.baseFolders.size > 0 && !state.baseFolders.has(b.BaseFolder)) return false;
            if (state.subFolder && b.SubFolder !== state.subFolder) return false;
            if (state.campaignMode !== 'off' && state.campaignIds) {
                // Banners without a CampaignId count as "not in list".
                const inList = !!b.CampaignId && state.campaignIds.has(normalizeCampaignId(b.CampaignId));
                if (state.campaignMode === 'include' && !inList) return false;
                if (state.campaignMode === 'exclude' && inList) return false;
            }
            return true;
        });

        results.sort((a, b) => {
            const dateA = a.Updated || "";
            const dateB = b.Updated || "";
            return dateB.localeCompare(dateA);
        });

        DOM.count.textContent = `${results.length} Banners`;

        if (results.length === 0) {
            DOM.grid.innerHTML = '';
            DOM.emulatorGrid.innerHTML = '';
            DOM.empty.classList.remove('hidden');
            return;
        } else {
            DOM.empty.classList.add('hidden');
        }

        const renderLimit = state.viewMode === 'emulator' ? 50 : 500;
        const toRender = results.slice(0, renderLimit);

        if (state.viewMode === 'emulator') {
            renderEmulator(results, toRender, renderLimit);
            return;
        }

        if (state.viewMode === 'creator') {
            if (DOM.creatorSearchInput.value.trim() !== '') renderCreator();
            return;
        }

        const fragment = document.createDocumentFragment();

        toRender.forEach(b => {
            const card = document.createElement('div');
            card.className = "bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-slate-200 overflow-hidden flex flex-col h-full";

            const typeColor = b.Language === 'en' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800';

            // Construct the image HTML block if standard image exists
            let imageBlock = '';
            if (b.HeroImage) {
                const fullImageUrl = 'https://essentimages.janwillemwilmsen.workers.dev/?' + (state.mediaPrefix + b.HeroImage);
                imageBlock = `
                <div class="w-full h-24 bg-slate-100 flex items-center justify-center overflow-hidden relative group">
                    <img src="${fullImageUrl}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21 15 16 10 5 21\\'></polyline></svg>'; this.classList.add('w-10', 'h-10', 'opacity-50', 'object-contain'); this.classList.remove('w-full', 'h-full');" alt="Banner Image" class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <a href="${fullImageUrl}" target="_blank" class="bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm hover:bg-slate-50 transition-colors">Full Image</a>
                    </div>
                </div>`;
            }

            card.innerHTML = `
             <div class="p-4 flex flex-col flex-1">
                <div class="flex justify-between items-start mb-2 gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200 truncate" title="${esc(b.BaseFolder)} / ${esc(b.SubFolder)}">
                        ${esc(b.BaseFolder)}${b.SubFolder ? ' / ' + esc(b.SubFolder) : ''}
                    </span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] whitespace-nowrap font-bold ${typeColor} uppercase tracking-wider">${esc(b.Language)}</span>
                </div>
                <h3 class="text-sm font-semibold text-slate-900 line-clamp-2 min-h-10 leading-tight mb-2" title="${esc(b.Name)}">${esc(b.Name)}</h3>
                
                ${imageBlock}
                
                <div class="mt-3">
                    ${b.Title ? `<p class="text-sm text-slate-600 mb-1 font-medium line-clamp-2" title="${esc(b.Title)}">${esc(b.Title)}</p>` : '<p class="text-sm text-slate-400 italic mb-1">No title</p>'}
                    ${b.Subtitle ? `<p class="text-[11px] text-slate-500 mb-3 line-clamp-2" title="${esc(b.Subtitle)}">${esc(b.Subtitle)}</p>` : ''}
                </div>

                <div class="mb-3 flex flex-col gap-1.5">
                    ${(() => {
                    const mainCtas = b.CTAs ? b.CTAs.filter(c => !c.Key.includes('app')) : [];
                    return mainCtas.length > 0 ? mainCtas.map(cta => `
                            <div class="bg-indigo-50 rounded p-1.5 flex flex-col border border-indigo-100">
                                <span class="text-[11px] font-medium text-slate-800 truncate" title="${esc(cta.Text || '')}">${esc(cta.Text || 'No Link Text')}</span>
                                <span class="text-[9px] text-indigo-600 truncate opacity-90 mt-0.5" title="${esc(cta.Url || '')}">${esc(cta.Url || 'No Target URL')}</span>
                            </div>
                        `).join('') : '<span class="text-[11px] font-medium text-slate-400 italic">No call-to-action</span>';
                })()}
                </div>

                ${(() => {
                    const hasAppData = b.AppTitle || b.AppSubtitle || b.AppImage || (b.CTAs && b.CTAs.some(c => c.Key.includes('app')));
                    if (!hasAppData) return '';

                    const appCtas = b.CTAs ? b.CTAs.filter(c => c.Key.includes('app')) : [];

                    let appImageBlock = '';
                    if (b.AppImage) {
                        const fullAppImageUrl = 'https://essentimages.janwillemwilmsen.workers.dev/?' + (state.mediaPrefix + b.AppImage);
                        appImageBlock = `
                            <div class="w-full h-24 bg-slate-100 flex items-center justify-center overflow-hidden relative group mt-2 rounded">



                            <img src="${fullAppImageUrl}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%2394a3b8\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21 15 16 10 5 21\\'></polyline></svg>'; this.classList.add('w-10', 'h-10', 'opacity-50', 'object-contain'); this.classList.remove('w-full', 'h-full');" alt="Banner Image" class="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <a href="${fullAppImageUrl}" target="_blank" class="bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm hover:bg-slate-50 transition-colors">Full Image</a>
                    </div>


                               
                            </div>
                            ${b.AppImageAlt ? `<div class="mt-1 text-[10px] text-slate-500 px-1"><span class="font-medium text-slate-600">Alt text:</span> <span class="italic">${esc(b.AppImageAlt)}</span></div>` : ''}
                        `;
                    }

                    return `
                        <hr class="border-slate-100 my-3">
                        <div class="flex flex-col gap-1.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">App Version</span>
                            ${b.AppTitle ? `<h4 class="text-sm font-semibold text-slate-800 leading-tight truncate" title="${esc(b.AppTitle)}">${esc(b.AppTitle)}</h4>` : ''}
                            ${b.AppSubtitle ? `<p class="text-[11px] text-slate-500 line-clamp-2" title="${esc(b.AppSubtitle)}">${esc(b.AppSubtitle)}</p>` : ''}
                            ${appImageBlock}
                            ${appCtas.length > 0 ? `
                            <div class="mt-2 flex flex-col gap-1.5">
                                ${appCtas.map(cta => `
                                    <div class="bg-teal-50 rounded p-1.5 flex flex-col border border-teal-100">
                                        <div class="flex justify-between items-center mb-0.5">
                                            <span class="text-[9px] font-bold text-teal-800 uppercase tracking-widest leading-none">${esc(cta.Key.replace('action', ' action'))}</span>
                                            <span class="text-[8px] text-teal-700 bg-white px-1 py-0.5 rounded shadow-sm border border-teal-100 leading-none">${esc(cta.Type || 'No link type')}</span>
                                        </div>
                                        <span class="text-[11px] font-medium text-slate-800 truncate" title="${esc(cta.Text || '')}">${esc(cta.Text || 'No Link Text')}</span>
                                        <span class="text-[9px] text-teal-700 truncate opacity-90 mt-0.5" title="${esc(cta.Url || '')}">${esc(cta.Url || 'No Target URL')}</span>
                                    </div>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                        `;
                })()}

                <div class="mt-auto pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500">
                    ${b.CampaignId ? `<div><span class="font-medium text-slate-700">Camp:</span> ${esc(b.CampaignId)}</div>` : ''}
                    <div><span class="font-medium text-slate-700">Updated:</span> ${formatDate(b.Updated)}</div>
                </div>
            </div>
            `;
            fragment.appendChild(card);
        });

        DOM.grid.innerHTML = '';
        DOM.grid.appendChild(fragment);

        if (results.length > renderLimit) {
            const notice = document.createElement('div');
            notice.className = "col-span-full text-center py-4 text-sm text-slate-500";
            notice.textContent = `Showing 1-${renderLimit} out of ${results.length} results. Please narrow down via filters.`;
            DOM.grid.appendChild(notice);
        }
    }

    function updateModeStyles() {
        DOM.modeDataBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md text-indigo-100 hover:text-white hover:bg-indigo-500 transition-all duration-200";
        DOM.modeEmulatorBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md text-indigo-100 hover:text-white hover:bg-indigo-500 transition-all duration-200";
        DOM.modeCreatorBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md text-indigo-100 hover:text-white hover:bg-indigo-500 transition-all duration-200";

        if (state.viewMode !== 'data') {
            DOM.brandToggleContainer.classList.remove('hidden');
        } else {
            DOM.brandToggleContainer.classList.add('hidden');
        }
        
        DOM.grid.classList.add('hidden');
        DOM.emulatorGrid.classList.add('hidden');
        DOM.creatorGrid.classList.add('hidden');

        if (state.viewMode === 'data') {
            DOM.modeDataBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md bg-white text-indigo-700 shadow-sm transition-all duration-200";
            DOM.grid.classList.remove('hidden');
        } else if (state.viewMode === 'emulator') {
            DOM.modeEmulatorBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md bg-white text-indigo-700 shadow-sm transition-all duration-200";
            DOM.emulatorGrid.classList.remove('hidden');
        } else if (state.viewMode === 'creator') {
            DOM.modeCreatorBtn.className = "px-4 py-1.5 text-sm font-semibold rounded-md bg-white text-indigo-700 shadow-sm transition-all duration-200";
            DOM.creatorGrid.classList.remove('hidden');
        }

        if (state.brandStyle === 'essent') {
            DOM.brandEssentBtn.className = "px-3 py-1.5 text-xs font-bold rounded-md bg-[#E6006E] text-white shadow-sm ring-2 ring-white ring-offset-1 ring-offset-indigo-800 transition-all";
            DOM.brandEdBtn.className = "px-3 py-1.5 text-xs font-bold rounded-md bg-transparent text-slate-300 hover:text-white hover:bg-indigo-600 transition-all";
        } else {
            DOM.brandEdBtn.className = "px-3 py-1.5 text-xs font-bold rounded-md bg-[#66BC29] text-white shadow-sm ring-2 ring-white ring-offset-1 ring-offset-indigo-800 transition-all";
            DOM.brandEssentBtn.className = "px-3 py-1.5 text-xs font-bold rounded-md bg-transparent text-slate-300 hover:text-white hover:bg-indigo-600 transition-all";
        }
    }

    const canvasState = { scale: 1, x: 0, y: 0, isDragging: false, startX: 0, startY: 0 };
    
    function setupCreatorZoom() {
        const container = DOM.creatorCanvasContainer;
        const canvas = DOM.creatorCanvas;

        const updateTransform = () => {
            canvas.style.transform = `scale(${canvasState.scale}) translate(${canvasState.x}px, ${canvasState.y}px)`;
            DOM.zoomLevelIndicator.textContent = `${Math.round(canvasState.scale * 100)}%`;
        };

        container.addEventListener('wheel', (e) => {
            if (state.viewMode !== 'creator') return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            canvasState.scale = Math.max(0.2, Math.min(canvasState.scale + delta, 3));
            updateTransform();
        }, { passive: false });
        
        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('#creatorCanvas') && !e.target.classList.contains('p-12')) {
                if (e.target.isContentEditable || e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;
            }
            if (state.viewMode !== 'creator') return;
            canvasState.isDragging = true;
            canvasState.startX = e.clientX - (canvasState.x * canvasState.scale);
            canvasState.startY = e.clientY - (canvasState.y * canvasState.scale);
            container.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!canvasState.isDragging) return;
            canvasState.x = (e.clientX - canvasState.startX) / canvasState.scale;
            canvasState.y = (e.clientY - canvasState.startY) / canvasState.scale;
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            canvasState.isDragging = false;
            container.style.cursor = 'grab';
        });

        DOM.zoomInBtn.addEventListener('click', () => {
            canvasState.scale = Math.min(canvasState.scale + 0.1, 3);
            updateTransform();
        });

        DOM.zoomOutBtn.addEventListener('click', () => {
            canvasState.scale = Math.max(canvasState.scale - 0.1, 0.2);
            updateTransform();
        });

        DOM.zoomResetBtn.addEventListener('click', () => {
            canvasState.scale = 1;
            canvasState.x = 0;
            canvasState.y = 0;
            updateTransform();
        });
    }

    let referenceBannerObj = null;

    function renderCreator() {
        const term = DOM.creatorSearchInput.value.toLowerCase().trim();
        if (!term) return;

        const match = state.data.find(b => b.Name.toLowerCase() === term);

        if (!match) {
            DOM.creatorTopPreview.innerHTML = `<div class="p-8 text-slate-500 font-medium w-full text-center">No banner found exactly matching name "${esc(DOM.creatorSearchInput.value)}"</div>`;
            DOM.creatorWorkflow.classList.remove('hidden');
            return;
        }

        referenceBannerObj = match;
        DOM.creatorWorkflow.classList.remove('hidden');
        renderEmulator(state.data, [match], 1, DOM.creatorTopPreview, true);

        DOM.aiVariantsSection.classList.add('hidden');
        DOM.aiVariantsGrid.innerHTML = '';
        DOM.creatorCanvas.innerHTML = '<span class="text-slate-400 font-medium text-sm">Select a variant above to compile here.</span>';
    }

    async function generateVariantsLogic() {
        if (!referenceBannerObj) return alert('Load a reference banner first!');
        const apiKey = DOM.geminiApiKey.value.trim();
        if (!apiKey) return alert('Please provide your Gemini API key.');

        const format = DOM.aiFormatSelect.value;
        const copyPrompt = DOM.aiCopyPrompt.value.trim();
        const imgPrompt = DOM.aiImagePrompt.value.trim();

        if (!copyPrompt && !imgPrompt) return alert('Please enter at least one prompt (Copy or Image).');

        DOM.aiSpinnerOverlay.classList.remove('hidden');
        DOM.aiLoadingStatus.textContent = 'Preparing images...';

        try {
            const originalImgUrl = format === 'app' ? referenceBannerObj.AppImage : referenceBannerObj.HeroImage;
            let base64Image = null;
            let mimeType = 'image/jpeg';
            if (originalImgUrl) {
                const proxyUrl = 'https://essentimages.janwillemwilmsen.workers.dev/?' + encodeURIComponent(state.mediaPrefix + originalImgUrl);
                try {
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error('Fetch failed');
                    const blob = await response.blob();
                    mimeType = blob.type;
                    base64Image = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.warn('Could not fetch image for base64 over workers dev.', e);
                }
            }

            let newCopies = [];
            if (copyPrompt) {
                DOM.aiLoadingStatus.textContent = 'Generating Copy Variants (Gemini-2.5-Flash-Lite)...';
                const currentText = `Title: ${referenceBannerObj.Title || referenceBannerObj.Name}\nSubtitle: ${referenceBannerObj.Subtitle || ''}\nCTA: ${referenceBannerObj.CTAs && referenceBannerObj.CTAs[0] ? referenceBannerObj.CTAs[0].Text : ''}`;

                let geminiPrompt = `You are an expert copywriter. Based on the user prompt: "${copyPrompt}".\n\nThe original text is:\n${currentText}\n\nGenerate strictly 3 distinct, high-quality variations. Return ONLY a valid JSON array of objects without markdown wrappers. Format: [{"title": "...", "subtitle": "...", "cta": "..."}]`;

                let contents = [{ role: 'user', parts: [{ text: geminiPrompt }] }];
                if (base64Image) {
                    contents[0].parts.unshift({
                        inlineData: { mimeType: mimeType, data: base64Image }
                    });
                }

                const resText = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents, generationConfig: { responseMimeType: "application/json" } })
                });
                const dataText = await resText.json();
                if (dataText.error) throw new Error(dataText.error.message);

                try {
                    const textOutput = dataText.candidates[0].content.parts[0].text;
                    newCopies = JSON.parse(textOutput.replace(/^```json\s*/, '').replace(/\s*```$/, ''));
                } catch (e) {
                    throw new Error('Failed to parse Gemini generated JSON: ' + dataText.candidates[0].content.parts[0].text);
                }
            } else {
                newCopies = [1, 2, 3].map(() => ({
                    title: referenceBannerObj.Title || referenceBannerObj.Name,
                    subtitle: referenceBannerObj.Subtitle || '',
                    cta: referenceBannerObj.CTAs && referenceBannerObj.CTAs.length > 0 ? referenceBannerObj.CTAs[0].Text : 'Meer weten'
                }));
            }

            let newImages = [];
            if (imgPrompt) {
                DOM.aiLoadingStatus.textContent = 'Generating Image Variants...';
                try {
                    const promises = [];
                    for (let i = 0; i < 3; i++) {
                        let imageContents = [{ role: 'user', parts: [{ text: "Generate an image variation based on this prompt: " + imgPrompt + ". Variation " + (i + 1) }] }];
                        if (base64Image) {
                             imageContents[0].parts.unshift({
                                 inlineData: { mimeType: mimeType, data: base64Image }
                             });
                        }

                        promises.push(
                            fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: imageContents,
                                    generationConfig: {
                                        responseModalities: ["TEXT", "IMAGE"]
                                    }
                                })
                            }).then(res => res.json())
                        );
                    }

                    const results = await Promise.all(promises);
                    newImages = [];
                    
                    results.forEach(dataImg => {
                        if (dataImg.error) throw new Error(dataImg.error.message);
                        if (dataImg.candidates && dataImg.candidates[0].content.parts) {
                            const part = dataImg.candidates[0].content.parts.find(p => p.inlineData);
                            if (part) {
                                newImages.push(`data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`);
                            }
                        }
                    });

                    if (newImages.length === 0) {
                        throw new Error('No images parsed from Gemini Response.');
                    }
                } catch (e) {
                    console.error("Gemini API Error:", e);
                    const fallbackImgUrl = base64Image ? `data:${mimeType};base64,${base64Image}` : null;
                    newImages = [fallbackImgUrl, fallbackImgUrl, fallbackImgUrl];
                    setTimeout(() => alert("Warning: Image Generation via Gemini-2.5-Flash failed. Loading Text variants using original image! \n\n" + e.message), 500);
                }
            } else {
                const fallbackImgUrl = base64Image ? `data:${mimeType};base64,${base64Image}` : null;
                newImages = [fallbackImgUrl, fallbackImgUrl, fallbackImgUrl];
            }

            DOM.aiLoadingStatus.textContent = 'Building UI...';

            while (newCopies.length < 3) newCopies.push(newCopies[0] || {});
            while (newImages.length < 3) newImages.push(newImages[0] || null);

            renderVariantGrid(newCopies, newImages, format);

        } catch (err) {
            alert('AI Generation Error: ' + err.message);
        } finally {
            DOM.aiSpinnerOverlay.classList.add('hidden');
        }
    }

    function renderVariantGrid(copies, images, format) {
        DOM.aiVariantsGrid.innerHTML = '';
        DOM.aiVariantsSection.classList.remove('hidden');

        for (let i = 0; i < 3; i++) {
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 group relative overflow-hidden";
            card.innerHTML = `
                <div class="h-40 bg-slate-100 rounded flex items-center justify-center overflow-hidden border border-slate-200">
                    ${images[i] ? `<img src="${images[i]}" class="w-full h-full object-cover">` : '<span class="text-slate-400 text-xs">No Image Available</span>'}
                </div>
                <div class="flex-1 flex flex-col">
                    <h4 class="font-black text-sm text-slate-800 mb-1 leading-tight">${esc(copies[i]?.title || '...')}</h4>
                    <p class="text-xs text-slate-500 mb-3 font-semibold">${esc(copies[i]?.subtitle || '...')}</p>
                    <div class="mt-auto pt-2 border-t border-slate-100">
                      <span class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-bold text-[10px] px-2 py-1 rounded-full uppercase tracking-wider">CTA: ${esc(copies[i]?.cta || '...')}</span>
                    </div>
                </div>
                <button class="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded mt-2 transition-colors focus:ring-2 select-variant-btn" data-idx="${i}">Compile into Canvas &rarr;</button>
            `;
            DOM.aiVariantsGrid.appendChild(card);
        }

        DOM.aiVariantsGrid.querySelectorAll('.select-variant-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                DOM.aiVariantsGrid.querySelectorAll('div.border-indigo-500').forEach(c => c.classList.remove('border-indigo-500', 'ring-2', 'ring-indigo-100'));
                const card = e.target.closest('.bg-white.p-4');
                card.classList.add('border-indigo-500', 'ring-2', 'ring-indigo-100');

                const idx = parseInt(e.target.getAttribute('data-idx'));
                compileVariantToBottomCanvas(copies[idx], images[idx], format);
            });
        });
    }

    function compileVariantToBottomCanvas(copy, imageB64, format) {
        const modifiedBanner = JSON.parse(JSON.stringify(referenceBannerObj));
        modifiedBanner.Title = copy.title;
        modifiedBanner.Subtitle = copy.subtitle;
        if (!modifiedBanner.CTAs) modifiedBanner.CTAs = [];

        if (format === 'app') {
            modifiedBanner.AppTitle = copy.title;
            modifiedBanner.AppSubtitle = copy.subtitle;
            const appCtaObj = modifiedBanner.CTAs.find(c => c.Key.includes('app'));
            if (appCtaObj) appCtaObj.Text = copy.cta;
            else modifiedBanner.CTAs.push({ Key: 'app', Text: copy.cta });
            modifiedBanner._forceAppImage = imageB64;
        } else {
            const webCtaObj = modifiedBanner.CTAs.find(c => !c.Key.includes('app'));
            if (webCtaObj) webCtaObj.Text = copy.cta;
            else modifiedBanner.CTAs.push({ Key: 'web', Text: copy.cta });
            modifiedBanner._forceHeroImage = imageB64;
        }

        renderEmulator([modifiedBanner], [modifiedBanner], 1, DOM.creatorCanvas, true);
    }

    function renderEmulator(results, toRender, max, targetDOM = DOM.emulatorGrid, isCreatorMode = false) {
        targetDOM.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        if (!isCreatorMode) {
            const introEmuluator = document.createElement('div')
            introEmuluator.textContent = 'De banner previews zijn geen exacte weergave van de manier waarop ze op apparaten van klanten getoond worden. De weergave is een indicatie.'
            targetDOM.prepend(introEmuluator)
        }

        const getImgUrl = (img) => {
            if (!img) return '';
            return 'https://essentimages.janwillemwilmsen.workers.dev/?' + encodeURIComponent(state.mediaPrefix + img);
        };

        toRender.forEach((b, idx) => {
            const hasApp = b.AppTitle || b.AppSubtitle || b.AppImage || (b.CTAs && b.CTAs.some(c => c.Key.includes('app')));
            const mainCtas = b.CTAs ? b.CTAs.filter(c => !c.Key.includes('app')) : [];
            const appCtas = b.CTAs ? b.CTAs.filter(c => c.Key.includes('app')) : [];
            const primaryCta = b.CTAs ? b.CTAs.find(c => !c.Key.includes('app')) : null;
            const primaryAppCta = b.CTAs ? b.CTAs.find(c => c.Key.includes('app')) : null;

            const ctaText = esc(primaryCta && primaryCta.Text ? primaryCta.Text : 'No text in CTA');
            const appCtaText = esc(primaryAppCta && primaryAppCta.Text ? primaryAppCta.Text : 'No text in CTA');

            const webImg = getImgUrl(b.HeroImage);
            const appImg = getImgUrl(b.AppImage);

            const isEssent = state.brandStyle === 'essent';

            const colors = isEssent ? {
                mainBg: '#E6006E',
                ctaBg: '#1A66FF',
                ctaText: 'text-white',
                ctaBorder: 'border-transparent',
                webCtaBg: '#FFFFFF',
                webCtaText: 'text-[#1A66FF]',
                appHeader: '#E6006E',
                appHeaderStyle: 'clip-path: ellipse(150% 100% at 50% 0%);', // curve pointing outwards down
                appTitleCol: 'text-white'
            } : {
                mainBg: '#66BC29',
                ctaBg: '#FFC000',
                ctaText: 'text-black',
                ctaBorder: 'border-2 border-black',
                webCtaBg: '#FFC000',
                webCtaText: 'text-black',
                appHeader: '#66BC29',
                appHeaderStyle: 'border-bottom-left-radius: 50% 20px; border-bottom-right-radius: 50% 20px;', // curve pointing inwards up
                appTitleCol: 'text-white'
            };

            const desktopHTML = `
                <div class="rounded-xl overflow-hidden shadow-lg mx-auto flex items-center relative py-8 bg-right bg-no-repeat shrink-0" style="width: 800px; background-color: ${colors.mainBg}; ${webImg ? `background-image: url('${webImg}'); background-size: cover;` : ''}">
                    ${!isEssent ? `<div class="absolute inset-y-0 right-0 w-[55%] pointer-events-none opacity-30 bg-repeat bg-[length:40px_40px]"></div>` : ''}
                    
                    <div class="w-full mx-auto px-8 z-10">
                        <div class="flex w-full">
                            <div class="w-5/12 ${!isEssent ? 'bg-[#31006E] rounded-r-full pr-12 py-6 -ml-8 pl-8' : ''}">
                                <div class="inline-flex flex-col">
                                    <span class="text-2xl font-black text-white uppercase leading-tight tracking-tight mb-2" contenteditable="true">${esc(b.Title || b.Name)}</span>
                                    ${b.Subtitle ? `<span contenteditable="true" class="text-[13px] font-bold ${!isEssent ? 'text-[#66BC29] uppercase' : 'text-white'} ">${esc(b.Subtitle)}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-4 mt-5">
                                    <button class="${colors.webCtaText} ${colors.ctaBorder} flex-shrink-0 font-bold text-xs px-5 py-2.5 ${isEssent ? 'rounded-md' : 'rounded-full'} shadow-sm whitespace-nowrap inline-flex items-center gap-2" contenteditable="true" style="background-color: ${colors.webCtaBg}">${ctaText} ${!isEssent ? '->' : ''}</button>
                                    ${b.DismissBannerLabel ? `<a href="#" class="text-white text-[11px] underline opacity-80 hover:opacity-100 whitespace-nowrap">${esc(b.DismissBannerLabel)}</a>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const mobileHTML = `
                <div class="rounded-xl overflow-hidden shadow-lg w-[320px] min-h-[340px] shrink-0 mx-auto flex flex-col relative bg-bottom bg-no-repeat ${!isEssent ? `py-4` : ''}" style="background-color: ${colors.mainBg}; ">
                    ${!isEssent ? `<div class=" py-2"></div>` : ''}
                    
                    <div class="flex flex-col w-full z-10 ${!isEssent ? 'bg-[#31006E] rounded-r-full p-8 -ml-2 pl-10' : 'p-8 h-full'}">
                        <div class="inline-flex flex-col">
                            <span class="text-xl font-black text-white uppercase leading-tight tracking-tight mb-2" contenteditable="true">${esc(b.Title || b.Name)}</span>
                            ${b.Subtitle ? `<span contenteditable="true" class="text-[12px] font-bold ${!isEssent ? 'text-[#66BC29] uppercase' : 'text-white'} leading-snug">${esc(b.Subtitle)}</span>` : ''}
                        </div>
                        
                        <div class="${!isEssent ? 'mt-8' : 'mt-auto pt-6'} flex flex-col items-center w-full">
                            <button class="${colors.webCtaText} ${colors.ctaBorder} w-full font-bold text-xs py-3.5 ${isEssent ? 'rounded-md' : 'rounded-full'} shadow-sm whitespace-nowrap inline-flex items-center justify-center gap-2" contenteditable="true" style="background-color: ${colors.webCtaBg}">${ctaText} ${!isEssent ? '->' : ''}</button>
                            ${b.DismissBannerLabel ? `<a href="#" class="text-white text-sm underline opacity-90 mx-auto mt-4">${esc(b.DismissBannerLabel)}</a>` : ''}
                        </div>
                    </div>
                </div>
            `;

            const appRenderTitle = esc(b.AppTitle || b.Title || b.Name);
            const appRenderSub = esc(b.AppSubtitle || b.Subtitle || '');

            const appHTML = hasApp ? `
                <div class="rounded-3xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] w-[320px] shrink-0 mx-auto flex flex-col bg-white border border-slate-100 overflow-hidden relative pb-8 relative group">
                    
                    <div class="w-full flex-shrink-0 relative flex flex-col items-center pt-10 px-6 pb-40" style="background-color: ${colors.appHeader}; ${colors.appHeaderStyle}">
                        ${!isEssent ? `<h2 class="text-2xl font-black ${colors.appTitleCol} uppercase leading-tight tracking-tight z-10 w-full" contenteditable="true">${appRenderTitle}</h2>` : ''}
                        ${isEssent ? `<h2 class="text-xl font-bold ${colors.appTitleCol} uppercase leading-tight tracking-tight z-10" contenteditable="true">${appRenderTitle}</h2>` : ''}
                    </div>
                    
                    ${appImg ? `<div class="relative w-full flex justify-center -mt-36 z-20 px-8 h-32"><img src="${appImg}" class="object-contain h-full max-w-full drop-shadow-md" onerror="this.style.display='none'" /></div>` : '<div class="h-8"></div>'}
                    
                    <div class="px-6 flex flex-col flex-1 ${!appImg ? 'mt-4' : ''}">
                       ${!isEssent ? `<p contenteditable="true" class="text-slate-600 text-lg font-medium mt-6 mb-8 leading-snug">${appRenderSub}</p>` : ''}
                       ${isEssent && appRenderSub ? `<p contenteditable="true" class="text-slate-800 text-base mt-6 mb-6">${appRenderSub}</p>` : ''}
                       
                       <div class="mt-auto flex flex-col items-center w-full mt-4">
                           <button class="${colors.ctaText} ${colors.ctaBorder} w-full font-bold text-lg py-3.5 ${isEssent ? 'rounded-md' : 'rounded-full'} shadow-sm whitespace-nowrap inline-flex items-center justify-center gap-2 block" contenteditable="true" style="background-color: ${colors.ctaBg}">
                               <span>${appCtaText}</span> ${!isEssent ? '' : ''}
                               <svg class="w-5 h-5 mb-[2px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                           </button>
                           ${b.DismissBannerLabel ? `<a href="#" class="${isEssent ? 'text-[#1A66FF]' : 'text-[#1E76CE]'} text-sm font-medium underline mx-auto mt-4" contenteditable="true">${esc(b.DismissBannerLabel)}</a>` : ''}
                       </div>
                    </div>
                </div>
            ` : `
                <div class="rounded-3xl shadow-sm w-[320px] shrink-0 mx-auto flex flex-col items-center justify-center bg-slate-50 border border-slate-200 overflow-hidden relative p-8 text-center min-h-[300px]">
                    <svg class="w-12 h-12 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <p class="text-sm font-medium text-slate-500">No app banner available.</p>
                </div>
            `;

            const wrapper = document.createElement('div');
            wrapper.id = `screenshot-${idx}-${toRender.length}`;

            wrapper.className = "flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm";
            wrapper.innerHTML = `
                <div class="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-slate-800 uppercase tracking-widest">${esc(b.BaseFolder)}${b.SubFolder ? ' / ' + esc(b.SubFolder) : ''}</span>
                        <span class="text-xs text-slate-500 font-medium">${esc(b.Name)} | ${esc(b.Language)}</span>
                        <button class="text-xs font-semibold px-2 py-1 bg-slate-200 text-slate-700 rounded" onclick="printScreenshot('${wrapper.id}')">Print screenshot</button>
                    </div>
                    <span class="text-xs font-semibold px-2 py-1 bg-slate-200 text-slate-700 rounded">${idx + 1} / ${toRender.length}</span>
                </div>
                <div class="p-8 w-[100%] overflow-x-auto bg-slate-200/50">
                    <div class="flex flex-col xl:flex-row gap-8 items-start justify-center min-w-[max-content]">
                        <div class="flex flex-col items-center gap-3">
                            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded shadow-sm border border-slate-100">Desktop Web</span>
                            ${desktopHTML}
                        </div>
                        <div class="flex gap-8">
                             <div class="flex flex-col items-center gap-3">
                                 <span class="text-xs font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded shadow-sm border border-slate-100">Web Mobile</span>
                                 ${mobileHTML}
                             </div>
                             <div class="flex flex-col items-center gap-3">
                                 <span class="text-xs font-bold text-slate-400 uppercase tracking-widest bg-white px-3 py-1 rounded shadow-sm border border-slate-100">In-App View</span>
                                 ${appHTML}
                             </div>
                        </div>
                    </div>
                </div>
            `;
            fragment.appendChild(wrapper);
        });

        targetDOM.appendChild(fragment);

        if (!isCreatorMode && results.length > max) {
            const notice = document.createElement('div');
            notice.className = "text-center py-4 text-sm font-medium text-slate-500";
            notice.textContent = `Showing 1-${max} out of ${results.length} results. Please narrow down via filters for more.`;
            targetDOM.appendChild(notice);
        }
    }

    init();
});

// Expose globally for inline onclick handlers
window.printScreenshot = async function (id) {
    const banner = document.getElementById(id);
    if (!banner) return;

    // 1. Capture the element
    const canvas = await html2canvas(banner, {
        useCORS: true, // Crucial if your images come from a different URL/CDN
        scale: 2,      // Makes the PNG high-resolution (Retina quality)
        onclone: (clonedDoc) => {
            const clonedBanner = clonedDoc.getElementById(id);
            if (clonedBanner) {
                // Force the wrapper and its scrollable sections to stretch to full internal width
                clonedBanner.style.width = 'max-content';
                const scrollableDiv = clonedBanner.querySelector('.overflow-x-auto');
                if (scrollableDiv) {
                    scrollableDiv.style.overflow = 'visible';
                    scrollableDiv.style.width = 'max-content';
                }
            }
        }
    });

    // 2. Convert to PNG and trigger download
    const link = document.createElement('a');
    link.download = `banner-preview-${id}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
};
