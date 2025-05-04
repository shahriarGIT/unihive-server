import express from "express";
import * as authControlller from "../controller/authController.js";

const router = express.Router();

router.post("/signup", authControlller.signup);

export default router;
