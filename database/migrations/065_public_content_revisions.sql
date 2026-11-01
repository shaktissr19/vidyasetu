-- Keep a recoverable record of every published editorial version.
-- Restore operations create drafts; publishing remains an explicit action.
BEGIN;

CREATE TABLE IF NOT EXISTS public_content_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_slug TEXT NOT NULL CHECK (page_slug ~ '^[a-z0-9-]{1,80}$'),
  version INTEGER NOT NULL CHECK (version > 0),
  content JSONB NOT NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_slug, version)
);

CREATE INDEX IF NOT EXISTS idx_public_content_revisions_page_version
  ON public_content_revisions(page_slug, version DESC);

-- Preserve the currently live snapshot when this additive migration is applied.
INSERT INTO public_content_revisions(page_slug, version, content, published_by, published_at)
SELECT 'homepage', version, published_content, published_by, published_at
FROM public_homepage_content
WHERE singleton=TRUE
ON CONFLICT (page_slug, version) DO NOTHING;

INSERT INTO public_content_revisions(page_slug, version, content, published_by, published_at)
SELECT page_slug, version, published_content, published_by, published_at
FROM public_page_content
ON CONFLICT (page_slug, version) DO NOTHING;

COMMENT ON TABLE public_content_revisions IS
  'Immutable published snapshots for super-admin-managed public editorial pages. Restores are staged as drafts.';

COMMIT;
