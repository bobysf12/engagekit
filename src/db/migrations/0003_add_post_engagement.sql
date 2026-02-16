ALTER TABLE posts ADD COLUMN engaged integer NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN engaged_at integer;
ALTER TABLE posts ADD COLUMN engaged_by text;
CREATE INDEX posts_engaged_idx ON posts(engaged, last_seen_at DESC);
