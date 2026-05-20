const sizeClass = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-9 w-9 border-[3px]",
};

const Loader = ({ label = "Loading", size = "md", className = "" }) => (
  <div className={`flex items-center justify-center ${className}`} role="status" aria-label={label}>
    <span
      className={`${sizeClass[size] || sizeClass.md} animate-spin rounded-full border-lavender-500 border-t-transparent`}
    />
    <span className="sr-only">{label}</span>
  </div>
);

export default Loader;
