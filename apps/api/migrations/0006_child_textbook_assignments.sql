-- 家长给孩子指定课本：孩子只能看到被指定的课本。
-- 学生端课本列表、课本/单元详情、开局与复习均按该表过滤，未指定的直接拒绝。
CREATE TABLE IF NOT EXISTS child_textbook (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  textbook_id TEXT NOT NULL REFERENCES textbook(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL,
  UNIQUE (parent_user_id, student_user_id, textbook_id)
);
CREATE INDEX IF NOT EXISTS idx_child_textbook_student ON child_textbook(student_user_id);
CREATE INDEX IF NOT EXISTS idx_child_textbook_textbook ON child_textbook(textbook_id);
