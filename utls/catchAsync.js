// This function is used to catch errors in async functions and pass them to the next
// middleware (error handling middleware) in Express.js applications. It helps to avoid
//  repetitive try-catch blocks in your route handlers.

export default (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next); //fn(req, res, next).catch(next); === .catch(next)
  };
};
