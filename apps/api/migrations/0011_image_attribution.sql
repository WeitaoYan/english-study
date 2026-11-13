-- 图片署名：导入的开源图片（维基百科 / Openverse）须按 CC 协议署名，
-- 来源、授权、作者与现成署名行存在这里；人工上传的图片这几列为空。
ALTER TABLE word_image ADD COLUMN source TEXT;
ALTER TABLE word_image ADD COLUMN license TEXT;
ALTER TABLE word_image ADD COLUMN creator TEXT;
ALTER TABLE word_image ADD COLUMN attribution TEXT;
