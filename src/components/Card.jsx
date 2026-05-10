// Tiny card wrapper with optional title.
export default function Card({ title, children, action, className = '', id }) {
  return (
    <section id={id} className={`card ${className}`.trim()}>
      {(title || action) && (
        <div className="flex-between mb-8">
          {title && <h3 className="card-title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
