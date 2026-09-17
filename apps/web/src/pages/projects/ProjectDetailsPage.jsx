import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  Pencil,
  PenTool,
  Trash2,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { projects, teams } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { Loading, Failed } from "../../components/ui/States";

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

const dateInputValue = (value) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSelector((state) => state.auth.user);
  const isAdmin = user?.role === "admin";
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.detail(projectId),
  });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: teams.list,
    enabled: project.isSuccess,
  });

  const edit = useMutation({
    mutationFn: () => {
      const payload = { ...form };
      if (!payload.teamId) payload.teamId = null;
      if (!payload.startDate) payload.startDate = null;
      if (!payload.endDate) payload.endDate = null;
      return projects.update(projectId, payload);
    },
    onSuccess: () => {
      setShowEdit(false);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated successfully.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to update project")),
  });

  const remove = useMutation({
    mutationFn: () => projects.remove(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted successfully.");
      navigate("/projects", { replace: true });
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete project")),
  });

  const openEdit = () => {
    const item = project.data;
    setForm({
      name: item.name || "",
      description: item.description || "",
      teamId: item.team?._id || item.team || "",
      status: item.status || "planning",
      priority: item.priority || "medium",
      startDate: dateInputValue(item.startDate),
      endDate: dateInputValue(item.endDate),
    });
    setShowEdit(true);
  };

  if (project.isLoading) return <Loading text="Loading project details..." />;
  if (project.isError) return <Failed retry={project.refetch} />;

  const item = project.data;
  const teamOptions = list(teamsQuery.data);
  const ownerId = item.owner?._id || item.owner;
  const canManage = isAdmin || ownerId === user?.id;

  return (
    <div className="stack">
      <Link className="back" to="/projects">
        <ArrowLeft size={16} />
        Back to projects
      </Link>

      <header className="surface project-hero">
        <small className="eyebrow">PROJECT DETAILS</small>
        <div className="page-head">
          <div>
            <h1>{item.name}</h1>
            <p>{item.description || "No description added yet."}</p>
          </div>
          <span className="badge">{item.status || "planning"}</span>
        </div>
      </header>

      <section className="surface project-details-panel">
        <div className="project-details-grid">
          <div>
            <small>Assigned team</small>
            <strong>{item.team?.name || "No team assigned"}</strong>
          </div>
          <div>
            <small>Priority</small>
            <strong>{item.priority || "medium"}</strong>
          </div>
          <div>
            <small>Owner</small>
            <strong>{item.owner?.name || "Unknown"}</strong>
          </div>
          <div>
            <small>Members</small>
            <strong>
              <Users size={15} /> {item.members?.length || 0}
            </strong>
            <span className="detail-member-names">
              {item.members?.length
                ? item.members
                    .map((member) => member.user?.name || member.user?.email)
                    .filter(Boolean)
                    .join(", ")
                : "No members assigned"}
            </span>
          </div>
          <div>
            <small>Team members</small>
            <span className="detail-member-names">
              {item.team?.members?.length
                ? item.team.members
                    .map((member) => member.user?.name || member.user?.email)
                    .filter(Boolean)
                    .join(", ")
                : "No team members assigned"}
            </span>
          </div>
          <div>
            <small>Dates</small>
            <strong>
              <CalendarRange size={15} />
              {item.startDate || item.endDate
                ? `${item.startDate ? new Date(item.startDate).toLocaleDateString() : "Start"} - ${item.endDate ? new Date(item.endDate).toLocaleDateString() : "Ongoing"}`
                : "Dates not set"}
            </strong>
          </div>
        </div>

        <div className="project-detail-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate(`/collaboration/${projectId}`)}
          >
            <PenTool size={16} />
            Open collaboration
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={openEdit}
            disabled={!canManage}
          >
            <Pencil size={16} />
            Edit project
          </button>
          <button
            className="button danger-button"
            type="button"
            onClick={() => remove.mutate()}
            disabled={!canManage || remove.isPending}
          >
            <Trash2 size={16} />
            {remove.isPending ? "Deleting..." : "Delete project"}
          </button>
        </div>
      </section>

      {showEdit && canManage && (
        <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
          <div
            className="modal-card surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <small className="eyebrow">PROJECT</small>
                <h2>Edit project</h2>
              </div>
              <button
                className="icon small-icon"
                type="button"
                onClick={() => setShowEdit(false)}
              >
                ×
              </button>
            </div>
            <form
              className="form-panel"
              onSubmit={(event) => {
                event.preventDefault();
                if (form.name.trim()) edit.mutate();
              }}
            >
              <input
                className="field"
                value={form.name}
                placeholder="Project name"
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
              <textarea
                className="field textarea"
                value={form.description}
                placeholder="Project description"
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              <select
                className="select"
                value={form.teamId}
                onChange={(event) =>
                  setForm({ ...form, teamId: event.target.value })
                }
              >
                <option value="">No team assigned</option>
                {teamOptions.map((team) => (
                  <option key={team._id || team.id} value={team._id || team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
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
                  onClick={() => setShowEdit(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!form.name.trim() || edit.isPending}
                >
                  {edit.isPending ? "Saving..." : "Save project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
