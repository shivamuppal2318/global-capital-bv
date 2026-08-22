-- The migration that added AiSettings.dataSources defaulted existing rows
-- to an empty array. Empty is taken literally by the assistant (an admin
-- who unticks every box gets no database access), so an install that
-- already had a Claude key configured silently lost all data access on
-- upgrade. Backfill those rows with the full source list — the state they
-- were effectively in before the column existed.
--
-- Safe to run once: at this point no admin has been able to express a
-- preference yet, so an empty list here can only mean the default.
UPDATE "AiSettings"
SET "dataSources" = ARRAY[
  'leads','follow-ups','meetings','whatsapp','email-campaigns',
  'team','employees','market-signals','documents'
]::TEXT[]
WHERE cardinality("dataSources") = 0;
