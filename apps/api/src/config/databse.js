import mongoose from "mongoose";
import env from "./env.js";

const connectDatabase = async () => {
  try {
    const connection = await mongoose.connect(env.mongodbUri);

    console.info("[ProjectHub DB] connected", {
      host: connection.connection.host,
    });
  } catch (error) {
    console.error("[ProjectHub DB] connection failed", {
      message: error.message,
    });
    process.exit(1);
  }
};

export default connectDatabase;
