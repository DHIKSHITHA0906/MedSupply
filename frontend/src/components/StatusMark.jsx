export default function StatusMark({ level = "low", children, className = "" }) {
  return (
    <span className={`status-mark status-${level} ${className}`.trim()}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
