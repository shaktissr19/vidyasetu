-- ============================================================
-- 015_realistic_demo_identities.sql
-- Human-friendly legacy usernames + realistic demo emails.
-- Safe/idempotent: preserves user-chosen usernames/emails.
-- ============================================================

-- Migration 014 used a UUID suffix as a collision-safe temporary backfill.
-- Replace only those machine-generated usernames with human-friendly names.
-- New registrations already use firstname.lastname with .2/.3 collision suffixes.
DO $$
DECLARE
  rec RECORD;
  base_name TEXT;
  candidate TEXT;
  suffix_num INTEGER;
  max_base_len INTEGER;
BEGIN
  FOR rec IN
    SELECT id, name
    FROM users
    WHERE username IS NULL
       OR username ~ '\.[0-9a-f]{32}$'
    ORDER BY created_at NULLS LAST, id
  LOOP
    base_name := TRIM(BOTH '.' FROM REGEXP_REPLACE(
      LOWER(COALESCE(NULLIF(BTRIM(rec.name), ''), 'user')),
      '[^a-z0-9]+', '.', 'g'
    ));

    IF base_name IS NULL OR base_name = '' THEN
      base_name := 'user';
    END IF;

    base_name := LEFT(base_name, 60);
    candidate := base_name;
    suffix_num := 2;

    WHILE EXISTS (
      SELECT 1
      FROM users u2
      WHERE u2.id <> rec.id
        AND LOWER(u2.username) = LOWER(candidate)
    ) LOOP
      max_base_len := GREATEST(1, 60 - LENGTH(suffix_num::TEXT) - 1);
      candidate := LEFT(base_name, max_base_len) || '.' || suffix_num::TEXT;
      suffix_num := suffix_num + 1;
    END LOOP;

    UPDATE users
    SET username = candidate,
        updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- Synthetic demo addresses for seeded identities. These are intentionally under
-- demo.vidyasetu.sbs so they look realistic in UI/testing without being mistaken
-- for personal email addresses. Existing non-null email values are never changed.
WITH demo_emails(id, email) AS (
  VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid, 'vidyasetu.admin@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'ramesh.kumar@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'sunita.sharma@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000010'::uuid, 'anil.verma@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000011'::uuid, 'priya.singh@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000012'::uuid, 'mohan.gupta@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000013'::uuid, 'kavita.yadav@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000020'::uuid, 'aarav.sharma@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000021'::uuid, 'priya.patel@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000022'::uuid, 'rohan.singh@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000023'::uuid, 'ananya.gupta@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000024'::uuid, 'arjun.kumar@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000025'::uuid, 'sakshi.verma@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000026'::uuid, 'vivek.yadav@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000027'::uuid, 'neha.mishra@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000028'::uuid, 'rahul.tiwari@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000029'::uuid, 'pooja.joshi@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000030'::uuid, 'amit.pandey@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000031'::uuid, 'divya.chauhan@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000040'::uuid, 'rajesh.sharma@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000041'::uuid, 'meena.patel@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000042'::uuid, 'suresh.singh@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000043'::uuid, 'lata.gupta@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000044'::uuid, 'deepak.kumar@demo.vidyasetu.sbs'),
    ('00000000-0000-0000-0000-000000000045'::uuid, 'asha.verma@demo.vidyasetu.sbs')
)
UPDATE users u
SET email = d.email,
    updated_at = NOW()
FROM demo_emails d
WHERE u.id = d.id
  AND u.email IS NULL;

-- Contract checks: no machine-generated username should remain for migrated
-- demo/legacy users, and username/email uniqueness remains case-insensitive.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE username ~ '\.[0-9a-f]{32}$') THEN
    RAISE EXCEPTION 'Legacy UUID-style usernames remain after migration 015';
  END IF;

  IF EXISTS (
    SELECT LOWER(username)
    FROM users
    GROUP BY LOWER(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate usernames detected after migration 015';
  END IF;

  IF EXISTS (
    SELECT LOWER(email)
    FROM users
    WHERE email IS NOT NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate emails detected after migration 015';
  END IF;
END $$;

COMMENT ON COLUMN users.username IS 'Human-friendly case-insensitive login name; defaults to firstname.lastname with .2/.3 suffixes only when required';
