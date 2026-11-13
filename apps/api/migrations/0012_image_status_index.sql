-- 图片审核列表按状态查（status='pending' ORDER BY created_at DESC LIMIT 200），
-- 原先无可用索引、全表扫；导入后表到 1200+ 行，每翻一页审核列表都扫全表。
-- 复合索引同时覆盖 status 过滤与 created_at 排序。
-- 注意：按词取图（word_id + status）早已有 idx_word_image_word（0001 建表时建的），
-- 本次只补状态维度的索引。
CREATE INDEX IF NOT EXISTS idx_word_image_status_created ON word_image(status, created_at);
