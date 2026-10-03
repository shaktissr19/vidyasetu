\set ON_ERROR_STOP on

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='parent_link_requests'
      AND column_name IN (
        'initiated_by',
        'requested_by_user_id',
        'student_confirmed_at',
        'parent_confirmed_at',
        'school_confirmed_at',
        'reviewed_by'
      ))=6
  AND (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='learning_source_intake'
      AND column_name IN ('licence_verified_at','imported_resource_id','category'))=3
  AND (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='learning_resources'
      AND column_name IN ('delivery_mode','rights_status','asset_id'))=3
  AND to_regclass('public.learning_content_assets') IS NOT NULL
  AND to_regclass('public.learning_content_pipeline_events') IS NOT NULL
  AND (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('learning_resources','learning_assessments')
      AND column_name='access_requirement')=2;
