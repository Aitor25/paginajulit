import './TabPlaceholder.css';

export default function TabPlaceholder({ id, icon, label, description }) {
  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      className="tab-placeholder"
    >
      <div className="tab-placeholder__inner">
        <div className="tab-placeholder__icon-wrap">
          <span className="tab-placeholder__icon">{icon}</span>
        </div>
        <h1 className="tab-placeholder__title">{label}</h1>
        <p className="tab-placeholder__desc">{description}</p>
        <div className="tab-placeholder__badge">
          <span className="badge-dot" />
          Próximamente en desarrollo
        </div>
      </div>
    </section>
  );
}
