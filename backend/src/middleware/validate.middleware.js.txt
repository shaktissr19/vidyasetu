// middleware/validate.middleware.js
const R = require('../utils/response');

/**
 * Zod schema validation middleware factory.
 * Usage: validate(myZodSchema)  — validates req.body
 *        validate(schema, 'params') — validates req.params
 *        validate(schema, 'query')  — validates req.query
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return R.badRequest(res, 'Validation failed', errors);
    }
    req[source] = result.data; // replace with parsed (coerced) data
    next();
  };
}

module.exports = { validate };
