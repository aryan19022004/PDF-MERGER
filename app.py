import os
import uuid
import base64
import json
from io import BytesIO
import tempfile
import shutil
import zipfile
from flask import Flask, request, send_file, render_template, jsonify, session
from pypdf import PdfReader, PdfWriter
import fitz  # PyMuPDF
from PIL import Image
from pdf2docx import Converter as PDF2Docx
import pandas as pd
from pptx import Presentation
from pptx.util import Inches
import platform
import subprocess

# Note: comtypes is Windows only
try:
    import comtypes.client
except ImportError:
    pass

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
                
                start = max(0, start)
                end = min(total_pages - 1, end)
                
                if start <= end:
                    pages.update(range(start, end + 1))
            else:
                page = int(part) - 1
                if 0 <= page < total_pages:
                    pages.add(page)
    except ValueError as e:
        raise ValueError("Invalid range format. Use numbers, commas, and dashes.")
        
    return sorted(list(pages))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/merge')
def merge_page():
    return render_template('merge.html')

@app.route('/split')
def split_page():
    return render_template('split.html')

@app.route('/edit')
def edit_page():
    return render_template('edit.html')

@app.route('/pdf-to-excel')
def pdf_to_excel():
    return render_template('pdf_to_excel.html')

@app.route('/excel-to-pdf')
def excel_to_pdf():
    return render_template('excel_to_pdf.html')

@app.route('/pdf-to-word')
def pdf_to_word():
    return render_template('pdf_to_word.html')

@app.route('/word-to-pdf')
def word_to_pdf():
    return render_template('word_to_pdf.html')

@app.route('/pdf-to-ppt')
def pdf_to_ppt():
    return render_template('pdf_to_ppt.html')

@app.route('/ppt-to-pdf')
def ppt_to_pdf():
    return render_template('ppt_to_pdf.html')

@app.route('/jpg-to-pdf')
def jpg_to_pdf():
    return render_template('jpg_to_pdf.html')

@app.route('/pdf-to-jpg')
def pdf_to_jpg():
    return render_template('pdf_to_jpg.html')

# ==========================================
# TOOL ENDPOINTS 
# ==========================================

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    try:
        indices = []
        for key in request.files.keys():
            if key.startswith('pdf_'):
                try:
                    idx = int(key.split('_')[1])
                    indices.append(idx)
                except ValueError:
                    pass
                    
        indices.sort()
        
        if len(indices) < 2:
            return jsonify({'error': 'At least two PDF files are required'}), 400
            
        writer = PdfWriter()
        
        for idx in indices:
            file = request.files[f'pdf_{idx}']
            if file.filename == '':
                return jsonify({'error': 'All blocks must have a PDF file selected'}), 400
                
            if not file.filename.lower().endswith('.pdf'):
                return jsonify({'error': f'File {file.filename} is not a valid PDF'}), 400
                
            reader = PdfReader(file)
            total_pages = len(reader.pages)
            
            range_str = request.form.get(f'range_{idx}', '')
            
            try:
                pages = parse_page_range(range_str, total_pages)
            except ValueError as e:
                return jsonify({'error': f"Error in document {idx+1}: {str(e)}"}), 400
                
            for p in pages:
                if 0 <= p < total_pages:
                    writer.add_page(reader.pages[p])

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
# CONVERSION ROUTES (INDIVIDUAL)
# ==========================================

def serve_converted_files(outputs, zip_name):
    if not outputs:
        return jsonify({'error': 'No completed conversions to return'}), 400
    if len(outputs) == 1:
        out_io = BytesIO(outputs[0][1])
        return send_file(out_io, as_attachment=True, download_name=outputs[0][0])
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for fname, b_content in outputs:
            zipf.writestr(fname, b_content)
    zip_buffer.seek(0)
    return send_file(zip_buffer, mimetype="application/zip", as_attachment=True, download_name=zip_name)

