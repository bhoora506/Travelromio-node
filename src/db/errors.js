'use strict';

/**
 * src/db/errors.js
 *
 * Database-layer error abstractions.
 *
 * Purpose:
 *   Repositories catch raw Prisma errors and re-throw one of these typed
 *   errors so callers never see internal Prisma/MySQL details.
 *
 * HTTP translation (status codes, response bodies) is NOT done here.
 * That belongs to future controller/middleware layers.
 *
 * Prisma error code reference:
 *   P2002 — Unique constraint violation
 *   P2003 — Foreign key constraint violation
 *   P2025 — Record not found (expected to exist)
 *   P1001 — Database server unreachable
 */

// ── Base ─────────────────────────────────────────────────────────────────────

class DatabaseError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = cause || null;
  }
}

// ── Specific error types ─────────────────────────────────────────────────────

/**
 * Thrown when a queried record does not exist.
 * Wraps Prisma P2025 or explicit not-found conditions.
 */
class NotFoundError extends DatabaseError {
  constructor(entity, identifier) {
    super(`${entity} not found: ${identifier}`);
    this.name = 'NotFoundError';
    this.entity = entity;
    this.identifier = identifier;
  }
}

/**
 * Thrown when a unique constraint is violated.
 * Wraps Prisma P2002.
 */
class UniqueConstraintError extends DatabaseError {
  constructor(field, value, cause) {
    super(`Unique constraint violated on field '${field}' with value '${value}'`);
    this.name = 'UniqueConstraintError';
    this.field = field;
    this.value = value;
    this.cause = cause || null;
  }
}

/**
 * Thrown when a foreign key constraint is violated.
 * Wraps Prisma P2003.
 */
class ForeignKeyConstraintError extends DatabaseError {
  constructor(field, cause) {
    super(`Foreign key constraint violated on field '${field}'`);
    this.name = 'ForeignKeyConstraintError';
    this.field = field;
    this.cause = cause || null;
  }
}

// ── Normaliser ───────────────────────────────────────────────────────────────

/**
 * normaliseError(error)
 *
 * Takes a raw Prisma ClientKnownRequestError and converts it to a typed
 * DatabaseError subclass. Unknown errors are re-wrapped in a generic
 * DatabaseError so internal details do not leak.
 *
 * Usage inside repositories:
 *   try { ... } catch (err) { throw normaliseError(err); }
 *
 * @param {Error} error  The raw error caught from a Prisma call.
 * @returns {DatabaseError}
 */
function normaliseError(error) {
  if (error instanceof DatabaseError) {
    // Already normalised — do not double-wrap.
    return error;
  }

  const code = error.code;

  if (code === 'P2002') {
    // Unique constraint: Prisma includes the field in meta.target
    const field = (error.meta && error.meta.target)
      ? String(error.meta.target)
      : 'unknown';
    return new UniqueConstraintError(field, '', error);
  }

  if (code === 'P2003') {
    const field = (error.meta && error.meta.field_name)
      ? String(error.meta.field_name)
      : 'unknown';
    return new ForeignKeyConstraintError(field, error);
  }

  if (code === 'P2025') {
    return new NotFoundError('Record', 'unknown');
  }

  // Generic fallback — mask internal details
  return new DatabaseError('An unexpected database error occurred', error);
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  DatabaseError,
  NotFoundError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  normaliseError,
};
