-- 2026-11-07 管理端单词搜索改完全匹配：
-- 拼写不区分大小写精确匹配、中文释义精确匹配；两个分支都要能走索引，
-- 否则 OR 会退回全表扫（此前 LIKE '%...%' 每搜一次扫单词表两次）。
-- spelling_lower 是虚拟生成列（不占存储），lower(spelling) 的值只存在索引里；
-- chinese_def 直接建索引。建索引要读表，须等 D1 额度恢复后（2026-11-08 08:00）
-- 随 0009 一起跑（d1 migrations apply 会按顺序全跑）。
ALTER TABLE word ADD COLUMN spelling_lower TEXT GENERATED ALWAYS AS (lower(spelling)) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_word_spelling_lower ON word(spelling_lower);
CREATE INDEX IF NOT EXISTS idx_word_chinese_def ON word(chinese_def);