@app.route('/api/convert/pdf-to-word', methods=['POST'])
def api_pdf_to_word():
    files = request.files.getlist('files')
    outputs = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for f in files:
            if not f.filename: continue
            pdf_path = os.path.join(tmpdir, f.filename)
            docx_name = os.path.splitext(f.filename)[0] + ".docx"
            docx_path = os.path.join(tmpdir, docx_name)
            f.save(pdf_path)
            try:
                cv = PDF2Docx(pdf_path)
                cv.convert(docx_path)
                cv.close()
                with open(docx_path, 'rb') as df:
                    outputs.append((docx_name, df.read()))
            except Exception as e:
                print(e)
    return serve_converted_files(outputs, "word_docs.zip")

@app.route('/api/convert/word-to-pdf', methods=['POST'])
def api_word_to_pdf():
    files = request.files.getlist('files')
    outputs = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for f in files:
            if not f.filename: continue
            docx_path = os.path.join(tmpdir, f.filename)
            pdf_name = os.path.splitext(f.filename)[0] + ".pdf"
            pdf_path = os.path.join(tmpdir, pdf_name)
            f.save(docx_path)
            try:
                # Need to use abspath for docx2pdf
                abs_in = os.path.abspath(docx_path)
                abs_out = os.path.abspath(pdf_path)
                
                if platform.system() == 'Windows':
                    from docx2pdf import convert as docx2pdf_convert
                    docx2pdf_convert(abs_in, abs_out)
                else:
                    subprocess.run(['libreoffice', '--headless', '--nologo', '--convert-to', 'pdf', '--outdir', tmpdir, abs_in], check=True)
                
                with open(abs_out, 'rb') as pf:
                    outputs.append((pdf_name, pf.read()))
            except Exception as e:
                print("Error converting Word to PDF:", e)
    return serve_converted_files(outputs, "converted_pdfs.zip")

@app.route('/api/convert/pdf-to-excel', methods=['POST'])
def api_pdf_to_excel():
    import pdfplumber
    files = request.files.getlist('files')
    outputs = []
    for f in files:
        if not f.filename: continue
        try:
            excel_name = os.path.splitext(f.filename)[0] + ".xlsx"
            out_io = BytesIO()
            with pdfplumber.open(f) as pdf:
                writer = pd.ExcelWriter(out_io, engine='openpyxl')
                for i, page in enumerate(pdf.pages):
                    table = page.extract_table()
                    if table:
                        df = pd.DataFrame(table[1:], columns=table[0])
                        df.to_excel(writer, sheet_name=f"Page_{i+1}", index=False)
                writer.close()
            outputs.append((excel_name, out_io.getvalue()))
        except Exception as e:
            print(e)
    return serve_converted_files(outputs, "excel_sheets.zip")

@app.route('/api/convert/excel-to-pdf', methods=['POST'])
def api_excel_to_pdf():
    # Simplistic conversion: Excel -> HTML -> text for PDF
    files = request.files.getlist('files')
    outputs = []
    for f in files:
        if not f.filename: continue
        try:
            pdf_name = os.path.splitext(f.filename)[0] + ".pdf"
            df = pd.read_excel(f)
            doc = fitz.open()
            page = doc.new_page()
            text = df.to_string()
            page.insert_text(fitz.Point(50, 50), text, fontsize=8)
            out_io = BytesIO()
            doc.save(out_io)
            outputs.append((pdf_name, out_io.getvalue()))
        except Exception as e:
            print(e)
    return serve_converted_files(outputs, "converted_pdfs.zip")

@app.route('/api/convert/pdf-to-ppt', methods=['POST'])
def api_pdf_to_ppt():
    files = request.files.getlist('files')
    outputs = []
    for f in files:
        if not f.filename: continue
        try:
            ppt_name = os.path.splitext(f.filename)[0] + ".pptx"
            prs = Presentation()
            blank_layout = prs.slide_layouts[6]
            pdf_bytes = f.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for page in doc:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img_stream = BytesIO(pix.tobytes("png"))
                slide = prs.slides.add_slide(blank_layout)
                slide.shapes.add_picture(img_stream, 0, 0, width=Inches(10))
            out_ppt = BytesIO()
            prs.save(out_ppt)
            outputs.append((ppt_name, out_ppt.getvalue()))
        except Exception as e:
            print(e)
    return serve_converted_files(outputs, "presentations.zip")

