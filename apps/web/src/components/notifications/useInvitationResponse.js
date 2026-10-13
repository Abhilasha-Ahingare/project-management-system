import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { collaboration, invitations } from "../../api/resources.api";
import { apiMessage } from "../../api/client";

export default function useInvitationResponse({ onAccepted } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id || currentUser?._id;

  return useMutation({
    mutationFn: ({ id, decision }) => invitations.respond(id, decision),
    onSuccess: async (invitation, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      if (invitation?.targetType === "CollaborationProject") {
        queryClient.invalidateQueries({
          queryKey: ["collaboration-project", invitation.targetId],
        });
        queryClient.invalidateQueries({
          queryKey: ["collaboration-boards", invitation.targetId],
        });
      }
      toast.success(`Invitation ${variables.decision}.`);
      if (variables.decision === "accepted") {
        onAccepted?.();
        if (invitation?.targetType === "CollaborationProject") {
          try {
            const boards = await collaboration.boards(invitation.targetId);
            const activeBoard = boards.find((board) => board.activeSession);
            const targetBoard = activeBoard || boards[0];
            if (targetBoard) {
              const isAlreadyInMeeting =
                activeBoard?.activeSession?.participants?.some(
                  (participant) =>
                    String(idOf(participant)) === String(currentUserId),
                );
              if (isAlreadyInMeeting) {
                await collaboration.startSession(idOf(targetBoard), {
                  title:
                    activeBoard.activeSession.title || "Collaboration session",
                });
              }
              navigate(
                `/collaboration/${invitation.targetId}/${idOf(targetBoard)}`,
              );
            } else {
              navigate(`/collaboration/${invitation.targetId}`);
            }
          } catch (error) {
            toast.error(
              apiMessage(
                error,
                "Joined the project, but could not open its meeting",
              ),
            );
            navigate(`/collaboration/${invitation.targetId}`);
          }
        } else if (invitation?.targetType === "Collaboration") {
          try {
            const detail = await collaboration.detail(invitation.targetId);
            const board = detail.board;
            await collaboration.startSession(invitation.targetId, {
              title: "Collaboration session",
            });
            navigate(
              `/collaboration/${idOf(board.project)}/${invitation.targetId}`,
            );
          } catch (error) {
            toast.error(
              apiMessage(
                error,
                "Invitation accepted, but the board could not be opened",
              ),
            );
          }
        }
      }
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to respond to invitation")),
  });
}

const idOf = (value) => value?._id || value?.id || value;
