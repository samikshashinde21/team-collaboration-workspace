import { Link, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import AppFooter from "./AppFooter";

const AuthLayout = () => {
  return (
    <div className="app-surface min-h-screen px-4 py-10 text-slate-950">
      <div className="floating-shape left-8 top-16 h-28 w-44 rotate-6 animate-float" />
      <div className="floating-shape bottom-16 right-10 h-32 w-32 -rotate-12" />
      <div className="app-content mx-auto max-w-md">
        <Link to="/login" className="mb-8 flex items-center justify-center gap-2 text-2xl font-black text-navy-900">
          <span className="icon-chip">
            <Sparkles className="h-5 w-5" />
          </span>
          CollabSpace
        </Link>
        <Outlet />
      </div>
      <AppFooter className="mt-8" />
    </div>
  );
};

export default AuthLayout;