@app.route('/api/convert/ppt-to-pdf', methods=['POST'])
def api_ppt_to_pdf():
    files = request.files.getlist('files')
    outputs = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for f in files:
            if not f.filename: continue
            ppt_name = f.filename
            ppt_path = os.path.join(tmpdir, ppt_name)
            pdf_name = os.path.splitext(ppt_name)[0] + ".pdf"
            pdf_path = os.path.join(tmpdir, pdf_name)
            f.save(ppt_path)
            try:
                abs_in = os.path.abspath(ppt_path)
                abs_out = os.path.abspath(pdf_path)
                
                if platform.system() == 'Windows':
                    import comtypes.client
                    powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
                    # Headless presentation save
                    deck = powerpoint.Presentations.Open(abs_in, WithWindow=False)
                    deck.SaveAs(abs_out, 32) # 32 is ppSaveAsPDF
                    deck.Close()
                    powerpoint.Quit()
                else:
                    subprocess.run(['libreoffice', '--headless', '--nologo', '--convert-to', 'pdf', '--outdir', tmpdir, abs_in], check=True)
                
                with open(abs_out, 'rb') as pf:
                    outputs.append((pdf_name, pf.read()))
            except Exception as e:
                print("Error converting PPT to PDF:", e)
    return serve_converted_files(outputs, "converted_pdfs.zip")

@app.route('/api/convert/jpg-to-pdf', methods=['POST'])
def api_jpg_to_pdf():
    files = request.files.getlist('files')
    images = []
    for f in files:
        if f.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff')):
            try:
                img = Image.open(f).convert('RGB')
                images.append(img)
            except Exception as e:
                print(e)
    if not images:
        return jsonify({'error': 'No valid images found'}), 400
    out_pdf = BytesIO()
    images[0].save(out_pdf, format='PDF', save_all=True, append_images=images[1:])
    out_pdf.seek(0)
    return send_file(out_pdf, as_attachment=True, download_name='converted_images.pdf')

@app.route('/api/convert/pdf-to-jpg', methods=['POST'])
def api_pdf_to_jpg():
    files = request.files.getlist('files')
    outputs = []
    for f in files:
        if not f.filename: continue
        try:
            base_name = os.path.splitext(f.filename)[0]
            pdf_bytes = f.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            for i, page in enumerate(doc):
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                jpg_name = f"{base_name}_page_{i+1}.jpg"
                outputs.append((jpg_name, pix.tobytes("jpeg")))
        except Exception as e:
            print(e)
    return serve_converted_files(outputs, "extracted_images.zip")

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

@app.route('/api/get_pdf/<session_id>')
def get_pdf(session_id):
    """Returns the raw PDF bytes for PDF.js to render."""
    if session_id not in EDIT_SESSIONS:
        return jsonify({'error': 'Session expired or invalid'}), 404
        
    pdf_bytes = EDIT_SESSIONS[session_id]['bytes']
    return send_file(
        BytesIO(pdf_bytes),
        mimetype='application/pdf'
    )

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

@app.route('/api/reorder_pages', methods=['POST'])
def reorder_pages():
    data = request.json
    session_id = data.get('session_id')
    new_order = data.get('new_order', [])  # list of ints or "BLANK"
    
    if session_id not in EDIT_SESSIONS:
        return jsonify({'error': 'Session expired'}), 404
        
    doc = EDIT_SESSIONS[session_id]['doc']
    new_doc = fitz.open()
    
    for item in new_order:
        if item == 'BLANK':
            w, h = 595, 842
            if len(doc) > 0:
                rect = doc[0].rect
                w, h = rect.width, rect.height
            new_doc.new_page(width=w, height=h)
        else:
            idx = int(item)
            if 0 <= idx < len(doc):
                new_doc.insert_pdf(doc, from_page=idx, to_page=idx)
                
    EDIT_SESSIONS[session_id]['doc'] = new_doc
    
    out_pdf = BytesIO()
    new_doc.save(out_pdf, garbage=4, deflate=True)
    EDIT_SESSIONS[session_id]['bytes'] = out_pdf.getvalue()
    
    return jsonify({'success': True, 'total_pages': len(new_doc)})

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
