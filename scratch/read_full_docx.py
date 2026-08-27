import sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
docx_path = Path(r"e:\Projects\VectorWorkspace\Materials\Генератор Школьного Расписания в Казахстане.docx")

with zipfile.ZipFile(docx_path) as z:
    xml_content = z.read('word/document.xml')
    tree = ET.fromstring(xml_content)
    # Find all paragraph tags
    paragraphs = tree.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p')
    for i, p in enumerate(paragraphs[:71]):
        texts = p.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
        full_p = "".join([t.text for t in texts if t.text])
        if full_p.strip():
            print(f"[{i}] {full_p}")
