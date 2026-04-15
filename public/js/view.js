document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        search: '',
        language: 'all',
        baseFolders: new Set(),
        subFolder: '',
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
        loading: document.getElementById('loadingState'),
        locatorGrid: null,
        emulatorGrid: document.getElementById('emulatorGrid'),
        creatorGrid: document.getElementById('creatorGrid'),
        creatorSearchInput: document.getElementById('creatorSearchInput'),
        creatorSearchBtn: document.getElementById('creatorSearchBtn'),
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
        const urlParams = new URLSearchParams(window.location.search);
        const archiveId = urlParams.get('id');

        if (!archiveId) {
            alert('No archive ID provided in URL');
            window.location.href = '/';
            return;
        }

        DOM.loading.classList.remove('hidden');

        fetch(`/api/banners/${archiveId}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load data');
                return res.json();
            })
            .then(data => {
                state.data = data;
                DOM.loading.classList.add('hidden');
                setupFilters();
            })
            .catch(err => {
                console.error(err);
                alert('Could not load banners data.');
                DOM.loading.classList.add('hidden');
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

        DOM.search.value = '';
        document.querySelectorAll('input[name="lang"]').forEach(el => el.checked = (el.value === 'all'));
        document.querySelectorAll('input[type="checkbox"][data-type="base"]').forEach(el => el.checked = false);

        updateSubFolderFilters();
        render();
    }

    function renderLanguageFilters(langs) {
        let html = `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="all" checked onchange="window.setLang('all');" class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">All</span></label>`;
        langs.forEach(l => {
            html += `<label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="lang" value="${l}" onchange="window.setLang('${l}');" class="text-indigo-600 focus:ring-indigo-500"> <span class="text-sm">${l}</span></label>`;
        });
        DOM.languages.innerHTML = html;
    }

    window.setLang = function (l) {
        state.language = l;
        render();
    }

    function renderBaseFolderFilters(folders) {
        let html = '';
        folders.forEach(f => {
            html += `
            <label class="flex items-center gap-2 cursor-pointer mb-1 hover:bg-slate-50 p-1 rounded transition-colors text-sm">
                <input type="checkbox" data-type="base" value="${f}" onchange="window.toggleBaseFolder('${f}')" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                <span class="truncate" title="${f}">${f}</span>
            </label>`;
        });
        DOM.baseFolders.innerHTML = html;
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
            html += `<option value="${s}" ${selected}>${s}</option>`;
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
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 border border-slate-200 truncate" title="${b.BaseFolder} / ${b.SubFolder}">
                        ${b.BaseFolder}${b.SubFolder ? ' / ' + b.SubFolder : ''}                        
                    </span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] whitespace-nowrap font-bold ${typeColor} uppercase tracking-wider">${b.Language}</span>
                </div>
                <h3 class="text-sm font-semibold text-slate-900 line-clamp-2 min-h-10 leading-tight mb-2" title="${b.Name}">${b.Name}</h3>
                
                ${imageBlock}
                
                <div class="mt-3">
                    ${b.Title ? `<p class="text-sm text-slate-600 mb-1 font-medium line-clamp-2" title="${b.Title}">${b.Title}</p>` : '<p class="text-sm text-slate-400 italic mb-1">No title</p>'}
                    ${b.Subtitle ? `<p class="text-[11px] text-slate-500 mb-3 line-clamp-2" title="${b.Subtitle}">${b.Subtitle}</p>` : ''}
                </div>

                <div class="mb-3 flex flex-col gap-1.5">
                    ${(() => {
                    const mainCtas = b.CTAs ? b.CTAs.filter(c => !c.Key.includes('app')) : [];
                    return mainCtas.length > 0 ? mainCtas.map(cta => `
                            <div class="bg-indigo-50 rounded p-1.5 flex flex-col border border-indigo-100">
                                <span class="text-[11px] font-medium text-slate-800 truncate" title="${cta.Text || ''}">${cta.Text || 'No Link Text'}</span>
                                <span class="text-[9px] text-indigo-600 truncate opacity-90 mt-0.5" title="${cta.Url || ''}">${cta.Url || 'No Target URL'}</span>
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
                            ${b.AppImageAlt ? `<div class="mt-1 text-[10px] text-slate-500 px-1"><span class="font-medium text-slate-600">Alt text:</span> <span class="italic">${b.AppImageAlt}</span></div>` : ''}
                        `;
                    }

                    return `
                        <hr class="border-slate-100 my-3">
                        <div class="flex flex-col gap-1.5">
                            <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">App Version</span>
                            ${b.AppTitle ? `<h4 class="text-sm font-semibold text-slate-800 leading-tight truncate" title="${b.AppTitle}">${b.AppTitle}</h4>` : ''}
                            ${b.AppSubtitle ? `<p class="text-[11px] text-slate-500 line-clamp-2" title="${b.AppSubtitle}">${b.AppSubtitle}</p>` : ''}
                            ${appImageBlock}
                            ${appCtas.length > 0 ? `
                            <div class="mt-2 flex flex-col gap-1.5">
                                ${appCtas.map(cta => `
                                    <div class="bg-teal-50 rounded p-1.5 flex flex-col border border-teal-100">
                                        <div class="flex justify-between items-center mb-0.5">
                                            <span class="text-[9px] font-bold text-teal-800 uppercase tracking-widest leading-none">${cta.Key.replace('action', ' action')}</span>
                                            <span class="text-[8px] text-teal-700 bg-white px-1 py-0.5 rounded shadow-sm border border-teal-100 leading-none">${cta.Type || 'No link type'}</span>
                                        </div>
                                        <span class="text-[11px] font-medium text-slate-800 truncate" title="${cta.Text || ''}">${cta.Text || 'No Link Text'}</span>
                                        <span class="text-[9px] text-teal-700 truncate opacity-90 mt-0.5" title="${cta.Url || ''}">${cta.Url || 'No Target URL'}</span>
                                    </div>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                        `;
                })()}

                <div class="mt-auto pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-500">
                    ${b.CampaignId ? `<div><span class="font-medium text-slate-700">Camp:</span> ${b.CampaignId}</div>` : ''}
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

    function renderCreator() {
        const term = DOM.creatorSearchInput.value.toLowerCase().trim();
        if (!term) return;

        const match = state.data.find(b => b.Name.toLowerCase() === term);

        if (!match) {
           DOM.creatorCanvas.innerHTML = `<div class="p-8 text-slate-500 font-medium bg-white rounded-lg shadow-sm border border-slate-200">No banner found exactly matching name "${DOM.creatorSearchInput.value}"</div>`;
           return;
        }

        renderEmulator(state.data, [match], 1, DOM.creatorCanvas, true);
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

            const ctaText = primaryCta && primaryCta.Text ? primaryCta.Text : 'No text in CTA';
            const appCtaText = primaryAppCta && primaryAppCta.Text ? primaryAppCta.Text : 'No text in CTA';

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
                                    <span class="text-2xl font-black text-white uppercase leading-tight tracking-tight mb-2" contenteditable="true">${b.Title || b.Name}</span>
                                    ${b.Subtitle ? `<span contenteditable="true" class="text-[13px] font-bold ${!isEssent ? 'text-[#66BC29] uppercase' : 'text-white'} ">${b.Subtitle}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-4 mt-5">
                                    <button class="${colors.webCtaText} ${colors.ctaBorder} flex-shrink-0 font-bold text-xs px-5 py-2.5 ${isEssent ? 'rounded-md' : 'rounded-full'} shadow-sm whitespace-nowrap inline-flex items-center gap-2" contenteditable="true" style="background-color: ${colors.webCtaBg}">${ctaText} ${!isEssent ? '->' : ''}</button>
                                    ${b.DismissBannerLabel ? `<a href="#" class="text-white text-[11px] underline opacity-80 hover:opacity-100 whitespace-nowrap">${b.DismissBannerLabel}</a>` : ''}
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
                            <span class="text-xl font-black text-white uppercase leading-tight tracking-tight mb-2" contenteditable="true">${b.Title || b.Name}</span>
                            ${b.Subtitle ? `<span contenteditable="true" class="text-[12px] font-bold ${!isEssent ? 'text-[#66BC29] uppercase' : 'text-white'} leading-snug">${b.Subtitle}</span>` : ''}
                        </div>
                        
                        <div class="${!isEssent ? 'mt-8' : 'mt-auto pt-6'} flex flex-col items-center w-full">
                            <button class="${colors.webCtaText} ${colors.ctaBorder} w-full font-bold text-xs py-3.5 ${isEssent ? 'rounded-md' : 'rounded-full'} shadow-sm whitespace-nowrap inline-flex items-center justify-center gap-2" contenteditable="true" style="background-color: ${colors.webCtaBg}">${ctaText} ${!isEssent ? '->' : ''}</button>
                            ${b.DismissBannerLabel ? `<a href="#" class="text-white text-sm underline opacity-90 mx-auto mt-4">${b.DismissBannerLabel}</a>` : ''}
                        </div>
                    </div>
                </div>
            `;

            const appRenderTitle = b.AppTitle || b.Title || b.Name;
            const appRenderSub = b.AppSubtitle || b.Subtitle || '';

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
                           ${b.DismissBannerLabel ? `<a href="#" class="${isEssent ? 'text-[#1A66FF]' : 'text-[#1E76CE]'} text-sm font-medium underline mx-auto mt-4" contenteditable="true">${b.DismissBannerLabel}</a>` : ''}
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
                        <span class="text-sm font-bold text-slate-800 uppercase tracking-widest">${b.BaseFolder}${b.SubFolder ? ' / ' + b.SubFolder : ''}</span>
                        <span class="text-xs text-slate-500 font-medium">${b.Name} | ${b.Language}</span>
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
