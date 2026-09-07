-- Notite: o singura tabela pentru notitele de zi si cele durabile, plus index FTS5.
-- `rid` este rowid-ul stabil folosit de FTS5 (niciodata expus); `id` este uuid-ul public din URL.
CREATE TABLE notite (
  rid           INTEGER PRIMARY KEY,
  id            TEXT NOT NULL UNIQUE,
  owner         TEXT NOT NULL,
  tip           TEXT NOT NULL CHECK (tip IN ('zi', 'nota')),
  data_zi       TEXT CHECK (data_zi IS NULL OR data_zi GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  titlu         TEXT,
  corp          TEXT NOT NULL DEFAULT '',
  creat_la      TEXT NOT NULL,
  actualizat_la TEXT NOT NULL,
  CHECK ((tip = 'zi' AND data_zi IS NOT NULL) OR (tip = 'nota' AND data_zi IS NULL))
);

-- O singura notita de zi per owner si data.
CREATE UNIQUE INDEX idx_notite_owner_zi ON notite(owner, data_zi);
CREATE INDEX idx_notite_owner_tip_act ON notite(owner, tip, actualizat_la DESC);

-- Index full-text cu continut extern: textul ramane doar in `notite`.
-- remove_diacritics 2: "eticheta" gaseste "etichetă".
CREATE VIRTUAL TABLE notite_fts USING fts5(
  titlu, corp,
  content = 'notite',
  content_rowid = 'rid',
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Tiparul standard FTS5 pentru tabele cu continut extern.
CREATE TRIGGER notite_ai AFTER INSERT ON notite BEGIN
  INSERT INTO notite_fts(rowid, titlu, corp) VALUES (new.rid, new.titlu, new.corp);
END;

CREATE TRIGGER notite_ad AFTER DELETE ON notite BEGIN
  INSERT INTO notite_fts(notite_fts, rowid, titlu, corp) VALUES ('delete', old.rid, old.titlu, old.corp);
END;

CREATE TRIGGER notite_au AFTER UPDATE OF titlu, corp ON notite BEGIN
  INSERT INTO notite_fts(notite_fts, rowid, titlu, corp) VALUES ('delete', old.rid, old.titlu, old.corp);
  INSERT INTO notite_fts(rowid, titlu, corp) VALUES (new.rid, new.titlu, new.corp);
END;
