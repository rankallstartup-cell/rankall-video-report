-- rerun-safe: each UPDATE only touches rows that still contain a leak marker
-- (or trailing whitespace); after the first run none match, so re-running is a no-op.
-- Backfill: strip leaked prompt scaffolding from generated_fixes content.
-- Truncates at the first occurrence of any known leak marker.

UPDATE generated_fixes
SET generated_content = LEFT(generated_content, POSITION('MARKET CONTEXT:' IN generated_content) - 1),
    updated_at = now()
WHERE generated_content LIKE '%MARKET CONTEXT:%';

UPDATE generated_fixes
SET generated_content = LEFT(generated_content, POSITION('BUSINESS CONTEXT:' IN generated_content) - 1),
    updated_at = now()
WHERE generated_content LIKE '%BUSINESS CONTEXT:%';

UPDATE generated_fixes
SET generated_content = LEFT(generated_content, POSITION('CRITICAL RULES:' IN generated_content) - 1),
    updated_at = now()
WHERE generated_content LIKE '%CRITICAL RULES:%';

-- Trim trailing whitespace left after truncation
UPDATE generated_fixes
SET generated_content = RTRIM(generated_content)
WHERE generated_content <> RTRIM(generated_content);
