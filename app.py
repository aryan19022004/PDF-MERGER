import os
import uuid
import base64
import json
from io import BytesIO
from flask import Flask, request, send_file, render_template, jsonify, session
from pypdf import PdfReader, PdfWriter
import fitz  # PyMuPDF

app = Flask(__name__)
app.secret_key = 'super-secret-pdf-key'  # Needed for session
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max limit

# Dictionary to hold active editing sessions temporarily in memory
EDIT_SESSIONS = {}

def parse_page_range(range_str, total_pages):
    """
    Parses a string like '1-3, 5, 7-9' into a list of 0-based page indices.
    If range_str is empty or None, returns all pages.
    """
    if not range_str or not str(range_str).strip():
        return list(range(total_pages))
    
    pages = set()
    parts = str(range_str).replace(' ', '').split(',')
    
    try:
        for part in parts:
            if not part:
                continue
            if '-' in part:
                start_str, end_str = part.split('-', 1)
                start = int(start_str) - 1
                end = int(end_str) - 1
                
                if start < 0 or end >= total_pages or start > end:
                    raise ValueError(f"Invalid range: {part}")
                
                pages.update(range(start, end + 1))
            else:
                page = int(part) - 1
                if page < 0 or page >= total_pages:
                    raise ValueError(f"Invalid page number: {part}")
                pages.add(page)
    except ValueError as e:
        raise ValueError(str(e))
        
    return sorted(list(pages))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    try:
        if 'pdf1' not in request.files or 'pdf2' not in request.files:
            return jsonify({'error': 'Both PDF files are required'}), 400
            
        file1 = request.files['pdf1']
        file2 = request.files['pdf2']
        
        if file1.filename == '' or file2.filename == '':
            return jsonify({'error': 'Both PDF files must be selected'}), 400
            
        if not (file1.filename.lower().endswith('.pdf') and file2.filename.lower().endswith('.pdf')):
            return jsonify({'error': 'Uploaded files must be PDFs'}), 400

        reader1 = PdfReader(file1)
        reader2 = PdfReader(file2)
        
        total_pages1 = len(reader1.pages)
        total_pages2 = len(reader2.pages)

        range1_str = request.form.get('range1', '')
        range2_str = request.form.get('range2', '')
        
        try:
            pages1 = parse_page_range(range1_str, total_pages1)
            pages2 = parse_page_range(range2_str, total_pages2)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        writer = PdfWriter()
        
        for p in pages1:
            writer.add_page(reader1.pages[p])
            
        for p in pages2:
            writer.add_page(reader2.pages[p])

        output_pdf = BytesIO()
        writer.write(output_pdf)
        output_pdf.seek(0)
        
        return send_file(
            output_pdf,
            mimetype='application/pdf',
            as_attachment=True,
            download_name='merged_output.pdf'
        )
        
    except Exception as e:
        return jsonify({'error': f"An error occurred: {str(e)}"}), 500

# ==========================================
# PDF EDITOR ROUTES (PHASE 2)
# ==========================================

@app.route('/api/upload_edit', methods=['POST'])
def upload_edit():
    """Uploads a PDF and creates a memory session."""
    if 'edit_pdf' not in request.files:
        return jsonify({'error': 'PDF file is required'}), 400
        
    file = request.files['edit_pdf']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    session_id = str(uuid.uuid4())
    pdf_bytes = file.read()
    
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
    except Exception as e:
        return jsonify({'error': 'Invalid PDF file'}), 400
        
    EDIT_SESSIONS[session_id] = {
        'bytes': pdf_bytes,
        'filename': file.filename,
        'doc': doc
    }
    
    return jsonify({
        'session_id': session_id,
        'total_pages': total_pages
    })

