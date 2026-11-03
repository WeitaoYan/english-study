-- 课本单词学习系统 · D1 schema
-- 所有时间均为 ISO-8601 UTC 字符串；业务展示时按 Asia/Shanghai 处理。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin')),
  nickname TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  parent_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS family (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS family_member (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT '孩子',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected')),
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (family_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS textbook (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  grade TEXT NOT NULL,
  semester TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  cover_color TEXT NOT NULL DEFAULT 'forest',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS unit (
  id TEXT PRIMARY KEY,
  textbook_id TEXT NOT NULL REFERENCES textbook(id) ON DELETE CASCADE,
  unit_no INTEGER NOT NULL,
  unit_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_unit_textbook ON unit(textbook_id, sort_order);

CREATE TABLE IF NOT EXISTS word (
  id TEXT PRIMARY KEY,
  spelling TEXT NOT NULL,
  phonetic TEXT,
  pos TEXT,
  chinese_def TEXT NOT NULL,
  english_def TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  data_source TEXT,
  has_image INTEGER NOT NULL DEFAULT 0,
  image_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  examples TEXT NOT NULL DEFAULT '[]',
  collocations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_word_spelling ON word(spelling);
CREATE INDEX IF NOT EXISTS idx_word_image ON word(has_image);

CREATE TABLE IF NOT EXISTS unit_word (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES unit(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE (unit_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_unit_word_unit ON unit_word(unit_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_unit_word_word ON unit_word(word_id);

CREATE TABLE IF NOT EXISTS word_image (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  r2_key TEXT,
  upload_method TEXT NOT NULL DEFAULT 'upload',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'replaced')),
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_word_image_word ON word_image(word_id, status);

CREATE TABLE IF NOT EXISTS word_audio (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  pronunciation_type TEXT NOT NULL DEFAULT 'us',
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS question_template (
  id TEXT PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL DEFAULT '{}',
  description TEXT
);

CREATE TABLE IF NOT EXISTS question (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  stem TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_question_word ON question(word_id, type);

CREATE TABLE IF NOT EXISTS practice_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  textbook_id TEXT REFERENCES textbook(id) ON DELETE SET NULL,
  unit_id TEXT REFERENCES unit(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'unit' CHECK (mode IN ('unit', 'review', 'word')),
  questions_json TEXT NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL,
  end_time TEXT,
  total_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_user ON practice_session(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_unit ON practice_session(unit_id);

CREATE TABLE IF NOT EXISTS practice_record (
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
CREATE INDEX IF NOT EXISTS idx_record_session ON practice_record(session_id);
CREATE INDEX IF NOT EXISTS idx_record_user_word ON practice_record(word_id, answered_at);
CREATE INDEX IF NOT EXISTS idx_record_time ON practice_record(answered_at);

CREATE TABLE IF NOT EXISTS word_mastery (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  strength INTEGER NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 5),
  next_review_time TEXT,
  last_review_time TEXT,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  consecutive_wrong INTEGER NOT NULL DEFAULT 0,
  accuracy REAL NOT NULL DEFAULT 0,
  is_weak INTEGER NOT NULL DEFAULT 0,
  recent_results TEXT NOT NULL DEFAULT '[]',
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_mastery_due ON word_mastery(user_id, next_review_time);
CREATE INDEX IF NOT EXISTS idx_mastery_weak ON word_mastery(user_id, is_weak);

CREATE TABLE IF NOT EXISTS incentive_rule (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'unit_complete', 'streak_days', 'daily_accuracy', 'weekly_wrong_lt', 'review_count'
  )),
  trigger_params TEXT NOT NULL DEFAULT '{}',
  reward_description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_rule_family ON incentive_rule(family_id, enabled);

CREATE TABLE IF NOT EXISTS incentive_event (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES incentive_rule(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_params TEXT NOT NULL DEFAULT '{}',
  reward_description TEXT NOT NULL,
  period_key TEXT NOT NULL,
  triggered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_confirm' CHECK (status IN (
    'pending_confirm', 'pending_redeem', 'redeemed', 'revoked'
  )),
  confirmed_at TEXT,
  redeemed_at TEXT,
  note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_once
  ON incentive_event(rule_id, student_user_id, period_key);
CREATE INDEX IF NOT EXISTS idx_event_family ON incentive_event(family_id, status, triggered_at);

CREATE TABLE IF NOT EXISTS parent_word_focus (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (parent_user_id, student_user_id, word_id)
);

INSERT OR IGNORE INTO question_template (id, type_name, config, description) VALUES
  ('qt-definition', 'definition_choice', '{"requires":["chinese_def"]}', '根据中文释义选择英文单词'),
  ('qt-letter', 'letter_fill', '{"min_length":3}', '给出部分字母，补全完整拼写'),
  ('qt-sentence', 'sentence_fill', '{"requires":["examples"]}', '从例句中挖空，填写正确单词'),
  ('qt-image', 'image_choice', '{"requires":["approved_image"]}', '根据图片选择对应单词'),
  ('qt-audio', 'audio_choice', '{"requires":["audio"]}', '播放发音后选择对应单词'),
  ('qt-collocation', 'collocation_choice', '{"requires":["collocations"]}', '选择正确的词组搭配');
