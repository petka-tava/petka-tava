-- Structured Talmud Bavli location (ref_id is the masechet; daf number; amud a|b; source label). Additive and backward compatible.
ALTER TABLE chiddushim ADD COLUMN daf INTEGER;
ALTER TABLE chiddushim ADD COLUMN amud TEXT;
ALTER TABLE chiddushim ADD COLUMN source TEXT;
CREATE INDEX IF NOT EXISTS chid_loc ON chiddushim(ref_id, daf, amud, status);
-- Backfill the existing published chiddush "מסכת מנחות דף ב עמוד ב" (parsed by the same rules as new input).
UPDATE chiddushim SET ref_id='Menachot', daf=2, amud='b', source='gemara' WHERE id='74690fda-f963-49cf-bb78-489fedd2f0a4' AND ref_id IS NULL;
