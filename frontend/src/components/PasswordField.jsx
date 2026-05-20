import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const PasswordField = ({ className = "", inputClassName = "", ...props }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        {...props}
        type={isVisible ? "text" : "password"}
        className={`field-input pr-11 ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-navy-900"
        aria-label={isVisible ? "Hide password" : "Show password"}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export default PasswordField;
