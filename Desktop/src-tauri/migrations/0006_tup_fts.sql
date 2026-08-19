-- 0006: Полнотекстовый поиск по ТУП (FTS5).
-- Индексируются: описания целей (learning_objectives), названия разделов и
-- тем Долгосрочного плана (tup_sections / tup_topics), задачи предмета
-- (tup_document_tasks). Метаданные (subject_id, классы, язык) хранятся
-- денормализованно для фильтрации результатов без JOIN.

CREATE VIRTUAL TABLE tup_fts USING fts5(
    text,
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    document_id UNINDEXED,
    subject_id UNINDEXED,
    target_grades UNINDEXED,
    language UNINDEXED,
    grade UNINDEXED,
    quarter_number UNINDEXED,
    tokenize = 'unicode61'
);

-- Обратное наполнение из существующих данных (миграция применяется один раз).
INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
SELECT o.description, 'objective', o.id, d.id, d.subject_id, d.target_grades, d.language, o.grade, NULL
FROM learning_objectives o JOIN tup_documents d ON d.id = o.document_id;

INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
SELECT s.name, 'section', s.id, d.id, d.subject_id, d.target_grades, d.language, q.grade, q.quarter_number
FROM tup_sections s
JOIN tup_quarters q ON q.id = s.quarter_id
JOIN tup_documents d ON d.id = q.document_id;

INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
SELECT t.name, 'topic', t.id, d.id, d.subject_id, d.target_grades, d.language, q.grade, q.quarter_number
FROM tup_topics t
JOIN tup_sections s ON s.id = t.section_id
JOIN tup_quarters q ON q.id = s.quarter_id
JOIN tup_documents d ON d.id = q.document_id;

INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
SELECT t.task_text, 'task', t.id, d.id, d.subject_id, d.target_grades, d.language, NULL, NULL
FROM tup_document_tasks t JOIN tup_documents d ON d.id = t.document_id;

-- Триггеры синхронизации: цели обучения.
CREATE TRIGGER tup_fts_objective_ai AFTER INSERT ON learning_objectives BEGIN
  INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
  SELECT new.description, 'objective', new.id, d.id, d.subject_id, d.target_grades, d.language, new.grade, NULL
  FROM tup_documents d WHERE d.id = new.document_id;
END;

CREATE TRIGGER tup_fts_objective_ad AFTER DELETE ON learning_objectives BEGIN
  DELETE FROM tup_fts WHERE entity_type = 'objective' AND entity_id = old.id;
END;

CREATE TRIGGER tup_fts_objective_au AFTER UPDATE OF description ON learning_objectives BEGIN
  UPDATE tup_fts SET text = new.description WHERE entity_type = 'objective' AND entity_id = new.id;
END;

-- Триггеры синхронизации: разделы Долгосрочного плана.
CREATE TRIGGER tup_fts_section_ai AFTER INSERT ON tup_sections BEGIN
  INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
  SELECT new.name, 'section', new.id, d.id, d.subject_id, d.target_grades, d.language, q.grade, q.quarter_number
  FROM tup_quarters q JOIN tup_documents d ON d.id = q.document_id
  WHERE q.id = new.quarter_id;
END;

CREATE TRIGGER tup_fts_section_ad AFTER DELETE ON tup_sections BEGIN
  DELETE FROM tup_fts WHERE entity_type = 'section' AND entity_id = old.id;
END;

CREATE TRIGGER tup_fts_section_au AFTER UPDATE OF name ON tup_sections BEGIN
  UPDATE tup_fts SET text = new.name WHERE entity_type = 'section' AND entity_id = new.id;
END;

-- Триггеры синхронизации: темы Долгосрочного плана.
CREATE TRIGGER tup_fts_topic_ai AFTER INSERT ON tup_topics BEGIN
  INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
  SELECT new.name, 'topic', new.id, d.id, d.subject_id, d.target_grades, d.language, q.grade, q.quarter_number
  FROM tup_sections s
  JOIN tup_quarters q ON q.id = s.quarter_id
  JOIN tup_documents d ON d.id = q.document_id
  WHERE s.id = new.section_id;
END;

CREATE TRIGGER tup_fts_topic_ad AFTER DELETE ON tup_topics BEGIN
  DELETE FROM tup_fts WHERE entity_type = 'topic' AND entity_id = old.id;
END;

CREATE TRIGGER tup_fts_topic_au AFTER UPDATE OF name ON tup_topics BEGIN
  UPDATE tup_fts SET text = new.name WHERE entity_type = 'topic' AND entity_id = new.id;
END;

-- Триггеры синхронизации: задачи предмета.
CREATE TRIGGER tup_fts_task_ai AFTER INSERT ON tup_document_tasks BEGIN
  INSERT INTO tup_fts(text, entity_type, entity_id, document_id, subject_id, target_grades, language, grade, quarter_number)
  SELECT new.task_text, 'task', new.id, d.id, d.subject_id, d.target_grades, d.language, NULL, NULL
  FROM tup_documents d WHERE d.id = new.document_id;
END;

CREATE TRIGGER tup_fts_task_ad AFTER DELETE ON tup_document_tasks BEGIN
  DELETE FROM tup_fts WHERE entity_type = 'task' AND entity_id = old.id;
END;

CREATE TRIGGER tup_fts_task_au AFTER UPDATE OF task_text ON tup_document_tasks BEGIN
  UPDATE tup_fts SET text = new.task_text WHERE entity_type = 'task' AND entity_id = new.id;
END;