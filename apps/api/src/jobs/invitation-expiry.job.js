import { expireInvitations } from "../model/notifications/invitation.service.js";

const EXPIRY_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const startInvitationExpiryJob = () => {
  const run = async () => {
    try {
      const result = await expireInvitations();
      if (result.expired) {
        console.info("[ProjectHub Job] invitations expired", result);
      }
    } catch (error) {
      console.error("[ProjectHub Job] invitation expiry failed", {
        message: error.message,
      });
    }
  };

  void run();
  return setInterval(run, EXPIRY_CHECK_INTERVAL_MS);
};
