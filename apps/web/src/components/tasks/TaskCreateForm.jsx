import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { CheckSquare } from "lucide-react";
import { toast } from "react-toastify";
import { members, projects, tasks } from "../../api/resources.api";
import { apiMessage } from "../../api/client";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];

export default function TaskCreateForm({ projectId }) {
  const queryClient = useQueryClient();
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const membersQuery = useQuery({
    queryKey: ["all-members"],
    queryFn: members.list,
    enabled: isAdmin,
  });
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.detail(projectId),
    enabled: !isAdmin,
  });
  const [form, setForm] = useState({
    title: "",
    description: "",
    assigneeId: "",
    priority: "medium",
    status: "todo",
    dueDate: "",
    tags: "",
  });

  const memberList = isAdmin
    ? list(membersQuery.data)
    : list(projectQuery.data?.members).map((entry) => entry.user || entry);

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        assigneeId: form.assigneeId || null,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };

      return tasks.create(projectId, payload);
    },
    onSuccess: () => {
      setForm({
        title: "",
        description: "",
        assigneeId: "",
        priority: "medium",
        status: "todo",
        dueDate: "",
        tags: "",
      });
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      toast.success("Task created successfully.");
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to create task")),
  });

  return (
    <form
      className="surface form-panel inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.title.trim()) create.mutate();
      }}
    >
      <input
        className="field"
        placeholder="Add a task title"
        value={form.title}
        onChange={(event) => setForm({ ...form, title: event.target.value })}
      />
      <input
        className="field"
        placeholder="Task description"
        value={form.description}
        onChange={(event) =>
          setForm({ ...form, description: event.target.value })
        }
      />
      <select
        className="select"
        value={form.assigneeId}
        onChange={(event) =>
          setForm({ ...form, assigneeId: event.target.value })
        }
      >
        <option value="">Unassigned</option>
        {memberList.map((member) => (
          <option key={member._id || member.id} value={member._id || member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={form.priority}
        onChange={(event) => setForm({ ...form, priority: event.target.value })}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <input
        className="field"
        type="date"
        value={form.dueDate}
        onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
      />
      <input
        className="field"
        placeholder="Tags: ui, backend"
        value={form.tags}
        onChange={(event) => setForm({ ...form, tags: event.target.value })}
      />
      <button
        className="button primary"
        disabled={!form.title.trim() || create.isPending}
      >
        <CheckSquare size={16} />
        {create.isPending ? "Adding..." : "Add task"}
      </button>
    </form>
  );
}
