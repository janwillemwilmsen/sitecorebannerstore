document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const archivesList = document.getElementById('archivesList');
    const refreshBtn = document.getElementById('refreshBtn');
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');

    let pollInterval = null;

    // Fetch archives on load
    fetchArchives();

    // Event Listeners for drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-active');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
            fileInput.value = ''; // Reset
        }
    });

    refreshBtn.addEventListener('click', fetchArchives);

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.zip')) {
            showError('Only .zip files are allowed.');
            return;
        }
        hideError();
        
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.innerText = 'Uploading...';
        progressPercent.innerText = '0%';
        progressBar.classList.remove('bg-green-500', 'bg-red-500');
        progressBar.classList.add('bg-indigo-600');

        const formData = new FormData();
        formData.append('zipfile', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = percentComplete + '%';
                progressPercent.innerText = percentComplete + '%';
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                progressText.innerText = 'Upload complete! Processing in background...';
                progressBar.classList.remove('bg-indigo-600');
                progressBar.classList.add('bg-green-500');
                
                // Refresh list right away to show "processing"
                fetchArchives();
                
                // Start polling until processing is done
                startPolling();
                
                setTimeout(() => {
                    progressContainer.classList.add('hidden');
                }, 5000);
            } else {
                showError('Upload failed: ' + xhr.responseText);
                progressContainer.classList.add('hidden');
            }
        };

        xhr.onerror = () => {
            showError('Network error during upload.');
            progressContainer.classList.add('hidden');
        };

        xhr.send(formData);
    }

    function showError(msg) {
        errorMessage.innerText = msg;
        errorAlert.classList.remove('hidden');
    }

    function hideError() {
        errorAlert.classList.add('hidden');
    }

    function fetchArchives() {
        fetch('/api/archives')
            .then(res => res.json())
            .then(data => {
                renderArchives(data);
                
                // Check if any currently processing
                const needsPolling = data.some(a => a.status === 'processing');
                if (needsPolling) {
                    startPolling();
                } else {
                    stopPolling();
                }
            })
            .catch(err => console.error("Error fetching archives:", err));
    }

    function startPolling() {
        if (!pollInterval) {
            pollInterval = setInterval(fetchArchives, 2000);
        }
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function renderArchives(archives) {
        if (archives.length === 0) {
            archivesList.innerHTML = `<div class="text-center py-10 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-500 text-sm">No archives uploaded yet.</div>`;
            return;
        }

        let html = '';
        archives.forEach(arch => {
            const date = new Date(arch.uploadedAt).toLocaleString();
            const size = formatBytes(arch.size);
            
            let statusBadge = '';
            let actionHtml = '';

            if (arch.status === 'ready') {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Ready</span>`;
                actionHtml = `<a href="/view.html?id=${arch.id}" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">View Filter Tool</a>`;
            } else if (arch.status === 'processing') {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 animate-pulse">Processing...</span>`;
                actionHtml = `<button disabled class="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-400 bg-slate-50 cursor-not-allowed">Processing...</button>`;
            } else {
                statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title="${arch.error}">Error</span>`;
                actionHtml = `<button disabled class="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-400 bg-slate-50 cursor-not-allowed">Failed</button>`;
            }

            html += `
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between hover:shadow-md transition-shadow">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-1">
                        <h3 class="text-base font-bold text-slate-900 truncate" title="${arch.originalName}">${arch.originalName}</h3>
                        ${statusBadge}
                    </div>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span class="flex items-center gap-1"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> ${date}</span>
                        <span class="flex items-center gap-1"><svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg> ${size}</span>
                        ${arch.bannerCount !== undefined ? `<span class="flex items-center gap-1 font-medium text-slate-700 bg-slate-100 px-1.5 rounded"><svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg> ${arch.bannerCount} banners</span>` : ''}
                    </div>
                    ${arch.error ? `<div class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">${arch.error}</div>` : ''}
                </div>
                <div class="flex items-center gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
                    ${actionHtml}
                    <button onclick="deleteArchive('${arch.id}')" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete Archive">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
            `;
        });
        archivesList.innerHTML = html;
    }

    window.deleteArchive = function(id) {
        if (!confirm('Are you sure you want to delete this archive and all its extracted data?')) return;
        
        fetch('/api/archives/' + id, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => fetchArchives())
            .catch(err => console.error(err));
    }
});
