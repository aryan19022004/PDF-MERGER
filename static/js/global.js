window.showToast = function(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    if (container.children.length > 5) {
        container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'var(--error, #EF4444)' : 'var(--success, #10B981)';
    
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-exclamation' : 'circle-check'}"></i> ${msg}`;
    
    toast.style.padding = '1rem 1.5rem';
    toast.style.background = bgColor;
    toast.style.color = 'white';
    toast.style.borderRadius = 'var(--radius-sm)';
    toast.style.boxShadow = 'var(--shadow-md)';
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.style.pointerEvents = 'auto';
    toast.style.fontWeight = '500';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '0.5rem';
    toast.style.marginTop = '0.5rem';
    
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
    }, 4700);
    
    setTimeout(() => toast.remove(), 5000);
};

window.setupDropzone = function(zoneId, inputId, onFilesAdded) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            onFilesAdded(e.dataTransfer.files);
        }
    });

    input.addEventListener('change', e => {
        if (e.target.files.length) {
            onFilesAdded(e.target.files);
        }
        input.value = '';
    });
};
