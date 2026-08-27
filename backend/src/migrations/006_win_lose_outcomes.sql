-- Extends the bull/bear outcome override with a direct WIN/LOSE mode: instead of forcing
-- the market direction (which still depends on the user's chosen Up/Down to determine the
-- result), WIN/LOSE forces the settlement result itself regardless of what the user picked.

ALTER TYPE forced_outcome ADD VALUE 'WIN';
ALTER TYPE forced_outcome ADD VALUE 'LOSE';
