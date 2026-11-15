-- 专项练习（家长触发）：家长给孩子建“套题”，固定一种题型、指定单元范围、
-- 每套默认 10 题；孩子每次开局从这些单元里随机抽词，只出这一种题型。
-- 套题本身只存配置（题型、单元 id 列表、题数），每次开局现抽现出，
-- 不预生成题目；答题记录仍走 practice_session / practice_record，
-- 家长报告按题型统计时自动包含专项练习的成绩。
CREATE TABLE IF NOT EXISTS special_practice (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question_type TEXT NOT NULL,
  unit_ids TEXT NOT NULL DEFAULT '[]',
  question_count INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_special_practice_student ON special_practice(student_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_special_practice_parent ON special_practice(parent_user_id, created_at);

-- practice_session 加 special 模式与 special_practice_id：
-- SQLite 改不了 CHECK 约束，只能重建表。practice_session 是小表
-- （学生练题会话），一次全量复制即可；special_practice_id 置空为 NULL。
CREATE TABLE IF NOT EXISTS practice_session_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  textbook_id TEXT REFERENCES textbook(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL,
  special_practice_id TEXT REFERENCES special_practice(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'unit' CHECK (mode IN ('unit', 'review', 'word', 'special')),
  questions_json TEXT NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL,
  end_time TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
INSERT INTO practice_session_new
  (id, user_id, textbook_id, unit_id, mode, questions_json, start_time, end_time, total_count, correct_count, duration_ms)
SELECT
  id, user_id, textbook_id, unit_id, mode, questions_json, start_time, end_time, total_count, correct_count, duration_ms
FROM practice_session;
DROP TABLE practice_session;
ALTER TABLE practice_session_new RENAME TO practice_session;
CREATE INDEX IF NOT EXISTS idx_session_user ON practice_session(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_unit ON practice_session(unit_id);
CREATE INDEX IF NOT EXISTS idx_session_special ON practice_session(special_practice_id);
