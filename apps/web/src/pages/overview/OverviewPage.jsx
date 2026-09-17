import { useQueries, useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import {
  Activity,
  CalendarClock,
  FolderKanban,
  Users,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  projects,
  teams,
  tasks,
  activities,
  members,
} from "../../api/resources.api";
import { Loading, Failed, Empty } from "../../components/ui/States";
const items = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];
export default function OverviewPage() {
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const summary = useQuery({
    queryKey: ["task-summary"],
    queryFn: tasks.summary,
  });
  const feed = useQuery({ queryKey: ["activity"], queryFn: activities.mine });
  const projectQuery = useQuery({ queryKey: ["projects"], queryFn: projects.list });
  const teamQuery = useQuery({ queryKey: ["teams"], queryFn: teams.list });
  const reportQuery = useQuery({ queryKey: ["task-report"], queryFn: tasks.report });
  const membersOverview = useQuery({
    queryKey: ["members", "overview"],
    queryFn: members.list,
    enabled: isAdmin,
  });
  const allProjects = items(projectQuery.data);
  const allTeams = items(teamQuery.data);
  const collaborators = [
    ...new Map(
      allProjects
        .flatMap((project) =>
          (project.collaborators || [])
            .filter((collaborator) => collaborator.status === "accepted")
            .map((collaborator) => collaborator.user || collaborator),
        )
        .map((collaborator) => [
          String(collaborator._id || collaborator.id || collaborator),
          collaborator,
        ]),
    ).values(),
  ];
  const reports = [reportQuery.data || {}];
  const allMembers = membersOverview.data;
  const memberCount = items(allMembers).length;
  const report = reports.reduce(
    (total, item) => ({
      total: total.total + (item.total || 0),
      todo: total.todo + (item.todo || 0),
      inProgress: total.inProgress + (item.inProgress || 0),
      review: total.review + (item.review || 0),
      completed: total.completed + (item.completed || 0),
      overdue: total.overdue + (item.overdue || 0),
    }),
    { total: 0, todo: 0, inProgress: 0, review: 0, completed: 0, overdue: 0 },
  );
  const activityItems = items(feed.data);
  const chart = [
    {
      label: "Projects",
      value: activityItems.filter((item) => item.entityType === "Project")
        .length,
      color: "bg-teal-600",
    },
    {
      label: "Teams",
      value: activityItems.filter((item) => item.entityType === "Team").length,
      color: "bg-cyan-500",
    },
    {
      label: "Members",
      value: activityItems.filter((item) => item.action === "assigned").length,
      color: "bg-amber-500",
    },
    {
      label: "Tasks",
      value: activityItems.filter((item) => item.entityType === "Task").length,
      color: "bg-orange-500",
    },
  ];
  const chartMax = Math.max(...chart.map((item) => item.value), 1);
  const loading =
    projectQuery.isLoading || teamQuery.isLoading || membersOverview.isLoading;
  if (loading) return <Loading text="Loading your workspace..." />;
  if (projectQuery.isError || teamQuery.isError)
    return <Failed retry={() => projectQuery.refetch()} />;
  return (
    <div className="stack overview-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <small className="eyebrow">OVERVIEW</small>
          <h1>Good work starts with a clear view.</h1>
          <p className="muted">
            Your workspace, projects, and next actions in one place.
          </p>
        </div>
        <div className="rounded-xl bg-[#e6f3f0] px-4 py-3 text-sm font-semibold text-[#0e8178]">
          Live workspace data
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Users, "Members", memberCount, "bg-[#e5f4f1]"],
          [UsersRound, "Teams", allTeams.length, "bg-[#e9f2fb]"],
          [FolderKanban, "Projects", allProjects.length, "bg-[#fff0e7]"],
          [UserPlus, "Collaborators", collaborators.length, "bg-[#f2edff]"],
        ].map(([Icon, label, value, color]) => (
          <div
            className="surface flex min-h-[142px] flex-col justify-between rounded-2xl p-5 shadow-sm"
            key={label}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}
            >
              <Icon size={19} />
            </div>
            <small className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {label}
            </small>
            <strong className="text-3xl font-bold text-slate-900">
              {value}
            </strong>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="surface rounded-2xl p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <small className="eyebrow">ACTIVITY PULSE</small>
              <h2 className="mb-0">Workspace momentum</h2>
            </div>
            <Activity className="text-[#0e8178]" size={20} />
          </div>
          <div className="flex h-56 items-end gap-5 border-b border-slate-100 px-2 pb-0">
            {chart.map((item) => (
              <div
                className="flex h-full flex-1 flex-col items-center justify-end gap-3"
                key={item.label}
              >
                <span className="text-sm font-bold text-slate-700">
                  {item.value}
                </span>
                <div
                  className={`w-full max-w-16 rounded-t-xl ${item.color}`}
                  style={{
                    height: `${Math.max((item.value / chartMax) * 78, 8)}%`,
                  }}
                />
                <small className="pb-3 text-xs font-semibold text-slate-500">
                  {item.label}
                </small>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div>
              <strong>{report.todo}</strong>
              <small className="block text-xs text-slate-500">Todo</small>
            </div>
            <div>
              <strong>{report.inProgress}</strong>
              <small className="block text-xs text-slate-500">
                In progress
              </small>
            </div>
            <div>
              <strong>{report.completed}</strong>
              <small className="block text-xs text-slate-500">Completed</small>
            </div>
          </div>
        </section>
        <section className="surface rounded-2xl p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <CalendarClock className="text-[#ef8b64]" size={19} />
            <div>
              <small className="eyebrow">UP NEXT</small>
              <h2 className="mb-0">Due soon</h2>
            </div>
          </div>
          {report.overdue ? (
            <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {report.overdue} overdue task{report.overdue > 1 ? "s" : ""}
            </div>
          ) : null}
          <div className="grid gap-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <strong>{summary.data?.dueToday || 0}</strong>
              <small className="ml-2 text-slate-500">due today</small>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <strong>{report.review}</strong>
              <small className="ml-2 text-slate-500">waiting for review</small>
            </div>
          </div>
        </section>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section>
          <small className="eyebrow">WORKSPACE</small>
          <h2>Where the work lives</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="surface rounded-2xl p-5 shadow-sm">
              <h3>Projects</h3>
              <p>Projects, teams, tasks, and collaboration live here.</p>
            </article>
            <article className="surface rounded-2xl p-5 shadow-sm">
              <h3>People</h3>
              <p>Manage members and access from the workspace.</p>
            </article>
          </div>
        </section>
        <section>
          <small className="eyebrow">RECENT ACTIVITY</small>
          <h2>What changed</h2>
          {activityItems.length ? (
            <div className="surface overflow-hidden rounded-2xl shadow-sm">
              {activityItems.slice(0, 6).map((item, i) => (
                <div
                  className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-0"
                  key={item._id || i}
                >
                  <strong className="text-sm">
                    {item.description ||
                      `${item.action || "Updated"} ${item.entityType || "workspace"}`}
                  </strong>
                  <small className="shrink-0 text-xs text-slate-500">
                    {item.entityType || "Workspace"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No activity yet"
              text="Recent changes will show here."
            />
          )}
        </section>
      </div>
    </div>
  );
}
