const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const isProduction = (process.env.NODE_ENV || "development") === "production";

  const response = {
    success: false,
    error: {
      message:
        statusCode === 500 && isProduction ? "Internal server error" : err.message,
    },
  };

  if (!isProduction) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { notFound, errorHandler };
