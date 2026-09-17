import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, FolderKanban } from "lucide-react";
import { projects } from "../../api/resources.api";
import { Loading, Failed, Empty } from "../../components/ui/States";
const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];
export default function TasksPage() {
  const projectsQuery = useQuery({
    queryKey: ["task-projects"],
    queryFn: projects.list,
  });
  if (projectsQuery.isLoading)
    return <Loading text="Loading your projects..." />;
  if (projectsQuery.isError)
    return <Failed retry={() => projectsQuery.refetch()} />;
  const data = list(projectsQuery.data);
  return (
    <div className="stack">
      <div>
        <small className="eyebrow">MY TASKS</small>
        <h1>Choose a project to get moving.</h1>
        <p className="muted">
          Open a project workspace for todos and team chat.
        </p>
      </div>
      {data.length ? (
        <div className="surface list">
          {data.map((project) => (
            <Link
              className="task-row"
              to={`/tasks/${project._id || project.id}`}
              key={project._id || project.id}
            >
              <FolderKanban size={19} />
              <div>
                <strong>{project.name}</strong>
                <p>{project.description || "No description added."}</p>
              </div>
              <span className="badge">{project.status || "ACTIVE"}</span>
              {(project.startDate || project.endDate) && (
                <small>
                  <CalendarDays size={14} />
                  {new Date(
                    project.endDate || project.startDate,
                  ).toLocaleDateString()}
                </small>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="No projects found"
          text="Projects available to you will appear here."
        />
      )}
    </div>
  );
}
