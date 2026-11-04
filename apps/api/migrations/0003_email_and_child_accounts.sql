-- 账号体系调整：学生可能没有手机号。
-- 家长用邮箱注册、在自己账号内直接创建孩子账号（无需手机号、无需绑定邀请）。
-- 因此 user.phone 改为可空、新增 user.email（可空、唯一，非空值不重复）。
--
-- SQLite 不能直接把 NOT NULL 列改成可空，改用建新表、拷数据、删旧表、改名的标准重建流程。
-- parent_id 在代码里只用于记录归属（邀请接受 / 管理端展示），重建时保留该列但不重建外键约束，
-- 其余指向 user(id) 的外键在重命名后仍指向新 user 表；执行前关闭外键检查，执行后恢复并校验。

PRAGMA foreign_keys = OFF;

CREATE TABLE user_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin')),
  nickname TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  parent_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO user_new (id, role, nickname, phone, email, password_hash, parent_id, enabled, created_at, updated_at)
  SELECT id, role, nickname, phone, NULL, password_hash, parent_id, enabled, created_at, updated_at
  FROM user;

DROP TABLE user;

ALTER TABLE user_new RENAME TO user;

PRAGMA foreign_keys = ON;
