-- Create player_pub_match_stats table
-- This table stores player statistics from public matches fetched from Stratz API
-- Three types of data: recent matches (last 3 months), top 10 heroes by position, and top 10 heroes overall

CREATE TABLE player_pub_match_stats (
  id BIGSERIAL PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hero_id BIGINT NOT NULL,
  wins SMALLINT NOT NULL,
  losses SMALLINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RECENT_MATCH', 'TOP_10_HEROES_BY_POSITION', 'TOP_10_HEROES_OVERALL')),
  last_match_date_time TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX idx_player_pub_match_stats_player_id ON player_pub_match_stats(player_id);
CREATE INDEX idx_player_pub_match_stats_type ON player_pub_match_stats(type);

-- Optional: Create a composite index for common query patterns
CREATE INDEX idx_player_pub_match_stats_player_type ON player_pub_match_stats(player_id, type);
