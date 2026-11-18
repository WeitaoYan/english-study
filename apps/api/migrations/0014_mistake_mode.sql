-- 错词重练：practice_session.mode 增加 'mistake'（只练家长报告里
-- 每种题型错得最多的词，答对退出、答错重现）。
-- SQLite 改不了 CHECK 约束，只能重建 practice_session。但直接重建会删光
-- practice_record：practice_record.session_id 带 ON DELETE CASCADE，
-- DROP 父表时子表记录被级联删光——0013 就是这么丢了全部答题记录
-- （2026-11-16 事故）。PRAGMA foreign_keys=OFF 写进迁移文件也靠不住：
-- wrangler 执行时可能把各条语句拆到不同连接，实测本地 0014 第一版
-- （只有关外键）仍把记录清零。所以这里不用 PRAGMA 保命，改用
-- “先断子表外键、再重建父表、最后把子表外键接回去”的三段重建：
-- 每一步 DROP 的表在当时都不带级联外键指向，任何执行方式下都安全。
-- 第一段：重建 practice_record，去掉它对 practice_session 的外键
-- （只去掉这一条；对 question / word 的外键保留）。
-- practice_record 是叶子表，没有别的表引用它，DROP 它本身就是安全的。
CREATE TABLE IF NOT EXISTS practice_record_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT REFERENCES question(id) ON DELETE SET NULL,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  prompt TEXT,
  correct_answer TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL
);
INSERT INTO practice_record_new
  (id, session_id, question_id, word_id, question_type, prompt, correct_answer, user_answer, is_correct, duration, answered_at)
SELECT
  id, session_id, question_id, word_id, question_type, prompt, correct_answer, user_answer, is_correct, duration, answered_at
FROM practice_record;
DROP TABLE practice_record;
ALTER TABLE practice_record_new RENAME TO practice_record;
CREATE INDEX IF NOT EXISTS idx_record_session ON practice_record(session_id);
CREATE INDEX IF NOT EXISTS idx_record_user_word ON practice_record(word_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_record_time ON practice_record(answered_at);

-- 第二段：重建 practice_session，mode 的 CHECK 增加 'mistake'。
-- 此时没有任何外键指向它，DROP 安全；special_practice_id 一起复制。
CREATE TABLE IF NOT EXISTS practice_session_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  textbook_id TEXT REFERENCES textbook(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL,
  special_practice_id TEXT REFERENCES special_practice(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'unit' CHECK (mode IN ('unit', 'review', 'word', 'special', 'mistake')),
  questions_json TEXT NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL,
  end_time TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
INSERT INTO practice_session_new
  (id, user_id, textbook_id, unit_id, special_practice_id, mode, questions_json, start_time, end_time, total_count, correct_count, duration_ms)
SELECT
  id, user_id, textbook_id, unit_id, special_practice_id, mode, questions_json, start_time, end_time, total_count, correct_count, duration_ms
FROM practice_session;
DROP TABLE practice_session;
ALTER TABLE practice_session_new RENAME TO practice_session;
CREATE INDEX IF NOT EXISTS idx_session_user ON practice_session(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_unit ON practice_session(unit_id);
CREATE INDEX IF NOT EXISTS idx_session_special ON practice_session(special_practice_id);

-- 第三段：把 practice_record 的外键接回去（恢复成原来的定义，
-- session_id 仍带 ON DELETE CASCADE），practice_record 仍是叶子表，DROP 安全。
CREATE TABLE IF NOT EXISTS practice_record_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_session(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES question(id) ON DELETE SET NULL,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  prompt TEXT,
  correct_answer TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL
);
INSERT INTO practice_record_new
  (id, session_id, question_id, word_id, question_type, prompt, correct_answer, user_answer, is_correct, duration, answered_at)
SELECT
  id, session_id, question_id, word_id, question_type, prompt, correct_answer, user_answer, is_correct, duration, answered_at
FROM practice_record;
DROP TABLE practice_record;
ALTER TABLE practice_record_new RENAME TO practice_record;
CREATE INDEX IF NOT EXISTS idx_record_session ON practice_record(session_id);
CREATE INDEX IF NOT EXISTS idx_record_user_word ON practice_record(word_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_record_time ON practice_record(answered_at);
