class AppError extends Error {
  constructor(message, statusCode) {
    console.log("from app");
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // *** we add this flag so that we tell this error is send by us, we dont want to send
    // other errors in production which might expose unwanted error information
    // error which will not have isOperational flag = true , means it is not sent from the developer
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
