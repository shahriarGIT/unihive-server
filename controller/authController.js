import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import catchAsync from "../utls/catchAsync.js";

const signToken = (id, firstname, organizationType, email) => {
  //jwt.sign(payload , Secret , expirity)
  return jwt.sign(
    { id, firstname, organizationType, email },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    }
  );
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(
    user._id,
    user.firstname,
    user.organizationType,
    user.email
  );

  /* -- cookie ------
      res.cookie('cookieName', 'cookieValue', {
        // Options
        maxAge: 3600000, // Cookie expiration time (in milliseconds)
        httpOnly: true, // Cookie accessible only by HTTP(S) requests
        secure: true, // Cookie sent only over HTTPS
        sameSite: 'strict', // Restrict cookie to same-site requests
      });
      */
  // httpOnly: true,
  // secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  // process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
  res.cookie("jwt", token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    sameSite: "none", // Set SameSite attribute to "None"
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  });

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

export const signup = async (req, res, next) => {
  const newUser = await User.create(req.body);

  //createToken function returns the response
  createSendToken(newUser, 201, req, res);
};
