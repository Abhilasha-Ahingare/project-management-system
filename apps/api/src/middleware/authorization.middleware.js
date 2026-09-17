import Team from "../model/teams/team.model.js";
import Project from "../model/projects/project.model.js";
import User from "../model/users/users.model.js";
import ApiError from "../utils/ApiError.js";

export const requireSystemAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role isActive");

    if (!user || !user.isActive) {
      throw new ApiError(403, "Active user account required");
    }

    if (user.role !== "admin") {
      throw new ApiError(403, "Administrator access required");
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has specific role in team
 */
export const requireTeamRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.id;

      if (!teamId) {
        throw new ApiError(400, "Team ID required");
      }

      const team = await Team.findById(teamId);

      if (!team) {
        throw new ApiError(404, "Team not found");
      }

      // Check if user is lead
      if (team.lead.toString() === userId) {
        req.userTeamRole = "lead";
        return next();
      }

      // Check member roles
      const memberRecord = team.members.find(
        (m) => m.user.toString() === userId,
      );

      if (!memberRecord) {
        throw new ApiError(403, "You are not a member of this team");
      }

      if (!allowedRoles.includes(memberRecord.role)) {
        throw new ApiError(
          403,
          `This action requires one of: ${allowedRoles.join(", ")}`,
        );
      }

      req.userTeamRole = memberRecord.role;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has specific role in project
 */
export const requireProjectRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;

      if (!projectId) {
        throw new ApiError(400, "Project ID required");
      }

      const project = await Project.findById(projectId);

      if (!project) {
        throw new ApiError(404, "Project not found");
      }

      // Check if user is owner
      if (project.owner.toString() === userId) {
        req.userProjectRole = "owner";
        return next();
      }

      // Check member roles
      const memberRecord = project.members.find(
        (m) => m.user.toString() === userId,
      );

      if (!memberRecord) {
        throw new ApiError(403, "You are not a member of this project");
      }

      if (!allowedRoles.includes(memberRecord.role)) {
        throw new ApiError(
          403,
          `This action requires one of: ${allowedRoles.join(", ")}`,
        );
      }

      req.userProjectRole = memberRecord.role;
      next();
    } catch (error) {
      next(error);
    }
  };
};
