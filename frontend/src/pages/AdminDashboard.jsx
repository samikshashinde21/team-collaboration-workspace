import { Link } from "react-router-dom";

const AdminDashboard = () => {
  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">Admin-only area for platform controls.</p>
      </div>

      <Link
        to="/admin/users"
        className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
      >
        <h2 className="font-semibold">Manage users</h2>
        <p className="mt-2 text-sm text-slate-600">View users and update roles.</p>
      </Link>
    </section>
  );
};

export default AdminDashboard;
