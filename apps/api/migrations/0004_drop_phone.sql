-- 手机号逻辑整体删除：项目仍在开发阶段、无用户数据，不保留手机号兼容。
-- 登录、注册、管理员创建账号全部只走邮箱；家长创建的孩子账号仍无邮箱、无直接登录。
-- user.phone 列直接丢弃（旧手机号账号不再可登录；邮箱账号的数据原样保留）。
-- 与 0003 同样的表重建流程：建新表、拷数据（不含 phone）、删旧表、改名。

PRAGMA foreign_keys = OFF;

CREATE TABLE user_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin')),
  nickname TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  parent_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO user_new (id, role, nickname, email, password_hash, parent_id, enabled, created_at, updated_at)
  SELECT id, role, nickname, email, password_hash, parent_id, enabled, created_at, updated_at
  FROM user;

DROP TABLE user;

ALTER TABLE user_new RENAME TO user;

PRAGMA foreign_keys = ON;
