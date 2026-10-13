import { Check, X } from "lucide-react";

export default function InvitationActions({
  invitationId,
  onRespond,
  disabled,
}) {
  return (
    <div className="notification-invitation-actions">
      <button
        className="button primary"
        type="button"
        disabled={disabled}
        onClick={() => onRespond(invitationId, "accepted")}
      >
        <Check size={15} /> Accept
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={disabled}
        onClick={() => onRespond(invitationId, "rejected")}
      >
        <X size={15} /> Reject
      </button>
    </div>
  );
}
