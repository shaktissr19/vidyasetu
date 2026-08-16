/**
 * Simple limit/offset pagination helper.
 * Returns { limit, offset, page } from query params.
 * Default: page=1, limit=20, max limit=100
 */
function getPagination(query) {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build the meta object for paginated responses.
 */
function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

module.exports = { getPagination, paginationMeta };
