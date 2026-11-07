-- 2026-11-07 D1 读额度打满的根因修复：
-- word_audio 表自 0001 建表起就没有 word_id 索引，而单词列表查询
-- （WORD_COLUMNS / ADMIN_WORD_COLUMNS）每个词都要用
-- (SELECT audio_url FROM word_audio WHERE word_id = w.id ...) 查一次录音，
-- 无索引时每次都是 1657 行全表扫：1 局 30 个词约 5 万行，
-- 一次加载整本课本几百个词可达 33 万行，24 小时内烧掉约 350 万行。
-- 建索引后每次查录音变索引直查（约 1 行），同类查询读量降 99% 以上。
-- 注意：建索引本身要读表，额度用完当天跑不了，须等 UTC 午夜
-- （北京时间次日 08:00）额度恢复后，或升级 Workers Paid 后再跑。
-- 同理受益：补录音脚本的 NOT IN (SELECT word_id FROM word_audio) 剩余统计。

CREATE INDEX IF NOT EXISTS idx_word_audio_word ON word_audio(word_id);
