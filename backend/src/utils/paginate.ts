export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PaginationQuery {
  page?: unknown;
  limit?: unknown;
}

function parsedInteger(value: unknown): number {
  return Number.parseInt(String(value ?? ''), 10);
}

export function getPagination(query: PaginationQuery): ParsedPagination {
  const page = Math.max(1, parsedInteger(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parsedInteger(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}
