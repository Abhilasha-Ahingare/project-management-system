import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { session, clear } from "./app/store";
import { auth } from "./api/resources.api";
import AppShell from "./components/layout/AppShell";
import LoginPage from "./pages/auth/LoginPage";
import OverviewPage from "./pages/overview/OverviewPage";
import ProjectDetailsPage from "./pages/projects/ProjectDetailsPage";
import TasksPage from "./pages/tasks/TasksPage";
import TaskPage from "./pages/tasks/TaskPage";
import MembersPage from "./pages/members/MembersPage";
import TeamsPage from "./pages/teams/TeamsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import ProjectsPage from "./pages/projects/ProjectsPage";
import CollaborationPage from "./pages/collaboration/CollaborationPage";
import ErrorBoundary from "./components/ErrorBoundary";

function PageBoundary({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}
function NotFoundPage() {
  return (
    <div className="state surface">
      <strong>Page not found</strong>
      <span>The requested ProjectHub route does not exist.</span>
      <a className="back" href="/overview">
        Back to overview
      </a>
    </div>
  );
}
function SessionGate({ children }) {
  const dispatch = useDispatch();
  const initialized = useSelector((s) => s.auth.initialized);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const user = await auth.me();
        if (live) dispatch(session(user));
      } catch {
        if (live) {
          dispatch(clear());
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [dispatch]);
  return initialized ? (
    children
  ) : (
    <div className="loading-screen">Loading ProjectHub...</div>
  );
}
function Protected({ children }) {
  return useSelector((s) => s.auth.user) ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
}
function PublicOnly({ children }) {
  return useSelector((s) => s.auth.user) ? (
    <Navigate to="/overview" replace />
  ) : (
    children
  );
}
function LegacyAppRedirect() {
  const location = useLocation();
  const cleanPath =
    location.pathname.replace(/^\/app(?=\/|$)/, "") || "/overview";
  return (
    <Navigate to={`${cleanPath}${location.search}${location.hash}`} replace />
  );
}
export default function App() {
  return (
    <SessionGate>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <PageBoundary>
                <LoginPage />
              </PageBoundary>
            </PublicOnly>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route
            path="overview"
            element={
              <PageBoundary>
                <OverviewPage />
              </PageBoundary>
            }
          />
          <Route
            path="projects"
            element={
              <PageBoundary>
                <ProjectsPage />
              </PageBoundary>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <PageBoundary>
                <ProjectDetailsPage />
              </PageBoundary>
            }
          />

          <Route
            path="tasks"
            element={
              <PageBoundary>
                <TasksPage />
              </PageBoundary>
            }
          />
          <Route
            path="tasks/:taskId"
            element={
              <PageBoundary>
                <TaskPage />
              </PageBoundary>
            }
          />
          <Route
            path="members"
            element={
              <PageBoundary>
                <MembersPage />
              </PageBoundary>
            }
          />
          <Route
            path="teams"
            element={
              <PageBoundary>
                <TeamsPage />
              </PageBoundary>
            }
          />
          <Route
            path="notifications"
            element={
              <PageBoundary>
                <NotificationsPage />
              </PageBoundary>
            }
          />
          <Route
            path="collaboration"
            element={
              <PageBoundary>
                <CollaborationPage />
              </PageBoundary>
            }
          />
          <Route
            path="collaboration/:projectId/:boardId?"
            element={
              <PageBoundary>
                <CollaborationPage />
              </PageBoundary>
            }
          />
        </Route>
        <Route path="/app/*" element={<LegacyAppRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SessionGate>
  );
}
