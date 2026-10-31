-- Editorial copy for public marketing pages is separate from governed learning content.
BEGIN;

CREATE TABLE IF NOT EXISTS public_page_content (
  page_slug TEXT PRIMARY KEY CHECK (page_slug ~ '^[a-z0-9-]{1,80}$'),
  published_content JSONB NOT NULL,
  draft_content JSONB,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

COMMENT ON TABLE public_page_content IS
  'Super Admin managed editorial content for public pages. Catalogue resources and private account data remain in their own services.';

COMMIT;
