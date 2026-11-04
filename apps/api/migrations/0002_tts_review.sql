-- 听音选词改用浏览器 TTS 发音：发音需管理员试听审核通过后才可出题。
-- 与图片审核对齐：word.tts_status 默认 pending，只有 approved 才会进入
-- audio_choice 出题池；rejected / pending 的单词仍可出其他题型。
-- 已有数据库执行本迁移即可获得新字段；新库由 0001 + 0002 顺序应用。

ALTER TABLE word ADD COLUMN tts_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (tts_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE word ADD COLUMN tts_review_note TEXT;
ALTER TABLE word ADD COLUMN tts_reviewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_word_tts ON word(tts_status);

UPDATE question_template
SET config = '{"requires":["tts_approved"]}',
    description = '播放 TTS 发音后选择对应单词（需管理员审核发音通过）'
WHERE type_name = 'audio_choice';
