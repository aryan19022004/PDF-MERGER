document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('excel-upload-zone');
    const fileInput = document.getElementById('excel-file-input');
    const formSection = document.getElementById('excel-form');
    const fileNameDisplay = document.getElementById('excel-file-name');
    const fileMetaDisplay = document.getElementById('excel-file-meta');
    const removeBtn = document.getElementById('remove-excel-file');
    const convertBtn = document.getElementById('convert-excel-btn');
    
    let currentWorkbook = null;
    let currentFile = null;

    // --- Upload Setup ---
    uploadZone.addEventListener('click', (e) => {
        if (!currentFile && e.target !== fileInput) fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    async function handleFileSelect(file) {
        const validExtensions = ['xlsx', 'xls', 'csv'];
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(ext)) {
            window.showToast?.('Please upload a valid Excel file (.xlsx, .xls) or CSV.', 'error');
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = file.name;
        
        // Show loading state for parser
        fileMetaDisplay.textContent = "Analyzing spreadsheet...";
        uploadZone.classList.add('hidden');
        formSection.classList.remove('hidden');
        convertBtn.disabled = true;

        try {
            await parseExcel(file);
        } catch (err) {
            window.showToast?.('Failed to read Excel file: ' + err.message, 'error');
            resetUpload();
        }
    }

    function resetUpload() {
        currentFile = null;
        currentWorkbook = null;
        fileInput.value = '';
        formSection.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    }

    removeBtn.addEventListener('click', resetUpload);

    // --- SheetJS Parsing ---
    function parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // Read workbook
                    currentWorkbook = XLSX.read(data, { type: 'array' });
                    
                    const sheetName = currentWorkbook.SheetNames[0];
                    const sheet = currentWorkbook.Sheets[sheetName];
                    const range = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");
                    
                    const totalCols = (range.e.c - range.s.c) + 1;
                    const totalRows = (range.e.r - range.s.r) + 1;
                    
                    fileMetaDisplay.textContent = `Found ${totalCols} columns and ${totalRows} rows in '${sheetName}'`;
                    convertBtn.disabled = false;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    // --- PDF Generation via jsPDF ---
    convertBtn.addEventListener('click', async () => {
        if (!currentWorkbook) return;

        const orientation = document.getElementById('pdf-orientation').value;
        const theme = document.getElementById('pdf-theme').value;

        const btnText = convertBtn.querySelector('.btn-text');
        const spinner = convertBtn.querySelector('.spinner');
        
        convertBtn.disabled = true;
        btnText.textContent = 'Rendering PDF...';
        spinner.classList.remove('hidden');

        // Allow UI to update before heavy JS freezing
        setTimeout(() => {
            try {
                // Initialize jsPDF
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({
                    orientation: orientation,
                    unit: 'mm',
                    format: 'a4'
                });

                // Grab the first sheet
                const sheetName = currentWorkbook.SheetNames[0];
                const sheet = currentWorkbook.Sheets[sheetName];
                
                // Convert sheet to JSON array of arrays
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
                
                if (jsonData.length === 0) {
                    throw new Error("Spreadsheet is empty!");
                }

                // Assume first row is headers
                const head = [jsonData[0]];
                const body = jsonData.slice(1);

                // Add Document Title
                doc.setFontSize(14);
                // doc.text(currentFile.name, 14, 15);
                
                // Draw autoTable
                doc.autoTable({
                    head: head,
                    body: body,
                    startY: 15,
                    theme: theme, // 'grid', 'striped', 'plain'
                    styles: {
                        fontSize: 9,
                        cellPadding: 3,
                        overflow: 'linebreak'
                    },
                    headStyles: {
                        fillColor: theme === 'striped' ? [99, 102, 241] : [240, 240, 240], // indigo if striped, grey if grid
                        textColor: theme === 'striped' ? 255 : 20,
                        fontStyle: 'bold',
                        lineWidth: theme === 'grid' ? 0.1 : 0
                    },
                    margin: { top: 15, right: 14, bottom: 15, left: 14 },
                    didDrawPage: function (data) {
                        // Header text on each page
                        doc.setFontSize(14);
                        doc.setTextColor(40);
                        doc.text(currentFile.name.replace(/\.[^/.]+$/, ""), data.settings.margin.left, 10);
                        
                        // Footnote on each page
                        const str = "Page " + doc.internal.getNumberOfPages();
                        doc.setFontSize(8);
                        const pageSize = doc.internal.pageSize;
                        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                        doc.text(str, data.settings.margin.left, pageHeight - 10);
                    }
                });

                // Trigger Instant Local Download
                const finalFileName = currentFile.name.replace(/\.[^/.]+$/, "") + ".pdf";
                doc.save(finalFileName);

                window.showToast?.('Success! Table perfectly rendered.', 'success');

            } catch (err) {
                console.error(err);
                window.showToast?.('Error rendering PDF: ' + err.message, 'error');
            } finally {
                convertBtn.disabled = false;
                btnText.textContent = 'Generate PDF Table';
                spinner.classList.add('hidden');
            }
        }, 100);
    });
});
