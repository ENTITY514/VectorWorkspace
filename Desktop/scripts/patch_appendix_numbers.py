import sqlite3
import json
import os
import sys

# Скрипт для безопасного обновления appendix_number в базе данных.
# Используется вместо `import_tup_html --reimport`, чтобы избежать ошибки 
# `FOREIGN KEY constraint failed` (ON DELETE RESTRICT), когда в БД уже есть КТП-планы.
#
# Использование:
# python patch_appendix_numbers.py <путь_к_ru_json> <путь_к_kz_json> <путь_к_бд>
#
# Пример:
# python patch_appendix_numbers.py ../Materials/tup_ru_new.json ../Materials/tup_kz_new.json %APPDATA%/com.teacher.vectorworkspace/vector.db

def update_db(json_file, cur):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        for doc in data['documents']:
            cur.execute('''
                UPDATE tup_documents 
                SET appendix_number = ? 
                WHERE subject_id = ? AND target_grades = ? AND direction = ? AND language = ?
            ''', (
                doc['appendix_number'],
                doc['subject_id'],
                doc['target_grades'],
                doc['direction'],
                doc['language']
            ))

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python patch_appendix_numbers.py <ru_json> <kz_json> <db_path>")
        sys.exit(1)
        
    ru_json = sys.argv[1]
    kz_json = sys.argv[2]
    db_path = os.path.expandvars(sys.argv[3])
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print(f"Обновление БД: {db_path}...")
    update_db(ru_json, cur)
    update_db(kz_json, cur)
    
    conn.commit()
    conn.close()
    print("Обновление завершено!")
