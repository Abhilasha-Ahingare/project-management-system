import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { invitations, notifications } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { Loading, Failed, Empty } from "../../components/ui/States";
const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];
export default function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState([]);
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: notifications.list,
  });
  const pendingInvitations = useQuery({
    queryKey: ["invitations", "pending"],
    queryFn: invitations.list,
  });
  const mark = useMutation({
    mutationFn: notifications.readAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) =>
      toast.error(apiMessage(e, "Unable to update notifications")),
  });
  const respond = useMutation({
    mutationFn: ({ id, decision }) => invitations.respond(id, decision),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["invitations", "pending"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success(`Invitation ${variables.decision}.`);
      if (variables.decision === "accepted") {
        if (result?.targetType === "CollaborationProject") {
          navigate(`/collaboration/${result.targetId}`);
        } else if (result?.targetType === "Collaboration") {
          toast.info("Open the project collaboration area to join this board.");
        }
      }
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to respond to invitation")),
  });
  const removeSelected = useMutation({
    mutationFn: () =>
      Promise.all(selectedIds.map((id) => notifications.remove(id))),
    onSuccess: () => {
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Selected notifications deleted.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete notifications")),
  });
  const removeOne = useMutation({
    mutationFn: (id) => notifications.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification deleted.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete notification")),
  });
  const clearAll = useMutation({
    mutationFn: notifications.clear,
    onSuccess: () => {
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Your notifications cleared.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to clear notifications")),
  });
  if (query.isLoading) return <Loading text="Loading notifications..." />;
  if (query.isError) return <Failed retry={query.refetch} />;
  const data = list(query.data);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <small className="eyebrow">NOTIFICATIONS</small>
          <h1>Stay close to what changed.</h1>
        </div>
        <button
          className="button secondary"
          onClick={() => mark.mutate()}
          disabled={mark.isPending}
        >
          <CheckCheck size={17} />
          Mark all read
        </button>
        <button
          className="icon small-icon danger"
          type="button"
          title="Delete selected notifications"
          aria-label="Delete selected notifications"
          disabled={!selectedIds.length || removeSelected.isPending}
          onClick={() => removeSelected.mutate()}
        >
          <Trash2 size={16} />
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={!data.length || clearAll.isPending}
          onClick={() => clearAll.mutate()}
        >
          <Trash2 size={16} /> Clear my notifications
        </button>
      </div>
      {data.length ? (
        <div className="surface list notifications">
          {data.map((item) => (
            <article
              key={item._id || item.id}
              className={item.isRead ? "read" : ""}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item._id || item.id)}
                onChange={() =>
                  setSelectedIds((current) =>
                    current.includes(item._id || item.id)
                      ? current.filter((id) => id !== (item._id || item.id))
                      : [...current, item._id || item.id],
                  )
                }
                aria-label={`Select ${item.title}`}
              />
              <Bell size={18} />
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleString()
                    : "Recent"}
                </small>
              </div>
              <button
                className="icon small-icon danger notification-delete"
                type="button"
                title="Delete notification"
                aria-label={`Delete ${item.title}`}
                disabled={removeOne.isPending}
                onClick={() => removeOne.mutate(item._id || item.id)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No notifications"
          text="New assignments and updates will appear here."
        />
      )}
      {pendingInvitations.data?.length ? (
        <section>
          <small className="eyebrow">PENDING INVITATIONS</small>
          <h2>Choose where you want to work</h2>
          <div className="surface list">
            {pendingInvitations.data.map((invitation) => (
              <article key={invitation._id || invitation.id}>
                <div>
                  <strong>Join {invitation.targetName}</strong>
                  <p>
                    {invitation.targetType} invitation from{" "}
                    {invitation.invitedBy?.name || "an administrator"}.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate({
                      id: invitation._id || invitation.id,
                      decision: "accepted",
                    })
                  }
                >
                  <Check size={16} /> Accept
                </button>
                <button
                  className="button secondary"
                  disabled={respond.isPending}
                  onClick={() =>
                    respond.mutate({
                      id: invitation._id || invitation.id,
                      decision: "rejected",
                    })
                  }
                >
                  <X size={16} /> Reject
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
