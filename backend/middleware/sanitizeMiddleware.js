const sanitizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((sanitized, [key, nestedValue]) => {
      if (key.startsWith("$") || key.includes(".")) {
        return sanitized;
      }

      sanitized[key] = sanitizeValue(nestedValue);
      return sanitized;
    }, {});
  }

  return typeof value === "string" ? value.trim() : value;
};

const sanitizeRequest = (req, res, next) => {
  req.body = sanitizeValue(req.body);
  req.params = sanitizeValue(req.params);

  if (req.query && typeof req.query === "object") {
    Object.keys(req.query).forEach((key) => {
      if (key.startsWith("$") || key.includes(".")) {
        delete req.query[key];
        return;
      }

      req.query[key] = sanitizeValue(req.query[key]);
    });
  }

  next();
};

module.exports = sanitizeRequest;
