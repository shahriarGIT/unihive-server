import express from "express";
import * as authControlller from "../controller/authController.js";

const router = express.Router();

router.post("/signup", authControlller.signup);
router.post("/login", authControlller.login);

export default router;
