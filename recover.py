with open('old_index.html', 'r', encoding='utf-16le') as f:
    text = f.read()

import re
match = re.search(r'(?s)<!-- PDF Editor -->(.*?)<!-- JavaScript -->', text)
if match:
    editor_html = match.group(1).strip()
    with open('templates/edit.html', 'w', encoding='utf-8') as out:
        out.write("{% extends 'base.html' %}\n")
        out.write("{% block title %}Edit PDF{% endblock %}\n")
        out.write("{% block content %}\n")
        out.write("<div class=\"text-center mb-4\">\n")
        out.write("    <h1 class=\"text-gradient\">Edit PDF</h1>\n")
        out.write("    <p class=\"text-muted\">Add text, change styling, and manage pages directly in your browser.</p>\n")
        out.write("</div>\n")
        out.write(editor_html)
        out.write("\n{% endblock %}\n")
        out.write("{% block extra_scripts %}\n")
        out.write("<script src=\"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js\"></script>\n")
        out.write("<script src=\"https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js\"></script>\n")
        out.write("<script src=\"{{ url_for('static', filename='js/editor.js') }}\"></script>\n")
        out.write("{% endblock %}\n")
    print("Success")
else:
    print("Match not found")
