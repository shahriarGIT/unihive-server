import mongoose, { model } from "mongoose";
import validator from "validator";
import express from "express";

import app from "./app.js";
import server from "./app.js";

import dotenv from "dotenv";
dotenv.config();

mongoose
  .connect(
    process.env.DATABASE_URL.replace("<password>", process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
  )
  .then(() => console.log("MongoDB Connected..."))
  .catch((err) => console.log(err));

const userSchema = new mongoose.Schema(
  {
    name: String,
    contact: Number,
    email: {
      type: String,
      required: [true, "Please provide your email"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Please provide a valid email"],
    },
    role: {
      type: String,
      enum: ["user", "owner", "admin"],
      default: "user",
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: 3,
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, "Please confirm your password"],
      validate: {
        // This only works on CREATE and SAVE!!!
        validator: function (el) {
          return el === this.password;
        },
        message: "Passwords are not the same!",
      },
    },
    address: {
      city: String,
      area: String,
      house: String,
      road: String,
    },
    cart: [
      {
        restaurantId: String,
        orderType: {
          type: String,
          default: "delivery",
          enum: ["delivery", "pickup"],
        },
        subTotal: Number,
        total: Number,
        products: [
          {
            productName: String,
            productId: String,
            productPrice: Number,
            productQuantity: Number,
            reqOption: [
              {
                reqOptionName: String,
                reqOptionPrice: Number,
              },
            ],
            optOption: [
              {
                optOptionName: String,
                optOptionPrice: Number,
              },
            ],
          },
        ],
        cartCreatedAt: {
          type: Date,
          default: Date.now(),
          select: false,
        },
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now(),
      select: false,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const User = mongoose.model("User", userSchema);

app.get("/", async function (req, res, next) {
  console.log("Router Working");
  let id = "64af4111554ce53981aaf680";
  let currentUser = await User.findById(id).select("+password");
  console.log(currentUser);
  res.send(currentUser);
  res.end();
});

// const port = process.env.PORT;
// const serverInstance = server.listen(port, () => {
//   console.log(`App running on port ${port}...`);
// });
