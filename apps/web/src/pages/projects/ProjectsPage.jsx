import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarRange,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { projects, teams } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { Loading, Failed, Empty } from "../../components/ui/States";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];

const emptyForm = {
  name: "",
  description: "",
  teamId: "",
  status: "planning",
  priority: "medium",
  startDate: "",
  endDate: "",
};

export default function ProjectsPage() {
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: projects.list,
  });
  const teamQuery = useQuery({
    queryKey: ["teams"],
    queryFn: teams.list,
  });
  const qc = useQueryClient();
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const openCreate = () => {
    setEditingProject(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (project) => {
    setEditingProject(project);
    setForm({
      name: project.name || "",
      description: project.description || "",
      teamId: project.team?._id || project.team || "",
      status: project.status || "planning",
      priority: project.priority || "medium",
      startDate: project.startDate
        ? new Date(project.startDate).toISOString().slice(0, 10)
        : "",
      endDate: project.endDate
        ? new Date(project.endDate).toISOString().slice(0, 10)
        : "",
    });
    setShowForm(true);
  };

  const saveProject = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.teamId) delete payload.teamId;
      if (!payload.startDate) {
        if (editingProject) payload.startDate = null;
        else delete payload.startDate;
      }
      if (!payload.endDate) {
        if (editingProject) payload.endDate = null;
        else delete payload.endDate;
      }
      if (editingProject)
        return projects.update(
          editingProject._id || editingProject.id,
          payload,
        );

      return projects.create(payload);
    },
    onSuccess: () => {
      setShowForm(false);
      setEditingProject(null);
      setForm(emptyForm);
      setMenuOpenId(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        editingProject
          ? "Project updated successfully."
          : "Project created successfully.",
      );
    },
    onError: (error) =>
      toast.error(
        apiMessage(
          error,
          editingProject
            ? "Unable to update project"
            : "Unable to create project",
        ),
      ),
  });

  const removeProject = useMutation({
    mutationFn: (projectId) => projects.remove(projectId),
    onSuccess: () => {
      setMenuOpenId(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted successfully.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete project")),
  });

  if (query.isLoading)
    return <Loading text="Loading projects..." />;
  if (query.isError)
    return <Failed retry={() => query.refetch()} />;

  const data = list(query.data);
  const teamOptions = list(teamQuery.data);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <small className="eyebrow">PROJECTS</small>
          <h1>A map of the work ahead.</h1>
          <p className="muted">
            Projects you own or have access to.
          </p>
        </div>
        {isAdmin && (
          <button
            className="button primary"
            onClick={openCreate}
            title="Create project"
          >
            <Plus size={16} />
            Create project
          </button>
        )}
      </div>

      {data.length ? (
        <div className="project-grid cards">
          {data.map((project) => (
            <article
              className="surface card project-card"
              key={project._id || project.id}
            >
              <div className="card-top-row">
                <div className="card-icon">
                  <FolderKanban size={18} />
                </div>
                <div className="menu-wrap">
                  <button
                    className="icon small-icon"
                    type="button"
                    aria-label="Project actions"
                    disabled={!isAdmin}
                    onClick={() => {
                      if (!isAdmin) return;
                      setMenuOpenId((current) =>
                        current === (project._id || project.id)
                          ? null
                          : project._id || project.id,
                      );
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {isAdmin && menuOpenId === (project._id || project.id) && (
                    <div className="menu-popover">
                      <button type="button" onClick={() => openEdit(project)}>
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          removeProject.mutate(project._id || project.id)
                        }
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <span className="badge project-badge">
                {project.status || "ACTIVE"}
              </span>
              <h3>{project.name}</h3>
              <p>{project.description || "No description added yet."}</p>

              <div className="meta-block">
                <small>
                  <CalendarRange size={14} />
                  {project.startDate || project.endDate
                    ? `${project.startDate ? new Date(project.startDate).toLocaleDateString() : "Start"} - ${project.endDate ? new Date(project.endDate).toLocaleDateString() : "Ongoing"}`
                    : "Dates not set"}
                </small>
                <small>Team: {project.team?.name || "Unassigned"}</small>
                <small>Priority: {project.priority || "medium"}</small>
              </div>

              <Link to={`/projects/${project._id || project.id}`}>
                Open project <ArrowUpRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No projects found"
          text="Projects created by the admin will appear here."
        />
      )}

      {showForm && isAdmin && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-card surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <small className="eyebrow">PROJECT</small>
                <h2>{editingProject ? "Edit project" : "Create project"}</h2>
              </div>
              <button
                className="icon small-icon"
                type="button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form
              className="form-panel"
              onSubmit={(event) => {
                event.preventDefault();
                if (!form.name.trim()) return;
                saveProject.mutate();
              }}
            >
              <input
                className="field"
                placeholder="Project name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />

              <textarea
                className="field textarea"
                placeholder="Project description"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />

              {teamOptions.length > 0 && (
                <select
                  className="select"
                  value={form.teamId}
                  onChange={(event) =>
                    setForm({ ...form, teamId: event.target.value })
                  }
                >
                  <option value="">No team assigned</option>
                  {teamOptions.map((team) => (
                    <option
                      key={team._id || team.id}
                      value={team._id || team.id}
                    >
                      {team.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="two-col-form">
                <select
                  className="select"
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on-hold">On hold</option>
                  <option value="completed">Completed</option>
                </select>

                <select
                  className="select"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="two-col-form">
                <input
                  className="field"
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm({ ...form, startDate: event.target.value })
                  }
                />
                <input
                  className="field"
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm({ ...form, endDate: event.target.value })
                  }
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!form.name.trim() || saveProject.isPending}
                >
                  {saveProject.isPending
                    ? editingProject
                      ? "Saving..."
                      : "Creating..."
                    : editingProject
                      ? "Save project"
                      : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
