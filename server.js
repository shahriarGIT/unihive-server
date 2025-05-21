import mongoose, { model } from "mongoose";

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

// const port = process.env.PORT;
// const serverInstance = server.listen(port, () => {
//   console.log(`App running on port ${port}...`);
// });
