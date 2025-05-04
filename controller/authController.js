import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import catchAsync from "../utls/catchAsync.js";
import AppError from "../utls/appError.js";

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

export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password!", 400));
  }

  // 2) Check if user email exist in d
  // const user = await User.findOne({ email }).select("+password");

  // 2) Check if user email exists in any user model
  let user = await User.findOne({ email }).select("+password");
  // let userModel = "Partner"; // Track the user model for creating the token

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect email or password", 401));
  }

  // 3) If everything ok, send token to client
  //createToken function returns the response
  createSendToken(user, 200, req, res);
});

export const logout = (req, res) => {
  // set a cookie name = jwt, payload = loggedout, exprity = 10sec
  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: "success" });
};
