import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    `rounded-md px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    }`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/dashboard" className="text-xl font-semibold">
            CollabSpace
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/rooms" className={linkClass}>
              Rooms
            </NavLink>
            {user?.role === "admin" && (
              <>
                <NavLink to="/admin/dashboard" className={linkClass}>
                  Admin
                </NavLink>
                <NavLink to="/admin/users" className={linkClass}>
                  Users
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="font-medium text-slate-900">{user?.name}</p>
              <p className="capitalize text-slate-500">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
