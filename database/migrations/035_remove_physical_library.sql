-- 035_remove_physical_library.sql
-- Retire the School physical-book circulation feature while preserving VidyaSetu's digital Learning Library.
-- Historical migration 033 remains immutable. Notification enum values are intentionally retained because
-- PostgreSQL enum value removal is destructive and unnecessary once the application stops emitting them.

BEGIN;

DROP TABLE IF EXISTS library_loans CASCADE;
DROP TABLE IF EXISTS library_staff_access CASCADE;
DROP TABLE IF EXISTS library_book_copies CASCADE;
DROP TABLE IF EXISTS library_books CASCADE;

DROP TYPE IF EXISTS library_loan_status;
DROP TYPE IF EXISTS library_copy_status;

COMMIT;
