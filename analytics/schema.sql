-- All timestamps are epoch MILLISECONDS, matching the frontend's Date.now() convention.
-- Array/object fields are JSON text.

-- Singleton: exactly one row, seeded on first connect from seed/campaign.json.
-- Supplies the entity being measured (name, url) and the tracked queries (search_intent).
CREATE TABLE IF NOT EXISTS campaigns (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    type               TEXT NOT NULL,
    type_label         TEXT NOT NULL,
    url                TEXT NOT NULL,
    description        TEXT NOT NULL,
    audience_json      TEXT NOT NULL,
    why_care           TEXT NOT NULL,
    problems_json      TEXT NOT NULL,
    search_intent_json TEXT NOT NULL,
    topics_json        TEXT NOT NULL,
    related_json       TEXT NOT NULL,
    avoid_json         TEXT NOT NULL,
    status             TEXT NOT NULL,
    started_at         INTEGER NOT NULL
);

-- One row per probe that actually measured something. A blocked or failed probe writes
-- nothing: missing data, never a zero.
CREATE TABLE IF NOT EXISTS visibility_samples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          INTEGER NOT NULL,
    campaign_id TEXT NOT NULL,
    query       TEXT NOT NULL,
    surface     TEXT NOT NULL,   -- reddit | search | ai
    presence    REAL NOT NULL,   -- 0..1
    position    INTEGER,         -- search rank, when applicable
    raw_json    TEXT
);
CREATE INDEX IF NOT EXISTS ix_vis_campaign_query_ts ON visibility_samples(campaign_id, query, ts);
CREATE INDEX IF NOT EXISTS ix_vis_surface_ts ON visibility_samples(campaign_id, surface, ts);
