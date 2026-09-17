import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import env from "./src/config/env.js";
import User from "./src/model/users/users.model.js";
import Team from "./src/model/teams/team.model.js";
import Project from "./src/model/projects/project.model.js";
import Task from "./src/model/tasks/task.model.js";
import Activity from "./src/model/activities/activity.model.js";
import Notification from "./src/model/notifications/notification.model.js";
import Invitation from "./src/model/notifications/invitation.model.js";
import {
  CollaborationActivity,
  CollaborationBoard,
  CollaborationSession,
} from "./src/model/collaboration/collaboration.model.js";
import Message from "./src/model/chat/chat.model.js";
import Session from "./src/model/auth/session.model.js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in apps/api/src/.env`);
  return value;
};

const resetToAdmin = async () => {
  await mongoose.connect(env.mongodbUri);
  const adminEmail = required("ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("ADMIN_PASSWORD");
  const adminName = process.env.ADMIN_NAME?.trim() || "ProjectHub Admin";
  const adminAddress = process.env.ADMIN_ADDRESS?.trim() || "";
  const adminContact = process.env.ADMIN_CONTACT?.trim() || "";
  const password = await bcrypt.hash(adminPassword, 12);

  await mongoose.connection.db
    .collection("organizations")
    .drop()
    .catch((error) => {
      if (error.codeName !== "NamespaceNotFound") throw error;
    });

  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    Activity.deleteMany({}),
    Notification.deleteMany({}),
    Invitation.deleteMany({}),
    CollaborationActivity.deleteMany({}),
    CollaborationBoard.deleteMany({}),
    CollaborationSession.deleteMany({}),
    Message.deleteMany({}),
    Session.deleteMany({}),
  ]);

  const admin = await User.create({
    name: adminName,
    email: adminEmail,
    password,
    address: adminAddress,
    contactNumber: adminContact,
    role: "admin",
    designation: "Administrator",
    isActive: true,
    isEmailVerified: true,
  });

  console.log(`Database reset complete. Created admin: ${adminEmail}`);
  await mongoose.disconnect();
};

resetToAdmin().catch(async (error) => {
  console.error("Admin-only seed failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
