-- TTS 发音审核已移除：听音题只放真人录音，没有录音的词不出听音题。
-- 删掉 0002 建的三列与索引；题型模板配置改回 requires audio。

DROP INDEX IF EXISTS idx_word_tts;
ALTER TABLE word DROP COLUMN tts_status;
ALTER TABLE word DROP COLUMN tts_review_note;
ALTER TABLE word DROP COLUMN tts_reviewed_at;

UPDATE question_template
SET config = '{"requires":["audio"]}',
    description = '播放真人录音后选择对应单词（须有录音文件）'
WHERE type_name = 'audio_choice';
