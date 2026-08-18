// Express 4 does not forward rejected promises from async route handlers to
// error middleware — an unhandled rejection there crashes the whole process
// (verified: a DB auth failure took the server down entirely). Wrap every
// async handler with this so errors flow to next() instead.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
