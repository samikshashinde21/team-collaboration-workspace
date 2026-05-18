import { Link, Outlet } from "react-router-dom";

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-md">
        <Link to="/login" className="mb-8 block text-center text-2xl font-semibold">
          CollabSpace
        </Link>
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
