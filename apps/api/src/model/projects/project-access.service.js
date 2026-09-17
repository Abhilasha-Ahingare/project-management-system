import Project from "./project.model.js";
import Team from "../teams/team.model.js";
import User from "../users/users.model.js";
import ApiError from "../../utils/ApiError.js";
import { CollaborationBoard } from "../collaboration/collaboration.model.js";

export const getAccessibleProject = async (projectId, userId) => {
  const [project, actor] = await Promise.all([
    Project.findOne({ _id: projectId, isActive: true }),
    User.findById(userId).select("role isActive"),
  ]);
  if (!project || !actor?.isActive) {
    throw new ApiError(404, "Project not found");
  }

  const isDirectMember = project.members.some(
    (member) => member.user.toString() === userId,
  );
  const isAcceptedCollaborator = project.collaborators?.some(
    (collaborator) =>
      collaborator.user.toString() === userId &&
      collaborator.status === "accepted",
  );
  const isAssignedTeamMember = project.team
    ? await Team.exists({
        _id: project.team,
        isActive: true,
        $or: [{ lead: userId }, { "members.user": userId }],
      })
    : false;
  const isAcceptedBoardParticipant = await CollaborationBoard.exists({
    project: project._id,
    isActive: true,
    participants: {
      $elemMatch: { user: userId, status: "accepted" },
    },
  });
  const allowed =
    actor.role === "admin" ||
    project.owner.toString() === userId ||
    isDirectMember ||
    isAcceptedCollaborator ||
    isAssignedTeamMember ||
    Boolean(isAcceptedBoardParticipant);

  if (!allowed) throw new ApiError(403, "Project access required");
  return project;
};

export const hasAccessibleProject = async (projectId, userId) => {
  try {
    await getAccessibleProject(projectId, userId);
    return true;
  } catch {
    return false;
  }
};
