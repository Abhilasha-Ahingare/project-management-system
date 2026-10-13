import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import env from "./src/config/env.js";
import User from "./src/model/users/users.model.js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in apps/api/src/.env`);
  return value;
};

const createInitialAdmin = async () => {
  await mongoose.connect(env.mongodbUri);
  try {
    const adminEmail = required("ADMIN_EMAIL").toLowerCase();
    if (await User.exists({ role: "admin" })) {
      throw new Error("An administrator already exists; no data was changed.");
    }
    if (await User.exists({ email: adminEmail })) {
      throw new Error(
        "ADMIN_EMAIL already belongs to a user; no data was changed.",
      );
    }

    const admin = await User.create({
      name: process.env.ADMIN_NAME?.trim() || "ProjectHub Admin",
      email: adminEmail,
      password: await bcrypt.hash(required("ADMIN_PASSWORD"), 12),
      address: process.env.ADMIN_ADDRESS?.trim() || "",
      contactNumber: process.env.ADMIN_CONTACT?.trim() || "",
      role: "admin",
      designation: "Administrator",
      isActive: true,
      isEmailVerified: true,
    });
    console.info(`Initial administrator created: ${admin.email}`);
  } finally {
    await mongoose.disconnect();
  }
};

createInitialAdmin().catch((error) => {
  console.error("Admin-only seed failed:", error.message);
  process.exitCode = 1;
});
