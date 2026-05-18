import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Hello, {user?.name}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Your collaboration workspace foundation is ready. Rooms, members, and admin tools are
          separated so realtime features can plug in cleanly later.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/rooms" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Rooms</h2>
          <p className="mt-2 text-sm text-slate-600">Create and browse collaboration rooms.</p>
        </Link>

        {user?.role === "admin" && (
          <>
            <Link
              to="/admin/dashboard"
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Admin dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">Review admin-only controls.</p>
            </Link>
            <Link
              to="/admin/users"
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Users</h2>
              <p className="mt-2 text-sm text-slate-600">Manage account roles.</p>
            </Link>
          </>
        )}
      </div>
    </section>
  );
};

export default Dashboard;
