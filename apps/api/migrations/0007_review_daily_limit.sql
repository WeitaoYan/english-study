-- 家长可设置的孩子每日复习题数（默认 10）。
-- 只管复习模式的题数：每天 0 点重置，到量后当天不再开复习局；新词单元练习不受限。
ALTER TABLE family_member ADD COLUMN review_daily_limit INTEGER NOT NULL DEFAULT 10;