@app.route('/api/page_data/<session_id>/<int:page_num>')
def get_page_data(session_id, page_num):
    """Returns the background image and text blocks for a specific page."""
    if session_id not in EDIT_SESSIONS:
        return jsonify({'error': 'Session expired or invalid'}), 404
        
    doc = EDIT_SESSIONS[session_id]['doc']
    
    if page_num < 0 or page_num >= len(doc):
        return jsonify({'error': 'Invalid page number'}), 400
        
    page = doc[page_num]
    
    # 1. Render page to image for the canvas background
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # 2x zoom for better resolution
    img_data = pix.tobytes("png")
    img_base64 = base64.b64encode(img_data).decode('utf-8')
    
    # 2. Extract text blocks (words/lines) and their coordinates
    # words = page.get_text("words")  # format: [x0, y0, x1, y1, "word", block_no, line_no, word_no]
    dict_data = page.get_text("dict")
    text_blocks = []
    
    # Scale coordinates to match the HTML canvas space based on image vs original rect
    orig_rect = page.rect
    
    for block in dict_data.get("blocks", []):
        if block.get("type") == 0:  # Text block
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span.get("text", "").strip():
                        # Extract BBox: [x0, y0, x1, y1]
                        bbox = span["bbox"]
                        text_blocks.append({
                            'id': str(uuid.uuid4()),
                            'text': span["text"],
                            'bbox': bbox,
                            'font': span["font"],
                            'size': span["size"],
                            'color': span["color"],  # int representation
                            'flags': span["flags"]   # bold, italic, etc.
                        })
                        
    return jsonify({
        'image': f"data:image/png;base64,{img_base64}",
        'width': orig_rect.width,
        'height': orig_rect.height,
        'blocks': text_blocks
    })

@app.route('/api/save_edit', methods=['POST'])
def save_edit():
    """Applies changes from the frontend to the PDF document."""
    data = request.json
    session_id = data.get('session_id')
    page_num = data.get('page_num')
    edits = data.get('edits', []) # List of edited blocks
    deleted_blocks = data.get('deleted', []) # Original blocks that were modified
    
    if session_id not in EDIT_SESSIONS:
        return jsonify({'error': 'Session expired or invalid'}), 404
        
    doc = EDIT_SESSIONS[session_id]['doc']
    page = doc[page_num]
    
    # 1. Erase original text by drawing a white rectangle over the old bounds
    # This is not perfect text replacement but standard for overlaid PDF edits
    for del_bbox in deleted_blocks:
        rect = fitz.Rect(del_bbox)
        # Redact/erase
        page.add_redact_annot(rect, fill=(1, 1, 1)) 
        
    page.apply_redactions()
    
    # 2. Insert new text at specified coordinates
    for edit in edits:
        text = edit['text']
        bbox = edit['new_bbox'] # [x0, y0, x1, y1]
        fontname = edit.get('fontFamilly', 'helv') 
        fontsize = edit.get('fontSize', 12)
        
        # Parse hex color back to rgb floats
        color_hex = edit.get('color', '#000000').lstrip('#')
        try:
            r = int(color_hex[0:2], 16) / 255.0
            g = int(color_hex[2:4], 16) / 255.0
            b = int(color_hex[4:6], 16) / 255.0
            color_tuple = (r, g, b)
        except:
            color_tuple = (0, 0, 0)
            
        point = fitz.Point(bbox[0], bbox[3] - (fontsize * 0.2)) # Approximate bottom-left origin
        
        try:
            # We attempt to insert the text.
            # PyMuPDF usually requires built-in fonts (helv, cour, ti-ro) or path.
            # Map common font requests to builtins
            fitz_font = "helv"
            if "courier" in fontname.lower() or "mono" in fontname.lower():
                fitz_font = "cour"
            elif "times" in fontname.lower() or "serif" in fontname.lower():
                fitz_font = "ti-ro"
                
            page.insert_text(point, text, fontname=fitz_font, fontsize=fontsize, color=color_tuple)
        except Exception as e:
            print(f"Error inserting: {e}")
            
    # Save the current state in memory
    EDIT_SESSIONS[session_id]['doc'] = doc
    return jsonify({'success': True})

@app.route('/api/download_edit/<session_id>')
def download_edit(session_id):
    """Downloads the edited PDF."""
    if session_id not in EDIT_SESSIONS:
        return "Not found", 404
        
    doc = EDIT_SESSIONS[session_id]['doc']
    filename = EDIT_SESSIONS[session_id]['filename']
    
    out_pdf = BytesIO()
    doc.save(out_pdf, garbage=4, deflate=True)
    out_pdf.seek(0)
    
    # We can delete the session if we assume download = finish
    # del EDIT_SESSIONS[session_id]
    
    return send_file(
        out_pdf,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"edited_{filename}"
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)
